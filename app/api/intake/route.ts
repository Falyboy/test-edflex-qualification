import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { put } from '@vercel/blob'
import { loadYouTube } from '@/lib/ingestion/loader-youtube'
import { loadPodcast } from '@/lib/ingestion/loader-podcast'
import { loadGDrive } from '@/lib/ingestion/loader-gdrive'
import { loadFile } from '@/lib/ingestion/loader-file'
import { scoreLLM } from '@/lib/qualification/scorer-llm'
import { detectSourceType } from '@/lib/ingestion/detect'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const MAX_TRANSCRIPT_CHARS = 40_000

let _redis: ReturnType<typeof Redis.fromEnv> | null = null
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv()
  return _redis
}

function notionHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

async function patchNotionPage(pageId: string, token: string, properties: Record<string, unknown>) {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: 'PATCH',
    headers: notionHeaders(token),
    body: JSON.stringify({ properties }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(`Notion PATCH ${res.status}: ${JSON.stringify(err).slice(0, 200)}`)
  }
}

function errorProperties(message: string) {
  return {
    'Statut': { select: { name: 'Erreur' } },
    'Flags': { rich_text: [{ text: { content: message.slice(0, 2000) } }] },
  }
}

function extractToken(raw: string | object): string {
  if (typeof raw === 'object' && raw !== null) {
    return (raw as { access_token: string }).access_token
  }
  return (JSON.parse(raw) as { access_token: string }).access_token
}

function safeInt(val: string | null | undefined, fallback: number): number {
  const n = parseInt(val ?? String(fallback), 10)
  return Number.isFinite(n) ? n : fallback
}

export async function POST(req: NextRequest): Promise<Response> {
  // HIGH: valider shared secret n8n — jamais accepter requête sans authentification
  const expectedSecret = process.env.N8N_SHARED_SECRET ?? ''
  const secret = req.headers.get('x-n8n-secret')
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  let body: { url?: string; type?: string; userId?: string; notionPageId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 })
  }

  const { url, type, userId, notionPageId } = body

  if (!url || !userId || !notionPageId) {
    return NextResponse.json({ error: 'url, userId et notionPageId sont requis' }, { status: 400 })
  }

  // Valider URL syntax
  try { new URL(url) } catch {
    return NextResponse.json({ error: 'URL invalide' }, { status: 400 })
  }

  const sourceType = type ? type.toLowerCase() : detectSourceType(url)

  // Récupérer token Notion user depuis Redis
  let userToken: string
  try {
    const rawToken = await getRedis().get<string | object>(`notion_token:${userId}`)
    if (!rawToken) return NextResponse.json({ error: 'User non connecté à Notion' }, { status: 401 })
    userToken = extractToken(rawToken as string | object)
    if (!userToken) return NextResponse.json({ error: 'Token Notion invalide' }, { status: 401 })
  } catch {
    return NextResponse.json({ error: 'Token Notion invalide' }, { status: 401 })
  }

  // Valider type supporté — écrire erreur explicite dans Notion si non supporté
  const SUPPORTED_TYPES = ['youtube', 'podcast', 'gdrive', 'pdf']
  if (!SUPPORTED_TYPES.includes(sourceType)) {
    const urlLower = url.toLowerCase()
    let explication = `Type de source non reconnu (${sourceType}). `
    if (urlLower.includes('viewer.html') || urlLower.includes('/web/viewer') || urlLower.includes('pdfjs')) {
      explication = 'Cette URL pointe vers un viewer PDF (page HTML), pas vers un fichier PDF direct. Téléchargez le PDF manuellement et importez-le via "Importer des fichiers" dans l\'app.'
    } else if (urlLower.includes('.ashx') || urlLower.includes('downloadhandler') || urlLower.includes('inline')) {
      explication = 'Ce lien est un handler de téléchargement protégé — le PDF n\'est pas accessible directement. Téléchargez le fichier et importez-le via "Importer des fichiers" dans l\'app.'
    } else if (urlLower.includes('instagram.com') || urlLower.includes('tiktok.com')) {
      explication = 'Instagram et TikTok ne sont pas supportés. Utilisez YouTube, un podcast RSS, Google Drive, ou un PDF direct.'
    } else if (urlLower.includes('spotify.com')) {
      explication = 'Spotify n\'est pas supporté (DRM). Recherchez l\'URL RSS du podcast ou un fichier MP3 direct.'
    } else {
      explication += 'Formats supportés : YouTube, Podcast (RSS/MP3), Google Drive, PDF direct (.pdf). Pour un PDF derrière un viewer ou une authentification : téléchargez-le et importez-le via "Importer des fichiers".'
    }
    await patchNotionPage(notionPageId, userToken, {
      'Statut': { select: { name: 'Erreur' } },
      'Flags': { rich_text: [{ text: { content: explication.slice(0, 2000) } }] },
    }).catch(() => null)
    return NextResponse.json({ error: explication }, { status: 422 })
  }

  // HIGH: réserver quota atomiquement via INCR avant le travail
  const redis = getRedis()
  const newCount = await redis.incr(`qual_count:${userId}`)
  const rawQuota = await redis.get<string>(`qual_quota:${userId}`)
  const quota = safeInt(rawQuota as string | null, 40)

  if (newCount > quota) {
    // Rollback
    await redis.incr(`qual_count:${userId}`).then(() => redis.incr(`qual_count:${userId}`)).catch(() => null)
    await redis.incr(`qual_count:${userId}`).catch(() => null)
    // Simple decr via incr(-1) — Upstash supporte decrby
    try { await (redis as unknown as { decrby: (k: string, n: number) => Promise<number> }).decrby(`qual_count:${userId}`, 1) } catch { /* best-effort */ }
    await patchNotionPage(notionPageId, userToken, {
      'Statut': { select: { name: 'Quota atteint' } },
      'Flags': { rich_text: [{ text: { content: `Quota de ${quota} qualifications atteint. Contactez l'administrateur pour augmenter votre limite.` } }] },
    }).catch(() => null)
    return NextResponse.json({ error: 'Quota atteint' }, { status: 429 })
  }

  // Générer Réf (counter séparé du quota)
  const refNum = await redis.incr(`qual_ref:${userId}`)
  const ref = `QF-${String(refNum).padStart(4, '0')}`

  // Idempotency lock — éviter double traitement du même notionPageId
  const lockKey = `qual_lock:${notionPageId}`
  const locked = await redis.set(lockKey, '1', { nx: true, ex: 300 })
  if (!locked) {
    await redis.incr(`qual_count:${userId}`).catch(() => null)
    try { await (redis as unknown as { decrby: (k: string, n: number) => Promise<number> }).decrby(`qual_count:${userId}`, 1) } catch { /* best-effort */ }
    return NextResponse.json({ error: 'Qualification déjà en cours pour cette page' }, { status: 409 })
  }

  // Statut "En cours"
  try {
    await patchNotionPage(notionPageId, userToken, { 'Statut': { select: { name: 'En cours' } } })
  } catch { /* non-bloquant */ }

  // Extraction contenu selon sourceType
  let title: string
  let text: string
  try {
    if (sourceType === 'youtube') {
      const meta = await loadYouTube(url)
      title = meta.title
      text = meta.transcript.slice(0, MAX_TRANSCRIPT_CHARS)
    } else if (sourceType === 'podcast') {
      const meta = await loadPodcast(url)
      title = meta.title
      text = meta.transcript.slice(0, MAX_TRANSCRIPT_CHARS)
    } else if (sourceType === 'gdrive') {
      const rawGoogleToken = await redis.get<string>(`google_token:${userId}`)
      if (!rawGoogleToken) throw new Error('Compte Google non connecté — connectez Google Drive dans le dashboard')
      const meta = await loadGDrive(url, rawGoogleToken)
      title = meta.title
      text = meta.transcript.slice(0, MAX_TRANSCRIPT_CHARS)
    } else if (sourceType === 'pdf') {
      const pdfRes = await fetch(url)
      if (!pdfRes.ok) throw new Error(`PDF inaccessible (${pdfRes.status})`)
      const buffer = await pdfRes.arrayBuffer()
      const filename = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? 'document.pdf')
      const doc = await loadFile(buffer, filename, 'application/pdf')
      title = doc.title
      text = doc.text.slice(0, MAX_TRANSCRIPT_CHARS)
    } else {
      throw new Error(`Type de source non supporté : ${sourceType}`)
    }
  } catch (err) {
    await redis.del(lockKey).catch(() => null)
    try { await (redis as unknown as { decrby: (k: string, n: number) => Promise<number> }).decrby(`qual_count:${userId}`, 1) } catch { /* best-effort */ }
    const message = err instanceof Error ? err.message : 'Erreur extraction'
    await patchNotionPage(notionPageId, userToken, errorProperties(
      `${message} — modifiez l'URL et remettez le statut à "À qualifier"`
    )).catch(() => null)
    return NextResponse.json({ error: 'Erreur extraction contenu' }, { status: 422 })
  }

  // Stocker transcript dans Vercel Blob (best-effort — ne bloque pas la qualification)
  const SOURCE_TTL = 60 * 60 * 24 * 365
  try {
    const blob = await put(
      `sources/${userId}/${notionPageId}.txt`,
      text,
      { access: 'private', contentType: 'text/plain; charset=utf-8' }
    )
    await redis.set(`source_blob:${notionPageId}`, blob.url, { ex: SOURCE_TTL })
    await redis.set(`source_meta:${notionPageId}`, JSON.stringify({
      title,
      type: sourceType,
      url,
      blobUrl: blob.url,
      userId,
      date: new Date().toISOString().split('T')[0],
      // scores de qualification — mis à jour après scoreLLM
      score_qualite: null,
      score_rgpd: null,
      score_ia_act: null,
      decision: null,
      tags: [],
      flag_excerpt: null,
    }), { ex: SOURCE_TTL })
    await redis.lpush(`user_sources:${userId}`, notionPageId)
  } catch { /* best-effort */ }

  // Qualification OPAD
  let result: Awaited<ReturnType<typeof scoreLLM>>
  try {
    result = await scoreLLM({ text, title, sourceType })
  } catch (err) {
    await redis.del(lockKey).catch(() => null)
    try { await (redis as unknown as { decrby: (k: string, n: number) => Promise<number> }).decrby(`qual_count:${userId}`, 1) } catch { /* best-effort */ }
    const message = err instanceof Error ? err.message : 'Erreur scorer LLM'
    await patchNotionPage(notionPageId, userToken, errorProperties(message)).catch(() => null)
    return NextResponse.json({ error: 'Erreur qualification LLM' }, { status: 422 })
  }

  const statut = result.decision === 'Publier' ? 'Qualifié'
    : result.decision === 'Rejeter' ? 'Rejeté'
    : 'Revue humaine'

  // Mettre à jour source_meta Redis avec scores qualification
  try {
    const redis2 = getRedis()
    const rawMeta = await redis2.get(`source_meta:${notionPageId}`) as string | null
    if (rawMeta) {
      const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta
      await redis2.set(`source_meta:${notionPageId}`, JSON.stringify({
        ...meta,
        score_qualite: result.score_qualite,
        score_rgpd: result.scores.rgpd,
        score_ia_act: result.scores.ia_act,
        decision: result.decision,
        tags: result.tags,
        flag_excerpt: result.flag_excerpt ?? null,
      }), { ex: SOURCE_TTL })
    }
  } catch { /* best-effort */ }

  // Écrire résultat dans page Notion user
  try {
    // Colonnes canoniques (voir lib/edflex/notion-schema.ts) — ordre/noms imposés
    const scoreA = Math.round((result.scores.a_forme + result.scores.a_inclusion) / 2 * 10) / 10
    await patchNotionPage(notionPageId, userToken, {
      'Nom': { title: [{ text: { content: title.slice(0, 2000) } }] },
      'Flags': { rich_text: [{ text: { content: (result.flag_excerpt ?? '').slice(0, 2000) } }] },
      'IA Act': { number: result.scores.ia_act },
      'RGPD': { number: result.scores.rgpd },
      'Score O': { number: result.scores.o },
      'Score P': { number: result.scores.p },
      'Score A': { number: scoreA },
      'Score D': { number: result.scores.d },
      'Décision': { select: { name: result.decision } },
      'Statut': { select: { name: statut } },
      'Justification': { rich_text: [{ text: { content: (result.justification || result.flag_excerpt || result.tags.join(', ')).slice(0, 2000) } }] },
      'Réf': { rich_text: [{ text: { content: ref } }] },
      'Sujet': { rich_text: [{ text: { content: (result.sujet_principal ?? '').slice(0, 2000) } }] },
      'Niveau': { select: { name: result.niveau } },
      'Score Persona': { number: result.score_persona },
    })
  } catch (err) {
    // Résultat produit mais non écrit — logguer sans rollback quota
    console.error('[intake] Notion write failed after scoring:', err)
  }

  await redis.del(lockKey).catch(() => null)

  return NextResponse.json({
    ref,
    decision: result.decision,
    score_qualite: result.score_qualite,
    scores: result.scores,
    tags: result.tags,
    flag_excerpt: result.flag_excerpt,
  })
}
