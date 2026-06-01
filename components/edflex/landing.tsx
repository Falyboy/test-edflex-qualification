'use client'
import { useState } from 'react'
import Link from 'next/link'
import { OnboardingModal } from './onboarding-modal'
import { MAX_PROJECTS } from '@/lib/edflex/limits'

interface Project {
  id: string
  titre: string
  organisation: string
  createdAt: string
}

export function EdflexLanding({ projects, email }: { projects: Project[]; email: string }) {
  const [showModal, setShowModal] = useState(projects.length === 0)

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      <header className="border-b border-zinc-800/60 px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-orange-500 uppercase tracking-widest">Edflex</span>
            <span className="text-xs text-zinc-700">·</span>
            <span className="text-xs text-zinc-500">Pipeline Qualification IA</span>
          </div>
          <p className="text-xs text-zinc-600 mt-0.5">{email}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          disabled={projects.length >= MAX_PROJECTS}
          className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-400 text-white rounded-xl font-medium disabled:opacity-40 transition-colors">
          + Nouveau projet
        </button>
      </header>

      <main className="flex-1 p-6 max-w-3xl mx-auto w-full">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-4">
              <span className="text-xl">⚡</span>
            </div>
            <p className="text-zinc-400 text-sm font-medium">Aucun projet</p>
            <p className="text-zinc-600 text-xs mt-1">Créez un projet pour lancer le pipeline</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500 mb-4">{projects.length}/{MAX_PROJECTS} projets</p>
            {projects.map(p => (
              <Link
                key={p.id}
                href={`/edflex/${p.id}`}
                className="flex items-center justify-between p-5 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-700 hover:bg-zinc-900/80 transition-all group">
                <div>
                  <p className="font-medium text-white text-sm group-hover:text-orange-400 transition-colors">{p.titre}</p>
                  {p.organisation && <p className="text-xs text-zinc-500 mt-0.5">{p.organisation}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-zinc-600">{new Date(p.createdAt).toLocaleDateString('fr-FR')}</p>
                  <span className="text-zinc-700 group-hover:text-zinc-400 transition-colors">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {showModal && <OnboardingModal onClose={() => setShowModal(false)} />}
    </div>
  )
}
