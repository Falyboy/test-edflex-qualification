'use client'

import type { EdflexSource } from '@/lib/edflex/store'
import { NOTION_COLUMNS, buildDisplayRow, type SourceForNotion } from '@/lib/edflex/notion-schema'

function statutFromDecision(decision?: string): string {
  if (decision === 'Publier') return 'Qualifié'
  if (decision === 'Réviser') return 'En cours'
  if (decision === 'Rejeter') return 'Rejeté'
  if (decision === 'Revue humaine') return 'Revue humaine'
  return 'À qualifier'
}

function toSourceForNotion(s: EdflexSource): SourceForNotion {
  const sc = s.allScores ?? { o: 0, p: 0, a_forme: 0, a_inclusion: 0, d: 0, pi: 0, rgpd: s.rgpd ?? 0, ia_act: s.iaAct ?? 0 }
  return {
    title: s.title,
    url: s.url,
    type: s.type,
    flags: s.flagExcerpt ?? '',
    scores: sc,
    decision: s.decision ?? '',
    statut: statutFromDecision(s.decision),
    justification: s.justification ?? '',
    ref: s.id,
  }
}

const NUMERIC = new Set(['IA Act', 'RGPD', 'Score O', 'Score P', 'Score A', 'Score D'])

function scoreColor(v: number): string {
  if (v >= 7) return 'text-emerald-600'
  if (v >= 4) return 'text-amber-600'
  return 'text-red-600'
}

export function SourcesNotionTable({ sources }: { sources: EdflexSource[] }) {
  if (sources.length === 0) return null

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">
        Base Notion — sources qualifiées ({sources.length})
      </h2>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-200">
              {NOTION_COLUMNS.map(col => (
                <th key={col.name} className="px-3 py-2 text-left font-semibold text-zinc-500 whitespace-nowrap">
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sources.map(s => {
              const row = buildDisplayRow(toSourceForNotion(s))
              return (
                <tr key={s.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  {row.map(cell => {
                    const isNum = NUMERIC.has(cell.column) && typeof cell.value === 'number'
                    const isLong = cell.column === 'Justification' || cell.column === 'Flags' || cell.column === 'Nom'
                    return (
                      <td
                        key={cell.column}
                        className={[
                          'px-3 py-2 align-top',
                          isNum ? `font-semibold tabular-nums ${scoreColor(cell.value as number)}` : 'text-zinc-700',
                          isLong ? 'max-w-[220px] truncate' : 'whitespace-nowrap',
                        ].join(' ')}
                        title={typeof cell.value === 'string' ? cell.value : undefined}
                      >
                        {cell.column === 'Urls' && cell.value
                          ? <a href={String(cell.value)} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline underline-offset-2">lien</a>
                          : String(cell.value)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
