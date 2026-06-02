'use client'

import { useState, useEffect, useCallback } from 'react'

interface NotionSourcePreview {
  notionPageId: string
  title: string
  url: string
  type: string
  decision: string
  statut: string
  scorePersona: number | null
  sujet: string
}

interface Props {
  projectId: string
  onImported: (sources: unknown[]) => void
  onClose: () => void
}

const DECISION_COLOR: Record<string, string> = {
  'Publier':       'text-emerald-700 bg-emerald-50 border-emerald-200',
  'Réviser':       'text-amber-700 bg-amber-50 border-amber-200',
  'Rejeter':       'text-red-700 bg-red-50 border-red-200',
  'Revue humaine': 'text-orange-700 bg-orange-50 border-orange-200',
}

export function NotionImportModal({ projectId, onImported, onClose }: Props) {
  const [sources, setSources] = useState<NotionSourcePreview[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/edflex/notion-sources')
      .then(r => r.json())
      .then((d: { sources?: NotionSourcePreview[]; error?: string }) => {
        if (d.error) { setError(d.error); return }
        setSources(d.sources ?? [])
      })
      .catch(() => setError('Erreur réseau'))
      .finally(() => setLoading(false))
  }, [])

  const toggle = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    if (selected.size === sources.length) setSelected(new Set())
    else setSelected(new Set(sources.map(s => s.notionPageId)))
  }, [selected.size, sources])

  const handleImport = useCallback(async () => {
    if (selected.size === 0) return
    setImporting(true)
    try {
      const pages = sources.filter(s => selected.has(s.notionPageId))
      const res = await fetch('/api/edflex/notion-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, pages }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erreur import'); return }
      onImported(data.sources ?? [])
      onClose()
    } catch {
      setError('Erreur réseau')
    } finally {
      setImporting(false)
    }
  }, [selected, sources, projectId, onImported, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <div>
            <p className="text-sm font-semibold text-zinc-800">Importer depuis Notion</p>
            <p className="text-xs text-zinc-400 mt-0.5">Sources qualifiées dans votre base Notion</p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-lg leading-none">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading && (
            <p className="text-sm text-zinc-400 text-center py-8">Chargement…</p>
          )}
          {error && (
            <p className="text-sm text-red-600 text-center py-4">{error}</p>
          )}
          {!loading && !error && sources.length === 0 && (
            <p className="text-sm text-zinc-400 text-center py-8 italic">
              Aucune source qualifiée dans votre base Notion.
            </p>
          )}
          {!loading && sources.length > 0 && (
            <>
              <button
                onClick={toggleAll}
                className="text-xs text-zinc-500 hover:text-zinc-800 underline underline-offset-2"
              >
                {selected.size === sources.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </button>
              {sources.map(s => (
                <label
                  key={s.notionPageId}
                  className={[
                    'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                    selected.has(s.notionPageId)
                      ? 'border-zinc-800 bg-zinc-50'
                      : 'border-zinc-200 bg-white hover:border-zinc-300',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.notionPageId)}
                    onChange={() => toggle(s.notionPageId)}
                    className="mt-0.5 accent-zinc-800 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-zinc-800 leading-snug line-clamp-2">{s.title}</p>
                      {s.decision && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-md border shrink-0 ${DECISION_COLOR[s.decision] ?? 'text-zinc-600 bg-zinc-50 border-zinc-200'}`}>
                          {s.decision}
                        </span>
                      )}
                    </div>
                    {s.sujet && <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{s.sujet}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      {s.type && <span className="text-[11px] text-zinc-400">{s.type}</span>}
                      {s.scorePersona != null && (
                        <span className="text-[11px] text-zinc-400">Persona {s.scorePersona}/10</span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-100">
          <p className="text-xs text-zinc-400">
            {selected.size > 0 ? `${selected.size} sélectionnée${selected.size > 1 ? 's' : ''}` : 'Aucune sélection'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleImport}
              disabled={selected.size === 0 || importing}
              className="px-4 py-2 text-sm rounded-lg bg-zinc-800 text-white hover:bg-zinc-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {importing ? 'Import…' : `Importer (${selected.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
