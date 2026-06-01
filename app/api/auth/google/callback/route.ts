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
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.json({ error: 'Code OAuth manquant' }, { status: 400 })
  }

  try {
    const oauth2Client = createOAuth2Client()
    const { tokens } = await oauth2Client.getToken(code)

    // Récupérer email Google via userinfo
    oauth2Client.setCredentials(tokens)
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: profile } = await oauth2.userinfo.get()
    const googleEmail = profile.email ?? null

    // Stocker token dans cookie (pour status UI)
    const cookieStore = await cookies()
    cookieStore.set('google_token', JSON.stringify(tokens), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })

    // Stocker access_token dans Redis par email (pour intake Drive)
    if (googleEmail && tokens.access_token) {
      const redis = getRedis()
      await redis.set(`google_token:${googleEmail}`, tokens.access_token, { ex: 60 * 60 * 24 * 29 })
    }

    return NextResponse.redirect(new URL('/dashboard', process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'), { status: 302 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Auth Google échouée : ${message}` }, { status: 500 })
  }
}
