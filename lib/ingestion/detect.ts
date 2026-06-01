import type { SourceType } from './types'

const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.m4b', '.ogg', '.flac', '.opus', '.webm']

export function detectSourceType(url: string): SourceType {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtube.com' || host === 'youtu.be') return 'youtube'
    if (host === 'docs.google.com' || host === 'drive.google.com') return 'gdrive'
    const path = u.pathname.toLowerCase()
    if (AUDIO_EXTS.some(ext => path.endsWith(ext))) return 'podcast'
    if (path.endsWith('.rss') || path.endsWith('.atom') || path.includes('/feed') || path.includes('/rss')) return 'podcast'
    return 'url'
  } catch {
    return 'text'
  }
}
