import { NextResponse } from 'next/server'
import { contentStore } from '@/lib/store/content-store'

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { contentId } = body as { contentId?: string }
  if (!contentId) {
    return NextResponse.json({ error: 'contentId requis' }, { status: 400 })
  }

  const doc = await contentStore.get(contentId)
  if (!doc) {
    return NextResponse.json({ error: 'Contenu introuvable' }, { status: 404 })
  }

  if (doc.notionPageId) {
    const token = process.env.NOTION_TOKEN
    if (token) {
      fetch(`https://api.notion.com/v1/pages/${doc.notionPageId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: { 'Valide par humain': { checkbox: true } },
        }),
      }).catch(err => {
        console.error('[Notion validate] PATCH failed:', err)
      })
    }
  }

  return NextResponse.json({ validated: true })
}
