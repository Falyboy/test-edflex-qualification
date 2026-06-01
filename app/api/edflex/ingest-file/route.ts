import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { del } from '@vercel/blob'
import { Redis } from '@upstash/redis'
import { getEdflexEmail } from '@/lib/edflex/session'
import { MAX_SOURCES, getSourceCount, isProjectLocked } from '@/lib/edflex/limits'
import { saveSource, updateSource, getProject, EdflexSource } from '@/lib/edflex/store'
import { loadFile } from '@/lib/ingestion/loader-file'
import { scoreLLM } from '@/lib/qualification/scorer-llm'
import { syncToNotion, buildRejectReason } from '@/lib/edflex/notion-sync'

function redis() { return Redis.fromEnv() }

export async function POST(req: NextRequest) {
  const email = await getEdflexEmail()
  if (!email) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  // Le fichier est uploadé côté client vers Vercel Blob (contourne la limite 4.5MB
  // du body serverless). On reçoit juste l'URL + le nom.
  const body = await req.json().catch(() => ({})) as { blobUrl?: string; filename?: string; projectId?: string; mimeType?: string }
  const { blobUrl, filename, projectId, mimeType } = body

  if (!blobUrl || !filename || !projectId) {
    return NextResponse.json({ error: 'blobUrl + filename + projectId requis' }, { status: 400 })
  }

  const project = await getProject(projectId)
  if (!project || project.email !== email) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

  const locked = await isProjectLocked(projectId)
  if (locked) return NextResponse.json({ error: 'Projet verrouillé' }, { status: 403 })

  const count = await getSourceCount(projectId)
  if (count >= MAX_SOURCES) return NextResponse.json({ error: `Maximum ${MAX_SOURCES} sources atteint` }, { status: 403 })

  const source: EdflexSource = {
    id: randomUUID(),
    projectId,
    url: filename,
    type: 'Fichier',
    title: filename,
    status: 'transcription',
    createdAt: new Date().toISOString(),
  }
  await saveSource(source)

  // Phase 1 — Récupérer le fichier depuis Blob + extraction
  let transcript = ''
  let title = filename
  try {
    const blobRes = await fetch(blobUrl)
    if (!blobRes.ok) throw new Error(`Fichier inaccessible (${blobRes.status})`)
    const buffer = await blobRes.arrayBuffer()
    const doc = await loadFile(buffer, filename, mimeType ?? '')
    transcript = doc.text
    title = doc.title
    await updateSource(source.id, { transcript, title, status: 'qualification' })
    // Blob = artefact de traitement, on le supprime après extraction (copyright + coût)
    del(blobUrl).catch(() => null)
  } catch (err) {
    await updateSource(source.id, { status: 'error' })
    const msg = err instanceof Error ? err.message : 'Extraction échouée'
    return NextResponse.json({ error: msg, sourceId: source.id }, { status: 500 })
  }

  // Cas limite — texte absent (PDF scanné illisible, fichier vide) : techniquement
  // une erreur (comme "source indisponible"), mais on route en Revue humaine pour
  // qu'un humain ouvre le fichier lui-même. Pas d'appel LLM sur du vide.
  const MIN_CONTENU = 50
  if (transcript.trim().length < MIN_CONTENU) {
    await updateSource(source.id, {
      status: 'done',
      decision: 'Revue humaine',
      title,
      rejectReason: 'Texte indisponible ou trop court (PDF scanné ?) pour une qualification automatique.',
      justification: 'Texte indisponible ou trop court (PDF scanné ?) pour une qualification automatique.',
    })
    return NextResponse.json({ sourceId: source.id, decision: 'Revue humaine', reason: 'texte absent' })
  }

  // Phase 2 — Qualification auto
  try {
    const scored = await scoreLLM({
      text: transcript,
      title,
      sourceType: 'Fichier',
      projetContext: {
        secteur: project.context.secteur,
        problemes: project.context.probleme ? [project.context.probleme] : [],
      },
    })

    const decision = scored.decision === 'Erreur' ? 'Revue humaine' : scored.decision
    const allScores = scored.scores
    const flagExcerpt = scored.flag_excerpt ?? ''
    const rejectReason = buildRejectReason(allScores, flagExcerpt)

    await updateSource(source.id, {
      status: 'done', decision,
      score: scored.score_qualite,
      tags: scored.tags ?? [],
      rgpd: allScores.rgpd,
      iaAct: allScores.ia_act,
      allScores,
      flagExcerpt,
      rejectReason,
      sujetPrincipal: scored.sujet_principal,
      niveau: scored.niveau,
      scorePersona: scored.score_persona,
      justification: scored.justification,
    })

    syncToNotion({
      email, title, url: filename, type: 'Fichier', decision,
      score: scored.score_qualite,
      scores: allScores,
      tags: scored.tags ?? [],
      rejectReason,
      flagExcerpt,
      ref: source.id,
      sujet: scored.sujet_principal,
      niveau: scored.niveau,
      scorePersona: scored.score_persona,
      justificationText: scored.justification,
      redisGet: (key) => redis().get(key),
    }).then(r => {
      if (!r.ok) console.error(`[edflex/ingest-file] Notion sync KO (${email}): ${r.reason}`)
    }).catch(() => null)

    return NextResponse.json({ sourceId: source.id, decision, score: scored.score_qualite })
  } catch {
    await updateSource(source.id, { status: 'error' })
    return NextResponse.json({ error: 'Qualification échouée', sourceId: source.id }, { status: 500 })
  }
}
