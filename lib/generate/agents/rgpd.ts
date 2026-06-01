import { getRedis, findLivrableByType, blobFetch } from '@/lib/generate/helpers'

export async function buildRegistreRGPDUserMessage(projectId: string, email: string, params: Record<string, unknown>): Promise<string> {
  const parts: string[] = []
  const redis = getRedis()

  const sourceIdsRGPD = await redis.lrange(`user_sources:${email}`, 0, -1) as string[]
  if (sourceIdsRGPD.length) {
    parts.push('## Sources qualifiées (métadonnées RGPD pré-analysées)')
    for (const id of sourceIdsRGPD.slice(0, 5)) {
      const rawMeta = await redis.get(`source_meta:${id}`) as string | null
      if (!rawMeta) continue
      const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta
      const metaBlock = [
        `### Source : ${meta.title ?? 'Sans titre'} (${meta.type ?? 'inconnu'})`,
        `URL : ${meta.url ?? 'N/A'}`,
        `Date qualification : ${meta.date ?? 'N/A'}`,
        `Score RGPD : ${meta.score_rgpd ?? 'N/A'}/10`,
        `Score IA Act : ${meta.score_ia_act ?? 'N/A'}/10`,
        `Décision : ${meta.decision ?? 'N/A'}`,
        `Tags : ${Array.isArray(meta.tags) ? meta.tags.join(', ') : (meta.tags ?? 'N/A')}`,
        `Flag excerpt : ${meta.flag_excerpt ?? 'Aucun'}`,
      ].join('\n')
      parts.push(metaBlock)

      if (meta.blobUrl) {
        try {
          const res = await blobFetch(meta.blobUrl)
          if (res.ok) parts.push(`Transcript (20 000 premiers caractères — détection données personnelles) :\n${(await res.text()).slice(0, 20000)}`)
        } catch { /* continue */ }
      }
    }
  } else {
    parts.push('## Sources\nAucune source qualifiée trouvée pour ce projet.')
  }

  const maquetteUrl = await findLivrableByType(email, projectId, 'maquette')
  if (maquetteUrl) {
    try {
      const res = await blobFetch(maquetteUrl)
      if (res.ok) parts.push(`\n## Maquette Pédagogique (activités générant des données personnelles)\n${(await res.text()).slice(0, 4000)}`)
    } catch { /* continue */ }
  }

  const scenarioUrl = await findLivrableByType(email, projectId, 'scenario_pedagogique')
  if (scenarioUrl) {
    try {
      const res = await blobFetch(scenarioUrl)
      if (res.ok) parts.push(`\n## Scénario Pédagogique (scanner patterns déclencheurs RGPD)\n${(await res.text()).slice(0, 4000)}`)
    } catch { /* continue */ }
  }

  const rawProjet = await redis.get(`projet:${projectId}`) as string | null
  if (rawProjet) {
    const projet = typeof rawProjet === 'string' ? JSON.parse(rawProjet) : rawProjet
    const ctx = projet.context ?? {}
    parts.push(`\n## Contexte projet : ${projet.titre}`)
    parts.push(`Organisation : ${projet.organisation}`)
    parts.push(`Stade : ${projet.stade}`)
    if (ctx.publicCible) parts.push(`Q1 Public : ${ctx.publicCible}`)
    if (ctx.secteur) parts.push(`Q2 Secteur : ${ctx.secteur}`)
    if (ctx.outils) parts.push(`Q6 Outils tiers utilisés : ${ctx.outils}`)
    if (ctx.conformite) parts.push(`Q8 Conformité déclarée : ${ctx.conformite}`)
  }

  const paramEntries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
  if (paramEntries.length) {
    parts.push('\n## Paramètres')
    for (const [k, v] of paramEntries) parts.push(`${k}: ${String(v)}`)
  } else {
    parts.push('\n## Paramètres\nType formation : non précisé — appliquer règles les plus strictes par défaut')
  }

  return parts.join('\n')
}
