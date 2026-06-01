'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SourcePicker, Source } from '@/components/source-picker'
import { ProjetContext } from './projet-context'
import type { EdflexProject, EdflexSource, EdflexLivrable } from '@/lib/edflex/store'
import { MAX_PROJECTS } from '@/lib/edflex/limits'
import { SourcesNotionTable } from './sources-table'
import { NotionRecreateButton } from './notion-recreate-button'
import { renderLivrableHtml, livrableDownload } from '@/lib/edflex/render-livrable'

function downloadLivrable(agent: string, content: string, label: string) {
  const { filename, content: body, mime } = livrableDownload(agent, content, label)
  const blob = new Blob([body], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function viewLivrable(agent: string, content: string, label: string) {
  // Ouvre la fenêtre SYNCHRONIQUEMENT (sinon popup blocker)
  const win = window.open('', '_blank')
  if (!win) return
  const html = renderLivrableHtml(agent, content, label)
  win.document.open()
  win.document.write(html)
  win.document.close()
}

const LIVRABLE_LABELS: Record<string, string> = {
  AGENT_BILAN_SOURCES:      'Bilan Sources',
  AGENT_CARTE_CONCEPTUELLE: 'Carte Conceptuelle',
  AGENT_CURATION:           'Fiche Outil',
  AGENT_CONTENU:            'Module E-Learning',
  AGENT_ROLEPLAY:           'Scénario Roleplay',
  AGENT_QUIZ:               'Quiz Automatisé',
}

function sourceTypeMap(type: Source['type']): string {
  if (type === 'youtube') return 'YouTube'
  if (type === 'podcast') return 'Podcast'
  if (type === 'web')     return 'Web'
  if (type === 'file')    return 'Fichier'
  return 'YouTube'
}

interface ProjectTab {
  id: string
  titre: string
  organisation: string
  createdAt: string
}

// ── Pending source card (transcription / qualification) ───────────────────────
function PendingSourceCard({ source }: { source: EdflexSource }) {
  const isTranscription = source.status === 'transcription'
  const label = isTranscription ? 'Transcription…' : 'Qualification IA…'
  const icon  = isTranscription ? '⏳' : '🔍'
  const color = isTranscription ? 'bg-zinc-400' : 'bg-blue-400'

  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-zinc-700 truncate flex-1 font-medium">{source.title}</p>
        <span className="text-xs text-zinc-400 whitespace-nowrap shrink-0">{icon} {label}</span>
      </div>
      {/* Barre de progression indéterminée */}
      <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full`}
          style={{
            width: '40%',
            animation: 'slide-progress 1.5s ease-in-out infinite',
          }}
        />
      </div>
    </div>
  )
}

// ── Result card (lignes) ──────────────────────────────────────────────────────

const NIVEAU_DOTS: Record<string, number> = { 'débutant': 1, 'intermédiaire': 2, 'expert': 3 }

// Seuils couleur : vert ≥7, orange 4-6, rouge ≤3
function scoreClass(v: number): { bar: string; text: string } {
  if (v >= 7) return { bar: 'bg-emerald-500', text: 'text-emerald-600' }
  if (v >= 4) return { bar: 'bg-amber-500', text: 'text-amber-600' }
  return { bar: 'bg-red-500', text: 'text-red-600' }
}

function flagClass(v: number): { dot: string; text: string } {
  if (v >= 7) return { dot: 'bg-emerald-500', text: 'text-emerald-600' }
  if (v >= 4) return { dot: 'bg-amber-500', text: 'text-amber-600' }
  return { dot: 'bg-red-500', text: 'text-red-600' }
}

function NoteRow({ name, value }: { name: string; value: number }) {
  const c = scoreClass(value)
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-500 w-[88px] shrink-0">{name}</span>
      <span className="flex-1 h-[5px] rounded-full bg-zinc-100 overflow-hidden">
        <span className={`block h-full rounded-full ${c.bar}`} style={{ width: `${value * 10}%` }} />
      </span>
      <span className={`w-6 text-right font-semibold tabular-nums ${c.text}`}>{value}</span>
    </div>
  )
}

function Flag({ name, value }: { name: string; value: number }) {
  const c = flagClass(value)
  return (
    <span className="flex items-center gap-1.5 text-[11px]">
      <span className={`h-2.5 w-2.5 rounded-full ${c.dot}`} />
      <span className={c.text}>{name}</span>
    </span>
  )
}

function ResultCard({ source }: { source: EdflexSource }) {
  const badgeColor =
    source.decision === 'Publier' || source.decision === 'Réviser'
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
      : source.decision === 'Rejeter'
      ? 'text-red-700 bg-red-50 border-red-200'
      : 'text-amber-700 bg-amber-50 border-amber-200'

  const s = source.allScores
  const persona = source.scorePersona ?? source.score ?? 0
  const pc = scoreClass(persona)
  const niveauDots = source.niveau ? NIVEAU_DOTS[source.niveau] ?? 2 : 0
  // Accessibilité = moyenne forme + inclusion (inclusion intégrée)
  const accessibilite = s ? Math.round((s.a_forme + s.a_inclusion) / 2) : 0

  return (
    <div className="flex-none w-[300px] rounded-xl border border-zinc-200 bg-white p-4 flex flex-col gap-3">
      {/* Titre + décision */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-zinc-800 leading-snug line-clamp-2">{source.title}</p>
        {source.decision && (
          <span className={`text-[11px] px-2 py-0.5 rounded-md border shrink-0 ${badgeColor}`}>{source.decision}</span>
        )}
      </div>

      {/* Persona */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-zinc-400">Persona</span>
        <span className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
          <span className={`block h-full rounded-full ${pc.bar}`} style={{ width: `${persona * 10}%` }} />
        </span>
        <span className={`text-sm font-bold tabular-nums ${pc.text}`}>{persona}</span>
        <span className="text-[11px] text-zinc-400">/10</span>
      </div>

      {/* Sujet */}
      {source.sujetPrincipal && (
        <p className="text-xs text-zinc-500 leading-relaxed">{source.sujetPrincipal}</p>
      )}

      {/* Niveau */}
      {source.niveau && (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="flex gap-1" aria-hidden>
            {[1, 2, 3].map(i => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= niveauDots ? 'bg-zinc-600' : 'bg-zinc-200'}`} />
            ))}
          </span>
          <span className="capitalize">{source.niveau}</span>
        </div>
      )}

      {/* Notes OPAD */}
      {s && (
        <div className="flex flex-col gap-1.5 pt-1 border-t border-zinc-100">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Notes OPAD</p>
          <NoteRow name="Originalité" value={s.o} />
          <NoteRow name="Pédagogie" value={s.p} />
          <NoteRow name="Accessibilité" value={accessibilite} />
          <NoteRow name="Design" value={s.d} />
        </div>
      )}

      {/* Conformité — drapeaux */}
      {s && (
        <div className="flex flex-col gap-1.5 pt-1 border-t border-zinc-100">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Conformité</p>
          <div className="flex items-center gap-3.5">
            <Flag name="RGPD" value={s.rgpd} />
            <Flag name="IA Act" value={s.ia_act} />
            <Flag name="PI" value={s.pi} />
          </div>
        </div>
      )}

      {/* Tags */}
      {source.tags?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {source.tags.map(t => (
            <span key={t} className="text-[11px] px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-500">{t}</span>
          ))}
        </div>
      ) : null}

      {/* Justification */}
      {source.justification && (
        <div className="pt-1 border-t border-zinc-100">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-1">Justification</p>
          <p className="text-xs text-zinc-500 leading-relaxed">{source.justification}</p>
        </div>
      )}
    </div>
  )
}

// ── Result row (ligne horizontale) ────────────────────────────────────────────
function ResultRow({ title, color, sources }: { title: string; color: string; sources: EdflexSource[] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold">{title}</span>
        <span className="text-xs text-zinc-400 font-medium">({sources.length})</span>
        <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      </div>
      {sources.length === 0 ? (
        <p className="text-xs text-zinc-400 italic border border-dashed border-zinc-200 rounded-xl px-5 py-4 bg-white">
          Aucune source dans cette catégorie.
        </p>
      ) : (
        <div className="flex gap-3.5 overflow-x-auto pb-2">
          {sources.map(s => <ResultCard key={s.id} source={s} />)}
        </div>
      )}
    </div>
  )
}

// ── Main workspace ────────────────────────────────────────────────────────────
export function EdflexWorkspace({
  allProjects,
  project,
  initialSources,
  initialLivrables,
  locked: initLocked,
}: {
  allProjects: ProjectTab[]
  project: EdflexProject | null
  initialSources: EdflexSource[]
  initialLivrables: EdflexLivrable[]
  locked: boolean
}) {
  const router = useRouter()
  const [isCreating, setIsCreating] = useState(!project)
  const [edflexSources, setEdflexSources] = useState(initialSources)
  const [livrables, setLivrables] = useState(initialLivrables)
  const [locked, setLocked] = useState(initLocked)
  const [pickerStatuses, setPickerStatuses] = useState<Record<string, 'loading' | 'done' | 'error'>>({})
  const [pickerErrors, setPickerErrors] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const fileRefsRef = useRef<Map<string, File>>(new Map())
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Polling ──────────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    if (!project) return
    const res = await fetch(`/api/edflex/project/${project.id}`)
    if (!res.ok) return
    const d = await res.json()
    const sources: EdflexSource[] = d.sources ?? []
    setEdflexSources(sources)
    setLivrables(d.livrables ?? [])
    setLocked(d.locked ?? false)
    return sources
  }, [project])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
  }, [])

  const startPolling = useCallback(() => {
    if (pollingRef.current || !project) return
    pollingRef.current = setInterval(async () => {
      if (!project) return
      const res = await fetch(`/api/edflex/project/${project.id}`)
      if (!res.ok) return
      const d = await res.json()
      const sources: EdflexSource[] = d.sources ?? []
      setEdflexSources(sources)
      setLivrables(d.livrables ?? [])
      setLocked(d.locked ?? false)
      const hasPending = sources.some(s => s.status === 'transcription' || s.status === 'qualification')
      if (!hasPending) stopPolling()
    }, 2500)
  }, [project, stopPolling])

  useEffect(() => () => stopPolling(), [stopPolling])

  // ── Source ingestion ──────────────────────────────────────────────────────
  const ingestUrl = useCallback(async (source: Source) => {
    if (!project || locked) return
    setPickerStatuses(prev => ({ ...prev, [source.id]: 'loading' }))

    // Start polling before ingest starts (captures intermediate states)
    startPolling()

    try {
      const res = await fetch('/api/edflex/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, url: source.value, type: sourceTypeMap(source.type) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPickerStatuses(prev => ({ ...prev, [source.id]: 'error' }))
        setPickerErrors(prev => ({ ...prev, [source.id]: data.error ?? 'Erreur' }))
        return
      }
      setPickerStatuses(prev => ({ ...prev, [source.id]: 'done' }))
      await reload()
    } catch {
      setPickerStatuses(prev => ({ ...prev, [source.id]: 'error' }))
      setPickerErrors(prev => ({ ...prev, [source.id]: 'Erreur réseau' }))
    }
  }, [project, locked, startPolling, reload])

  const ingestFile = useCallback(async (source: Source, file: File) => {
    if (!project) return
    setPickerStatuses(prev => ({ ...prev, [source.id]: 'loading' }))
    startPolling()
    try {
      // 1. Upload navigateur → Vercel Blob (pas de limite 4.5MB du body serverless)
      const { upload } = await import('@vercel/blob/client')
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/edflex/blob-upload',
        multipart: true,
        contentType: file.type || undefined,
      })
      // 2. Déclencher l'ingestion avec l'URL du blob (body minuscule)
      const res = await fetch('/api/edflex/ingest-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blobUrl: blob.url, filename: file.name, projectId: project.id, mimeType: file.type }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPickerStatuses(prev => ({ ...prev, [source.id]: 'error' }))
        setPickerErrors(prev => ({ ...prev, [source.id]: data.error ?? 'Erreur' }))
        return
      }
      setPickerStatuses(prev => ({ ...prev, [source.id]: 'done' }))
      await reload()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau'
      setPickerStatuses(prev => ({ ...prev, [source.id]: 'error' }))
      setPickerErrors(prev => ({ ...prev, [source.id]: msg }))
    }
  }, [project, startPolling, reload])

  const handleFileAdded = useCallback((sourceId: string, file: File) => {
    fileRefsRef.current.set(sourceId, file)
  }, [])

  const handleSourceAdded = useCallback(async (source: Source) => {
    if (source.type === 'file') {
      const file = fileRefsRef.current.get(source.id)
      if (file) await ingestFile(source, file)
    } else {
      await ingestUrl(source)
    }
  }, [ingestUrl, ingestFile])

  const handleRetry = useCallback((sourceId: string) => {
    setPickerStatuses(prev => { const n = {...prev}; delete n[sourceId]; return n })
    setPickerErrors(prev => { const n = {...prev}; delete n[sourceId]; return n })
  }, [])

  // ── Generate livrables ────────────────────────────────────────────────────
  const generateLivrables = useCallback(async (force = false) => {
    if (!project) return
    setGenerating(true)
    setGenError(null)
    try {
      const res = await fetch('/api/edflex/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, force }),
      })
      const data = await res.json()
      if (!res.ok) { setGenError(data.error ?? 'Erreur'); return }
      setLivrables(data.livrables)
      setLocked(true)
    } catch {
      setGenError('Erreur réseau')
    } finally { setGenerating(false) }
  }, [project])

  const unlockProject = useCallback(async () => {
    if (!project) return
    try {
      const res = await fetch('/api/edflex/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      })
      if (res.ok) setLocked(false)
    } catch { /* ignore */ }
  }, [project])

  // ── Source grouping ───────────────────────────────────────────────────────
  const pending   = edflexSources.filter(s => s.status === 'transcription' || s.status === 'qualification')
  const done      = edflexSources.filter(s => s.status === 'done')
  const qualified = done.filter(s => s.decision === 'Publier' || s.decision === 'Réviser')
  const rejected  = done.filter(s => s.decision === 'Rejeter')
  const review    = done.filter(s => s.decision === 'Revue humaine')

  return (
    <>
      <style>{`
        @keyframes slide-progress {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">

        {/* Tabs projets */}
        <div className="flex items-center gap-2 flex-wrap">
          {allProjects.map(p => (
            <button
              key={p.id}
              onClick={() => { setIsCreating(false); router.push(`/edflex/${p.id}`) }}
              className={[
                'px-4 py-1.5 text-sm rounded-full transition-colors font-medium',
                !isCreating && project?.id === p.id
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100',
              ].join(' ')}
            >
              {p.titre}
            </button>
          ))}
          <button
            onClick={() => setIsCreating(true)}
            disabled={allProjects.length >= MAX_PROJECTS}
            className={[
              'px-4 py-1.5 text-sm rounded-full border border-dashed transition-colors disabled:opacity-40',
              isCreating && !project
                ? 'border-zinc-800 text-zinc-800 bg-zinc-50'
                : 'border-zinc-300 text-zinc-400 hover:border-zinc-400 hover:text-zinc-600',
            ].join(' ')}
          >
            + Nouveau
          </button>
        </div>

        {/* Contexte projet — en création, reporte le contexte du projet courant */}
        <ProjetContext
          key={isCreating ? 'new' : project?.id}
          project={isCreating ? null : project}
          isCreating={isCreating}
          prefillContext={isCreating ? (project?.context ?? null) : null}
        />

        {/* Sources + résultats */}
        {!isCreating && project && (
          <>
            {/* SourcePicker */}
            {!locked && (
              <section className="space-y-3">
                <SourcePicker
                  onSourcesChange={() => {}}
                  onSourceAdded={handleSourceAdded}
                  onFileAdded={handleFileAdded}
                  onRetry={handleRetry}
                  sourceStatuses={pickerStatuses}
                  sourceErrors={pickerErrors}
                  disabled={generating}
                  showNotion={true}
                />
                <div className="flex justify-end">
                  <NotionRecreateButton />
                </div>
              </section>
            )}

            {/* Sources en cours (transcription / qualification) */}
            {pending.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">Traitement en cours</h2>
                <div className="space-y-2">
                  {pending.map(s => <PendingSourceCard key={s.id} source={s} />)}
                </div>
              </section>
            )}

            {/* Résultats qualification — 3 lignes */}
            {done.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">Qualification</h2>
                <ResultRow title="Catalogue qualifié" color="bg-emerald-500" sources={qualified} />
                <ResultRow title="Revue humaine"      color="bg-amber-500"   sources={review} />
                <ResultRow title="Rejetés"            color="bg-red-500"     sources={rejected} />
              </section>
            )}

            {/* Générer */}
            {!locked && qualified.length > 0 && (
              <button
                type="button"
                onClick={() => generateLivrables(false)}
                disabled={generating}
                className="w-full rounded-xl bg-zinc-800 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {generating ? 'Génération en cours (~60-90s)…' : 'Générer les 6 livrables pédagogiques'}
              </button>
            )}

            {/* Projet verrouillé — explication + actions */}
            {locked && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
                <p className="text-sm font-semibold text-amber-800">Projet verrouillé</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Les livrables ont été générés. Un projet est limité à une génération pour maîtriser les coûts.
                  Pour ajouter des sources ou régénérer, déverrouille le projet ci-dessous.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => generateLivrables(true)}
                    disabled={generating}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition-colors disabled:opacity-40"
                  >
                    {generating ? 'Régénération…' : 'Régénérer les livrables'}
                  </button>
                  <button
                    type="button"
                    onClick={unlockProject}
                    disabled={generating}
                    className="rounded-lg border border-amber-300 px-4 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-40"
                  >
                    Déverrouiller pour ajouter des sources
                  </button>
                </div>
              </div>
            )}

            {genError && (
              <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
                Erreur : {genError}
              </p>
            )}

            {/* Base Notion — sources qualifiées (avant les livrables) */}
            {done.length > 0 && <SourcesNotionTable sources={done} />}

            {/* Livrables */}
            {livrables.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wide">Livrables générés</h2>
                <ul className="space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
                  {livrables.map(l => (
                    <li key={l.agent}>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm ${l.status === 'done' ? 'text-green-700' : 'text-red-600'}`}>
                          {l.status === 'done' ? '✓' : '✕'} {LIVRABLE_LABELS[l.agent] ?? l.agent}
                        </span>
                        {l.content && (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => viewLivrable(l.agent, l.content as string, LIVRABLE_LABELS[l.agent] ?? l.agent)}
                              className="text-xs text-zinc-400 hover:text-zinc-700 underline underline-offset-2"
                            >
                              Voir
                            </button>
                            <button
                              onClick={() => downloadLivrable(l.agent, l.content as string, LIVRABLE_LABELS[l.agent] ?? l.agent)}
                              className="text-xs text-zinc-400 hover:text-zinc-700 underline underline-offset-2"
                            >
                              Télécharger
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {livrables.every(l => l.status === 'done') && (
                  <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3">
                    <p className="text-sm font-semibold text-green-800">6 livrables générés avec succès.</p>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </>
  )
}
