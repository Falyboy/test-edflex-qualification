import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { Redis } from '@upstash/redis'
import { getEdflexEmail } from '@/lib/edflex/session'
import { MAX_SOURCES, getSourceCount, isProjectLocked } from '@/lib/edflex/limits'
import { saveSource, updateSource, getProject, findProjectSourceByUrl, getCachedTranscript, setCachedTranscript, EdflexSource } from '@/lib/edflex/store'
import { loadYouTube } from '@/lib/ingestion/loader-youtube'
import { loadPodcast } from '@/lib/ingestion/loader-podcast'
import { loadWeb } from '@/lib/ingestion/loader-web'
import { scoreLLM } from '@/lib/qualification/scorer-llm'
import { syncToNotion, buildRejectReason } from '@/lib/edflex/notion-sync'

function redis() { return Redis.fromEnv() }

export async function POST(req: NextRequest) {
  const email = await getEdflexEmail()
  if (!email) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { projectId, url, type = 'YouTube' } = await req.json()
  if (!projectId || !url) return NextResponse.json({ error: 'projectId + url requis' }, { status: 400 })

  const project = await getProject(projectId)
  if (!project || project.email !== email) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

  const locked = await isProjectLocked(projectId)
  if (locked) return NextResponse.json({ error: 'Projet verrouillé' }, { status: 403 })

  // Dédup intra-projet : la même URL déjà dans CE projet = vrai doublon → on ne recrée pas.
  // (La même source dans un AUTRE projet reste autorisée — voir cache transcript plus bas.)
  const dup = await findProjectSourceByUrl(projectId, url)
  if (dup) {
    return NextResponse.json({ sourceId: dup.id, decision: dup.decision, duplicate: true })
  }

  const count = await getSourceCount(projectId)
  if (count >= MAX_SOURCES) return NextResponse.json({ error: `Maximum ${MAX_SOURCES} sources atteint` }, { status: 403 })

  const source: EdflexSource = {
    id: randomUUID(), projectId, url, type, title: url,
    status: 'transcription', createdAt: new Date().toISOString(),
  }
  await saveSource(source)

  // Phase 1 — Extraction (ou réutilisation du cache transcription cross-projet)
  let transcript = ''
  let title = url
  try {
    const cached = await getCachedTranscript(url)
    if (cached) {
      // Même source déjà transcrite ailleurs → on réutilise, pas de ré-extraction.
      transcript = cached.transcript
      title = cached.title
    } else if (type === 'YouTube') {
      const r = await loadYouTube(url); transcript = r.transcript; title = r.title
    } else if (type === 'Podcast') {
      const r = await loadPodcast(url); transcript = r.transcript; title = r.title
    } else if (type === 'Web') {
      const r = await loadWeb(url); transcript = r.text; title = r.title
    } else {
      await updateSource(source.id, { status: 'error' })
      return NextResponse.json({ error: `Type non supporté : ${type}` }, { status: 400 })
    }
    if (!cached && transcript.trim().length >= 50) {
      setCachedTranscript(url, transcript, title).catch(() => null)
    }
    await updateSource(source.id, { transcript, title, status: 'qualification' })
  } catch {
    await updateSource(source.id, { status: 'error' })
    return NextResponse.json({ error: 'Extraction échouée', sourceId: source.id }, { status: 500 })
  }

  // Cas limite — transcription absente : techniquement une erreur (comme "source
  // indisponible"), mais la source n'est pas cassée (l'URL a répondu). On ne
  // gaspille pas d'appel LLM sur du vide ; on route vers Revue humaine pour qu'un
  // humain regarde la vidéo / le contenu lui-même.
  const MIN_CONTENU = 50
  if (transcript.trim().length < MIN_CONTENU) {
    await updateSource(source.id, {
      status: 'done',
      decision: 'Revue humaine',
      title,
      rejectReason: 'Transcription indisponible ou trop courte pour une qualification automatique.',
      justification: 'Transcription indisponible ou trop courte pour une qualification automatique.',
    })
    return NextResponse.json({ sourceId: source.id, decision: 'Revue humaine', reason: 'transcription absente' })
  }

  // Phase 2 — Qualification
  try {
    const scored = await scoreLLM({
      text: transcript, title, sourceType: type,
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

    // Sync Notion (best-effort) — log si échec pour diagnostic
    syncToNotion({
      email, title, url, type, decision,
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
      if (!r.ok) console.error(`[edflex/ingest] Notion sync KO (${email}): ${r.reason}`)
    }).catch(() => null)

    return NextResponse.json({ sourceId: source.id, decision, score: scored.score_qualite })
  } catch {
    await updateSource(source.id, { status: 'error' })
    return NextResponse.json({ error: 'Qualification échouée', sourceId: source.id }, { status: 500 })
  }
}
