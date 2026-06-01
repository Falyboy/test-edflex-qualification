import crypto from 'crypto'

export interface ContentDocument {
  id: string
  sourceUrl: string
  sourceType: 'youtube' | 'web' | 'file' | 'text' | 'podcast' | 'drive' | 'notion'
  title: string
  text: string
  textLength: number
  thumbnailUrl: string | null
  durationSeconds: number | null
  language: string | null
  tags: string[]
  createdAt: string
  notionPageId?: string
}

type ContentInput = Omit<ContentDocument, 'id' | 'textLength' | 'createdAt'>

interface StoreAdapter {
  save(doc: ContentDocument): Promise<void>
  get(id: string): Promise<ContentDocument | null>
  update(id: string, doc: ContentDocument): Promise<void>
}

// Upstash Redis adapter — used when UPSTASH_REDIS_REST_URL env var is present
class RedisAdapter implements StoreAdapter {
  private redis: import('@upstash/redis').Redis | null = null

  private async client() {
    if (!this.redis) {
      const { Redis } = await import('@upstash/redis')
      this.redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      })
    }
    return this.redis
  }

  async save(doc: ContentDocument): Promise<void> {
    const client = await this.client()
    await client.set(`content:${doc.id}`, JSON.stringify(doc))
  }

  async get(id: string): Promise<ContentDocument | null> {
    const client = await this.client()
    const raw = await client.get<ContentDocument>(`content:${id}`)
    if (!raw) return null
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) as ContentDocument } catch { return null }
    }
    return raw
  }

  async update(id: string, doc: ContentDocument): Promise<void> {
    await this.save(doc)
  }
}

// Filesystem adapter — used in local dev when KV env vars are absent
export class FsAdapter implements StoreAdapter {
  private fs: typeof import('fs') | null = null
  private path: typeof import('path') | null = null
  readonly dir: string

  constructor(dir?: string) {
    if (dir) {
      this.dir = dir
    } else if (process.env.CONTENT_STORE_PATH) {
      this.dir = process.env.CONTENT_STORE_PATH
    } else if (process.env.VERCEL) {
      this.dir = '/tmp/.content-store'
    } else {
      this.dir = require('path').join(process.cwd(), '.content-store')
    }
    const fs = require('fs')
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true })
  }

  private get _fs() {
    if (!this.fs) this.fs = require('fs')
    return this.fs!
  }

  private get _path() {
    if (!this.path) this.path = require('path')
    return this.path!
  }

  async save(doc: ContentDocument): Promise<void> {
    const filePath = this._path.join(this.dir, `${doc.id}.json`)
    this._fs.writeFileSync(filePath, JSON.stringify(doc, null, 2), 'utf-8')
  }

  async get(id: string): Promise<ContentDocument | null> {
    const filePath = this._path.join(this.dir, `${id}.json`)
    if (!this._fs.existsSync(filePath)) return null
    try {
      return JSON.parse(this._fs.readFileSync(filePath, 'utf-8')) as ContentDocument
    } catch {
      return null
    }
  }

  async update(id: string, doc: ContentDocument): Promise<void> {
    await this.save(doc)
  }
}

function createAdapter(): StoreAdapter {
  if (process.env.UPSTASH_REDIS_REST_URL) return new RedisAdapter()
  return new FsAdapter()
}

export class ContentStore {
  private adapter: StoreAdapter

  constructor(dir?: string) {
    this.adapter = (process.env.UPSTASH_REDIS_REST_URL && !dir) ? new RedisAdapter() : new FsAdapter(dir)
  }

  async save(input: ContentInput): Promise<string> {
    const id = crypto.randomUUID()
    const doc: ContentDocument = {
      ...input,
      id,
      textLength: input.text.length,
      createdAt: new Date().toISOString(),
    }
    await this.adapter.save(doc)
    return id
  }

  async get(id: string): Promise<ContentDocument | null> {
    return this.adapter.get(id)
  }

  async update(id: string, partial: Partial<ContentDocument>): Promise<void> {
    const existing = await this.get(id)
    if (!existing) throw new Error(`ContentDocument not found: ${id}`)
    const updated: ContentDocument = { ...existing, ...partial, id }
    await this.adapter.update(id, updated)
  }
}

export const contentStore = new ContentStore()
