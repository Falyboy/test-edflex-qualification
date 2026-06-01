'use client'
import { useState, type FormEvent } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface Props { onClose: () => void }

function Field({ label, value, onChange, placeholder, required }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; required?: boolean
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1">{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-orange-500 transition-colors"
      />
    </div>
  )
}

export function OnboardingModal({ onClose }: Props) {
  const { data: session } = useSession()
  const router = useRouter()
  const [titre, setTitre] = useState('')
  const [organisation, setOrganisation] = useState('')
  const [publicCible, setPublicCible] = useState('')
  const [secteur, setSecteur] = useState('')
  const [probleme, setProbleme] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/edflex/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titre, organisation, context: { publicCible, secteur, probleme } }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erreur'); return }
      router.push(`/edflex/${data.project.id}`)
    } catch { setError('Erreur réseau') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-orange-500 uppercase tracking-wider">Edflex</span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-zinc-500">Pipeline Qualification</span>
          </div>
          <h2 className="text-lg font-semibold text-white">Nouveau projet</h2>
          {session?.user?.email && (
            <p className="text-xs text-zinc-500 mt-0.5">{session.user.email}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Titre du projet *" value={titre} onChange={setTitre} placeholder="Leadership RH — Edflex" required />
          <Field label="Organisation" value={organisation} onChange={setOrganisation} placeholder="Edflex" />
          <div className="border-t border-zinc-800 pt-3">
            <p className="text-xs text-zinc-500 mb-3">Contexte pédagogique (améliore la qualification)</p>
            <div className="space-y-3">
              <Field label="Public cible" value={publicCible} onChange={setPublicCible} placeholder="Managers RH, 30-50 ans" />
              <Field label="Secteur" value={secteur} onChange={setSecteur} placeholder="EdTech / Formation professionnelle" />
              <Field label="Problème principal" value={probleme} onChange={setProbleme} placeholder="Qualifier des contenus à grande échelle" />
            </div>
          </div>

          {error && <p className="text-sm text-red-400 bg-red-950/30 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm border border-zinc-700 rounded-xl text-zinc-400 hover:bg-zinc-800 transition-colors">
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !titre.trim()}
              className="flex-1 px-4 py-2.5 text-sm bg-orange-500 hover:bg-orange-400 text-white rounded-xl font-medium disabled:opacity-40 transition-colors">
              {loading ? 'Création...' : 'Créer →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
