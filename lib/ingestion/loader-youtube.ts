export interface YouTubeMetadata {
  videoId: string
  url: string
  title: string
  transcript: string
  durationEstimate: number | null
}

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('/')[0]
    if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/') || u.pathname.startsWith('/live/')) {
      return u.pathname.split('/')[2]
    }
    return u.searchParams.get('v')
  } catch {
    return null
  }
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
}

interface Segment { text: string; offset: number; duration: number }

interface CaptionTrack {
  baseUrl: string
  languageCode: string
}

type PlayerResponse = {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: Array<{ baseUrl?: string; languageCode?: string }>
    }
  }
}

const INNERTUBE_CLIENTS = [
  {
    url: 'https://www.youtube.com/youtubei/v1/player',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (TV; rv:120.0) Gecko/120.0 Firefox/120.0',
      'X-YouTube-Client-Name': '67',
      'X-YouTube-Client-Version': '7.20231121.18.00',
    },
    context: { client: { clientName: 'TVHTML5', clientVersion: '7.20231121.18.00', hl: 'fr', gl: 'FR' } },
  },
  {
    url: 'https://www.youtube.com/youtubei/v1/player',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      'X-YouTube-Client-Name': '5',
      'X-YouTube-Client-Version': '19.09.3',
    },
    context: { client: { clientName: 'IOS', clientVersion: '19.09.3', deviceModel: 'iPhone16,2', hl: 'fr', gl: 'FR' } },
  },
  {
    url: 'https://www.youtube.com/youtubei/v1/player',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'X-YouTube-Client-Name': '1',
      'X-YouTube-Client-Version': '2.20231121.08.00',
    },
    context: { client: { clientName: 'WEB', clientVersion: '2.20231121.08.00', hl: 'fr', gl: 'FR' } },
  },
]

// InnerTube API — endpoint JSON stable, ne dépend pas du HTML de la page
async function fetchCaptionTracksInnerTube(videoId: string): Promise<CaptionTrack[]> {
  const clientErrors: string[] = []

  for (const client of INNERTUBE_CLIENTS) {
    try {
      const res = await fetch(client.url, {
        method: 'POST',
        headers: client.headers,
        body: JSON.stringify({ context: client.context, videoId }),
      })

      if (!res.ok) {
        clientErrors.push(`${client.context.client.clientName}: HTTP ${res.status}`)
        continue
      }

      const data = await res.json() as PlayerResponse
      const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? []

      if (tracks.length === 0) {
        clientErrors.push(`${client.context.client.clientName}: aucune piste`)
        continue
      }

      return tracks
        .filter(t => t.baseUrl && t.languageCode)
        .map(t => ({ baseUrl: t.baseUrl!, languageCode: t.languageCode! }))
    } catch (e) {
      clientErrors.push(`${client.context.client.clientName}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  throw new Error(`InnerTube tous clients échoués : ${clientErrors.join(' | ')}`)
}

async function fetchSegmentsFromTrack(track: CaptionTrack): Promise<Segment[]> {
  const url = track.baseUrl.includes('fmt=') ? track.baseUrl : `${track.baseUrl}&fmt=json3`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Caption fetch erreur ${res.status}`)

  const data = await res.json() as {
    events?: Array<{
      segs?: Array<{ utf8?: string }>
      tStartMs?: number
      dDurationMs?: number
    }>
  }

  if (!data.events || data.events.length === 0) throw new Error('Captions vides')

  const segments: Segment[] = []
  for (const ev of data.events) {
    if (!ev.segs) continue
    const text = ev.segs.map(s => s.utf8 ?? '').join('').replace(/\n/g, ' ').trim()
    if (!text) continue
    segments.push({
      text: decodeHtmlEntities(text),
      offset: ev.tStartMs ?? 0,
      duration: ev.dDurationMs ?? 0,
    })
  }

  if (segments.length === 0) throw new Error('Aucun segment extrait')
  return segments
}

async function fetchVideoTitle(videoId: string): Promise<string | null> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) return null
  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`
    )
    if (!res.ok) return null
    const data = await res.json() as { items?: Array<{ snippet?: { title?: string } }> }
    return data.items?.[0]?.snippet?.title ?? null
  } catch {
    return null
  }
}

async function transcribeViaApi(url: string, videoId: string): Promise<{ transcript: string; title: string }> {
  const keys = [process.env.TRANSCRIPT_API_KEY, process.env.TRANSCRIPT_API_KEY_2].filter(Boolean) as string[]
  if (keys.length === 0) throw new Error('TRANSCRIPT_API_KEY manquant')

  let lastError: Error | null = null

  for (const key of keys) {
    const res = await fetch(
      `https://transcriptapi.com/api/v2/youtube/transcript?video_url=${encodeURIComponent(url)}&format=json`,
      { headers: { Authorization: `Bearer ${key}` } }
    )

    if (!res.ok) {
      const err = await res.text()
      const error = new Error(`TranscriptAPI erreur ${res.status}: ${err}`)
      if (res.status === 429 && keys.indexOf(key) < keys.length - 1) {
        lastError = error
        continue
      }
      if (res.status === 429 && keys.indexOf(key) === keys.length - 1) {
        throw new Error(`TranscriptAPI : toutes les clefs ont atteint leur limite (429)`)
      }
      throw error
    }

    const data = await res.json() as { video_id?: string; transcript?: { text: string }[] }
    const transcript = (data.transcript ?? []).map(s => s.text).join(' ').replace(/\s+/g, ' ').trim()
    if (!transcript) throw new Error('TranscriptAPI : transcription vide')

    return { transcript, title: `YouTube — ${data.video_id ?? videoId}` }
  }

  throw lastError ?? new Error('TranscriptAPI : toutes les clefs ont atteint leur limite (429)')
}

export async function loadYouTube(url: string): Promise<YouTubeMetadata> {
  const videoId = extractVideoId(url)
  if (!videoId) throw new Error(`URL YouTube invalide : ${url}`)

  const titlePromise = fetchVideoTitle(videoId)
  const { transcript, title: apiTitle } = await transcribeViaApi(url, videoId)
  const title = (await titlePromise) ?? apiTitle
  return { videoId, url, title, transcript, durationEstimate: null }
}
