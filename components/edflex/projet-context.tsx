'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CONTEXT_FIELDS, EdflexContext, countFilledFields, emptyContext } from '@/lib/edflex/projet-context'
import type { EdflexProject } from '@/lib/edflex/store'

interface ProjetContextProps {
  project: EdflexProject | null
  isCreating?: boolean
  prefillContext?: Partial<EdflexContext> | null
  onCreated?: () => void
}

function ctxFrom(src: Partial<EdflexContext>): EdflexContext {
  return {
    publicCible:  src.publicCible  ?? '',
    secteur:      src.secteur      ?? '',
    probleme:     src.probleme     ?? '',
    format:       src.format       ?? '',
    duree:        src.duree        ?? '',
    outils:       src.outils       ?? '',
    criteres:     src.criteres     ?? '',
    conformite:   src.conformite   ?? '',
    indicateurs:  src.indicateurs  ?? '',
  }
}

export function ProjetContext({ project, isCreating = false, prefillContext = null }: ProjetContextProps) {
  const router = useRouter()
  const [open, setOpen] = useState(isCreating)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [titre, setTitre] = useState(project?.titre ?? '')
  const [ctx, setCtx] = useState<EdflexContext>(
    project ? ctxFrom(project.context)
      // Nouveau projet : on reporte le contexte précédent (éditable), titre vide
      : prefillContext ? ctxFrom(prefillContext)
      : emptyContext()
  )

  const filled = countFilledFields(ctx)

  const handleChange = (key: keyof EdflexContext, value: string) => {
    setCtx(prev => ({ ...prev, [key]: value }))
  }

  const handleValider = async () => {
    if (isCreating && !titre.trim()) { setError('Titre requis'); return }
    setSaving(true)
    setError('')
    try {
      if (isCreating) {
        const res = await fetch('/api/edflex/project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ titre: titre.trim(), context: ctx }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error ?? 'Erreur'); return }
        router.push(`/edflex/${data.project.id}`)
      } else if (project) {
        const res = await fetch(`/api/edflex/project/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ titre: titre.trim(), context: ctx }),
        })
        if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Erreur'); return }
        router.refresh()
        setOpen(false)
      }
    } catch {
      setError('Erreur réseau')
    } finally { setSaving(false) }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-zinc-50 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <span className="text-zinc-400 text-sm">✏</span>
          <span className="text-sm font-semibold text-zinc-800">Contexte projet</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 font-medium">
            {filled}/9 remplis
          </span>
        </div>
        <span className="text-zinc-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-zinc-100">

          {/* Titre — uniquement en mode création */}
          {isCreating && (
            <div className="mt-4 mb-2">
              {prefillContext && filled > 0 && (
                <p className="mb-3 text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 rounded px-3 py-2">
                  Contexte du projet précédent reporté — modifie-le librement pour ce nouveau projet.
                </p>
              )}
              <label className="text-xs font-medium text-zinc-500 block mb-1">Titre du projet *</label>
              <input
                value={titre}
                onChange={e => { setTitre(e.target.value); setError('') }}
                placeholder="Ex : Leadership terrain"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300"
              />
            </div>
          )}

          {/* 9 champs 3×3 */}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-4">
            {CONTEXT_FIELDS.map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="text-xs font-medium text-zinc-500 block mb-1">{label}</label>
                <input
                  value={ctx[key]}
                  onChange={e => handleChange(key, e.target.value)}
                  placeholder={placeholder}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                />
              </div>
            ))}
          </div>

          {error && (
            <p className="mt-3 text-xs text-red-600">{error}</p>
          )}

          <div className="mt-4 flex justify-end">
            <button
              onClick={handleValider}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-700 disabled:opacity-40 transition-colors"
            >
              {saving ? '...' : '✓ Valider'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
