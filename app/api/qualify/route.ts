import { NextResponse } from 'next/server'
import { contentStore } from '@/lib/store/content-store'
import { scoreLLM, QualifyResult, ProjetContext } from '@/lib/qualification/scorer-llm'
import { logError } from '@/lib/error-logger'
import { auth } from '@/auth'
import { getRedis } from '@/lib/generate/helpers'
import type { ContentDocument } from '@/lib/store/content-store'

// Noms exacts des colonnes Notion — à synchroniser si renommage dans la DB
const N = {
  scoreGlobal:    'Score Global',
  decision:       'Decision',
  scoreRGPD:      'Score RGPD',
  scoreAIAct:     'Score AI Act',
  scorePI:        'Score PI',
  scoreO:         'Score O',
  scoreP:         'Score P',
  scoreAForme:    'Score A Forme',
  scoreAInclusion:'Score A Inclusion',
  scoreD:         'Score D',
  sensibiliteFlag:'Sensibilite flag',
  dateQualif:     'Date qualification',
  bloquants:      'Bloquants',
  flags:          'Flags',
  langue:         'Langue',
  tags:           'Tags',
  nom:            'Nom',
  urlSource:      'URL source',
  typeSource:     'Type de source',
  titre:          'Titre',
  longueurTexte:  'Longueur texte',
  dateCreation:   'Date creation',
  valideHumain:   'Valide par humain',
  miniature:      'Miniature',
  dureeSecondes:  'Duree secondes',
} as const

async function writeToNotion(doc: ContentDocument, result: QualifyResult): Promise<void> {
  const token = process.env.NOTION_TOKEN
  const dbId = process.env.NOTION_SOURCES_DB
  if (!token || !dbId) return

  const bloquants = [result.scores.rgpd, result.scores.ia_act, result.scores.pi].filter(s => s <= 3).length
  const flags = result.decision === 'Publier' ? ['Approuvé'] : ['À revoir']

  const scoreProperties: Record<string, unknown> = {
    [N.scoreGlobal]:     { number: result.score_qualite },
    [N.decision]:        { select: { name: result.decision } },
    [N.scoreRGPD]:       { number: result.scores.rgpd },
    [N.scoreAIAct]:      { number: result.scores.ia_act },
    [N.scorePI]:         { number: result.scores.pi },
    [N.scoreO]:          { number: result.scores.o },
    [N.scoreP]:          { number: result.scores.p },
    [N.scoreAForme]:     { number: result.scores.a_forme },
    [N.scoreAInclusion]: { number: result.scores.a_inclusion },
    [N.scoreD]:          { number: result.scores.d },
    [N.sensibiliteFlag]: { checkbox: result.sensibilite_flag },
    [N.dateQualif]:      { date: { start: new Date().toISOString().split('T')[0] } },
    [N.bloquants]:       { number: bloquants },
    [N.flags]:           { multi_select: flags.map(name => ({ name })) },
  }

  if (result.langue) scoreProperties[N.langue] = { select: { name: result.langue } }
  if (result.tags.length > 0) scoreProperties[N.tags] = { multi_select: result.tags.map(name => ({ name })) }

  if (doc.notionPageId) {
    // Page already created at ingest — PATCH with qualification scores
    const res = await fetch(`https://api.notion.com/v1/pages/${doc.notionPageId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ properties: scoreProperties }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { message?: string; code?: string }
      const err = new Error(`Notion PATCH HTTP ${res.status}: ${data.message ?? JSON.stringify(data)}`)
      throw Object.assign(err, { httpStatus: res.status, notionCode: data.code })
    }
  } else {
    // No ingest page — CREATE full row
    const fullProperties: Record<string, unknown> = {
      [N.nom]:           { title: [{ text: { content: doc.title || doc.sourceUrl } }] },
      [N.urlSource]:     { url: doc.sourceUrl },
      [N.typeSource]:    { select: { name: doc.sourceType } },
      [N.titre]:         { rich_text: [{ text: { content: doc.title } }] },
      [N.longueurTexte]: { number: doc.textLength },
      [N.dateCreation]:  { date: { start: doc.createdAt.split('T')[0] } },
      [N.valideHumain]:  { checkbox: false },
      ...scoreProperties,
    }
    if (doc.thumbnailUrl) fullProperties[N.miniature] = { url: doc.thumbnailUrl }
    if (doc.durationSeconds !== null) fullProperties[N.dureeSecondes] = { number: doc.durationSeconds }

    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parent: { database_id: dbId }, properties: fullProperties }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { message?: string; code?: string }
      const err = new Error(`Notion POST HTTP ${res.status}: ${data.message ?? JSON.stringify(data)}`)
      throw Object.assign(err, { httpStatus: res.status, notionCode: data.code })
    } else {
      const data = await res.json() as { id?: string }
      if (data.id) {
        contentStore.update(doc.id, { notionPageId: data.id }).catch(() => {})
      }
    }
  }
}

async function writeToRedis(doc: ContentDocument, result: QualifyResult, email: string | null): Promise<void> {
  const redis = getRedis()
  const TTL = 60 * 60 * 24 * 90 // 90 jours
  const meta = {
    id: doc.id,
    title: doc.title,
    url: doc.sourceUrl,
    type: doc.sourceType,
    date: new Date().toISOString().split('T')[0],
    decision: result.decision,
    score_qualite: result.score_qualite,
    score_rgpd: result.scores.rgpd,
    score_ia_act: result.scores.ia_act,
    scores: result.scores,
    tags: result.tags,
    flag_excerpt: result.flag_excerpt ?? null,
    sensibilite_flag: result.sensibilite_flag,
    langue: result.langue,
    blobUrl: null,
  }
  await redis.set(`source_meta:${doc.id}`, JSON.stringify(meta), { ex: TTL })
  if (email) {
    const existing = await redis.lrange(`user_sources:${email}`, 0, -1) as string[]
    if (!existing.includes(doc.id)) {
      await redis.lpush(`user_sources:${email}`, doc.id)
    }
  }
}

export async function POST(request: Request): Promise<Response> {
  const session = await auth()
  const email = session?.user?.email ?? null

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { contentId, projetContext } = body as { contentId?: string; projetContext?: ProjetContext }
  if (!contentId) {
    return NextResponse.json({ error: 'contentId requis' }, { status: 400 })
  }

  const doc = await contentStore.get(contentId)
  if (!doc) {
    return NextResponse.json({ error: 'Contenu introuvable' }, { status: 404 })
  }

  try {
    const result = await scoreLLM({
      text: doc.text,
      title: doc.title,
      sourceType: doc.sourceType,
      projetContext: projetContext ?? undefined,
    })

    // Fire-and-forget — Redis + Notion failures must not block the response
    writeToRedis(doc, result, email).catch(() => {})
    writeToNotion(doc, result).catch(err => {
      const msg = err instanceof Error ? err.message : String(err)
      const extra = err as Record<string, unknown>
      logError({
        route: '/api/qualify',
        type: 'NotionWriteError',
        message: msg,
        context: [
          `action: writeToNotion`,
          `contentId: ${doc.id}`,
          `sourceType: ${doc.sourceType}`,
          `decision: ${result.decision}`,
          `score: ${result.score_qualite}`,
          extra.httpStatus ? `httpStatus: ${extra.httpStatus}` : '',
          extra.notionCode ? `notionCode: ${extra.notionCode}` : '',
        ].filter(Boolean).join('\n'),
        stack: err instanceof Error ? err.stack : undefined,
      })
    })

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const extra = err as Record<string, unknown>
    const contextLines = [
      `action: scoreLLM`,
      `contentId: ${contentId}`,
      `sourceType: ${doc.sourceType}`,
      `textLength: ${doc.textLength}`,
      `title: ${doc.title.slice(0, 100)}`,
      extra.model ? `model: ${extra.model}` : '',
      extra.rawResponse ? `rawResponse: ${String(extra.rawResponse).slice(0, 500)}` : '',
    ].filter(Boolean).join('\n')
    logError({
      route: '/api/qualify',
      type: err instanceof Error ? err.constructor.name : 'Error',
      message: msg,
      context: contextLines,
      stack: err instanceof Error ? err.stack : undefined,
    })
    return NextResponse.json({ error: msg }, { status: 422 })
  }
}
