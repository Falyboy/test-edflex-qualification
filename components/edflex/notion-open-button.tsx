'use client'

import { useState, useEffect } from 'react'

// Bouton qui ouvre la base Notion de l'utilisateur (comme "Ouvrir le dossier" pour Drive).
export function NotionOpenButton() {
  const [dbUrl, setDbUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/notion/status')
      .then(r => r.json())
      .then((d: { dbUrl?: string | null }) => { if (d.dbUrl) setDbUrl(d.dbUrl) })
      .catch(() => {})
  }, [])

  if (!dbUrl) return null

  return (
    <a
      href={dbUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 hover:border-zinc-500 transition-colors"
      title="Ouvrir la base Notion (sources qualifiées)"
    >
      <span className="inline-flex items-center justify-center w-3.5 h-3.5 bg-zinc-900 rounded-sm text-white text-[10px] font-bold">N</span>
      Ouvrir la base
    </a>
  )
}
