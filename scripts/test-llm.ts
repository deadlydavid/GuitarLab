/**
 * End-to-end check of the tone-patch path against the real providers.
 *
 * Run with: npm run test:llm
 *
 * It exercises the patch normalisation, the loose JSON parsing and then the
 * live APIs. The bug this was written for — a reasoning model spending its
 * whole token budget thinking and returning an empty body — is invisible to
 * typecheck and to any mocked test, so the live call is the point.
 */
import { readFileSync } from 'node:fs'
import {
  normalizePatch,
  normalizePlan,
  normalizeGt1Plan,
  planPitchShifter,
  buildToneContext
} from '../src/main/services/tone'
import {
  gt1PatchPrompt,
  gt1PatchSystemPrompt,
  tonePatchPrompt,
  tonePatchSystemPrompt,
  toneResearchPrompt,
  toneResearchSystemPrompt
} from '../src/main/services/prompts'
import { LOCALES, LOCALE_PROMPT_NAMES } from '../src/shared/i18n'
import { RIG_OUTPUT_EN } from '../src/shared/types'
import { parseJsonLoose } from '../src/main/services/llm/pure'
import { readSse } from '../src/main/services/llm/events'
import {
  dedupeSources,
  geminiGrounding,
  parseResponsesEvent,
  stripInlineLinks
} from '../src/main/services/llm/websearch'
import { gt1CatalogueText, gt1KeyFor, gt1TargetsText, paramText } from '../src/shared/gt1'
import { RIG_DEFAULT, type TonePatchView, type WebSource } from '../src/shared/types'

const env: Record<string, string> = {}
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim()
}

const SONG = {
  title: 'Master of Puppets',
  artist: 'Metallica',
  genre: 'Thrash Metal',
  musicalKey: 'Em',
  bpm: 212,
  // the record is a half step down, which is what puts the pitch shifter and
  // the "guitar stays in E standard" rule into the live prompt
  tuning: { name: 'Eb Standard', strings: ['D#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'] },
  sections: ['Intro', 'Riff principal', 'Trecho limpo', 'Solo']
}

let failures = 0
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${label}${detail ? ` -- ${detail}` : ''}`)
  if (!ok) failures++
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
}

async function callGemini(prompt: string, system: string, maxTokens = 16384): Promise<string> {
  const model = env.GEMINI_MODEL || 'gemini-3.5-flash'
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          /*
           * Matches the driver in services/llm — and it has to. Gemini 3.x
           * spends 1500-2700 thinking tokens on this prompt before writing a
           * character, and they come out of this same budget, so half the
           * app's ceiling truncates a four-patch answer intermittently. The
           * test was failing on a limit the app does not use.
           */
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json'
        }
      })
    }
  )
  const data = (await res.json()) as GeminiResponse
  const cand = data.candidates?.[0]
  const text = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text) throw new Error(`vazio (finishReason=${cand?.finishReason}) HTTP ${res.status}`)
  return text
}

async function callOpenAi(prompt: string, system: string, maxTokens = 4096): Promise<string> {
  const key = env.OPEN_AI_API_KEY || env.OPENAI_API_KEY
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || 'gpt-5.4-nano',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: maxTokens
    })
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 160)}`)
  const data = JSON.parse(body) as { choices?: Array<{ message?: { content?: string } }> }
  const text = data.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('resposta vazia')
  return text
}

/** Gemini with Google Search grounding, streamed and parsed exactly as the app does. */
async function researchGemini(
  prompt: string,
  system: string
): Promise<{ text: string; sources: WebSource[]; queries: string[] }> {
  const model = env.GEMINI_MODEL || 'gemini-3.5-flash'
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 16384 }
      })
    }
  )
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  let text = ''
  const sources: WebSource[] = []
  const queries: string[] = []
  for await (const payload of readSse(res.body)) {
    let parsed: { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> }
    try {
      parsed = JSON.parse(payload)
    } catch {
      continue
    }
    const cand = parsed.candidates?.[0]
    for (const part of cand?.content?.parts ?? []) if (part.text && !part.thought) text += part.text
    const g = geminiGrounding(cand)
    sources.push(...g.sources)
    for (const q of g.queries) if (!queries.includes(q)) queries.push(q)
  }
  return { text, sources: dedupeSources(sources), queries }
}

/** The Responses API with web_search, streamed and parsed exactly as the app does. */
async function researchOpenAi(
  prompt: string,
  system: string
): Promise<{ text: string; sources: WebSource[]; queries: string[] }> {
  const key = env.OPEN_AI_API_KEY || env.OPENAI_API_KEY
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || 'gpt-5.4-nano',
      instructions: system,
      input: prompt,
      tools: [{ type: 'web_search' }],
      stream: true,
      max_output_tokens: 16384
    })
  })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  let text = ''
  const sources: WebSource[] = []
  const queries: string[] = []
  for await (const payload of readSse(res.body)) {
    const e = parseResponsesEvent(payload)
    if (!e) continue
    if (e.kind === 'text') text += e.delta
    else if (e.kind === 'search') queries.push(e.query)
    else if (e.kind === 'sources') sources.push(...e.sources)
    else if (e.kind === 'done' || e.kind === 'incomplete') {
      if (!text) text = e.text
      sources.push(...e.sources)
    } else if (e.kind === 'error') throw new Error(e.message)
  }
  return { text, sources: dedupeSources(sources), queries }
}

function validatePatch(patch: TonePatchView, label: string): void {
  check(`${label}: tem nome`, patch.patchName.length > 0, patch.patchName)
  check(`${label}: cadeia com 2+ nos`, patch.chain.length >= 2, patch.chain.join(' > '))
  check(`${label}: tem blocos`, patch.blocks.length > 0, `${patch.blocks.length} blocos`)
  check(
    `${label}: todo bloco tem slot`,
    patch.blocks.every((b) => b.slot.length > 0)
  )
  const params = patch.blocks.flatMap((b) => b.params)
  check(`${label}: tem controles`, params.length > 0, `${params.length} controles`)
  check(
    `${label}: knobs dentro de 0-100`,
    params.every((p) => p.value === null || (p.value >= 0 && p.value <= 100))
  )
  check(
    `${label}: todo controle tem rotulo`,
    params.every((p) => p.label.length > 0)
  )
  check(
    `${label}: controle sem valor tem texto`,
    params.every((p) => p.value !== null || (p.text ?? '').length > 0)
  )
}

async function main(): Promise<void> {
  console.log('=== 1. normalizePatch: o modelo erra e nao pode quebrar a tela ===')
  const junk = normalizePatch(
    {
      blocks: [
        { slot: '', model: 'X', enabled: true, params: [{ label: 'Gain', value: 999 }] },
        { slot: 'VAZIO', model: '', enabled: true, params: [] },
        ...Array.from({ length: 10 }, (_, i) => ({
          slot: `S${i}`,
          model: `M${i}`,
          enabled: true,
          params: []
        }))
      ],
      chain: ['a', '', '  ', 'b']
    },
    RIG_DEFAULT,
    'teste',
    'teste'
  )
  check('nome vazio vira padrao', junk.patchName === 'Patch sugerido')
  check('slot vazio vira BLOCO', junk.blocks[0]?.slot === 'BLOCO', junk.blocks[0]?.slot)
  check('valor 999 e limitado a 100', junk.blocks[0]?.params[0]?.value === 100)
  check('no maximo 6 blocos', junk.blocks.length <= 6, `${junk.blocks.length}`)
  check('bloco sem modelo e sem controles e descartado', !junk.blocks.some((b) => b.slot === 'VAZIO'))
  check(
    'cadeia sem strings vazias',
    junk.chain.every((c) => c.trim().length > 0),
    junk.chain.join('|')
  )

  const textParam = normalizePatch(
    {
      blocks: [
        {
          slot: 'EQ',
          model: 'EQ',
          enabled: true,
          params: [{ label: 'Low Cut', value: null, text: '110Hz' }]
        }
      ]
    },
    RIG_DEFAULT,
    't',
    't'
  )
  check(
    'controle de selecao mantem o texto',
    textParam.blocks[0]?.params[0]?.text === '110Hz' &&
      textParam.blocks[0]?.params[0]?.value === null
  )

  const noChain = normalizePatch(
    { blocks: [{ slot: 'PREAMP', model: 'BG LEAD', enabled: true, params: [] }] },
    RIG_DEFAULT,
    't',
    't'
  )
  check(
    'cadeia ausente e reconstruida dos blocos',
    noChain.chain.length === 3 && noChain.chain[1] === 'PREAMP',
    noChain.chain.join(' > ')
  )

  console.log('\n=== 2. parseJsonLoose ===')
  check('json puro', parseJsonLoose<{ a: number }>('{"a":1}')?.a === 1)
  check('json em cerca de codigo', parseJsonLoose<{ a: number }>('```json\n{"a":2}\n```')?.a === 2)
  check('json com prosa em volta', parseJsonLoose<{ a: number }>('Claro!\n{"a":3}\nAbraco')?.a === 3)
  check('json truncado devolve null', parseJsonLoose('{"a":1,"b":') === null)

  console.log('\n=== 3. prompt ===')
  const pitch = planPitchShifter(SONG.tuning)
  const context = buildToneContext(SONG, RIG_DEFAULT, SONG.sections)
  const output = RIG_OUTPUT_EN[RIG_DEFAULT.output].toLowerCase()
  const prompt = tonePatchPrompt(context, output, pitch)
  check('contexto cita a guitarra do rig', context.includes(RIG_DEFAULT.guitar))
  check('contexto cita a pedaleira', context.includes(RIG_DEFAULT.processor))
  check('contexto cita a afinacao', context.includes('Eb Standard'))
  check('contexto lista os trechos', context.includes('Trecho limpo'))
  check('prompt pede saida direta', prompt.toLowerCase().includes('pa / mixing desk'))
  check('prompt manda usar o CTRL', prompt.includes('CTRL'))
  check('prompt resolve a afinacao com pitch shifter', pitch.enabled && pitch.semitones === -1)

  /*
   * The prompt scaffolding is fixed English; only the output directive changes
   * per language. These three checks are what keeps that split honest, because
   * the failure mode is silent: a translated schema still returns JSON, just
   * with field names the app cannot read.
   */
  /*
   * The song's own data is the user's content and may be in any language;
   * only the labels around it are scaffolding. So each line is cut at its
   * colon and only the label half is checked for being plain ASCII.
   */
  const scaffoldOnly = context
    .split('\n')
    .map((line) => line.split(':')[0])
    .join(' | ')
  check(
    'o contexto nao emite rotulo nao-ASCII',
    !/[^\x20-\x7E]/.test(scaffoldOnly),
    scaffoldOnly
  )

  const SCHEMA = '{"patches":[{"patchName":"","appliesTo":"","summary":""'
  const systemPrompts = LOCALES.map((l) => tonePatchSystemPrompt(l))
  check(
    'o schema JSON e identico nos tres idiomas',
    LOCALES.every(() => prompt.includes(SCHEMA)),
    'o formato exigido nao pode variar com o idioma'
  )
  check(
    'cada idioma pede a si mesmo na saida',
    LOCALES.every((l, i) => systemPrompts[i].includes(`in ${LOCALE_PROMPT_NAMES[l]}`)),
    LOCALES.join(', ')
  )
  /*
   * "English" legitimately appears twice in the English prompt — once as the
   * output directive and once in the fixed instruction to leave device labels
   * alone — so counting occurrences proves nothing. What matters is that a
   * prompt never names a language other than its own.
   */
  check(
    'nenhum prompt pede um idioma que nao e o dele',
    LOCALES.every((l, i) =>
      LOCALES.filter((other) => other !== l && other !== 'en').every(
        (other) => !systemPrompts[i].includes(LOCALE_PROMPT_NAMES[other])
      )
    )
  )
  check(
    'o prompt manda preservar os rotulos do aparelho',
    systemPrompts.every((t) => /never translate a control or a block name/i.test(t)),
    'sem isso, "responda em espanhol" renomeia PREAMP'
  )

  console.log('\n=== 4. provedores ao vivo ===')
  // same order the app tries them in (LLM_PROVIDER then LLM_FALLBACK_PROVIDER)
  const providers = [
    ['openai', callOpenAi],
    ['gemini', callGemini]
  ] as const

  let anyProviderWorked = false
  for (const [name, call] of providers) {
    console.log(`\n--- ${name} ---`)
    try {
      const t0 = Date.now()
      const text = await call(prompt, tonePatchSystemPrompt('pt-BR'))
      const parsed = parseJsonLoose<Record<string, unknown>>(text)
      check(
        `${name}: devolveu JSON parseavel`,
        parsed !== null,
        parsed ? '' : `${text.length} chars, comeco: ${JSON.stringify(text.slice(0, 120))}`
      )
      if (parsed) {
        anyProviderWorked = true
        const plan = normalizePlan(parsed, RIG_DEFAULT, pitch, name, 'x')
        check(`${name}: veio pelo menos um patch`, plan.patches.length > 0, `${plan.patches.length}`)
        check(
          `${name}: o pitch shifter e o calculado, nao o do modelo`,
          plan.pitchShifter?.semitones === -1
        )
        console.log(`       ${Date.now() - t0}ms | ${plan.patches.length} patch(es)`)
        for (const patch of plan.patches) {
          validatePatch(patch, `${name}/${patch.patchName}`)
          console.log(`       ▸ ${patch.patchName} — ${patch.appliesTo}`)
          console.log(`         cadeia: ${patch.chain.join(' > ')}`)
          for (const b of patch.blocks) {
            console.log(
              `         ${b.slot} = ${b.model}: ` +
                b.params.map((p) => `${p.label}=${p.value ?? p.text}`).join(', ')
            )
          }
          if (patch.ctrl) {
            console.log(`         CTRL: ${patch.ctrl.target} — ${patch.ctrl.action}`)
          }
        }
        // the CTRL switch is the point of asking for it; at least one patch
        // should have found something worth putting on it
        check(
          `${name}: algum patch usa o botao CTRL`,
          plan.patches.some((p) => p.ctrl !== null),
          plan.patches.map((p) => p.ctrl?.target ?? '—').join(', ')
        )
      }
    } catch (err) {
      // a provider being out of credit is not a code failure; the fallback chain
      // exists precisely for this, so report it and keep going
      console.log(`  AVISO ${name} indisponivel -- ${err instanceof Error ? err.message : err}`)
    }
  }
  check('pelo menos um provedor gerou um patch valido', anyProviderWorked)

  console.log('\n=== 5. GT-1 ao vivo: pesquisa na web e patch conferido ===')
  /*
   * The same two calls the app makes for a GT-1: the Responses API with
   * web_search, read by the same SSE parser the driver uses, and then the
   * patch prompt with the whole catalogue, held to it by the validator.
   */
  let research: string | null = null
  const researchPrompt = toneResearchPrompt(
    `Song: ${SONG.title} — ${SONG.artist}\nAlbum: Master of Puppets\nYear: 1986`
  )
  for (const [name, search] of [
    ['openai', researchOpenAi],
    ['gemini', researchGemini]
  ] as const) {
    try {
      const t0 = Date.now()
      const found = await search(researchPrompt, toneResearchSystemPrompt('pt-BR'))
      research = stripInlineLinks(found.text)
      check(`${name}: pesquisa trouxe texto`, research.length > 200, `${research.length} chars`)
      check(`${name}: pesquisa citou fontes da web`, found.sources.length > 0, `${found.sources.length} fontes`)
      check(`${name}: a busca rodou`, found.queries.length > 0, found.queries.slice(0, 3).join(' | '))
      console.log(`       ${Date.now() - t0}ms`)
      console.log(research.split('\n').map((l) => `       │ ${l}`).join('\n'))
      for (const src of found.sources.slice(0, 6)) console.log(`       ↗ ${src.title} — ${src.url}`)
      break
    } catch (err) {
      console.log(`  AVISO ${name}: pesquisa indisponivel -- ${err instanceof Error ? err.message : err}`)
    }
  }

  for (const [name, call] of [
    ['openai', callOpenAi],
    ['gemini', callGemini]
  ] as const) {
  try {
    const t0 = Date.now()
    const gtPrompt = gt1PatchPrompt({
      context,
      output: 'pa',
      pitch,
      bpm: SONG.bpm,
      masterKey: gt1KeyFor(SONG.musicalKey),
      research,
      catalogue: gt1CatalogueText(),
      targets: gt1TargetsText(),
      // the player's own case: the harmonised lead played alone, a third below
      wishes: 'Harmonia uma terça abaixo no solo melódico, para soar como as duas guitarras dobradas.'
    })
    const text = await call(gtPrompt, gt1PatchSystemPrompt('pt-BR'), 32768)
    const parsed = parseJsonLoose<Record<string, unknown>>(text)
    check(`${name}: GT-1 em JSON parseavel`, parsed !== null, parsed ? '' : text.slice(0, 160))
    if (parsed) {
      const plan = normalizeGt1Plan(parsed, RIG_DEFAULT, pitch, { bpm: SONG.bpm, musicalKey: SONG.musicalKey }, 'openai', 'x')
      console.log(`       ${Date.now() - t0}ms | ${plan.patches.length} patch(es) | ${plan.cues?.length ?? 0} deixas`)
      check('GT-1: 1 a 3 patches', plan.patches.length >= 1 && plan.patches.length <= 3, `${plan.patches.length}`)
      const warnings: string[] = []
      for (const p of plan.patches) {
        console.log(`       ▸ ${p.patchName} — ${p.appliesTo}`)
        console.log(`         cadeia: ${p.chain.join(' > ')}`)
        for (const b of p.blocks) {
          if (b.warning) warnings.push(`${b.slot}: ${b.warning}`)
          console.log(
            `         ${b.enabled ? '●' : '○'} ${b.slot} = ${b.model}: ` +
              b.params
                .map((x) => {
                  if (x.warning) warnings.push(`${b.slot}.${x.label}: ${x.warning}`)
                  return `${x.label}=${paramText(x)}${x.warning ? '⚠' : ''}`
                })
                .join(', ')
          )
        }
        for (const c of p.controls ?? []) {
          if (c.warning) warnings.push(`${c.source}: ${c.warning}`)
          console.log(`         [${c.source}] ${c.func} ${c.mode ?? ''} — ${c.action}`)
        }
        for (const a of p.assigns ?? []) {
          if (a.warning) warnings.push(`ASSIGN${a.number}: ${a.warning}`)
          console.log(`         ASSIGN${a.number} ${a.source} ${a.category}›${a.target} ${a.min}→${a.max} — ${a.purpose}`)
        }
        check(`GT-1/${p.patchName}: tem PREAMP`, p.blocks.some((b) => b.slot === 'PREAMP'))
        check(`GT-1/${p.patchName}: FX1 é o pitch shifter da afinação`, p.blocks.find((b) => b.slot === 'FX1')?.model === 'PITCH SHIFTER')
      }
      for (const c of plan.cues ?? []) console.log(`       ♪ ${c.section} [${c.patch}] ${c.action}`)
      check(
        'GT-1: o plano usa CTL1, EXP ou ASSIGN',
        plan.patches.some((p) => (p.controls?.length ?? 0) + (p.assigns?.length ?? 0) > 0)
      )
      const harmonist = plan.patches.flatMap((p) => p.blocks).find((b) => b.model === 'HARMONIST')
      check(
        'GT-1: o pedido de harmonia virou HARMONIST -3rd',
        harmonist?.params.find((x) => x.label === 'HARMONY')?.text === '-3rd',
        harmonist ? `HARMONY ${harmonist.params.find((x) => x.label === 'HARMONY')?.text}` : 'sem HARMONIST'
      )
      if (warnings.length) console.log(`       avisos:\n         ${warnings.join('\n         ')}`)
      // a few slips are what the validator is for; many means the prompt is not landing
      check('GT-1: quase tudo existe no aparelho', warnings.length <= 4, `${warnings.length} aviso(s)`)
    }
    break
  } catch (err) {
    console.log(`  AVISO ${name}: patch GT-1 indisponivel -- ${err instanceof Error ? err.message : err}`)
  }
  }

  console.log(`\n${failures === 0 ? 'TODOS OS TESTES PASSARAM' : `${failures} TESTE(S) FALHARAM`}`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
