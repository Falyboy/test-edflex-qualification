const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.m4b', '.ogg', '.flac', '.opus', '.webm']
const GROQ_CHUNK_BYTES = 24 * 1024 * 1024 // 24 MB — limite Groq Whisper = 25MB

const EXT_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/m4a',
  '.m4b': 'audio/m4a',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.opus': 'audio/opus',
  '.webm': 'audio/webm',
}

function mimeFromFilename(filename: string): string {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''
  return EXT_MIME[ext] ?? 'audio/mpeg'
}
const PRIVATE_IP_RE = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|\[::1\])/i

export interface PodcastMetadata {
  title: string
  transcript: string
  durationSeconds: number | null
  audioUrl: string
}

function assertSafeUrl(url: string): void {
  let parsed: URL
  try { parsed = new URL(url) } catch { throw new Error(`URL invalide : ${url}`) }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Protocole non autorisé : ${parsed.protocol}`)
  }
  if (PRIVATE_IP_RE.test(parsed.hostname)) {
    throw new Error(`Adresse réseau privée non autorisée : ${parsed.hostname}`)
  }
}

function isDirectAudio(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase()
    return AUDIO_EXTS.some(ext => path.endsWith(ext))
  } catch {
    return false
  }
}

function rejectUnsupportedPlatform(url: string): void {
  const host = new URL(url).hostname
  if (host.includes('spotify.com')) throw new Error('Spotify non supporté (DRM). Utilisez l\'URL RSS du podcast ou un fichier MP3.')
  if (host.includes('podcasts.apple.com')) throw new Error('Apple Podcasts non supporté. Utilisez l\'URL RSS du podcast ou un fichier MP3.')
}

async function resolveAudioUrl(url: string): Promise<{ audioUrl: string; title: string }> {
  assertSafeUrl(url)
  rejectUnsupportedPlatform(url)

  if (isDirectAudio(url)) {
    const filename = new URL(url).pathname.split('/').pop() ?? 'podcast'
    return { audioUrl: url, title: filename.replace(/\.[^.]+$/, '') }
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Flux RSS inaccessible : ${res.status}`)
  const text = await res.text()

  const enclosureMatch = text.match(/<enclosure[^>]+url=["']([^"']+)["']/)
  const titleMatch = text.match(/<title>(?:<!\[CDATA\[)?([^\]<]+)/)

  if (!enclosureMatch) throw new Error('Aucun fichier audio trouvé dans ce flux RSS')

  const audioUrl = enclosureMatch[1]
  assertSafeUrl(audioUrl)

  return {
    audioUrl,
    title: titleMatch ? titleMatch[1].trim() : 'Podcast',
  }
}

function splitChunks(buffer: ArrayBuffer): ArrayBuffer[] {
  if (buffer.byteLength <= GROQ_CHUNK_BYTES) return [buffer]
  const chunks: ArrayBuffer[] = []
  let offset = 0
  while (offset < buffer.byteLength) {
    chunks.push(buffer.slice(offset, offset + GROQ_CHUNK_BYTES))
    offset += GROQ_CHUNK_BYTES
  }
  return chunks
}

async function transcribeWithGroq(buffer: ArrayBuffer, filename: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY manquant')

  const mimeType = mimeFromFilename(filename)
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mimeType }), filename)
  form.append('model', 'whisper-large-v3-turbo')
  form.append('response_format', 'json')

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq Whisper erreur ${res.status}: ${err}`)
  }

  const data = await res.json() as { text?: unknown }
  if (typeof data.text !== 'string') throw new Error('Réponse Groq invalide : champ text manquant')
  return data.text
}

export async function loadPodcast(url: string): Promise<PodcastMetadata> {
  const { audioUrl, title } = await resolveAudioUrl(url)

  const audioRes = await fetch(audioUrl)
  if (!audioRes.ok) throw new Error(`Téléchargement audio impossible: ${audioRes.status}`)

  const buffer = await audioRes.arrayBuffer()
  const filename = new URL(audioUrl).pathname.split('/').pop() ?? 'audio.mp3'
  const chunks = splitChunks(buffer)

  const parts = await Promise.all(
    chunks.map((chunk, i) =>
      transcribeWithGroq(chunk, chunks.length > 1 ? `${filename.replace(/\.[^.]+$/, '')}_part${i + 1}.mp3` : filename)
    )
  )
  const transcript = parts.join('')

  const wordCount = transcript.split(/\s+/).filter(Boolean).length
  const durationSeconds = Math.round((wordCount / 150) * 60)

  return { title, transcript, durationSeconds, audioUrl }
}
