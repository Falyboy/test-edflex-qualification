import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'
import { getEdflexEmail } from '@/lib/edflex/session'

// Émet les tokens d'upload client pour Vercel Blob (upload navigateur → Blob,
// contourne la limite 4.5MB du body serverless). Utilisé par les gros PDF.
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const email = await getEdflexEmail()
        if (!email) throw new Error('Non connecté')
        return {
          allowedContentTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain', 'text/markdown', 'text/csv',
            'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/webm',
            'video/mp4', 'video/quicktime', 'video/webm',
          ],
          maximumSizeInBytes: 500 * 1024 * 1024, // 500 MB
          tokenPayload: JSON.stringify({ email }),
        }
      },
      onUploadCompleted: async () => {
        // Rien à faire ici — l'ingestion est déclenchée par le client après upload.
      },
    })
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload refusé'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
