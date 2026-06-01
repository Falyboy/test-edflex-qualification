import fs from 'fs'
import path from 'path'

export interface ErrorEntry {
  timestamp: string
  route: string
  type: string
  message: string
  context?: string
  stack?: string
  notionPageId?: string
}

function logPath(): string {
  if (process.env.VERCEL) return '/tmp/errors.jsonl'
  return path.join(process.cwd(), 'errors.jsonl')
}

function notionType(type: string): string {
  const known = ['llm', 'auth', 'ingest', 'notion', 'export']
  return known.find(k => type.toLowerCase().includes(k)) ?? 'other'
}

async function writeToNotion(entry: ErrorEntry): Promise<void> {
  const token = process.env.NOTION_TOKEN
  const dbId = process.env.NOTION_ERRORS_DB
  if (!token || !dbId) return
  const props: Record<string, unknown> = {
    Message:   { title: [{ text: { content: entry.message.slice(0, 2000) } }] },
    Route:     { rich_text: [{ text: { content: entry.route } }] },
    Type:      { select: { name: notionType(entry.type) } },
    Timestamp: { date: { start: entry.timestamp } },
  }
  if (entry.context) props.Contexte = { rich_text: [{ text: { content: entry.context.slice(0, 2000) } }] }
  if (entry.stack)   props.Stack    = { rich_text: [{ text: { content: entry.stack.slice(0, 2000) } }] }

  await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ parent: { database_id: dbId }, properties: props }),
  })
}

export function logError(entry: Omit<ErrorEntry, 'timestamp'>): void {
  const full: ErrorEntry = { timestamp: new Date().toISOString(), ...entry }
  try {
    const line = JSON.stringify(full) + '\n'
    fs.appendFileSync(logPath(), line, 'utf-8')
  } catch {
    // never throw from logger
  }
  // fire-and-forget — Notion failure must not block callers
  writeToNotion(full).catch(() => {})
}

export async function readErrors(): Promise<ErrorEntry[]> {
  const token = process.env.NOTION_TOKEN
  const dbId = process.env.NOTION_ERRORS_DB

  if (token && dbId) {
    try {
      const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sorts: [{ property: 'Timestamp', direction: 'descending' }], page_size: 100 }),
      })
      if (res.ok) {
        const data = await res.json() as { results: unknown[] }
        return data.results.map((p: unknown) => {
          const page = p as Record<string, unknown>
          const props = page.properties as Record<string, unknown>
          const get = (key: string, sub: string) => {
            const prop = props[key] as Record<string, unknown> | undefined
            if (!prop) return ''
            const arr = prop[sub] as Array<Record<string, unknown>> | undefined
            return (arr?.[0]?.plain_text as string) ?? ''
          }
          const ts = (props.Timestamp as Record<string, unknown> | undefined)
          const dateVal = (ts?.date as Record<string, unknown> | undefined)?.start as string | undefined
          return {
            timestamp:    dateVal ?? new Date().toISOString(),
            route:        get('Route', 'rich_text'),
            type:         ((props.Type as Record<string, unknown>)?.select as Record<string, unknown> | undefined)?.name as string ?? 'other',
            message:      get('Message', 'title'),
            context:      get('Contexte', 'rich_text') || undefined,
            stack:        get('Stack', 'rich_text') || undefined,
            notionPageId: (page as Record<string, unknown>).id as string | undefined,
          } satisfies ErrorEntry
        })
      }
    } catch {
      // fall through to local file
    }
  }

  try {
    const raw = fs.readFileSync(logPath(), 'utf-8')
    return raw
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line) as ErrorEntry)
      .reverse()
  } catch {
    return []
  }
}
