import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { Redis } from '@upstash/redis'
import { z } from 'zod'

let _redis: ReturnType<typeof Redis.fromEnv> | null = null
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv()
  return _redis
}

interface Profile {
  nom: string
  prenom: string
}

export async function GET(): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ email: null }, { status: 401 })

  const email = session.user.email
  const profile = await getRedis().get<Profile>(`profile:${email}`)

  await getRedis().set(`last_seen:${email}`, Date.now(), { ex: 60 * 60 * 24 * 30 })

  const sessionName = session.user.name ?? ''
  const nameParts = sessionName.trim().split(/\s+/)
  const fallbackPrenom = nameParts[0] ?? ''
  const fallbackNom = nameParts.slice(1).join(' ')

  return NextResponse.json({
    email,
    nom: profile?.nom || fallbackNom,
    prenom: profile?.prenom || fallbackPrenom,
    name: sessionName,
  })
}

const schema = z.object({
  nom: z.string().max(100),
  prenom: z.string().max(100),
})

export async function PUT(req: NextRequest): Promise<Response> {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Données invalides' }, { status: 400 })

  await getRedis().set(`profile:${session.user.email}`, parsed.data)
  return NextResponse.json({ ok: true })
}
