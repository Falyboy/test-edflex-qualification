'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { generatePdfThumbnail } from '@/lib/pdf-thumbnail'
import { openGoogleDrivePicker } from '@/lib/google/picker'
import { navigateTo } from '@/lib/navigate'

export type SourceType = 'file' | 'web' | 'youtube' | 'drive' | 'podcast' | 'notion'
type ActiveInputType = SourceType | 'bulk'

export interface Source {
  id: string
  type: SourceType
  label: string
  value: string
  thumbnail?: string
  mimeType?: string
}

interface Enrichment {
  title: string
  thumbnail: string
}

interface PodcastResult {
  trackName: string
  artistName: string
  artworkUrl100: string
  feedUrl: string
}

interface PodcastEpisode {
  title: string
  audioUrl: string
  pubDate: string
}

interface SourcePickerProps {
  onSourcesChange?: (sources: Source[]) => void
  onSourceAdded?: (source: Source) => void
  onFileAdded?: (sourceId: string, file: File) => void
  onRetry?: (sourceId: string) => void
  onViewTranscript?: (contentId: string) => void
  sourceStatuses?: Record<string, 'loading' | 'done' | 'error'>
  sourceErrors?: Record<string, string>
  contentIds?: Record<string, string>
  disabled?: boolean
  sourcesListOpen?: boolean
  onToggleSourcesList?: () => void
  showNotion?: boolean
}

const TYPE_BUTTONS: { type: SourceType; icon: string; label: string }[] = [
  { type: 'file', icon: '↑', label: 'Importer des fichiers' },
  { type: 'web', icon: '🔗', label: 'Sites Web' },
  { type: 'youtube', icon: '▶', label: 'YouTube' },
  { type: 'podcast', icon: '🎙', label: 'Podcast' },
]

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function getWebFavicon(url: string): string {
  try {
    const { hostname } = new URL(url)
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`
  } catch {
    return ''
  }
}

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1)
    return u.searchParams.get('v')
  } catch {
    return null
  }
}

async function fetchOEmbed(url: string): Promise<Enrichment> {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
  const res = await fetch(endpoint)
  if (!res.ok) throw new Error(`oEmbed ${res.status}`)
  const data = await res.json()
  return { title: data.title, thumbnail: data.thumbnail_url }
}

export function SourcePicker({ onSourcesChange, onSourceAdded, onFileAdded, onRetry, onViewTranscript, sourceStatuses = {}, sourceErrors = {}, contentIds = {}, disabled = false, sourcesListOpen = true, onToggleSourcesList, showNotion = false }: SourcePickerProps) {
  const [sources, setSources] = useState<Source[]>([])
  const [enrichments, setEnrichments] = useState<Record<string, Enrichment>>({})
  const [activeInput, setActiveInput] = useState<ActiveInputType | null>(null)
  const [bulkValue, setBulkValue] = useState('')
  const [bulkErrors, setBulkErrors] = useState<string[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [podcastResults, setPodcastResults] = useState<PodcastResult[]>([])
  const [selectedPodcast, setSelectedPodcast] = useState<PodcastResult | null>(null)
  const [episodeResults, setEpisodeResults] = useState<PodcastEpisode[]>([])
  const [inputError, setInputError] = useState<string | null>(null)
  const [googleConnected, setGoogleConnected] = useState(false)
  const [googleToken, setGoogleToken] = useState<string | null>(null)
  const [notionConnected, setNotionConnected] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())
  const podcastSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const podcastSearchAbort = useRef<AbortController | null>(null)

  useEffect(() => {
    const controllers = abortControllersRef.current
    return () => {
      controllers.forEach(c => c.abort())
      if (podcastSearchTimer.current) clearTimeout(podcastSearchTimer.current)
      podcastSearchAbort.current?.abort()
    }
  }, [])

  useEffect(() => {
    onSourcesChange?.(sources)
  }, [sources, onSourcesChange])

  useEffect(() => {
    fetch('/api/auth/google/status')
      .then(r => r.json())
      .then((data: { connected: boolean; accessToken?: string }) => {
        setGoogleConnected(data.connected)
        if (data.accessToken) setGoogleToken(data.accessToken)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/auth/notion/status')
      .then(r => r.json())
      .then((data: { connected: boolean }) => setNotionConnected(data.connected))
      .catch(() => {})
  }, [])

  const enrichYouTube = useCallback(async (id: string, url: string) => {
    const controller = new AbortController()
    abortControllersRef.current.set(id, controller)
    try {
      const enrichment = await fetchOEmbed(url)
      if (controller.signal.aborted) return
      setEnrichments(prev => ({ ...prev, [id]: enrichment }))
      setSources(prev => prev.map(s => s.id === id ? { ...s, label: enrichment.title, thumbnail: enrichment.thumbnail } : s))
    } catch {
      // fallback: keep original label
    } finally {
      abortControllersRef.current.delete(id)
    }
  }, [])

  const addSource = useCallback((source: Source) => {
    setSources(prev => [...prev, source])
    if (source.type === 'youtube') {
      enrichYouTube(source.id, source.value)
    }
    onSourceAdded?.(source)
  }, [enrichYouTube, onSourceAdded])

  const handleGoogleDriveClick = useCallback(() => {
    if (!googleConnected) {
      navigateTo('/api/auth/google')
      return
    }
    openGoogleDrivePicker(googleToken ?? '', (file) => {
      addSource({ id: uid(), type: 'drive', label: file.name, value: file.id, mimeType: file.mimeType })
    })
  }, [googleConnected, googleToken, addSource])

  const handleGoogleDisconnect = useCallback(async () => {
    await fetch('/api/auth/google', { method: 'DELETE' })
    setGoogleConnected(false)
    setGoogleToken(null)
  }, [])

  const handleNotionClick = useCallback(() => {
    if (!notionConnected) {
      navigateTo('/api/auth/notion')
      return
    }
    setActiveInput(prev => prev === 'notion' ? null : 'notion')
    setInputValue('')
    setInputError(null)
  }, [notionConnected])

  const handleNotionDisconnect = useCallback(async () => {
    await fetch('/api/auth/notion', { method: 'DELETE' })
    setNotionConnected(false)
  }, [])

  const removeSource = useCallback((id: string) => {
    abortControllersRef.current.get(id)?.abort()
    abortControllersRef.current.delete(id)
    setSources(prev => prev.filter(s => s.id !== id))
    setEnrichments(prev => { const next = { ...prev }; delete next[id]; return next })
  }, [])

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach(async file => {
      const id = uid()
      onFileAdded?.(id, file)
      addSource({ id, type: 'file', label: file.name, value: file.name })
      if (file.type === 'application/pdf') {
        const thumbnail = await generatePdfThumbnail(file)
        if (thumbnail) {
          setSources(prev => prev.map(s => s.id === id ? { ...s, thumbnail } : s))
        }
      }
    })
  }, [addSource, onFileAdded])

  const handleButtonClick = (type: ActiveInputType) => {
    if (type === 'file') {
      fileInputRef.current?.click()
      return
    }
    setActiveInput(prev => prev === type ? null : type)
    setInputValue('')
    setInputError(null)
    setBulkValue('')
    setBulkErrors([])
    setPodcastResults([])
    setSelectedPodcast(null)
    setEpisodeResults([])
  }

  const isUrl = (v: string) => v.startsWith('http://') || v.startsWith('https://')

  const getUnsupportedUrlError = (url: string): string | null => {
    try {
      const host = new URL(url).hostname
      if (host === 'open.spotify.com' || host === 'spotify.com' || host.endsWith('.spotify.com')) {
        return "Spotify non supporté — recherchez l'épisode dans l'onglet Podcast"
      }
      if (host === 'www.instagram.com' || host === 'instagram.com') {
        return "Instagram non supportée — formats acceptés : YouTube, Web, PDF, Podcast"
      }
      if (host === 'www.tiktok.com' || host === 'tiktok.com') {
        return "TikTok non supporté — formats acceptés : YouTube, Web, PDF, Podcast"
      }
    } catch { /* not a valid URL */ }
    return null
  }

  const handlePodcastInputChange = useCallback((value: string) => {
    setInputValue(value)
    setPodcastResults([])
    if (podcastSearchTimer.current) clearTimeout(podcastSearchTimer.current)
    if (!value.trim() || isUrl(value) || value.trim().length < 3) return
    podcastSearchTimer.current = setTimeout(async () => {
      podcastSearchAbort.current?.abort()
      const controller = new AbortController()
      podcastSearchAbort.current = controller
      try {
        const res = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(value)}&media=podcast&limit=5`,
          { signal: controller.signal }
        )
        if (!res.ok || controller.signal.aborted) return
        const data = await res.json() as { results: PodcastResult[] }
        if (!controller.signal.aborted) setPodcastResults(data.results.filter(r => r.feedUrl))
      } catch { /* ignore network/abort errors */ }
    }, 300)
  }, [])

  const handlePodcastSelect = useCallback(async (result: PodcastResult) => {
    setPodcastResults([])
    setSelectedPodcast(result)
    try {
      const res = await fetch(`/api/podcast/episodes?feedUrl=${encodeURIComponent(result.feedUrl)}`)
      if (!res.ok) return
      const data = await res.json() as { episodes: PodcastEpisode[] }
      setEpisodeResults(data.episodes)
    } catch { /* keep episodes empty */ }
  }, [])

  const handleEpisodeSelect = useCallback((episode: PodcastEpisode) => {
    const id = uid()
    const podcastThumb = selectedPodcast?.artworkUrl100
    addSource({ id, type: 'podcast', label: episode.title, value: episode.audioUrl, thumbnail: podcastThumb })
    if (selectedPodcast) {
      setEnrichments(prev => ({
        ...prev,
        [id]: { title: episode.title, thumbnail: selectedPodcast.artworkUrl100 },
      }))
    }
    setInputValue('')
    setActiveInput(null)
    setPodcastResults([])
    setSelectedPodcast(null)
    setEpisodeResults([])
  }, [addSource, selectedPodcast])

  const handleInputConfirm = () => {
    if (!activeInput || activeInput === 'bulk' || !inputValue.trim()) return
    if (activeInput === 'podcast' && !isUrl(inputValue.trim())) return
    if (activeInput === 'web' && isUrl(inputValue.trim())) {
      const urlError = getUnsupportedUrlError(inputValue.trim())
      if (urlError) {
        setInputError(urlError)
        return
      }
    }
    const label = inputValue.trim()
    addSource({ id: uid(), type: activeInput, label, value: inputValue.trim() })
    setInputValue('')
    setInputError(null)
    setActiveInput(null)
    setPodcastResults([])
  }

  const detectBulkType = (url: string): SourceType => {
    try {
      const host = new URL(url).hostname
      if (host === 'www.youtube.com' || host === 'youtube.com' || host === 'youtu.be') return 'youtube'
    } catch { /* ignore */ }
    return 'web'
  }

  const handleBulkConfirm = useCallback(() => {
    const lines = bulkValue.split('\n').map(l => l.trim()).filter(Boolean)
    const errors: string[] = []
    const failedLines: string[] = []
    lines.forEach(line => {
      if (!isUrl(line)) {
        errors.push(`Invalide (pas une URL) : ${line}`)
        failedLines.push(line)
        return
      }
      try {
        const host = new URL(line).hostname
        if (host === 'open.spotify.com' || host.endsWith('.spotify.com')) {
          errors.push(`Spotify non supporté (DRM) : ${line}`)
          failedLines.push(line)
          return
        }
        if (host === 'podcasts.apple.com' || host.endsWith('.podcasts.apple.com')) {
          errors.push(`Apple Podcasts non supporté : ${line}`)
          failedLines.push(line)
          return
        }
      } catch {
        errors.push(`URL malformée : ${line}`)
        failedLines.push(line)
        return
      }
      const type = detectBulkType(line)
      addSource({ id: uid(), type, label: line, value: line })
    })
    setBulkErrors(errors)
    if (errors.length === 0) {
      setBulkValue('')
      setActiveInput(null)
    } else {
      setBulkValue(failedLines.join('\n'))
    }
  }, [bulkValue, addSource])

  const handleDragOver = (e: React.DragEvent) => {
    if (disabled) return
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = () => setIsDragOver(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFileSelect(e.dataTransfer.files)
  }

  const placeholders: Record<SourceType, string> = {
    file: '',
    web: 'https://monsite.com/article',
    youtube: 'https://youtube.com/watch?v=...',
    podcast: 'Nom du podcast ou URL RSS / .mp3',
    drive: 'https://drive.google.com/file/...',
    notion: 'https://www.notion.so/Ma-page-...',
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          'rounded-xl border-2 border-dashed px-8 py-10 text-center transition-colors',
          disabled ? 'opacity-50 pointer-events-none' : '',
          isDragOver ? 'border-zinc-500 bg-zinc-100' : 'border-zinc-300 bg-zinc-50',
        ].join(' ')}
      >
        <p className="text-base font-medium text-zinc-700 mb-1">ou déposez vos fichiers</p>
        <p className="text-xs text-zinc-400">PDF, images, documents, audio et plus encore</p>
      </div>

      {/* Type buttons */}
      <div className="flex flex-wrap gap-2 justify-center">
        {TYPE_BUTTONS.map(({ type, icon, label }) => (
          <button
            key={type}
            onClick={() => handleButtonClick(type)}
            disabled={disabled}
            className={[
              'flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
              disabled ? 'opacity-50 cursor-not-allowed' : '',
              activeInput === type
                ? 'border-zinc-800 bg-zinc-800 text-white'
                : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500',
            ].join(' ')}
          >
            <span className="text-xs">{icon}</span>
            {label}
          </button>
        ))}
        {showNotion && (
          <button
            onClick={handleNotionClick}
            disabled={disabled}
            className={[
              'flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
              disabled ? 'opacity-50 cursor-not-allowed' : '',
              notionConnected
                ? 'border-zinc-800 bg-zinc-800 text-white'
                : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500',
            ].join(' ')}
          >
            <span className="text-xs font-bold w-3.5 h-3.5 inline-flex items-center justify-center bg-current rounded-sm text-white" style={{color: notionConnected ? 'white' : '#18181b', background: notionConnected ? 'white' : '#18181b'}}>
              <span style={{color: notionConnected ? '#18181b' : 'white', fontSize: '10px', fontWeight: 700}}>N</span>
            </span>
            {notionConnected ? 'Notion ✓' : 'Notion'}
          </button>
        )}
      </div>

      {/* Bulk URL import */}
      {activeInput === 'bulk' && (
        <div className="flex flex-col gap-2">
          <textarea
            autoFocus
            value={bulkValue}
            onChange={e => { setBulkValue(e.target.value); setBulkErrors([]) }}
            placeholder="Une URL par ligne…"
            rows={5}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-400 resize-none"
          />
          {bulkErrors.length > 0 && (
            <ul className="text-xs text-red-600 space-y-0.5">
              {bulkErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          <button
            onClick={handleBulkConfirm}
            disabled={!bulkValue.trim()}
            className="self-end rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-zinc-700 transition-colors"
          >
            Ajouter tout
          </button>
        </div>
      )}

      {/* Inline input */}
      {activeInput && activeInput !== 'file' && activeInput !== 'bulk' && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {activeInput === 'podcast' ? (
              <input
                autoFocus
                type="text"
                value={inputValue}
                onChange={e => handlePodcastInputChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (podcastResults.length > 0) handlePodcastSelect(podcastResults[0])
                    else handleInputConfirm()
                  }
                  if (e.key === 'Escape') { setActiveInput(null); setPodcastResults([]) }
                }}
                placeholder={placeholders[activeInput]}
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
            ) : (
              <input
                autoFocus
                type="url"
                value={inputValue}
                onChange={e => { setInputValue(e.target.value); setInputError(null) }}
                onKeyDown={e => e.key === 'Enter' && handleInputConfirm()}
                placeholder={placeholders[activeInput]}
                className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
            )}
            <button
              onClick={handleInputConfirm}
              disabled={!inputValue.trim() || (activeInput === 'podcast' && !isUrl(inputValue.trim()))}
              className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 hover:bg-zinc-700 transition-colors"
            >
              Ajouter
            </button>
          </div>
          {inputError && (
            <p className="text-xs text-red-600">{inputError}</p>
          )}
          {podcastResults.length > 0 && !selectedPodcast && (
            <ul className="rounded-lg border border-zinc-200 bg-white shadow-md overflow-hidden">
              {podcastResults.map((r, i) => (
                <li key={`${r.feedUrl}-${i}`}>
                  <button
                    onClick={() => handlePodcastSelect(r)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-zinc-50 transition-colors"
                  >
                    <img src={r.artworkUrl100} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-800 truncate">{r.trackName}</p>
                      <p className="text-xs text-zinc-400 truncate">{r.artistName}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedPodcast && episodeResults.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white shadow-md overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-100 bg-zinc-50">
                <button
                  onClick={() => { setSelectedPodcast(null); setEpisodeResults([]) }}
                  className="text-xs text-zinc-400 hover:text-zinc-600"
                >←</button>
                <p className="text-xs font-medium text-zinc-600 truncate">{selectedPodcast.trackName}</p>
              </div>
              <ul>
                {episodeResults.map(ep => (
                  <li key={ep.audioUrl}>
                    <button
                      onClick={() => handleEpisodeSelect(ep)}
                      className="flex flex-col w-full px-3 py-2 text-left hover:bg-zinc-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-zinc-800 truncate">{ep.title}</p>
                      {ep.pubDate && <p className="text-xs text-zinc-400">{ep.pubDate}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.txt,.md,.csv,.mp3,.wav,.m4a,.ogg,.opus,.flac,.aac,.mp4,.mov,.webm,.mkv,.avi,.png,.jpg,.jpeg"
        className="hidden"
        onChange={e => handleFileSelect(e.target.files)}
      />

      {/* Sources list — only loading/error sources; done sources move to qualification */}
      {sources.filter(s => sourceStatuses[s.id] !== 'done').length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            Sources ajoutées
          </p>
          {sources.filter(s => sourceStatuses[s.id] !== 'done').map(source => {
            const enriched = enrichments[source.id]
            const contentId = contentIds[source.id]
            const isExpanded = expandedId === source.id
            return (
              <div
                key={source.id}
                className="flex flex-col rounded-lg border border-zinc-200 bg-white overflow-hidden"
              >
              <div className="flex items-center gap-2 px-3 py-2">
                {source.type === 'web' ? (
                  <div className="w-16 h-9 shrink-0 flex items-center gap-1.5">
                    <img
                      data-testid="web-favicon"
                      src={getWebFavicon(source.value)}
                      alt=""
                      className="w-5 h-5 object-contain rounded-sm shrink-0"
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                    <span className="text-xs text-zinc-400">Web</span>
                  </div>
                ) : enriched ? (
                  <img
                    src={enriched.thumbnail}
                    alt={enriched.title}
                    className="w-16 h-9 rounded object-cover shrink-0"
                  />
                ) : (
                  <span className="text-xs text-zinc-400 w-16 shrink-0">
                    {source.type === 'file' && 'Fichier'}
                    {source.type === 'youtube' && 'YouTube'}
                    {source.type === 'podcast' && 'Podcast'}
                    {source.type === 'drive' && 'Drive'}
                    {source.type === 'notion' && 'Notion'}
                  </span>
                )}
                <span className="text-sm text-zinc-700 truncate flex-1 font-mono">
                  {enriched ? enriched.title : source.label}
                </span>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1.5">
                    {sourceStatuses[source.id] === 'loading' && (
                      <span
                        data-testid="status-loading"
                        className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
                      />
                    )}
                    {sourceStatuses[source.id] === 'done' && (
                      <span data-testid="status-done" className="text-xs text-green-600">✓</span>
                    )}
                    {sourceStatuses[source.id] === 'error' && (
                      <>
                        <span data-testid="status-error" className="inline-block h-2 w-2 rounded-full bg-red-500" />
                        <button
                          onClick={e => { e.stopPropagation(); onRetry?.(source.id) }}
                          disabled={disabled}
                          aria-label="Réessayer"
                          className="text-zinc-400 hover:text-zinc-700 text-xs leading-none disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          ↻
                        </button>
                      </>
                    )}
                  {sourceStatuses[source.id] === 'error' && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 max-w-[280px] text-right leading-tight">
                      {sourceErrors[source.id] ?? 'Erreur de traitement — réessayez'}
                    </p>
                  )}
                    <button
                      onClick={e => { e.stopPropagation(); removeSource(source.id) }}
                      disabled={disabled}
                      className="text-zinc-300 hover:text-zinc-600 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ✕
                    </button>
                  </div>
                  {sourceStatuses[source.id] === 'done' && contentId && (
                    <button
                      onClick={() => {
                        if (!isExpanded && !previews[contentId]) {
                          fetch(`/api/content/${contentId}`)
                            .then(r => r.ok ? r.json() : null)
                            .then(d => d && setPreviews(prev => ({ ...prev, [contentId]: d.text })))
                            .catch(() => {})
                        }
                        setExpandedId(isExpanded ? null : source.id)
                      }}
                      className="text-xs text-zinc-400 hover:text-zinc-700 underline underline-offset-2"
                    >
                      Transcription
                    </button>
                  )}
                </div>
              </div>
              {isExpanded && contentId && (
                <div className="px-3 pb-3 pt-1 bg-zinc-50 border-t border-zinc-100">
                  <p
                    data-testid="transcript-preview"
                    className="text-xs text-zinc-600 font-mono leading-relaxed line-clamp-4"
                  >
                    {previews[contentId]
                      ? previews[contentId].slice(0, 300) + (previews[contentId].length > 300 ? '…' : '')
                      : '…'}
                  </p>
                  <button
                    onClick={() => onViewTranscript?.(contentId)}
                    className="mt-2 text-xs text-zinc-500 hover:text-zinc-800 underline underline-offset-2"
                  >
                    Voir tout
                  </button>
                </div>
              )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
