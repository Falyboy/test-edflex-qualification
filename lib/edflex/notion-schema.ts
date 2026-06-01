// Schéma canonique unique de la base Notion "Pipeline contenus".
// Ordre des 14 colonnes IMPOSÉ — utilisé pour : création de la base,
// écriture des pages (sync), et affichage du tableau dans l'app.
// Toute table Notion sur ce sujet DOIT suivre cet ordre exact.

export type NotionColType = 'title' | 'url' | 'select' | 'number' | 'rich_text'

export interface NotionColumn {
  name: string
  notionType: NotionColType
  options?: { name: string; color: string }[]
}

export const NOTION_COLUMNS: NotionColumn[] = [
  { name: 'Nom', notionType: 'title' },
  { name: 'Urls', notionType: 'url' },
  {
    name: 'Type',
    notionType: 'select',
    options: [
      { name: 'YouTube', color: 'red' },
      { name: 'Podcast', color: 'purple' },
      { name: 'Web', color: 'blue' },
      { name: 'PDF', color: 'orange' },
      { name: 'Fichier', color: 'gray' },
    ],
  },
  { name: 'Flags', notionType: 'rich_text' },
  { name: 'IA Act', notionType: 'number' },
  { name: 'RGPD', notionType: 'number' },
  { name: 'Score O', notionType: 'number' },
  { name: 'Score P', notionType: 'number' },
  { name: 'Score A', notionType: 'number' },
  { name: 'Score D', notionType: 'number' },
  {
    name: 'Décision',
    notionType: 'select',
    options: [
      { name: 'Publier', color: 'green' },
      { name: 'Réviser', color: 'yellow' },
      { name: 'Rejeter', color: 'red' },
      { name: 'Revue humaine', color: 'orange' },
    ],
  },
  {
    name: 'Statut',
    notionType: 'select',
    options: [
      { name: 'À qualifier', color: 'gray' },
      { name: 'En cours', color: 'yellow' },
      { name: 'Qualifié', color: 'green' },
      { name: 'Rejeté', color: 'red' },
      { name: 'Revue humaine', color: 'orange' },
      { name: 'Quota atteint', color: 'pink' },
      { name: 'Erreur', color: 'red' },
    ],
  },
  { name: 'Justification', notionType: 'rich_text' },
  { name: 'Réf', notionType: 'rich_text' },
  // Ajoutés après les 14 d'origine (ordre des 14 préservé)
  { name: 'Sujet', notionType: 'rich_text' },
  {
    name: 'Niveau',
    notionType: 'select',
    options: [
      { name: 'débutant', color: 'green' },
      { name: 'intermédiaire', color: 'yellow' },
      { name: 'expert', color: 'red' },
    ],
  },
  { name: 'Score Persona', notionType: 'number' },
]

export interface SourceForNotion {
  title: string
  url: string
  type: string
  flags: string
  scores: {
    o: number
    p: number
    a_forme: number
    a_inclusion: number
    d: number
    pi: number
    rgpd: number
    ia_act: number
  }
  decision: string
  statut: string
  justification: string
  ref: string
  sujet?: string
  niveau?: string
  scorePersona?: number
}

// Schéma de propriétés pour la CRÉATION de la base (ordre = ordre des colonnes).
export function buildDatabaseProperties(): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const col of NOTION_COLUMNS) {
    switch (col.notionType) {
      case 'title':
        props[col.name] = { title: {} }
        break
      case 'url':
        props[col.name] = { url: {} }
        break
      case 'number':
        props[col.name] = { number: { format: 'number' } }
        break
      case 'rich_text':
        props[col.name] = { rich_text: {} }
        break
      case 'select':
        props[col.name] = { select: { options: col.options ?? [] } }
        break
    }
  }
  return props
}

function score1(n: number): number {
  return Math.round(n * 10) / 10
}

export interface DisplayCell {
  column: string
  value: string | number
}

// Ligne d'affichage pour le tableau dans l'app — 14 cellules dans l'ordre canonique.
export function buildDisplayRow(s: SourceForNotion): DisplayCell[] {
  const scoreA = score1((s.scores.a_forme + s.scores.a_inclusion) / 2)
  const byName: Record<string, string | number> = {
    'Nom':           s.title || s.url,
    'Urls':          s.url,
    'Type':          s.type,
    'Flags':         s.flags ?? '',
    'IA Act':        s.scores.ia_act,
    'RGPD':          s.scores.rgpd,
    'Score O':       s.scores.o,
    'Score P':       s.scores.p,
    'Score A':       scoreA,
    'Score D':       s.scores.d,
    'Décision':      s.decision,
    'Statut':        s.statut,
    'Justification': s.justification ?? '',
    'Réf':           s.ref ?? '',
    'Sujet':         s.sujet ?? '',
    'Niveau':        s.niveau ?? '',
    'Score Persona': s.scorePersona ?? '',
  }
  return NOTION_COLUMNS.map(col => ({ column: col.name, value: byName[col.name] ?? '' }))
}

// Propriétés d'une PAGE (source qualifiée) pour POST/PATCH.
export function buildPageProperties(s: SourceForNotion): Record<string, unknown> {
  const scoreA = score1((s.scores.a_forme + s.scores.a_inclusion) / 2)
  return {
    'Nom':           { title: [{ text: { content: (s.title || s.url).slice(0, 2000) } }] },
    'Urls':          { url: s.url || null },
    'Type':          { select: { name: s.type } },
    'Flags':         { rich_text: [{ text: { content: (s.flags ?? '').slice(0, 2000) } }] },
    'IA Act':        { number: s.scores.ia_act },
    'RGPD':          { number: s.scores.rgpd },
    'Score O':       { number: s.scores.o },
    'Score P':       { number: s.scores.p },
    'Score A':       { number: scoreA },
    'Score D':       { number: s.scores.d },
    'Décision':      { select: { name: s.decision } },
    'Statut':        { select: { name: s.statut } },
    'Justification': { rich_text: [{ text: { content: (s.justification ?? '').slice(0, 2000) } }] },
    'Réf':           { rich_text: [{ text: { content: (s.ref ?? '').slice(0, 2000) } }] },
    'Sujet':         { rich_text: [{ text: { content: (s.sujet ?? '').slice(0, 2000) } }] },
    'Niveau':        s.niveau ? { select: { name: s.niveau } } : { select: null },
    'Score Persona': { number: s.scorePersona ?? null },
  }
}
