import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { Redis } from '@upstash/redis'
import { getEdflexEmail } from '@/lib/edflex/session'
import { saveSource, getProject, EdflexSource } from '@/lib/edflex/store'
import { MAX_SOURCES, getSourceCount } from '@/lib/edflex/limits'

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

function redis() { return Redis.fromEnv() }

function extractToken(raw: string | object): string {
  if (typeof raw === 'object' && raw !== null) {
    return (raw as { access_token: string }).access_token
  }
  return (JSON.parse(raw as string) as { access_token: string }).access_token
}

interface NotionPage {
  id: string
  properties: {
    Nom?: { title?: { plain_text: string }[] }
    Urls?: { url?: string | null }
    Type?: { select?: { name: string } | null }
    Décision?: { select?: { name: string } | null }
    Statut?: { select?: { name: string } | null }
    'Score O'?: { number?: number | null }
    'Score P'?: { number?: number | null }
    'Score A'?: { number?: number | null }
    'Score D'?: { number?: number | null }
    'IA Act'?: { number?: number | null }
    'RGPD'?: { number?: number | null }
    'Score Persona'?: { number?: number | null }
    Sujet?: { rich_text?: { plain_text: string }[] }
    Niveau?: { select?: { name: string } | null }
    Justification?: { rich_text?: { plain_text: string }[] }
  }
}

function richText(arr?: { plain_text: string }[]): string {
  return arr?.map(b => b.plain_text).join('') ?? ''
}

function mapNotionPageToSource(page: NotionPage, projectId: string): EdflexSource {
  const props = page.properties
  const scoreO = props['Score O']?.number ?? 0
  const scoreP = props['Score P']?.number ?? 0
  const scoreA = props['Score A']?.number ?? 0
  const scoreD = props['Score D']?.number ?? 0
  const iaAct  = props['IA Act']?.number ?? 0
  const rgpd   = props['RGPD']?.number ?? 0
  const scorePersona = props['Score Persona']?.number ?? undefined

  // Score A dans Notion = moyenne a_forme+a_inclusion → on réutilise pour les deux
  const allScores = {
    o: scoreO, p: scoreP,
    a_forme: scoreA, a_inclusion: scoreA,
    d: scoreD, pi: 10,
    rgpd, ia_act: iaAct,
  }

  const decisionRaw = props['Décision']?.select?.name ?? ''
  const decision = (['Publier', 'Réviser', 'Rejeter', 'Revue humaine'].includes(decisionRaw)
    ? decisionRaw : 'Revue humaine') as EdflexSource['decision']

  const typeRaw = props['Type']?.select?.name ?? 'Article'
  const type = (['YouTube', 'Podcast', 'Fichier', 'Article'].includes(typeRaw)
    ? typeRaw : 'Article') as EdflexSource['type']

  const niveau = props['Niveau']?.select?.name as EdflexSource['niveau'] | undefined

  return {
    id: randomUUID(),
    projectId,
    url: props['Urls']?.url ?? '',
    type,
    title: richText(props['Nom']?.title) || props['Urls']?.url || 'Sans titre',
    status: 'done',
    decision,
    score: scorePersona ?? scoreO,
    tags: [],
    justification: richText(props['Justification']?.rich_text),
    rgpd,
    iaAct,
    allScores,
    sujetPrincipal: richText(props['Sujet']?.rich_text),
    niveau,
    scorePersona,
    createdAt: new Date().toISOString(),
  }
}

// GET — liste les sources qualifiées dans la Notion DB de l'user
export async function GET(): Promise<Response> {
  const email = await getEdflexEmail()
  if (!email) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const r = redis()
  const [dbId, rawToken] = await Promise.all([
    r.get<string>(`notion_db_id:${email}`),
    r.get<string | object>(`notion_token:${email}`),
  ])

  if (!dbId || !rawToken) {
    return NextResponse.json({ error: 'Notion non connecté' }, { status: 400 })
  }

  let token: string
  try { token = extractToken(rawToken) }
  catch { return NextResponse.json({ error: 'Token Notion invalide' }, { status: 401 }) }

  const res = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: {
        or: [
          { property: 'Statut', select: { equals: 'Qualifié' } },
          { property: 'Statut', select: { equals: 'En cours' } },
        ],
      },
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      page_size: 50,
    }),
  })

  if (!res.ok) {
    return NextResponse.json({ error: `Notion ${res.status}` }, { status: 502 })
  }

  const { results } = await res.json() as { results: NotionPage[] }

  const sources = results.map(page => ({
    notionPageId: page.id,
    title: richText(page.properties['Nom']?.title) || page.properties['Urls']?.url || 'Sans titre',
    url: page.properties['Urls']?.url ?? '',
    type: page.properties['Type']?.select?.name ?? '',
    decision: page.properties['Décision']?.select?.name ?? '',
    statut: page.properties['Statut']?.select?.name ?? '',
    scorePersona: page.properties['Score Persona']?.number ?? null,
    sujet: richText(page.properties['Sujet']?.rich_text),
  }))

  return NextResponse.json({ sources })
}

// POST — importe les sources sélectionnées dans un projet Edflex
export async function POST(req: NextRequest): Promise<Response> {
  const email = await getEdflexEmail()
  if (!email) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { projectId, pages } = await req.json() as {
    projectId: string
    pages: NotionPage[]
  }

  if (!projectId || !Array.isArray(pages) || pages.length === 0) {
    return NextResponse.json({ error: 'projectId + pages requis' }, { status: 400 })
  }

  const project = await getProject(projectId)
  if (!project || project.email !== email) {
    return NextResponse.json({ error: 'Projet introuvable' }, { status: 404 })
  }

  const count = await getSourceCount(projectId)
  if (count + pages.length > MAX_SOURCES) {
    return NextResponse.json({ error: `Maximum ${MAX_SOURCES} sources atteint` }, { status: 403 })
  }

  const imported: EdflexSource[] = []
  for (const page of pages) {
    const source = mapNotionPageToSource(page, projectId)
    await saveSource(source)
    imported.push(source)
  }

  return NextResponse.json({ sources: imported })
}
