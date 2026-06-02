import { google } from 'googleapis'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { Redis } from '@upstash/redis'

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

let _redis: ReturnType<typeof Redis.fromEnv> | null = null
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv()
  return _redis
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state') ?? ''

  if (!code) {
    return NextResponse.json({ error: 'Code OAuth manquant' }, { status: 400 })
  }

  // Décoder l'email depuis le state
  let userEmail: string | null = null
  try {
    if (state) userEmail = Buffer.from(state, 'base64').toString('utf-8')
  } catch { /* ignoré */ }

  try {
    const oauth2Client = createOAuth2Client()
    const { tokens } = await oauth2Client.getToken(code)

    // Stocker token dans cookie (pour status UI)
    const cookieStore = await cookies()
    cookieStore.set('google_token', JSON.stringify(tokens), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })

    // Stocker email dans cookie (fiable pour /api/drive/status sans dépendre de auth())
    if (userEmail) {
      cookieStore.set('drive_user_email', userEmail, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30,
        path: '/',
      })
    }

    // Stocker tokens complets dans Redis (access + refresh + expiry) pour refresh auto
    if (userEmail && tokens.access_token) {
      const redis = getRedis()
      await redis.set(`google_token:${userEmail}`, JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? undefined,
        expiry_date: tokens.expiry_date ?? undefined,
      }), { ex: 60 * 60 * 24 * 29 })
    }

    const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL ?? `https://${process.env.VERCEL_URL}`).replace(/\/$/, '')
    return NextResponse.redirect(new URL('/edflex', baseUrl), { status: 302 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Auth Google échouée : ${message}` }, { status: 500 })
  }
}
