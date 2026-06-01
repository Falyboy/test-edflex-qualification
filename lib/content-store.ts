import { promises as fs } from 'fs'
import path from 'path'

export type ContentType = 'module' | 'fiche' | 'scenario' | 'kit'

export interface ContentMeta {
  id: string
  type: ContentType
  slug: string
  title?: string
  [key: string]: unknown
}

export interface Content {
  id: string
  type: ContentType
  slug: string
  body: string
  meta: Record<string, unknown>
}

export interface IContentStore {
  list(type: ContentType): Promise<ContentMeta[]>
  read(id: string): Promise<Content>
  write(content: Content): Promise<void>
  delete(id: string): Promise<void>
  search(query: string): Promise<ContentMeta[]>
}

export class FilesystemContentStore implements IContentStore {
  constructor(private basePath: string) {}

  private resolveSafe(id: string): string {
    const resolved = path.resolve(this.basePath, id + '.json')
    if (!resolved.startsWith(path.resolve(this.basePath) + path.sep) &&
        resolved !== path.resolve(this.basePath)) {
      throw new Error('Invalid path')
    }
    return resolved
  }

  async list(type: ContentType): Promise<ContentMeta[]> {
    const indexPath = path.join(this.basePath, `${type}-index.json`)
    try {
      const raw = await fs.readFile(indexPath, 'utf-8')
      return JSON.parse(raw)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
  }

  async read(id: string): Promise<Content> {
    const filePath = this.resolveSafe(id)
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  }

  async write(content: Content): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true })
    const filePath = this.resolveSafe(content.id)
    const tmpPath = filePath + '.tmp'
    await fs.writeFile(tmpPath, JSON.stringify(content, null, 2), 'utf-8')
    await fs.rename(tmpPath, filePath)
    const index = await this.list(content.type)
    const existingIdx = index.findIndex(i => i.id === content.id)
    const meta: ContentMeta = { ...content.meta, id: content.id, type: content.type, slug: content.slug }
    if (existingIdx >= 0) index[existingIdx] = meta
    else index.push(meta)
    await this.writeIndexAtomic(content.type, index)
  }

  async delete(id: string): Promise<void> {
    const content = await this.read(id)
    await fs.unlink(this.resolveSafe(id))
    const index = await this.list(content.type)
    const updated = index.filter(i => i.id !== id)
    await this.writeIndexAtomic(content.type, updated)
  }

  private async writeIndexAtomic(type: ContentType, index: ContentMeta[]): Promise<void> {
    const indexPath = path.join(this.basePath, `${type}-index.json`)
    const tmpPath = indexPath + '.tmp'
    await fs.writeFile(tmpPath, JSON.stringify(index, null, 2), 'utf-8')
    await fs.rename(tmpPath, indexPath)
  }

  async search(query: string): Promise<ContentMeta[]> {
    const types: ContentType[] = ['module', 'fiche', 'scenario', 'kit']
    const all = (await Promise.all(types.map(t => this.list(t)))).flat()
    const q = query.toLowerCase()
    return all.filter(item =>
      Object.values(item).some(v => String(v).toLowerCase().includes(q))
    )
  }
}
