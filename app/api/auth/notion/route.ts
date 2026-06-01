import { NextResponse } from 'next/server'

export function GET(): Response {
  const clientId = process.env.NOTION_CLIENT_ID!
  const redirectUri = process.env.NOTION_REDIRECT_URI!
  const url = new URL('https://api.notion.com/v1/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('owner', 'user')
  url.searchParams.set('redirect_uri', redirectUri)
  return NextResponse.redirect(url.toString(), { status: 302 })
}
