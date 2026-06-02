import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { put } from '@vercel/blob'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

// Limites par type
const LIMIT_AUDIO_BYTES = 25 * 1024 * 1024   // 25 MB — Groq Whisper max
const LIMIT_OTHER_BYTES = 50 * 1024 * 1024   // 50 MB — PDF/doc

function getRedis() { return Redis.fromEnv() }

function extractToken(raw: string | object): string {
  if (typeof raw === 'object' && raw !== null) {
    return (raw as { access_token: string }).access_token
  }
  return (JSON.parse(raw as string) as { access_token: string }).access_token
}

function mimeToNotionType(mimeType: string): string {
  if (mimeType.startsWith('audio/')) return 'Podcast'
  if (mimeType.startsWith('video/')) return 'Vidéo'
  return 'Fichier'
}

function mimeToFolderType(mimeType: string): 'audio' | 'video' | 'document' {
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  return 'document'
}

export async function POST(req: NextRequest): Promise<Response> {
  // Valider secret n8n
  const expectedSecret = process.env.N8N_SHARED_SECRET ?? ''
  if (expectedSecret && req.headers.get('x-n8n-secret') !== expectedSecret) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'FormData invalide' }, { status: 400 })
  }

  const userId = formData.get('userId') as string | null
  const file   = formData.get('file') as File | null

  if (!userId) return NextResponse.json({ error: 'userId requis' }, { status: 400 })
  if (!file)   return NextResponse.json({ error: 'fichier requis' }, { status: 400 })

  // Valider taille selon type MIME
  const mimeType  = file.type || 'application/octet-stream'
  const sizeLimit = mimeType.startsWith('audio/') ? LIMIT_AUDIO_BYTES : LIMIT_OTHER_BYTES
  if (file.size > sizeLimit) {
    const limitMB = Math.round(sizeLimit / 1024 / 1024)
    return NextResponse.json(
      { error: `Fichier trop volumineux (max ${limitMB} MB pour ce type)` },
      { status: 413 }
    )
  }

  // Récupérer token Notion + DB ID depuis Redis
  const redis = getRedis()
  const [rawToken, dbId] = await Promise.all([
    redis.get<string | object>(`notion_token:${userId}`),
    redis.get<string>(`notion_db_id:${userId}`),
  ])

  if (!rawToken) return NextResponse.json({ error: 'Notion non connecté pour cet utilisateur' }, { status: 401 })
  if (!dbId)    return NextResponse.json({ error: 'Base Notion introuvable pour cet utilisateur' }, { status: 400 })

  let notionToken: string
  try { notionToken = extractToken(rawToken) }
  catch { return NextResponse.json({ error: 'Token Notion invalide' }, { status: 401 }) }

  // Upload vers Vercel Blob
  let blobUrl: string
  try {
    const blob = await put(
      `n8n/${userId}/${file.name}`,
      file,
      { access: 'public', contentType: mimeType }
    )
    blobUrl = blob.url
  } catch {
    return NextResponse.json({ error: 'Erreur upload fichier' }, { status: 502 })
  }

  // Créer page Notion avec Statut "À qualifier"
  const notionType = mimeToNotionType(mimeType)
  const folderType = mimeToFolderType(mimeType)

  const notionRes = await fetch(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: {
        'Nom':    { title: [{ text: { content: file.name } }] },
        'Urls':   { url: blobUrl },
        'Type':   { select: { name: notionType } },
        'Statut': { select: { name: 'À qualifier' } },
      },
    }),
  })

  if (!notionRes.ok) {
    return NextResponse.json({ error: `Notion ${notionRes.status}` }, { status: 502 })
  }

  const { id: notionPageId } = await notionRes.json() as { id: string }

  // Stocker folderType dans Redis pour que n8n sache où déplacer le fichier après qualification
  await redis.set(`n8n_file_type:${notionPageId}`, folderType, { ex: 60 * 60 * 24 * 7 }).catch(() => null)

  return NextResponse.json({ notionPageId, blobUrl, folderType })
}
