'use client'

import { useState, useEffect, useCallback } from 'react'

interface DriveStatus {
  googleConnected: boolean
  enabled: boolean
  pendingCount?: number
  config?: { rootId: string; inboxId: string }
}

const DriveIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0">
    <path d="M7.71 3.5L1.15 15l3.43 5.97h15.84l3.43-5.97L17.29 3.5H7.71z" fill="#0F9D58" opacity=".8"/>
    <path d="M1.15 15l3.43 5.97H12L8.57 15H1.15z" fill="#4285F4"/>
    <path d="M22.85 15h-7.42L12 21h7.42L22.85 15z" fill="#FBBC04"/>
    <path d="M7.71 3.5l3.43 5.97 3.43-5.97H7.71z" fill="#EA4335" opacity=".8"/>
  </svg>
)

export function DriveMonitorCard({ compact = false }: { compact?: boolean }) {
  const [status, setStatus]   = useState<DriveStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/drive/status')
      if (!res.ok) return
      setStatus(await res.json())
    } catch { /* best-effort */ } finally {
      setLoading(false)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch d'état au montage (async, pas de cascade synchrone)
  useEffect(() => { fetchStatus() }, [fetchStatus])

  const handleActivate = useCallback(async () => {
    setActing(true); setError(null)
    try {
      const res = await fetch('/api/drive/setup', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erreur'); return }
      await fetchStatus()
    } catch { setError('Erreur réseau') } finally { setActing(false) }
  }, [fetchStatus])

  const handleDisable = useCallback(async () => {
    setActing(true); setError(null)
    try {
      await fetch('/api/drive/status', { method: 'DELETE' })
      setStatus(prev => prev ? { ...prev, enabled: false } : null)
    } catch { setError('Erreur réseau') } finally { setActing(false) }
  }, [])

  if (loading) {
    if (compact) return <div className="h-8 w-24 bg-zinc-100 rounded-full animate-pulse" />
    return (
      <div className="flex items-center justify-between py-3 px-4 animate-pulse">
        <div className="h-3 bg-zinc-100 rounded w-1/3" />
      </div>
    )
  }

  // Mode compact : bouton inline style Notion
  if (compact) {
    if (!status?.googleConnected) {
      return (
        // eslint-disable-next-line @next/next/no-html-link-for-pages -- route API OAuth (redirect serveur), pas une page Next
        <a
          href="/api/auth/google"
          className="flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-500 transition-colors"
        >
          <DriveIcon />
          Connecter Google Drive
        </a>
      )
    }
    return (
      <div className="flex flex-col items-start gap-0.5">
        {status.enabled ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
              <DriveIcon />
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Actif
            </span>
            <a
              href={`https://drive.google.com/drive/folders/${status.config?.rootId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-500 transition-colors"
              title="Ouvrir le dossier Formation-IA"
            >
              📁 Ouvrir le dossier
            </a>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleActivate}
            disabled={acting}
            className="flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-500 transition-colors disabled:opacity-40"
          >
            <DriveIcon />
            {acting ? 'Création…' : 'Activer'}
          </button>
        )}
        <button
          type="button"
          onClick={async () => {
            await fetch('/api/auth/google/disconnect', { method: 'POST' })
            setStatus(null)
            setLoading(false)
          }}
          className="text-[11px] text-zinc-400 hover:text-red-500 transition-colors pl-1"
          title="Déconnecter Google Drive"
        >
          ✕ déconnecter
        </button>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    )
  }

  if (!status?.googleConnected) return null
  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <DriveIcon />
          <div>
            <p className="text-sm font-medium text-zinc-800">Surveillance Drive</p>
            <p className="text-xs text-zinc-400">
              {status.enabled
                ? `Actif — ${status.pendingCount ?? 0} fichier${(status.pendingCount ?? 0) > 1 ? 's' : ''} en attente`
                : 'Déposez des fichiers → qualification automatique'}
            </p>
          </div>
        </div>

        {status.enabled ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Actif
            </span>
            <button
              onClick={handleDisable}
              disabled={acting}
              className="text-xs text-zinc-400 hover:text-red-500 transition-colors disabled:opacity-40"
            >
              Désactiver
            </button>
          </div>
        ) : (
          <button
            onClick={handleActivate}
            disabled={acting}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 text-white hover:bg-zinc-700 transition-colors disabled:opacity-40"
          >
            {acting ? 'Création…' : 'Activer'}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {status.enabled && (
        <p className="text-[11px] text-zinc-400 pl-7">
          Dossier <strong>Formation-IA / À qualifier</strong> dans votre Drive · Scan toutes les 2 min
        </p>
      )}
    </div>
  )
}
