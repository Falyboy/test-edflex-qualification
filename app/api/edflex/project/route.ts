import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getEdflexEmail } from '@/lib/edflex/session'
import { MAX_PROJECTS, getProjectCount } from '@/lib/edflex/limits'
import { saveProject, getUserProjects, EdflexProject } from '@/lib/edflex/store'

export async function GET() {
  const email = await getEdflexEmail()
  if (!email) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })
  const projects = await getUserProjects(email)
  return NextResponse.json({ projects })
}

export async function POST(req: NextRequest) {
  const email = await getEdflexEmail()
  if (!email) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const count = await getProjectCount(email)
  if (count >= MAX_PROJECTS) {
    return NextResponse.json({ error: `Maximum ${MAX_PROJECTS} projets atteint` }, { status: 403 })
  }

  const body = await req.json()
  const ctx = body.context ?? {}
  const project: EdflexProject = {
    id: randomUUID(),
    email,
    titre: body.titre ?? 'Sans titre',
    organisation: body.organisation ?? '',
    createdAt: new Date().toISOString(),
    context: {
      publicCible:  ctx.publicCible  ?? '',
      secteur:      ctx.secteur      ?? '',
      probleme:     ctx.probleme     ?? '',
      format:       ctx.format       ?? '',
      duree:        ctx.duree        ?? '',
      outils:       ctx.outils       ?? '',
      criteres:     ctx.criteres     ?? '',
      conformite:   ctx.conformite   ?? '',
      indicateurs:  ctx.indicateurs  ?? '',
    },
  }

  await saveProject(project)
  return NextResponse.json({ project })
}
