import { promises as fs } from 'fs'
import path from 'path'

const VALID_AGENTS = ['AGENT_CONTENU', 'AGENT_CURATION', 'AGENT_ROLEPLAY', 'AGENT_CARTE_CONCEPTUELLE', 'AGENT_MAQUETTE_PEDAGOGIQUE', 'AGENT_SCENARIO_PEDAGOGIQUE', 'AGENT_PROFIL_FORMATEUR', 'AGENT_SYLLABUS', 'AGENT_POSITIONNEMENT', 'AGENT_PARCOURS_BLENDED', 'AGENT_MULTIMEDIA', 'AGENT_GLOSSAIRE_METIER', 'AGENT_ETUDE_DE_CAS', 'AGENT_RUBRIC', 'AGENT_GRILLE_TERRAIN', 'AGENT_JOURNAL_APPRENTISSAGE', 'AGENT_QUIZ', 'AGENT_FEEDBACK', 'AGENT_CONFORMITE_PI', 'AGENT_REGISTRE_RGPD', 'AGENT_BILAN_SOURCES'] as const
export type AgentName = (typeof VALID_AGENTS)[number]

export interface GenerationParams {
  theme?: string
  persona?: string
  stade?: number
  duree?: number
  departement?: string
  competence?: string
  difficulte?: string
  contexte?: string
  nomOutil?: string
  casUsage?: string
  [key: string]: unknown
}

export class AgentRunner {
  private agentsDir: string

  constructor(buildosPath?: string) {
    // Agent files bundled in project under /agents — buildosPath kept for legacy compat
    this.agentsDir = path.join(process.cwd(), 'agents')
  }

  async loadSystemPrompt(agent: AgentName): Promise<string> {
    if (!VALID_AGENTS.includes(agent)) {
      throw new Error(`Unknown agent: ${agent}`)
    }
    const resolved = path.resolve(path.join(this.agentsDir, agent, `${agent}.md`))
    const base = path.resolve(this.agentsDir)
    if (!resolved.startsWith(base + path.sep) && resolved !== base) {
      throw new Error('Invalid agent path')
    }
    return fs.readFile(resolved, 'utf-8')
  }

  buildUserMessage(params: GenerationParams): string {
    return Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join('\n')
  }

  buildMessages(systemPrompt: string, userMessage: string) {
    return {
      system: systemPrompt,
      messages: [{ role: 'user' as const, content: userMessage }],
    }
  }
}
