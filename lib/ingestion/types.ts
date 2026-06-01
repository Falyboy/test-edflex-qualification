export type SourceType = 'youtube' | 'file' | 'url' | 'text' | 'podcast' | 'gdrive'

export interface IngestedDocument {
  sourceUrl: string
  sourceType: SourceType
  title: string
  text: string
  durationSeconds: number | null
  metadata: Record<string, unknown>
}

export type IngestEvent =
  | { type: 'start'; sourceUrl: string; index: number; total: number }
  | { type: 'done'; sourceUrl: string; index: number; contentId: string; doc: Omit<IngestedDocument, 'text'> & { textLength: number } }
  | { type: 'error'; sourceUrl: string; index: number; message: string }
  | { type: 'complete'; total: number; succeeded: number; failed: number }
