import { getRedis } from '@/lib/generate/helpers'

export async function buildBilanSourcesUserMessage(projectId: string, email: string): Promise<string> {
  const parts: string[] = []
  const redis = getRedis()

  const sourceIds = await redis.lrange(`user_sources:${email}`, 0, -1) as string[]
  if (sourceIds.length) {
    parts.push('## Sources qualifiées')
    for (const id of sourceIds.slice(0, 10)) {
      const rawMeta = await redis.get(`source_meta:${id}`) as string | null
      if (!rawMeta) continue
      const meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : rawMeta
      const scores = meta.scores ?? {}
      parts.push([
        `### ${meta.title ?? 'Sans titre'} (${meta.type ?? 'inconnu'})`,
        `URL : ${meta.url ?? 'N/A'}`,
        `Décision : ${meta.decision ?? 'N/A'}`,
        `Score global : ${meta.score_qualite ?? meta.score ?? 'N/A'}/10`,
        `Scores OPAD : O:${scores.o ?? 'N/A'} P:${scores.p ?? 'N/A'} A_forme:${scores.a_forme ?? 'N/A'} A_inclusion:${scores.a_inclusion ?? 'N/A'} D:${scores.d ?? 'N/A'}`,
        `RGPD : ${meta.score_rgpd ?? scores.rgpd ?? 'N/A'}/10 · IA Act : ${meta.score_ia_act ?? scores.ia_act ?? 'N/A'}/10 · PI : ${scores.pi ?? 'N/A'}/10`,
        `Tags : ${Array.isArray(meta.tags) ? meta.tags.join(', ') : (meta.tags ?? 'N/A')}`,
        meta.flag_excerpt ? `⚠️ Flag : ${meta.flag_excerpt}` : '',
      ].filter(Boolean).join('\n'))
    }
  } else {
    parts.push('## Sources\nAucune source qualifiée trouvée pour ce projet.')
  }

  const rawProjet = await redis.get(`projet:${projectId}`) as string | null
  if (rawProjet) {
    const projet = typeof rawProjet === 'string' ? JSON.parse(rawProjet) : rawProjet
    const ctx = projet.context ?? {}
    parts.push(`\n## Contexte projet : ${projet.titre}`)
    if (projet.organisation) parts.push(`Organisation : ${projet.organisation}`)
    if (projet.stade) parts.push(`Stade : ${projet.stade}`)
    if (ctx.publicCible) parts.push(`Public cible : ${ctx.publicCible}`)
    if (ctx.secteur) parts.push(`Secteur : ${ctx.secteur}`)
  }

  return parts.join('\n')
}
