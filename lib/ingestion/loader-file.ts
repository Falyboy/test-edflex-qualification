const SUPPORTED_TEXT_TYPES = [
  'text/plain', 'text/markdown', 'text/csv',
  'application/json', 'text/html',
]

const SUPPORTED_TYPES = [
  ...SUPPORTED_TEXT_TYPES,
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/msword', // .doc
]

const AUDIO_MIME_TYPES = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave',
  'audio/mp4', 'audio/m4a', 'audio/ogg', 'audio/opus',
  'audio/flac', 'audio/webm', 'audio/aac', 'audio/x-m4a',
]

const VIDEO_MIME_TYPES = [
  'video/mp4', 'video/webm', 'video/quicktime',
  'video/x-msvideo', 'video/x-matroska',
]

const AUDIO_EXTS = ['.mp3', '.wav', '.m4a', '.ogg', '.opus', '.flac', '.webm', '.aac']
const VIDEO_EXTS = ['.mp4', '.mov', '.webm', '.mkv', '.avi']

// Formats détectés mais non supportés par Groq Whisper — rejeter avant l'appel
const GROQ_UNSUPPORTED_EXTS: Record<string, string> = {
  '.avi': 'AVI',
  '.mkv': 'MKV',
}

// Normalisation MIME vers ce que Groq Whisper accepte
const GROQ_MIME_NORMALIZE: Record<string, string> = {
  'video/quicktime': 'video/mp4',
  'video/x-msvideo': 'video/mp4',
  'video/x-matroska': 'video/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/wave': 'audio/wav',
  'audio/x-m4a': 'audio/m4a',
  'audio/aac': 'audio/mpeg',
}

function normalizeGroqMime(mimeType: string): string {
  return GROQ_MIME_NORMALIZE[mimeType] ?? mimeType
}

function isAudioOrVideo(filename: string, mimeType: string): 'audio' | 'video' | null {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''
  if (AUDIO_MIME_TYPES.includes(mimeType) || AUDIO_EXTS.includes(ext)) return 'audio'
  if (VIDEO_MIME_TYPES.includes(mimeType) || VIDEO_EXTS.includes(ext)) return 'video'
  return null
}

function assertGroqSupported(filename: string): void {
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ''
  const format = GROQ_UNSUPPORTED_EXTS[ext]
  if (format) throw new Error(`Format ${format} non supporté par Groq — convertissez en MP4 ou MP3 avant d'importer.`)
}

const GROQ_CHUNK_BYTES = 24 * 1024 * 1024

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

async function transcribeChunk(chunk: ArrayBuffer, filename: string, mimeType: string, apiKey: string): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([chunk], { type: mimeType }), filename)
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

async function transcribeWithGroq(buffer: ArrayBuffer, filename: string, mimeType: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY manquant')

  const chunks = splitChunks(buffer)
  const base = filename.replace(/\.[^.]+$/, '')
  const ext = filename.match(/\.[^.]+$/)?.[0] ?? '.mp3'

  const parts = await Promise.all(
    chunks.map((chunk, i) => {
      const chunkFilename = chunks.length > 1 ? `${base}_part${i + 1}${ext}` : filename
      return transcribeChunk(chunk, chunkFilename, mimeType, apiKey)
    })
  )
  return parts.map(p => p.trim()).filter(Boolean).join('\n\n')
}

export interface FileDocument {
  title: string
  text: string
  mimeType: string
}

function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')
}

async function extractPdfNative(buffer: ArrayBuffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
    const result = await pdfParse(Buffer.from(buffer))
    return result.text?.trim() ?? ''
  } catch {
    return ''
  }
}

async function extractPdfOcr(buffer: ArrayBuffer): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Aucun texte extractible dans ce PDF et ANTHROPIC_API_KEY manquant pour OCR')

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Anthropic = require('@anthropic-ai/sdk').default ?? require('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })

  const base64 = Buffer.from(buffer).toString('base64')
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        } as unknown as { type: 'text'; text: string },
        { type: 'text', text: 'Extrait tout le texte de ce PDF. Réponds uniquement avec le texte brut extrait, sans commentaire.' },
      ],
    }],
  })

  const textBlock = response.content.find((b: { type: string }) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('OCR : réponse Anthropic invalide')
  return textBlock.text.trim()
}

async function extractPdf(buffer: ArrayBuffer): Promise<string> {
  const native = await extractPdfNative(buffer)
  if (native) return native
  try {
    return await extractPdfOcr(buffer)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`PDF scanné — aucun texte extractible. OCR échoué : ${msg}`)
  }
}

export async function loadFile(
  buffer: ArrayBuffer,
  filename: string,
  mimeType: string
): Promise<FileDocument> {
  const title = titleFromFilename(filename)
  const effectiveMime = mimeType || 'application/octet-stream'

  if (SUPPORTED_TEXT_TYPES.includes(effectiveMime) || filename.match(/\.(txt|md|csv|json|html?)$/i)) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
    return { title, text: text.trim(), mimeType: effectiveMime }
  }

  if (effectiveMime === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
    const text = await extractPdf(buffer)
    return { title, text, mimeType: 'application/pdf' }
  }

  const mediaKind = isAudioOrVideo(filename, effectiveMime)
  if (mediaKind) {
    assertGroqSupported(filename)
    const groqMime = normalizeGroqMime(effectiveMime)
    const text = await transcribeWithGroq(buffer, filename, groqMime)
    return { title, text, mimeType: effectiveMime }
  }

  throw new Error(
    `Format non supporté : ${filename}. Formats acceptés : PDF, TXT, MD, DOCX, MP3, WAV, M4A, OGG, FLAC, MP4, MOV, WEBM.`
  )
}
