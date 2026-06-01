export interface EdflexContext {
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

export const CONTEXT_FIELDS: {
  key: keyof EdflexContext
  label: string
  placeholder: string
}[] = [
  { key: 'publicCible',  label: 'Q1 Public',      placeholder: 'Ex : équipes terrain 25-45 ans, retail' },
  { key: 'secteur',      label: 'Q2 Secteur',      placeholder: 'Ex : distribution, santé, logistique' },
  { key: 'probleme',     label: 'Q3 Problèmes',    placeholder: 'Ex : perte de temps en saisie manuelle' },
  { key: 'format',       label: 'Q4 Format',       placeholder: 'Ex : 60% e-learning, 40% présentiel' },
  { key: 'duree',        label: 'Q5 Durée',        placeholder: 'Ex : 3 jours sur 6 semaines' },
  { key: 'outils',       label: 'Q6 Outils',       placeholder: 'Ex : ChatGPT, Notion, Excel' },
  { key: 'criteres',     label: 'Q7 Critères',     placeholder: 'Ex : 80% quiz > 70%, pratique terrain' },
  { key: 'conformite',   label: 'Q8 Conformité',   placeholder: 'Ex : Qualiopi, RGPD, AI Act' },
  { key: 'indicateurs',  label: 'Q9 Indicateurs',  placeholder: 'Ex : adoption IA +40% à 3 mois' },
]

export function countFilledFields(ctx: EdflexContext): number {
  return CONTEXT_FIELDS.filter(({ key }) => ctx[key]?.trim().length > 0).length
}

export function emptyContext(): EdflexContext {
  return { publicCible: '', secteur: '', probleme: '', format: '', duree: '', outils: '', criteres: '', conformite: '', indicateurs: '' }
}
