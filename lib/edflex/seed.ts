import type { EdflexProject } from './store'
import { getUserProjects, saveProject, saveSource, setCachedTranscript } from './store'
import { buildSeedProject, buildSeedSources } from './seed-project'

// Crée le projet démo "Leadership" pour un nouvel utilisateur (0 projet).
// Idempotent : ne fait rien si l'utilisateur a déjà au moins un projet.
// Retourne le projet créé, ou null si rien n'a été fait.
export async function ensureDemoProject(email: string): Promise<EdflexProject | null> {
  const existing = await getUserProjects(email)
  if (existing.length > 0) return null

  const project = buildSeedProject(email)
  await saveProject(project)

  const sources = buildSeedSources(project.id)
  await Promise.all(
    sources.map(async s => {
      await saveSource(s)
      // Alimente le cache transcript global → si la même URL est ré-ajoutée
      // dans un autre projet, pas de ré-extraction.
      if (s.transcript && s.transcript.trim().length >= 50) {
        await setCachedTranscript(s.url, s.transcript, s.title).catch(() => null)
      }
    })
  )

  return project
}
