import { buildCarteHtml, parseCarteJson } from '@/lib/generate/agents/carte-html'
import { renderMarkdownPage } from '@/lib/generate/markdown-page'
import { isHtmlContent, livrableFilename } from '@/lib/livrable-utils'

const CARTE_AGENT = 'AGENT_CARTE_CONCEPTUELLE'

// Transforme le contenu brut d'un livrable Edflex en page HTML affichable.
// - Carte : JSON → carte visuelle ; si JSON invalide → fallback markdown.
// - Autres : markdown → page HTML stylée.
// - Déjà HTML : servi tel quel.
export function renderLivrableHtml(agent: string, content: string, label: string): string {
  if (isHtmlContent(content)) return content

  if (agent === CARTE_AGENT) {
    const data = parseCarteJson(content)
    if (data) return buildCarteHtml(data)
    // JSON illisible → rendre le texte brut en markdown plutôt que d'afficher du JSON
  }

  return renderMarkdownPage(content, label)
}

export interface LivrableDownload {
  filename: string
  content: string
  mime: string
}

// Contenu à télécharger : carte → HTML visuel ; autres → markdown brut (le livrable propre).
export function livrableDownload(agent: string, content: string, label: string): LivrableDownload {
  if (agent === CARTE_AGENT) {
    const data = parseCarteJson(content)
    if (data) {
      const html = buildCarteHtml(data)
      return { filename: livrableFilename(label, html), content: html, mime: 'text/html' }
    }
  }
  if (isHtmlContent(content)) {
    return { filename: livrableFilename(label, content), content, mime: 'text/html' }
  }
  return { filename: livrableFilename(label, content), content, mime: 'text/markdown' }
}
