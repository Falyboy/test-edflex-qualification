import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { getEdflexEmail } from '@/lib/edflex/session'
import { getProject } from '@/lib/edflex/store'

// Déverrouille un projet : permet de rajouter des sources et de régénérer les livrables.
export async function POST(req: Request): Promise<Response> {
  const email = await getEdflexEmail()
  if (!email) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { projectId } = await req.json().catch(() => ({})) as { projectId?: string }
  if (!projectId) return NextResponse.json({ error: 'projectId requis' }, { status: 400 })

  const project = await getProject(projectId)
  if (!project || project.email !== email) {
    return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  }

  await Redis.fromEnv().del(`edflex_locked:${projectId}`)
  return NextResponse.json({ ok: true })
}
