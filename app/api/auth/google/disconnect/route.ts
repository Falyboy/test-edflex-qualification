import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function DELETE(): Promise<Response> {
  const cookieStore = await cookies()
  cookieStore.set('google_token', '', { maxAge: 0, path: '/' })
  return NextResponse.json({ disconnected: true })
}
