import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { Redis } from '@upstash/redis'
import { buildDatabaseProperties } from '@/lib/edflex/notion-schema'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const TOKEN_TTL = 60 * 60 * 24 * 30 // 30 jours

let _redis: ReturnType<typeof Redis.fromEnv> | null = null
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv()
  return _redis
}

function buildDbSchema(workspaceName: string, parentPageId: string) {
  return {
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: `${workspaceName} — Pipeline contenus` } }],
    // Ordre canonique des 14 colonnes — voir lib/edflex/notion-schema.ts
    properties: buildDatabaseProperties(),
  }
}

async function activateN8nWorkflow(dbId: string, email: string) {
  const n8nUrl = process.env.N8N_URL
  const n8nApiKey = process.env.N8N_API_KEY
  if (!n8nUrl || !n8nApiKey) return

  await fetch(`${n8nUrl}/api/v1/workflows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': n8nApiKey,
    },
    body: JSON.stringify({
      name: `notion-intake-${email}`,
      tags: ['notion-intake'],
      settings: { executionOrder: 'v1' },
      staticData: { dbId, email },
    }),
  })
}

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'Code manquant' }, { status: 400 })

  const clientId = process.env.NOTION_CLIENT_ID!
  const clientSecret = process.env.NOTION_CLIENT_SECRET!
  const redirectUri = process.env.NOTION_REDIRECT_URI!

  // 1. Échanger code → token
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const tokenRes = await fetch(`${NOTION_API}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  })

  if (!tokenRes.ok) return NextResponse.json({ error: `Notion API ${tokenRes.status}` }, { status: 502 })

  const tokens = await tokenRes.json() as {
    access_token: string
    workspace_id: string
    workspace_name: string
    owner?: { user?: { person?: { email?: string }; id?: string } }
  }

  const accessToken = tokens.access_token
  const workspaceName = tokens.workspace_name ?? 'Mon espace'
  const email = tokens.owner?.user?.person?.email ?? tokens.owner?.user?.id ?? 'unknown'

  // 2. Stocker token dans cookie (rétrocompatibilité)
  const cookieStore = await cookies()
  cookieStore.set('notion_token', JSON.stringify(tokens), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TOKEN_TTL,
    path: '/',
  })

  // 3. Stocker token dans Redis keyed par email
  const redis = getRedis()
  await redis.set(
    `notion_token:${email}`,
    JSON.stringify({ access_token: accessToken, workspace_id: tokens.workspace_id }),
    { ex: TOKEN_TTL }
  )

  // 4. Créer DB Notion dans le workspace user
  // On utilise une page racine du workspace comme parent (première page accessible)
  const searchRes = await fetch(`${NOTION_API}/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filter: { value: 'page', property: 'object' }, page_size: 1 }),
  })

  let parentPageId: string | null = null
  if (searchRes.ok) {
    const searchData = await searchRes.json() as { results?: Array<{ id: string }> }
    parentPageId = searchData.results?.[0]?.id ?? null
  }

  if (!parentPageId) {
    return NextResponse.json({ error: 'Impossible de trouver une page parent dans le workspace Notion' }, { status: 502 })
  }

  const dbRes = await fetch(`${NOTION_API}/databases`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildDbSchema(workspaceName, parentPageId)),
  })

  if (!dbRes.ok) {
    const errBody = await dbRes.json().catch(() => ({}))
    console.error('[notion-callback] DB create failed', dbRes.status, JSON.stringify(errBody))
    return NextResponse.json({ error: 'notion_db_create_failed', details: errBody }, { status: 502 })
  }

  const db = await dbRes.json() as { id: string; url: string }

  // 5. Stocker db_id dans Redis
  await redis.set(`notion_db_id:${email}`, db.id, { ex: TOKEN_TTL * 12 })

  // 6. Initialiser quota si absent
  const existingQuota = await redis.get(`qual_quota:${email}`)
  if (!existingQuota) {
    await redis.set(`qual_quota:${email}`, '40', { ex: TOKEN_TTL * 12 })
  }

  // 7. Activer workflow n8n (best-effort)
  // 8. Ajouter instructions dans la DB (best-effort)
  await fetch(`${NOTION_API}/blocks/${db.id}/children`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      children: [
        {
          type: 'callout',
          callout: {
            icon: { type: 'emoji', emoji: '☕' },
            color: 'blue_background',
            rich_text: [{ type: 'text', text: { content: 'Comment ça marche ? Collez un lien YouTube dans la colonne URL — la qualification démarre automatiquement. Le temps d\'un café, les scores OPAD apparaissent dans la ligne.' } }],
          },
        },
      ],
    }),
  }).catch(() => null)

  await activateN8nWorkflow(db.id, email).catch(() => null)

  const edflexEmails = (process.env.EDFLEX_ALLOWED_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean)
  const returnPath = edflexEmails.includes(email) ? '/edflex' : '/dashboard'
  return NextResponse.redirect(new URL(returnPath, req.nextUrl.origin), { status: 302 })
}
