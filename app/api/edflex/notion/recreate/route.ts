import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { auth } from '@/auth'
import { buildDatabaseProperties } from '@/lib/edflex/notion-schema'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const DB_TTL = 60 * 60 * 24 * 365

let _redis: ReturnType<typeof Redis.fromEnv> | null = null
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv()
  return _redis
}

function extractToken(raw: unknown): string | null {
  try {
    if (typeof raw === 'object' && raw !== null) return (raw as { access_token?: string }).access_token ?? null
    return (JSON.parse(raw as string) as { access_token?: string }).access_token ?? null
  } catch { return null }
}

// Recrée la base Notion avec le schéma canonique (14 colonnes, ordre exact).
// Nécessaire pour les utilisateurs dont la base date de l'ancien schéma.
export async function POST(): Promise<Response> {
  const session = await auth()
  const email = session?.user?.email
  if (!email) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const redis = getRedis()
  const rawToken = await redis.get(`notion_token:${email}`)
  const token = extractToken(rawToken)
  if (!token) return NextResponse.json({ error: 'Notion non connecté' }, { status: 400 })

  // Trouver une page parent
  const searchRes = await fetch(`${NOTION_API}/search`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter: { value: 'page', property: 'object' }, page_size: 1 }),
  })
  const searchData = searchRes.ok ? await searchRes.json() as { results?: Array<{ id: string }> } : { results: [] }
  const parentPageId = searchData.results?.[0]?.id
  if (!parentPageId) return NextResponse.json({ error: 'Aucune page parent accessible dans Notion' }, { status: 502 })

  // Créer la base avec le schéma canonique
  const dbRes = await fetch(`${NOTION_API}/databases`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parent: { type: 'page_id', page_id: parentPageId },
      title: [{ type: 'text', text: { content: 'Pipeline contenus — sources qualifiées' } }],
      properties: buildDatabaseProperties(),
    }),
  })
  if (!dbRes.ok) {
    const err = await dbRes.json().catch(() => ({})) as { message?: string }
    return NextResponse.json({ error: `Création base échouée : ${err.message ?? dbRes.status}` }, { status: 502 })
  }

  const db = await dbRes.json() as { id: string; url?: string }
  await redis.set(`notion_db_id:${email}`, db.id, { ex: DB_TTL })

  return NextResponse.json({ ok: true, dbId: db.id, url: db.url })
}
