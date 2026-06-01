import { NextRequest, NextResponse } from 'next/server'
import { getEdflexEmail } from '@/lib/edflex/session'
import { getProject, getProjectSources, getLivrables, updateProject } from '@/lib/edflex/store'
import { isProjectLocked } from '@/lib/edflex/limits'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const email = await getEdflexEmail()
  if (!email) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { id } = await params
  const project = await getProject(id)
  if (!project || project.email !== email) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  const [sources, livrables, locked] = await Promise.all([
    getProjectSources(id),
    getLivrables(id),
    isProjectLocked(id),
  ])

  return NextResponse.json({ project, sources, livrables, locked })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const email = await getEdflexEmail()
  if (!email) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { id } = await params
  const project = await getProject(id)
  if (!project || project.email !== email) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })

  const body = await req.json()
  const ctx = body.context ?? {}

  await updateProject(id, {
    titre: body.titre ?? project.titre,
    organisation: body.organisation ?? project.organisation,
    context: {
      publicCible:  ctx.publicCible  ?? project.context.publicCible,
      secteur:      ctx.secteur      ?? project.context.secteur,
      probleme:     ctx.probleme     ?? project.context.probleme,
      format:       ctx.format       ?? project.context.format  ?? '',
      duree:        ctx.duree        ?? project.context.duree   ?? '',
      outils:       ctx.outils       ?? project.context.outils  ?? '',
      criteres:     ctx.criteres     ?? project.context.criteres ?? '',
      conformite:   ctx.conformite   ?? project.context.conformite ?? '',
      indicateurs:  ctx.indicateurs  ?? project.context.indicateurs ?? '',
    },
  })

  const updated = await getProject(id)
  return NextResponse.json({ project: updated })
}
