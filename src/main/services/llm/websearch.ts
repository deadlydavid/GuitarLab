import type { WebSource } from '@shared/types'

/**
 * Reading what a web-searching model sends back.
 *
 * Two providers can search: OpenAI through the Responses API's `web_search`
 * tool, and Gemini through Google Search grounding. They report the same three
 * things in different shapes — the answer text, the queries they ran, and the
 * pages they cited — and this module flattens both into one. Pure, so the
 * parsing is tested against captured payloads rather than a live quota.
 */

/** One Responses API stream event, reduced to what the driver acts on. */
export type ResponsesEvent =
  | { kind: 'text'; delta: string }
  | { kind: 'reasoning'; delta: string }
  | { kind: 'search'; query: string }
  | { kind: 'sources'; sources: WebSource[] }
  | { kind: 'done'; text: string; sources: WebSource[] }
  | { kind: 'incomplete'; reason: string; text: string; sources: WebSource[] }
  | { kind: 'error'; message: string }

type Json = Record<string, unknown>

const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

function citation(annotation: unknown): WebSource | null {
  const a = obj(annotation)
  if (a.type !== 'url_citation') return null
  const url = str(a.url)
  if (!/^https?:\/\//.test(url)) return null
  return { url: cleanUrl(url), title: str(a.title) || hostOf(url) }
}

/** Walk a finished response's `output` for the message text and its citations. */
export function responsesOutput(response: unknown): { text: string; sources: WebSource[] } {
  let text = ''
  const sources: WebSource[] = []
  const output = obj(response).output
  for (const item of Array.isArray(output) ? output : []) {
    const it = obj(item)
    if (it.type !== 'message') continue
    for (const part of Array.isArray(it.content) ? it.content : []) {
      const p = obj(part)
      if (p.type !== 'output_text') continue
      text += str(p.text)
      for (const a of Array.isArray(p.annotations) ? p.annotations : []) {
        const c = citation(a)
        if (c) sources.push(c)
      }
    }
  }
  return { text, sources: dedupeSources(sources) }
}

/** Turn one `data:` payload of a Responses stream into what the driver does next. */
export function parseResponsesEvent(payload: string): ResponsesEvent | null {
  let e: Json
  try {
    e = obj(JSON.parse(payload))
  } catch {
    return null
  }
  switch (e.type) {
    case 'response.output_text.delta':
      return str(e.delta) ? { kind: 'text', delta: str(e.delta) } : null
    case 'response.reasoning_summary_text.delta':
    case 'response.reasoning_text.delta':
      return str(e.delta) ? { kind: 'reasoning', delta: str(e.delta) } : null
    case 'response.output_text.annotation.added': {
      const c = citation(e.annotation)
      return c ? { kind: 'sources', sources: [c] } : null
    }
    case 'response.output_item.done': {
      const item = obj(e.item)
      if (item.type !== 'web_search_call') return null
      const action = obj(item.action)
      const query = str(action.query) || (Array.isArray(action.queries) ? str(action.queries[0]) : '')
      return query ? { kind: 'search', query } : null
    }
    case 'response.completed': {
      const { text, sources } = responsesOutput(e.response)
      return { kind: 'done', text, sources }
    }
    case 'response.incomplete': {
      const { text, sources } = responsesOutput(e.response)
      const reason = str(obj(obj(e.response).incomplete_details).reason) || 'incompleta'
      return { kind: 'incomplete', reason, text, sources }
    }
    case 'response.failed': {
      const message = str(obj(obj(e.response).error).message) || 'a resposta falhou'
      return { kind: 'error', message }
    }
    case 'error': {
      const message = str(e.message) || str(obj(e.error).message) || 'erro no stream'
      return { kind: 'error', message }
    }
    default:
      return null
  }
}

/** Gemini's grounding block: the pages it used and the queries it ran. */
export function geminiGrounding(candidate: unknown): { sources: WebSource[]; queries: string[] } {
  const meta = obj(obj(candidate).groundingMetadata)
  const sources: WebSource[] = []
  for (const chunk of Array.isArray(meta.groundingChunks) ? meta.groundingChunks : []) {
    const web = obj(obj(chunk).web)
    const url = str(web.uri)
    if (!/^https?:\/\//.test(url)) continue
    // Gemini hands back a redirect through its own domain; the title is the real site
    sources.push({ url, title: str(web.title) || hostOf(url) })
  }
  const queries = (Array.isArray(meta.webSearchQueries) ? meta.webSearchQueries : [])
    .map(str)
    .filter(Boolean)
  return { sources: dedupeSources(sources), queries }
}

/* ---------------------------------------------------------------- helpers */

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Drop the tracking tag OpenAI appends to every cited link. */
function cleanUrl(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.delete('utm_source')
    return u.toString()
  } catch {
    return url
  }
}

export function dedupeSources(list: WebSource[]): WebSource[] {
  const seen = new Set<string>()
  const out: WebSource[] = []
  for (const s of list) {
    const key = s.url.replace(/[#?].*$/, '').replace(/\/$/, '')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

/**
 * Take the inline citations out of a cited answer.
 *
 * Search-grounded answers carry their sources inline as markdown links —
 * "([premierguitar.com](https://…))". The app's markdown renderer does not do
 * links on purpose, so left in they print as raw URLs mid-sentence; the sources
 * are listed under the text instead.
 */
export function stripInlineLinks(md: string): string {
  return md
    .replace(/\s*\(\s*\[[^\]]*\]\(https?:[^)]*\)\s*\)/g, '')
    .replace(/\[([^\]]+)\]\(https?:[^)]*\)/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
}
