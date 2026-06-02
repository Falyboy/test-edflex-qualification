import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { google } from 'googleapis'
import { cookies } from 'next/headers'
import { getEdflexEmail } from '@/lib/edflex/session'
import { getValidAccessToken } from '@/lib/ingestion/google-token'

const FOLDER_MIME = 'application/vnd.google-apps.folder'

function getRedis() { return Redis.fromEnv() }

function driveClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.drive({ version: 'v3', auth })
}

async function createFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parents?: string[]
): Promise<string> {
  const res = await drive.files.create({
    requestBody: { name, mimeType: FOLDER_MIME, ...(parents ? { parents } : {}) },
    fields: 'id',
  })
  const id = res.data.id
  if (!id) throw new Error(`Impossible de créer le dossier "${name}"`)
  return id
}

export interface DriveMonitorConfig {
  enabled: boolean
  rootId: string
  inboxId: string
  audioId: string
  documentId: string
  videoId: string
}

export async function POST(): Promise<Response> {
  const cookieStore = await cookies()
  const email = cookieStore.get('drive_user_email')?.value || await getEdflexEmail()
  if (!email) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const redis = getRedis()

  // Idempotence — si déjà configuré, renvoyer la config existante sans recréer de dossiers
  const existingConfig = await redis.get<string>(`drive_monitor_config:${email}`)
  if (existingConfig) {
    const config: DriveMonitorConfig = typeof existingConfig === 'string'
      ? JSON.parse(existingConfig) : existingConfig
    return NextResponse.json({ ok: true, config, alreadyConfigured: true })
  }

  const googleToken = await getValidAccessToken(redis, email)
  if (!googleToken) {
    return NextResponse.json({ error: 'Google Drive non connecté — connectez Google dans le dashboard' }, { status: 400 })
  }

  const drive = driveClient(googleToken)

  try {
    const rootId     = await createFolder(drive, 'Formation-IA')
    const inboxId    = await createFolder(drive, 'À qualifier',      [rootId])
    const audioId    = await createFolder(drive, 'Traités — Audio',  [rootId])
    const documentId = await createFolder(drive, 'Traités — Document', [rootId])
    const videoId    = await createFolder(drive, 'Traités — Vidéo',  [rootId])

    const config: DriveMonitorConfig = { enabled: true, rootId, inboxId, audioId, documentId, videoId }

    await redis.set(`drive_monitor_config:${email}`, JSON.stringify(config), { ex: 60 * 60 * 24 * 365 })
    await redis.sadd('drive_monitor_users', email)

    return NextResponse.json({ ok: true, config })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur Drive'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
