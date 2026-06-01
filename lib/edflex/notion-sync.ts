import { buildPageProperties } from '@/lib/edflex/notion-schema'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

export interface AllScores {
  o: number
  p: number
  a_forme: number
  a_inclusion: number
  d: number
  pi: number
  rgpd: number
  ia_act: number
}

export function buildRejectReason(scores: AllScores, flagExcerpt: string): string {
  if (scores.rgpd <= 3)         return `RGPD insuffisant (${scores.rgpd}/10)`
  if (scores.ia_act <= 3)       return `IA Act insuffisant (${scores.ia_act}/10)`
  if (scores.pi <= 3)           return `Propriété intellectuelle insuffisante (${scores.pi}/10)`
  if (scores.a_inclusion <= 3 && flagExcerpt) return flagExcerpt
  return ''
}

function extractToken(raw: string | object): string {
  if (typeof raw === 'object' && raw !== null) {
    return (raw as { access_token: string }).access_token
  }
  return (JSON.parse(raw as string) as { access_token: string }).access_token
}

function mapDecision(decision: string): string {
  if (decision === 'Publier')       return 'Qualifié'
  if (decision === 'Réviser')       return 'En cours'
  if (decision === 'Rejeter')       return 'Rejeté'
  if (decision === 'Revue humaine') return 'Revue humaine'
  return 'À qualifier'
}

function mapType(type: string): string {
  if (type === 'YouTube') return 'YouTube'
  if (type === 'Podcast') return 'Podcast'
  if (type === 'Article' || type === 'Web') return 'Web'
  if (type === 'PDF')     return 'PDF'
  if (type === 'Fichier') return 'Fichier'
  return 'Web'
}

export async function syncToNotion(params: {
  email: string
  title: string
  url: string
  type: string
  decision: string
  score: number
  scores: AllScores
  tags: string[]
  rejectReason: string
  flagExcerpt: string
  ref?: string
  sujet?: string
  niveau?: string
  scorePersona?: number
  justificationText?: string
  redisGet: (key: string) => Promise<unknown>
}): Promise<{ ok: boolean; reason?: string }> {
  const { email, title, url, type, decision, scores, tags, rejectReason, flagExcerpt, ref, sujet, niveau, scorePersona, justificationText, redisGet } = params

  const [rawToken, dbId] = await Promise.all([
    redisGet(`notion_token:${email}`),
    redisGet(`notion_db_id:${email}`),
  ])

  if (!rawToken) return { ok: false, reason: 'notion_token absent' }
  if (!dbId) return { ok: false, reason: 'notion_db_id absent' }

  let token: string
  try { token = extractToken(rawToken as string | object) }
  catch { return { ok: false, reason: 'token illisible' } }

  const justification = justificationText || rejectReason || (flagExcerpt ? `Contenu sensible : ${flagExcerpt}` : '') || tags.join(', ')

  const properties = buildPageProperties({
    title,
    url,
    type: mapType(type),
    flags: flagExcerpt,
    scores,
    decision,
    statut: mapDecision(decision),
    justification,
    ref: ref ?? '',
    sujet,
    niveau,
    scorePersona,
  })

  try {
    const res = await fetch(`${NOTION_API}/pages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ parent: { database_id: dbId as string }, properties }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { message?: string }
      console.error(`[edflex/notion-sync] POST ${res.status}: ${data.message ?? ''}`)
      return { ok: false, reason: `HTTP ${res.status}: ${data.message ?? ''}` }
    }
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[edflex/notion-sync] fetch threw: ${msg}`)
    return { ok: false, reason: msg }
  }
}
