import { Redis } from '@upstash/redis'

export const MAX_PROJECTS = 3
export const MAX_SOURCES = 10

export const AGENTS_EDFLEX = [
  'AGENT_BILAN_SOURCES',
  'AGENT_CARTE_CONCEPTUELLE',
  'AGENT_CURATION',
  'AGENT_CONTENU',
  'AGENT_ROLEPLAY',
  'AGENT_QUIZ',
] as const

export type EdflexAgent = (typeof AGENTS_EDFLEX)[number]

function redis() { return Redis.fromEnv() }

export async function getProjectCount(email: string): Promise<number> {
  const ids = await redis().smembers(`edflex_projects:${email}`)
  return ids.length
}

export async function getSourceCount(projectId: string): Promise<number> {
  const ids = await redis().smembers(`edflex_sources:${projectId}`)
  return ids.length
}

export async function isProjectLocked(projectId: string): Promise<boolean> {
  const val = await redis().get(`edflex_locked:${projectId}`)
  return val === true || val === 'true' || val === 1
}
