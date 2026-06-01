import type { EdflexProject, EdflexSource } from './store'

// ════════════════════════════════════════════════════════════════════
// Projet démo "Leadership" — pré-chargé automatiquement pour tout nouvel
// utilisateur Edflex (0 projet). Contexte + sources avec transcriptions
// bakées + qualification pré-calculée. L'évaluateur n'a plus qu'à lancer
// la génération des livrables (le scoring/génération restent live).
//
// Les transcriptions sont figées (pas d'extraction live) → la démo marche
// toujours, même si une vidéo YouTube est down ou l'API rate-limitée.
// ════════════════════════════════════════════════════════════════════

export const SEED_CONTEXT: EdflexProject['context'] = {
  publicCible: 'Managers de proximité et conseillers terrain, 25-45 ans, peu de temps de formation',
  secteur: 'Distribution / retail',
  probleme: "Difficulté à incarner un leadership concret au quotidien : déléguer, donner du feedback, embarquer l'équipe",
  format: '70% e-learning court (5-10 min), 30% mise en situation terrain',
  duree: '6 semaines, ~20 min/jour',
  outils: 'Mobile-first, mode voix compatible',
  criteres: '80% de complétion, application terrain mesurée à 30 jours',
  conformite: 'RGPD, AI Act (transparence contenu)',
  indicateurs: "Adoption des pratiques de leadership +30% à 3 mois, baisse du turn-over d'équipe",
}

// Une source pré-qualifiée du projet démo. `decision` la place dans la bonne
// ligne (Catalogue qualifié / Revue humaine / Rejetés) à l'arrivée.
export type SeedSource = Omit<EdflexSource, 'id' | 'projectId' | 'createdAt'>

// Sources réelles du projet démo. Transcriptions figées (extraits authentiques),
// qualification OPAD pré-calculée. Les 2 articles HBR sont fournis ici ; les
// vidéos YouTube et le podcast sont à ajouter quand leur transcription est
// disponible (le pipeline les requalifiera live avec le contexte projet).
export const SEED_SOURCES: SeedSource[] = [
  {
    url: 'https://hbr.org/2001/12/the-work-of-leadership',
    type: 'Article',
    title: 'The Work of Leadership — Heifetz & Laurie (HBR)',
    transcript:
      "The Work of Leadership, by Ronald Heifetz and Donald Laurie. The authors introduce the concept of adaptive change — the sort of change that occurs when people and organizations are forced to adjust to a radically altered environment. Changes in societies, markets, customers, competition, and technology are forcing organizations to clarify their values, develop new strategies, and learn new ways of operating. Often the toughest task for leaders in effecting change is mobilizing people throughout the organization to do adaptive work. Adaptive work is required when our deeply held beliefs are challenged, when the values that made us successful become less relevant, and when legitimate yet competing perspectives emerge. Solutions to adaptive challenges reside not in the executive suite but in the collective intelligence of employees at all levels. The authors offer six principles for leading adaptive work: getting on the balcony, identifying the adaptive challenge, regulating distress, maintaining disciplined attention, giving the work back to people, and protecting voices of leadership from below. Get on the balcony: leaders have to view patterns as if from above the field of play. Regulate distress: adaptive work generates distress; a leader regulates pressure like a pressure cooker, turning up the heat while letting some steam escape. Give the work back to people: management needs to learn to support rather than control, and workers need to learn to take responsibility.",
    status: 'done',
    decision: 'Réviser',
    score: 6.9,
    tags: ['leadership', 'change management', 'adaptive work'],
    rgpd: 9,
    iaAct: 9,
    allScores: { o: 8, p: 7, a_forme: 5, a_inclusion: 7, d: 6, pi: 9, rgpd: 9, ia_act: 9 },
    flagExcerpt: '',
    rejectReason: '',
    sujetPrincipal: "Mobiliser l'organisation à faire le travail adaptatif face au changement, plutôt que d'apporter des solutions toutes faites.",
    niveau: 'expert',
    scorePersona: 7,
    justification:
      "Cadre conceptuel puissant (travail adaptatif, six principes) très pertinent pour des managers confrontés au changement. Mais article académique, en anglais et dense : à réviser/adapter pour un public terrain retail avant publication.",
  },
  {
    url: 'https://hbr.org/1990/05/what-leaders-really-do',
    type: 'Article',
    title: 'What Leaders Really Do — John P. Kotter (HBR)',
    transcript:
      "What Leaders Really Do, by John P. Kotter. Leadership is different from management, but not for the reasons most people think. Leadership and management are two distinctive and complementary systems of action. Management is about coping with complexity; leadership is about coping with change. Companies manage complexity by planning and budgeting, organizing and staffing, and controlling and problem solving. By contrast, leading an organization to constructive change begins by setting a direction — developing a vision of the future along with strategies for producing the changes needed to achieve that vision. The equivalent of organizing and staffing is aligning people: communicating the new direction to those who can create coalitions that understand the vision and are committed to its achievement. And achieving a vision requires motivating and inspiring — keeping people moving in the right direction by appealing to basic human needs, values, and emotions. Most U.S. corporations are overmanaged and underled. More change always demands more leadership. One way to develop leadership is to create challenging opportunities for young employees. Institutionalizing a leadership-centered culture is the ultimate act of leadership.",
    status: 'done',
    decision: 'Publier',
    score: 7.2,
    tags: ['leadership', 'management', 'vision'],
    rgpd: 9,
    iaAct: 9,
    allScores: { o: 7, p: 8, a_forme: 7, a_inclusion: 7, d: 6, pi: 9, rgpd: 9, ia_act: 9 },
    flagExcerpt: '',
    rejectReason: '',
    sujetPrincipal: "Distinguer leadership (gérer le changement : direction, alignement, motivation) et management (gérer la complexité).",
    niveau: 'intermédiaire',
    scorePersona: 8,
    justification:
      "Référence claire et structurée sur la différence leadership/management, directement utile pour un manager de proximité. Exemples concrets (SAS, Kodak, P&G). Format article long à découper en modules courts pour le terrain.",
  },
]

let _seq = 0
function seedId(prefix: string): string {
  _seq += 1
  return `${prefix}_${Date.now().toString(36)}_${_seq}`
}

export function buildSeedProject(email: string): EdflexProject {
  return {
    id: seedId('demo'),
    email,
    titre: 'Démo — Leadership terrain',
    organisation: 'Edflex',
    createdAt: new Date().toISOString(),
    context: SEED_CONTEXT,
  }
}

export function buildSeedSources(projectId: string): EdflexSource[] {
  return SEED_SOURCES.map(s => ({
    ...s,
    id: seedId('src'),
    projectId,
    createdAt: new Date().toISOString(),
  }))
}
