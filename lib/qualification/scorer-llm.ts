import OpenAI from 'openai'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProjetContext {
  secteur?: string
  sousMétier?: string
  metier?: string
  niveau?: string
  problemes?: string[]
  vision?: string
  formats?: string[]
  heures?: string
  rythme?: string
  outils?: string
  kpis?: string
}

export interface QualifyInput {
  text: string
  title: string
  sourceType: string
  projetContext?: ProjetContext
}

export type Niveau = 'débutant' | 'intermédiaire' | 'expert'

export interface QualifyResult {
  decision: 'Publier' | 'Réviser' | 'Rejeter' | 'Revue humaine' | 'Erreur'
  score_qualite: number
  scores: {
    rgpd: number
    ia_act: number
    pi: number
    o: number
    p: number
    a_forme: number
    a_inclusion: number
    d: number
  }
  sensibilite_flag: boolean
  flag_excerpt?: string
  langue: string
  tags: string[]
  sujet_principal: string
  niveau: Niveau
  score_persona: number
  justification: string
}

function normalizeNiveau(raw: unknown): Niveau {
  const v = typeof raw === 'string' ? raw.toLowerCase().trim() : ''
  if (v.startsWith('débu') || v.startsWith('debu')) return 'débutant'
  if (v.startsWith('exp')) return 'expert'
  return 'intermédiaire'
}

// ─── Rubrics ──────────────────────────────────────────────────────────────────

const RUBRIC_O = `
## O — Originalité (score 0-10, synthèse de ces 10 critères)
Échelle : 0-4 = Inadéquat · 6 = À réviser · 8 = Satisfaisant · 10 = Excellent

1. Source identifiable : auteur absent/douteux → auteur/éditeur clair et traçable
2. Fiabilité : peu fiable ou incohérente → source solide et reconnue
3. Originalité / non-reproduction : copier-coller manifeste → angle réellement nouveau
4. Angle personnel identifiable : texte impersonnel → point de vue assumé et pertinent
5. Pas de simple compilation : compilation brute → synthèse éditoriale forte avec fil directeur
6. Profondeur équilibrée : trop léger ou trop exhaustif → niveau très maîtrisé et homogène
7. Contenu distinct et non répétitif : redondant ou inutile → contenu très bien ciblé
8. Sources citées (PI) : aucune source → sources variées et explicites
9. Transparence d'origine (PI) : origine impossible à établir → traçabilité explicite de bout en bout
10. Respect citations/licences (PI) : absence ou violation → références complètes, licences claires
`

const RUBRIC_P_BASE = `
## P — Pédagogie (score 0-10, synthèse de ces 11 critères)
Échelle : 0-4 = Inadéquat · 6 = À réviser · 8 = Satisfaisant · 10 = Excellent

1. Pertinence persona : surcharge cognitive/jargon → très lisible et très adapté au public
2. Applicabilité terrain : purement théorique → très orienté terrain, concret, orienté action
3. Alignement besoin projet : hors sujet → parfaitement aligné avec l'objectif déclaré
4. Clarté de l'objectif : flou ou absent → précis et mesurable
5. Niveau Bloom : non cohérent → parfaitement calibré au résultat attendu
6. Enchaînement logique (problème → explication → exemple → conclusion) : confus → très fluide
7. Progression général → concret : trop abstrait → très fluide du général au concret
8. Cohérence des niveaux du début à la fin : saut de niveau gênant → progression stable
9. Exemples pédagogiques illustrant une idée : aucun exemple → exemples excellents
10. Invitation à agir : aucune action → incitation forte et utile
11. Références à l'objectif d'apprentissage : aucune référence → références pédagogiques fortes
`

const RUBRIC_P_CONTEXT = (ctx: ProjetContext) => {
  const lines = [
    ctx.secteur && `Secteur : ${ctx.secteur}${ctx.sousMétier ? ' > ' + ctx.sousMétier : ''}`,
    ctx.metier && `Public cible : ${ctx.metier}${ctx.niveau ? ' — niveau ' + ctx.niveau : ''}`,
    ctx.problemes?.length && `Problèmes à résoudre : ${ctx.problemes.join(' / ')}`,
    ctx.vision && `Objectif pédagogique : ${ctx.vision}`,
    ctx.formats?.length && `Formats : ${ctx.formats.join(', ')}`,
    ctx.rythme && `Rythme : ${ctx.rythme}`,
    ctx.outils && `Outils terrain : ${ctx.outils}`,
    ctx.kpis && `KPIs visés : ${ctx.kpis}`,
  ].filter(Boolean).join('\n')

  return `
## CONTEXTE PROJET (utilise ces infos pour scorer chaque critère P)
${lines}

${RUBRIC_P_BASE}
Score P = évalue chaque critère EN FONCTION de ce contexte projet.
Critère 3 (alignement besoin) : la source répond-elle directement aux problèmes listés ?
Critère 1 (persona) : le vocabulaire est-il adapté au public et niveau déclarés ?
Critère 5 (Bloom) : la profondeur correspond-elle au résultat attendu dans le projet ?
`
}

const RUBRIC_A_FORME = `
## A_FORME — Accessibilité structurelle (score 0-10, synthèse de ces 7 critères)
Échelle : 0-4 = Inadéquat · 6 = À réviser · 8 = Satisfaisant · 10 = Excellent

1. Lisibilité / charge cognitive : surcharge cognitive → lecture immédiate, phrases courtes
2. Format et intégrité du contenu : texte cassé ou tronqué → texte impeccable et complet
3. Compréhensibilité immédiate : difficile à comprendre → compréhension instantanée
4. Éléments visuels décrits verbalement : dépendance au visuel → description très claire
5. Références écran explicites et non ambiguës : ambiguë ou absente → parfaitement explicite
6. Consignes d'usage claires sans dépendre du visuel : impossible sans visuel → immédiatement applicables
7. Questionnaire de cadrage suffisant : cadrage insuffisant → cadrage très complet
`

const RUBRIC_A_INCLUSION = `
## A_INCLUSION — Accessibilité inclusive (score 0-10, synthèse de ces 9 critères)
Échelle : 0-4 = Inadéquat · 6 = À réviser · 8 = Satisfaisant · 10 = Excellent
⚠️ Si score ≤ 3 → déclenchement d'une revue humaine obligatoire

1. Moqueries sur genre, origine, religion, handicap, statut social : dénigrement ciblé → respect total
2. Stéréotypes grossiers ou répétitifs sur des groupes : stéréotypes explicites → représentation équilibrée
3. Représentation déséquilibrée : même groupe toujours en défaut → très bon équilibre
4. Ton humiliant ou dénigrant : humiliant → très respectueux et neutre
5. Blagues faciles sur situations dramatiques : punchline déplacée → très bien cadré
6. Sujet sensible traité sans précaution : trivialisation → traitement très prudent
7. Absence de mise en garde sur sujet pouvant heurter : aucun avertissement → avertissement clair et utile
8. Auteur reconnaît ses limites ou biais : moralisateur ou fermé → réflexivité forte
9. Absence de posture réflexive : aucune nuance → très bonne posture réflexive
`

const RUBRIC_D = `
## D — Design (score 0-10, synthèse de ces 8 critères)
Échelle : 0-4 = Inadéquat · 6 = À réviser · 8 = Satisfaisant · 10 = Excellent

1. Expérience fluide : confuse ou lourde → très fluide, aucun frottement
2. Ergonomie mobile / terrain : inadapté au mobile → excellente ergonomie smartphone
3. Structure visuelle : illisible → très claire et hiérarchisée
4. Adaptation au format du module : incompatible → parfaite adaptation au parcours
5. Narrateur oriente l'attention visuelle : aucune guidance → guidage très efficace et systématique
6. Idée clé toujours complétée verbalement : non expliqué → systématique et exemplaire
7. Une zone / un élément à la fois : tout mélangé → découpage très progressif
8. Adaptation au type de support : support mal pris en compte → adaptation parfaite au format
`

const GATES = `
## GATES BLOQUANTS (scores 0-10 — si score ≤ 3 : rejet automatique)

- rgpd : collecte de données personnelles, tracking, conformité GDPR
- ia_act : transparence sur l'IA, biais algorithmiques, risques systèmes IA
- pi : droits d'auteur, plagiat, licences (distinct des critères O 8-10 qui scorent la qualité des citations)
`

const OUTPUT_FORMAT = `
## FORMAT DE RÉPONSE
Réponds UNIQUEMENT en JSON valide, sans texte autour :
{
  "rgpd": X,
  "ia_act": X,
  "pi": X,
  "o": X,
  "p": X,
  "a_forme": X,
  "a_inclusion": X,
  "d": X,
  "langue": "fr",
  "tags": ["tag1", "tag2", "tag3"],
  "flag_excerpt": "...",
  "sujet_principal": "...",
  "niveau": "débutant|intermédiaire|expert",
  "score_persona": X,
  "justification": "..."
}
Tous les scores sont des entiers entre 0 et 10.
flag_excerpt : si a_inclusion ≤ 4, copie ici le passage exact du texte qui justifie ce score (max 250 caractères). Sinon, chaîne vide "".
sujet_principal : le sujet pédagogique principal du contenu, en UNE phrase claire (max 200 caractères).
niveau : le niveau de l'apprenant visé — exactement "débutant", "intermédiaire" ou "expert".
score_persona : pertinence du contenu POUR LE PERSONA CIBLE déclaré dans le contexte projet (secteur, métier, problèmes), entier 0-10. Si aucun contexte persona, reflète la pertinence générale.
justification : 2 à 3 phrases expliquant la décision de qualification (forces, faiblesses, pour qui). Concret, max 500 caractères.
`

// ─── Build prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx?: ProjetContext): string {
  const pSection = ctx && (ctx.secteur || ctx.metier || ctx.problemes?.length)
    ? RUBRIC_P_CONTEXT(ctx)
    : RUBRIC_P_BASE

  return `Tu es un expert en qualification pédagogique de contenus de formation.
Évalue le contenu fourni selon le système OPAD.

${GATES}
${RUBRIC_O}
${pSection}
${RUBRIC_A_FORME}
${RUBRIC_A_INCLUSION}
${RUBRIC_D}
${OUTPUT_FORMAT}`
}

// ─── Decision logic ───────────────────────────────────────────────────────────

function computeDecision(scores: QualifyResult['scores']): Pick<QualifyResult, 'decision' | 'score_qualite' | 'sensibilite_flag'> {
  const bloquant = scores.rgpd <= 3 || scores.ia_act <= 3 || scores.pi <= 3
  const sensibilite_flag = scores.a_inclusion <= 3

  const a = (scores.a_forme + scores.a_inclusion) / 2
  const score_qualite = Math.round(
    (scores.o * 0.25 + scores.p * 0.35 + a * 0.25 + scores.d * 0.15) * 10
  ) / 10

  if (bloquant) return { decision: 'Rejeter', score_qualite, sensibilite_flag }
  if (sensibilite_flag) return { decision: 'Revue humaine', score_qualite, sensibilite_flag }
  if (score_qualite >= 7) return { decision: 'Publier', score_qualite, sensibilite_flag }
  if (score_qualite >= 5) return { decision: 'Réviser', score_qualite, sensibilite_flag }
  return { decision: 'Rejeter', score_qualite, sensibilite_flag }
}

// ─── Main scorer ──────────────────────────────────────────────────────────────

export async function scoreLLM(input: QualifyInput): Promise<QualifyResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY manquant')

  const client = new OpenAI({
    baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
    apiKey,
  })

  const truncated = input.text.slice(0, 50000)
  const userPrompt = `Titre : ${input.title}\nType : ${input.sourceType}\n\nContenu :\n${truncated}`

  const response = await client.chat.completions.create({
    model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat',
    temperature: 0,
    messages: [
      { role: 'system', content: buildSystemPrompt(input.projetContext) },
      { role: 'user', content: userPrompt },
    ],
  })

  const raw = response.choices[0]?.message?.content ?? ''
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    const err = new Error('Réponse LLM invalide — JSON non parsable') as Error & { rawResponse?: string; model?: string }
    err.rawResponse = raw.slice(0, 500)
    err.model = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'
    throw err
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    rgpd?: number; ia_act?: number; pi?: number
    o?: number; p?: number; a_forme?: number; a_inclusion?: number; d?: number
    langue?: string; tags?: unknown[]; flag_excerpt?: unknown
    sujet_principal?: unknown; niveau?: unknown; score_persona?: unknown; justification?: unknown
  }

  const scores: QualifyResult['scores'] = {
    rgpd:        Math.min(10, Math.max(0, Math.round(parsed.rgpd ?? 5))),
    ia_act:      Math.min(10, Math.max(0, Math.round(parsed.ia_act ?? 5))),
    pi:          Math.min(10, Math.max(0, Math.round(parsed.pi ?? 5))),
    o:           Math.min(10, Math.max(0, Math.round(parsed.o ?? 5))),
    p:           Math.min(10, Math.max(0, Math.round(parsed.p ?? 5))),
    a_forme:     Math.min(10, Math.max(0, Math.round(parsed.a_forme ?? 5))),
    a_inclusion: Math.min(10, Math.max(0, Math.round(parsed.a_inclusion ?? 5))),
    d:           Math.min(10, Math.max(0, Math.round(parsed.d ?? 5))),
  }

  const { decision, score_qualite, sensibilite_flag } = computeDecision(scores)
  const langue = typeof parsed.langue === 'string' ? parsed.langue : ''
  const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((t): t is string => typeof t === 'string') : []
  const flag_excerpt = typeof parsed.flag_excerpt === 'string' && parsed.flag_excerpt.trim()
    ? parsed.flag_excerpt.slice(0, 250)
    : undefined

  const sujet_principal = typeof parsed.sujet_principal === 'string' ? parsed.sujet_principal.slice(0, 200).trim() : ''
  const niveau = normalizeNiveau(parsed.niveau)
  const score_persona = typeof parsed.score_persona === 'number'
    ? Math.min(10, Math.max(0, Math.round(parsed.score_persona)))
    : Math.round(score_qualite)
  const justification = typeof parsed.justification === 'string' ? parsed.justification.slice(0, 500).trim() : ''

  return { decision, score_qualite, scores, sensibilite_flag, flag_excerpt, langue, tags, sujet_principal, niveau, score_persona, justification }
}
