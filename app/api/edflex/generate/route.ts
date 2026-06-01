import OpenAI from 'openai'
import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { getEdflexEmail } from '@/lib/edflex/session'
import { AGENTS_EDFLEX, EdflexAgent, isProjectLocked } from '@/lib/edflex/limits'
import { getProject, getProjectSources, saveLivrables, EdflexLivrable } from '@/lib/edflex/store'
import { AgentRunner, AgentName } from '@/lib/agent-runner'

const AGENT_LABELS: Record<EdflexAgent, string> = {
  AGENT_BILAN_SOURCES: 'Bilan Sources',
  AGENT_CARTE_CONCEPTUELLE: 'Carte Conceptuelle',
  AGENT_CURATION: 'Fiche Outil',
  AGENT_CONTENU: 'Module E-Learning',
  AGENT_ROLEPLAY: 'Scénario Roleplay',
  AGENT_QUIZ: 'Quiz Automatisé',
}

function openai() {
  return new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com',
  })
}

async function generateOne(agentName: AgentName, userMessage: string): Promise<string> {
  const runner = new AgentRunner()
  const systemPrompt = await runner.loadSystemPrompt(agentName)
  const client = openai()
  const completion = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    stream: false,
  })
  return completion.choices[0]?.message?.content ?? ''
}

export async function POST(req: NextRequest) {
  const email = await getEdflexEmail()
  if (!email) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { projectId, force } = await req.json()
  if (!projectId) return NextResponse.json({ error: 'projectId requis' }, { status: 400 })

  const project = await getProject(projectId)
  if (!project || project.email !== email) return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })

  // Lock = 1 génération par projet (garde-fou coût). `force` = régénération demandée par l'utilisateur.
  const alreadyLocked = await isProjectLocked(projectId)
  if (alreadyLocked && !force) return NextResponse.json({ error: 'Livrables déjà générés' }, { status: 409 })

  const sources = await getProjectSources(projectId)
  const qualified = sources.filter(s => s.decision === 'Publier' || s.decision === 'Réviser')
  if (!qualified.length) return NextResponse.json({ error: 'Aucune source qualifiée' }, { status: 400 })

  // Lock immédiat
  await Redis.fromEnv().set(`edflex_locked:${projectId}`, true, { ex: 60 * 60 * 24 * 90 })

  // Contexte commun pour tous les agents
  const userMessage = [
    `## Projet : ${project.titre}`,
    `Organisation : ${project.organisation}`,
    `Public cible : ${project.context.publicCible}`,
    `Secteur : ${project.context.secteur}`,
    `Problème : ${project.context.probleme}`,
    '',
    '## Sources qualifiées',
    ...qualified.map(s =>
      `### ${s.title}\nScore : ${s.score}/10 | Tags : ${(s.tags ?? []).join(', ')}\n${(s.transcript ?? '').slice(0, 3000)}`
    ),
  ].join('\n')

  const results = await Promise.allSettled(
    AGENTS_EDFLEX.map(agentName => generateOne(agentName as AgentName, userMessage))
  )

  const livrables: EdflexLivrable[] = results.map((r, i) => ({
    agent: AGENTS_EDFLEX[i],
    label: AGENT_LABELS[AGENTS_EDFLEX[i]],
    status: r.status === 'fulfilled' ? 'done' : 'error',
    content: r.status === 'fulfilled' ? r.value : undefined,
  }))

  await saveLivrables(projectId, livrables)
  return NextResponse.json({ livrables })
}
