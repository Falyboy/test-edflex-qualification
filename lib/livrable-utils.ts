export const TYPE_TO_CATEGORY: Record<string, string> = {
  carte: 'ingenierie',
  maquette: 'ingenierie',
  scenario_pedagogique: 'ingenierie',
  profil_formateur: 'ingenierie',
  syllabus: 'ingenierie',
  questionnaire_positionnement: 'ingenierie',
  parcours_blended: 'ingenierie',
  rubric: 'ingenierie',
  feedback: 'ingenierie',
  module: 'contenu',
  fiche: 'contenu',
  scenario: 'contenu',
  script_multimedia: 'contenu',
  glossaire: 'contenu',
  etude_de_cas: 'contenu',
  grille_terrain: 'contenu',
  journal_apprentissage: 'contenu',
  quiz: 'contenu',
  verdict_pi: 'admin',
  registre_rgpd: 'admin',
  bilan_sources: 'admin',
}

export function livrablesCountByCategory(
  livrables: { type: string }[],
  category: string
): number {
  return livrables.filter(l => TYPE_TO_CATEGORY[l.type] === category).length
}

export function extractTitleFromHtml(html: string): string | null {
  if (!html) return null
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match ? match[1].trim() : null
}

export function isHtmlContent(text: string): boolean {
  return text.trimStart().startsWith('<!DOCTYPE html>') || text.trimStart().startsWith('<html')
}

export function livrableFilename(label: string, content: string): string {
  const slug = (label || 'livrable')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const base = slug || 'livrable'
  const ext = isHtmlContent(content) ? 'html' : 'md'
  return `${base}.${ext}`
}
