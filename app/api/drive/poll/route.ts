import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { google } from 'googleapis'
import { loadFile } from '@/lib/ingestion/loader-file'
import { scoreLLM } from '@/lib/qualification/scorer-llm'
import { getValidAccessToken } from '@/lib/ingestion/google-token'
import type { DriveMonitorConfig } from '@/app/api/drive/setup/route'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const MAX_TRANSCRIPT_CHARS = 40_000
const LOCK_TTL = 300 // secondes

function getRedis() { return Redis.fromEnv() }

function driveClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.drive({ version: 'v3', auth })
}

function extractToken(raw: string | object): string {
  if (typeof raw === 'object' && raw !== null) {
    return (raw as { access_token: string }).access_token
  }
  return (JSON.parse(raw as string) as { access_token: string }).access_token
}

function mimeToFolder(mimeType: string, config: DriveMonitorConfig): string {
  if (mimeType.startsWith('audio/')) return config.audioId
  if (mimeType.startsWith('video/')) return config.videoId
  return config.documentId
}

function mimeToNotionType(mimeType: string): string {
  if (mimeType.startsWith('audio/')) return 'Podcast'
  if (mimeType.startsWith('video/')) return 'Vidéo'
  return 'Fichier'
}

async function writeNotion(
  notionToken: string,
  dbId: string,
  file: { name: string; mimeType: string },
  result: Awaited<ReturnType<typeof scoreLLM>>
): Promise<void> {
  const scoreA = Math.round((result.scores.a_forme + result.scores.a_inclusion) / 2 * 10) / 10
  const statut = result.decision === 'Publier' ? 'Qualifié'
    : result.decision === 'Rejeter' ? 'Rejeté'
    : 'Revue humaine'

  const res = await fetch(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        'Nom':      { title: [{ text: { content: file.name.slice(0, 2000) } }] },
        'Type':     { select: { name: mimeToNotionType(file.mimeType) } },
        'Statut':   { select: { name: statut } },
        'Décision': { select: { name: result.decision } },
        'Score O':  { number: result.scores.o },
        'Score P':  { number: result.scores.p },
        'Score A':  { number: scoreA },
        'Score D':  { number: result.scores.d },
        'IA Act':   { number: result.scores.ia_act },
        'RGPD':     { number: result.scores.rgpd },
        'Flags':    { rich_text: [{ text: { content: (result.flag_excerpt ?? '').slice(0, 2000) } }] },
        'Justification': { rich_text: [{ text: { content: (result.justification || '').slice(0, 2000) } }] },
        'Sujet':    { rich_text: [{ text: { content: (result.sujet_principal ?? '').slice(0, 2000) } }] },
        'Niveau':   { select: { name: result.niveau } },
        'Score Persona': { number: result.score_persona },
      },
    }),
  })

  // Ne JAMAIS avaler l'erreur — la remonter pour qu'elle soit visible
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(`Notion ${res.status}: ${err.message ?? 'écriture page échouée'}`)
  }
}

// Écrit une page "Erreur" dans Notion quand la qualification d'un fichier échoue.
async function writeNotionError(
  notionToken: string,
  dbId: string,
  file: { name: string; mimeType: string },
  message: string
): Promise<void> {
  const res = await fetch(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        'Nom':    { title: [{ text: { content: file.name.slice(0, 2000) } }] },
        'Type':   { select: { name: mimeToNotionType(file.mimeType) } },
        'Statut': { select: { name: 'Erreur' } },
        'Flags':  { rich_text: [{ text: { content: message.slice(0, 2000) } }] },
      },
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(`Notion ${res.status}: ${err.message ?? 'écriture Erreur échouée'}`)
  }
}

async function processFile(
  redis: ReturnType<typeof Redis.fromEnv>,
  drive: ReturnType<typeof google.drive>,
  config: DriveMonitorConfig,
  file: { id: string; name: string; mimeType: string },
  notionToken: string | null,
  dbId: string | null
): Promise<{ error?: string }> {
  const lockKey = `drive_lock:${file.id}`

  // Idempotency lock — atomique via NX
  const locked = await redis.set(lockKey, '1', { nx: true, ex: LOCK_TTL })
  if (!locked) return {}

  let procError: string | undefined

  try {
    // Télécharger contenu fichier
    const downloadRes = await drive.files.get(
      { fileId: file.id, alt: 'media' },
      { responseType: 'arraybuffer' }
    )
    const buffer = downloadRes.data as ArrayBuffer

    // Extraction texte
    const doc = await loadFile(buffer, file.name, file.mimeType)
    const text = doc.text.slice(0, MAX_TRANSCRIPT_CHARS)
    const title = doc.title

    // Qualification OPAD
    const sourceType = file.mimeType.startsWith('audio/') ? 'podcast'
      : file.mimeType.startsWith('video/') ? 'url'
      : 'pdf'
    const result = await scoreLLM({ text, title, sourceType })

    // Écrire le résultat dans Notion
    if (notionToken && dbId) {
      await writeNotion(notionToken, dbId, file, result)
    }
  } catch (err) {
    procError = err instanceof Error ? err.message : 'erreur inconnue'
    // Best-effort : tracer l'erreur dans Notion (Statut Erreur)
    if (notionToken && dbId) {
      await writeNotionError(notionToken, dbId, file, procError).catch((e: unknown) => {
        procError += ` | Notion erreur: ${e instanceof Error ? e.message : ''}`
      })
    }
  }

  // TOUJOURS déplacer vers Traités → le dossier "À qualifier" reste vide
  try {
    const targetFolder = mimeToFolder(file.mimeType, config)
    await drive.files.update({
      fileId: file.id,
      addParents: targetFolder,
      removeParents: config.inboxId,
      requestBody: {},
    })
  } catch (moveErr) {
    const m = moveErr instanceof Error ? moveErr.message : 'déplacement échoué'
    procError = procError ? `${procError} | move: ${m}` : `move: ${m}`
  } finally {
    await redis.del(lockKey).catch(() => null)
  }

  return { error: procError }
}

export async function POST(req: NextRequest): Promise<Response> {
  const expected = process.env.N8N_SHARED_SECRET ?? ''
  const provided  = req.headers.get('x-n8n-secret') ?? req.headers.get('x-cron-secret')
  if (expected && provided !== expected) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const redis   = getRedis()
  const emails  = await redis.smembers('drive_monitor_users') as string[]

  if (emails.length === 0) {
    return NextResponse.json({ users: 0, results: [] })
  }

  const results: { email: string; processed: number; errors: string[] }[] = []

  for (const email of emails) {
    const entry = { email, processed: 0, errors: [] as string[] }

    try {
      const [rawConfig, googleToken, rawNotionToken, dbId] = await Promise.all([
        redis.get<string | object>(`drive_monitor_config:${email}`),
        getValidAccessToken(redis, email),
        redis.get<string | object>(`notion_token:${email}`),
        redis.get<string>(`notion_db_id:${email}`),
      ])

      if (!rawConfig || !googleToken) { results.push(entry); continue }

      // Upstash auto-désérialise → rawConfig peut être string OU objet
      const config: DriveMonitorConfig = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig as DriveMonitorConfig
      if (!config.enabled) { results.push(entry); continue }

      const drive = driveClient(googleToken)

      let notionToken: string | null = null
      if (rawNotionToken) {
        try { notionToken = extractToken(rawNotionToken) } catch { /* pas bloquant */ }
      }

      const listRes = await drive.files.list({
        q: `'${config.inboxId}' in parents and trashed = false`,
        fields: 'files(id,name,mimeType,size)',
        pageSize: 100, // vider le dossier en un passage
      })

      const files = listRes.data.files ?? []

      for (const file of files) {
        if (!file.id || !file.name || !file.mimeType) continue
        try {
          const { error } = await processFile(redis, drive, config, { id: file.id, name: file.name, mimeType: file.mimeType }, notionToken, dbId ?? null)
          entry.processed++ // toujours traité (déplacé), même en erreur
          if (error) entry.errors.push(`${file.name}: ${error}`)
        } catch (err) {
          entry.errors.push(err instanceof Error ? err.message : 'erreur inconnue')
        }
      }
    } catch (err) {
      entry.errors.push(err instanceof Error ? err.message : 'erreur inconnue')
    }

    results.push(entry)
  }

  return NextResponse.json({ users: emails.length, results })
}
