const DRIVE_API = 'https://www.googleapis.com/drive/v3'

export interface GDriveMetadata {
  title: string
  transcript: string
  mimeType: string
}

function extractFileId(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname
    const path = u.pathname

    if (host === 'docs.google.com') {
      const m = path.match(/\/(document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/)
      if (m) return m[2]
    }
    if (host === 'drive.google.com') {
      const m = path.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
      if (m) return m[1]
      const id = u.searchParams.get('id')
      if (id) return id
    }
    return null
  } catch {
    return null
  }
}

const GOOGLE_APPS_EXPORT: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
}

export async function loadGDrive(url: string, accessToken: string): Promise<GDriveMetadata> {
  const fileId = extractFileId(url)
  if (!fileId) throw new Error(`URL Google Drive invalide : ${url}`)

  const authHeader = `Bearer ${accessToken}`

  const metaRes = await fetch(`${DRIVE_API}/files/${fileId}?fields=name,mimeType`, {
    headers: { Authorization: authHeader },
  })
  if (!metaRes.ok) {
    throw new Error(`Google Drive ${metaRes.status} — vérifiez que le fichier est partagé avec votre compte connecté`)
  }
  const meta = await metaRes.json() as { name: string; mimeType: string }
  const title = meta.name
  const mimeType = meta.mimeType

  const exportMime = GOOGLE_APPS_EXPORT[mimeType]

  let text = ''

  if (exportMime) {
    const exportRes = await fetch(
      `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`,
      { headers: { Authorization: authHeader } }
    )
    if (!exportRes.ok) throw new Error(`Export Google Drive impossible : ${exportRes.status}`)
    text = await exportRes.text()
  } else if (mimeType === 'application/pdf') {
    throw new Error('PDF Google Drive non supporté directement. Convertissez-le en Google Doc dans Drive, puis collez le lien.')
  } else {
    const downloadRes = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
      headers: { Authorization: authHeader },
    })
    if (!downloadRes.ok) throw new Error(`Téléchargement impossible : ${downloadRes.status}`)
    const ct = downloadRes.headers.get('content-type') ?? ''
    if (!ct.includes('text')) throw new Error(`Format non supporté : ${mimeType}`)
    text = await downloadRes.text()
  }

  if (!text.trim()) throw new Error('Fichier vide ou inaccessible')

  return { title, transcript: text.slice(0, 40_000), mimeType }
}
