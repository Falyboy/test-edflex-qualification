import { google } from 'googleapis'
import type { Redis } from '@upstash/redis'

const TOKEN_TTL = 60 * 60 * 24 * 29 // 29 jours
const REFRESH_MARGIN_MS = 60_000     // refresh 1 min avant expiration

interface StoredToken {
  access_token: string
  refresh_token?: string
  expiry_date?: number
}

// Sous-ensemble de @upstash/redis (les mocks de test sont castés via `as never`)
type RedisLike = Pick<Redis, 'get' | 'set'>

function normalize(raw: string | object): StoredToken {
  if (typeof raw === 'string') {
    // Legacy : access_token brut, ou JSON sérialisé
    return raw.startsWith('{') ? JSON.parse(raw) as StoredToken : { access_token: raw }
  }
  return raw as StoredToken
}

/**
 * Retourne un access_token Google valide pour l'email donné.
 * Rafraîchit automatiquement via refresh_token si expiré.
 * Retourne null si aucun token stocké.
 */
export async function getValidAccessToken(redis: RedisLike, email: string): Promise<string | null> {
  const raw = await redis.get(`google_token:${email}`) as string | object | null
  if (!raw) return null

  const stored = normalize(raw)
  const now = Date.now()
  const expired = stored.expiry_date ? stored.expiry_date < now + REFRESH_MARGIN_MS : false

  // Token valide, ou pas de refresh possible → renvoyer tel quel
  if (!expired || !stored.refresh_token) {
    return stored.access_token ?? null
  }

  // Rafraîchir
  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  oauth.setCredentials({ refresh_token: stored.refresh_token })
  const { credentials } = await oauth.refreshAccessToken()

  const updated: StoredToken = {
    access_token: credentials.access_token ?? stored.access_token,
    refresh_token: stored.refresh_token, // conservé (Google ne le renvoie pas toujours)
    // fallback expiry +1h si Google ne le renvoie pas → évite token figé qui n'est jamais rafraîchi
    expiry_date: credentials.expiry_date ?? Date.now() + 3_600_000,
  }
  await redis.set(`google_token:${email}`, JSON.stringify(updated), { ex: TOKEN_TTL })
  return updated.access_token
}
