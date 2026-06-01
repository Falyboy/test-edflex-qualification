const PRIVATE_IP_RE = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|\[::1\])/i

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

function extractBasic(html: string, url: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  const parsed = new URL(url)
  const title = titleMatch ? titleMatch[1].trim() : parsed.hostname + parsed.pathname
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return { title, text }
}

async function extractWithReadability(html: string, url: string): Promise<{ title: string; text: string } | null> {
  try {
    const { JSDOM } = require('jsdom') as typeof import('jsdom')
    const { Readability } = require('@mozilla/readability') as typeof import('@mozilla/readability')
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()
    if (!article || !article.textContent?.trim()) return null
    return { title: article.title || '', text: article.textContent.trim() }
  } catch {
    return null
  }
}

export interface WebDocument {
  title: string
  text: string
  url: string
}

export async function loadWeb(url: string): Promise<WebDocument> {
  assertSafeUrl(url)

  let html: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EdflexBot/1.0)' },
    })
    if (!res.ok) throw new Error(`Page inaccessible : ${res.status}`)
    html = await res.text()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('inaccessible')) throw err
    throw new Error(`Page inaccessible — erreur réseau : ${msg}`)
  }

  const readability = await extractWithReadability(html, url)
  const basic = extractBasic(html, url)
  const title = readability?.title || basic.title
  const text = readability?.text || basic.text

  return { title, text, url }
}
