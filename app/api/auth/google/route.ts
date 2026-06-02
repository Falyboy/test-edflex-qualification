import { google } from 'googleapis'
import { NextResponse } from 'next/server'
import { getEdflexEmail } from '@/lib/edflex/session'

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

export async function GET(): Promise<Response> {
  const email = await getEdflexEmail()
  const oauth2Client = createOAuth2Client()
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive'],
    prompt: 'consent',
    state: email ? Buffer.from(email).toString('base64') : '',
  })
  return NextResponse.redirect(url, { status: 302 })
}
