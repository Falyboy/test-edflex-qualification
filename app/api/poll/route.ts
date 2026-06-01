import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

let _redis: ReturnType<typeof Redis.fromEnv> | null = null
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv()
  return _redis
}

function extractToken(raw: string | object): string {
  if (typeof raw === 'object' && raw !== null) {
    return (raw as { access_token: string }).access_token
  }
  return (JSON.parse(raw as string) as { access_token: string }).access_token
}

interface NotionPage {
  id: string
  properties: { Urls?: { url?: string | null } }
}

export async function POST(req: NextRequest): Promise<Response> {
  const expectedSecret = process.env.N8N_SHARED_SECRET ?? ''
  const secret = req.headers.get('x-n8n-secret')
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })
  }

  const redis = getRedis()

  // Trouver tous les users connectés Notion
  let cursor = 0
  const emails: string[] = []
  do {
    const [next, keys] = await redis.scan(cursor, { match: 'notion_db_id:*', count: 100 })
    cursor = parseInt(String(next), 10)
    for (const key of keys as string[]) {
      emails.push(key.replace('notion_db_id:', ''))
    }
  } while (cursor !== 0)

  if (emails.length === 0) {
    return NextResponse.json({ users: 0, results: [] })
  }

  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL ?? `https://${process.env.VERCEL_URL}`).replace(/\/$/, '')
  const intakeSecret = process.env.N8N_SHARED_SECRET ?? ''
  const results: { email: string; queued: number; errors: string[] }[] = []

  for (const email of emails) {
    const entry = { email, queued: 0, errors: [] as string[] }
    try {
      const [dbId, rawToken] = await Promise.all([
        redis.get<string>(`notion_db_id:${email}`),
        redis.get<string | object>(`notion_token:${email}`),
      ])

      if (!dbId || !rawToken) { results.push(entry); continue }

      let token: string
      try { token = extractToken(rawToken as string | object) }
      catch { entry.errors.push('token invalide'); results.push(entry); continue }

      const queryRes = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: {
            or: [
              { property: 'Statut', select: { equals: 'À qualifier' } },
              { and: [
                { property: 'Urls', url: { is_not_empty: true } },
                { property: 'Statut', select: { is_empty: true } },
              ]},
            ],
          },
          page_size: 10,
        }),
      })

      if (!queryRes.ok) {
        entry.errors.push(`Notion ${queryRes.status}`)
        results.push(entry)
        continue
      }

      const { results: pages } = await queryRes.json() as { results: NotionPage[] }

      for (const page of pages) {
        const url = page.properties.Urls?.url
        if (!url) continue
        await fetch(`${baseUrl}/api/intake`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-n8n-secret': intakeSecret,
          },
          body: JSON.stringify({ url, userId: email, notionPageId: page.id }),
        }).catch((err: unknown) => {
          entry.errors.push(err instanceof Error ? err.message : 'intake error')
        })
        entry.queued++
      }
    } catch (err) {
      entry.errors.push(err instanceof Error ? err.message : 'erreur inconnue')
    }
    results.push(entry)
  }

  return NextResponse.json({ users: emails.length, results })
}
