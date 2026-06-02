import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { Redis } from '@upstash/redis'
import { auth } from '@/auth'

export async function POST(): Promise<Response> {
  const cookieStore = await cookies()
  cookieStore.set('google_token', '', { maxAge: 0, path: '/' })

  const session = await auth()
  const email = session?.user?.email
  if (email) {
    const redis = Redis.fromEnv()
    await redis.del(`google_token:${email}`).catch(() => null)
  }

  return NextResponse.json({ disconnected: true })
}

export async function DELETE(): Promise<Response> {
  return POST()
}
