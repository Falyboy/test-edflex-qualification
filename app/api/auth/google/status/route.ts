import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(): Promise<Response> {
  const cookieStore = await cookies()
  const raw = cookieStore.get('google_token')?.value
  if (!raw) return NextResponse.json({ connected: false })
  try {
    const tokens = JSON.parse(raw) as { access_token?: string }
    return NextResponse.json({ connected: true, accessToken: tokens.access_token ?? null })
  } catch {
    return NextResponse.json({ connected: false })
  }
}
