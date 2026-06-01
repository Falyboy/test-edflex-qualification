import { Redis } from '@upstash/redis'

export interface EdflexProject {
  id: string
  email: string
  titre: string
  organisation: string
  createdAt: string
  context: {
    publicCible: string
    secteur: string
    probleme: string
    format: string
    duree: string
    outils: string
    criteres: string
    conformite: string
    indicateurs: string
  }
}

export interface EdflexSource {
  id: string
  projectId: string
  url: string
  type: 'YouTube' | 'Podcast' | 'Article' | 'Fichier'
  title: string
  transcript?: string
  status: 'transcription' | 'qualification' | 'done' | 'error'
  decision?: 'Publier' | 'Réviser' | 'Rejeter' | 'Revue humaine'
  score?: number
  tags?: string[]
  justification?: string
  rejectReason?: string
  flagExcerpt?: string
  rgpd?: number
  iaAct?: number
  sujetPrincipal?: string
  niveau?: 'débutant' | 'intermédiaire' | 'expert'
  scorePersona?: number
  allScores?: {
    o: number
    p: number
    a_forme: number
    a_inclusion: number
    d: number
    pi: number
    rgpd: number
    ia_act: number
  }
  createdAt: string
}

export interface EdflexLivrable {
  agent: string
  label: string
  content?: string
  status: 'pending' | 'generating' | 'done' | 'error'
}

const TTL = 60 * 60 * 24 * 90

function redis() { return Redis.fromEnv() }

export async function saveProject(p: EdflexProject): Promise<void> {
  const r = redis()
  await Promise.all([
    r.set(`edflex_projet:${p.id}`, p, { ex: TTL }),
    r.sadd(`edflex_projects:${p.email}`, p.id),
  ])
}

export async function getProject(id: string): Promise<EdflexProject | null> {
  return redis().get<EdflexProject>(`edflex_projet:${id}`)
}

export async function getUserProjects(email: string): Promise<EdflexProject[]> {
  const r = redis()
  const ids = await r.smembers(`edflex_projects:${email}`)
  if (!ids.length) return []
  const projects = await Promise.all(ids.map(id => r.get<EdflexProject>(`edflex_projet:${id}`)))
  return projects.filter(Boolean) as EdflexProject[]
}

export async function saveSource(s: EdflexSource): Promise<void> {
  const r = redis()
  await Promise.all([
    r.set(`edflex_source:${s.id}`, s, { ex: TTL }),
    r.sadd(`edflex_sources:${s.projectId}`, s.id),
  ])
}

export async function getSource(id: string): Promise<EdflexSource | null> {
  return redis().get<EdflexSource>(`edflex_source:${id}`)
}

export async function getProjectSources(projectId: string): Promise<EdflexSource[]> {
  const r = redis()
  const ids = await r.smembers(`edflex_sources:${projectId}`)
  if (!ids.length) return []
  const sources = await Promise.all(ids.map(id => r.get<EdflexSource>(`edflex_source:${id}`)))
  return sources.filter(Boolean) as EdflexSource[]
}

// Dédup intra-projet : la même URL ne doit pas créer deux sources dans le même projet.
export async function findProjectSourceByUrl(projectId: string, url: string): Promise<EdflexSource | null> {
  const sources = await getProjectSources(projectId)
  return sources.find(s => s.url === url) ?? null
}

// Cache transcription par URL (clé globale) : la même source réutilisée dans un AUTRE
// projet ne paie pas la ré-extraction (API YouTube / OCR). Seul le scoring est rejoué
// avec le contexte du projet (alignement pédagogique = contextuel).
function urlKey(url: string): string {
  return Buffer.from(url).toString('base64url').slice(0, 200)
}

export async function getCachedTranscript(url: string): Promise<{ transcript: string; title: string } | null> {
  return redis().get<{ transcript: string; title: string }>(`edflex_transcript:${urlKey(url)}`)
}

export async function setCachedTranscript(url: string, transcript: string, title: string): Promise<void> {
  await redis().set(`edflex_transcript:${urlKey(url)}`, { transcript, title }, { ex: TTL })
}

export async function updateSource(id: string, patch: Partial<EdflexSource>): Promise<void> {
  const existing = await redis().get<EdflexSource>(`edflex_source:${id}`)
  if (!existing) return
  await redis().set(`edflex_source:${id}`, { ...existing, ...patch }, { ex: TTL })
}

export async function updateProject(id: string, patch: Partial<EdflexProject>): Promise<void> {
  const existing = await redis().get<EdflexProject>(`edflex_projet:${id}`)
  if (!existing) return
  await redis().set(`edflex_projet:${id}`, { ...existing, ...patch }, { ex: TTL })
}

export async function saveLivrables(projectId: string, livrables: EdflexLivrable[]): Promise<void> {
  await redis().set(`edflex_livrables:${projectId}`, livrables, { ex: TTL })
}

export async function getLivrables(projectId: string): Promise<EdflexLivrable[]> {
  return (await redis().get<EdflexLivrable[]>(`edflex_livrables:${projectId}`)) ?? []
}
