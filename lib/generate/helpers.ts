import { Redis } from '@upstash/redis'
import { get } from '@vercel/blob'

let _redis: ReturnType<typeof Redis.fromEnv> | null = null
export function getRedis() {
  if (!_redis) _redis = Redis.fromEnv()
  return _redis
}

// Lit un blob privé Vercel via le SDK get() (le fetch Bearer manuel renvoie 401 sur access:'private').
// Drop-in compatible avec l'ancien pattern fetch : retourne { ok, text() }.
export async function blobFetch(url: string): Promise<{ ok: boolean; text: () => Promise<string> }> {
  try {
    const result = await get(url, { access: 'private' })
    if (!result || !result.stream) return { ok: false, text: async () => '' }
    const body = await new Response(result.stream).text()
    return { ok: true, text: async () => body }
  } catch {
    return { ok: false, text: async () => '' }
  }
}

export async function findLivrableByType(email: string, projectId: string, type: string): Promise<string | null> {
  const redis = getRedis()
  const ids = await redis.lrange(`user_livrables:${email}`, 0, -1) as string[]
  if (!ids.length) return null
  const metas = await redis.mget<string[]>(...ids.map(id => `livrable_meta:${id}`))
  for (const raw of metas) {
    if (!raw) continue
    try {
      const m = typeof raw === 'string' ? JSON.parse(raw) : raw
      if (m.type === type && m.projectId === projectId) return m.blobUrl
    } catch { continue }
  }
  return null
}
