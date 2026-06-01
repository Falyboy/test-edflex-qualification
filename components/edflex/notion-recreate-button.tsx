'use client'

import { useState } from 'react'

export function NotionRecreateButton() {
  const [recreating, setRecreating] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  async function recreate() {
    setRecreating(true)
    setMsg(null)
    try {
      const res = await fetch('/api/edflex/notion/recreate', { method: 'POST' })
      const data = await res.json().catch(() => ({})) as { error?: string; url?: string }
      if (res.ok) {
        setOk(true)
        setMsg('Base Notion recréée avec les 14 colonnes — les prochaines sources s\'y synchronisent.')
      } else {
        setOk(false)
        setMsg(data.error ?? 'Échec de la recréation')
      }
    } catch {
      setOk(false)
      setMsg('Erreur réseau')
    } finally {
      setRecreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <button
          onClick={recreate}
          disabled={recreating}
          className="text-xs text-zinc-500 hover:text-zinc-800 underline underline-offset-2 disabled:opacity-40"
          title="Recrée la base Notion avec les 14 colonnes dans l'ordre exact (Nom, Urls, Type, Flags, IA Act, RGPD, Score O/P/A/D, Décision, Statut, Justification, Réf)"
        >
          {recreating ? 'Recréation de la base Notion…' : 'Recréer la base Notion (schéma à jour)'}
        </button>
      </div>
      {msg && (
        <p className={`text-xs rounded px-3 py-2 border ${ok ? 'text-green-700 bg-green-50 border-green-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
          {msg}
        </p>
      )}
    </div>
  )
}
