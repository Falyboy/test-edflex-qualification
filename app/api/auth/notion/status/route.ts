import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { Redis } from '@upstash/redis'

let _redis: ReturnType<typeof Redis.fromEnv> | null = null
function getRedis() {
  if (!_redis) _redis = Redis.fromEnv()
  return _redis
}

export async function GET(): Promise<Response> {
  const cookieStore = await cookies()
  const raw = cookieStore.get('notion_token')?.value
  if (!raw) return NextResponse.json({ connected: false })

  let email: string | null = null
  try {
    const tokens = JSON.parse(raw) as { access_token?: string; owner?: { user?: { person?: { email?: string } } } }
    if (!tokens.access_token) return NextResponse.json({ connected: false })
    email = tokens.owner?.user?.person?.email ?? null
  } catch {
    return NextResponse.json({ connected: false })
  }

  if (!email) return NextResponse.json({ connected: true, dbId: null, dbUrl: null, quota: null, used: null })

  const redis = getRedis()
  const [dbId, quota, used] = await Promise.all([
    redis.get<string>(`notion_db_id:${email}`),
    redis.get<string>(`qual_quota:${email}`),
    redis.get<string | number>(`qual_count:${email}`),
  ])

  const dbUrl = dbId ? `https://www.notion.so/${dbId.replace(/-/g, '')}` : null

  return NextResponse.json({
    connected: true,
    email,
    dbId: dbId ?? null,
    dbUrl,
    quota: quota ? parseInt(quota, 10) : 40,
    used: used ? parseInt(String(used), 10) : 0,
  })
}
