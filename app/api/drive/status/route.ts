import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { google } from 'googleapis'
import { cookies } from 'next/headers'
import { getEdflexEmail } from '@/lib/edflex/session'
import { getValidAccessToken } from '@/lib/ingestion/google-token'
import type { DriveMonitorConfig } from '@/app/api/drive/setup/route'

function getRedis() { return Redis.fromEnv() }

export async function GET(): Promise<Response> {
  // googleConnected basé sur le cookie (fiable, sans dépendre de auth())
  const cookieStore = await cookies()
  const googleCookie = cookieStore.get('google_token')?.value
  if (!googleCookie) return NextResponse.json({ googleConnected: false, enabled: false })

  // email : cookie posé au callback (fiable) → fallback session NextAuth
  const email = cookieStore.get('drive_user_email')?.value || await getEdflexEmail()
  if (!email) return NextResponse.json({ googleConnected: true, enabled: false })

  const redis = getRedis()
  const [rawConfig, googleToken] = await Promise.all([
    redis.get<string | object>(`drive_monitor_config:${email}`),
    getValidAccessToken(redis, email),
  ])

  if (!rawConfig) return NextResponse.json({ googleConnected: true, enabled: false })

  // Upstash auto-désérialise → string OU objet
  const config: DriveMonitorConfig = typeof rawConfig === 'string' ? JSON.parse(rawConfig) : rawConfig as DriveMonitorConfig
  const accessToken = googleToken ?? ''

  // Compter fichiers en attente dans la boîte
  let pendingCount = 0
  try {
    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: accessToken })
    const drive = google.drive({ version: 'v3', auth })
    const res = await drive.files.list({
      q: `'${config.inboxId}' in parents and trashed = false`,
      fields: 'files(id)',
      pageSize: 50,
    })
    pendingCount = res.data.files?.length ?? 0
  } catch { /* best-effort */ }

  return NextResponse.json({
    googleConnected: true,
    enabled: config.enabled,
    pendingCount,
    config: {
      rootId: config.rootId,
      inboxId: config.inboxId,
    },
  })
}

export async function DELETE(): Promise<Response> {
  const cookieStore = await cookies()
  const email = cookieStore.get('drive_user_email')?.value || await getEdflexEmail()
  if (!email) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const redis = getRedis()
  await Promise.all([
    redis.del(`drive_monitor_config:${email}`),
    redis.srem('drive_monitor_users', email),
  ])

  return NextResponse.json({ ok: true })
}
