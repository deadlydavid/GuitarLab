import type {
  AssignView,
  ControlView,
  CueView,
  PatchBlock,
  PatchParam,
  PitchShifterPlan,
  RigView,
  TonePatchView,
  TonePlanView
} from '@shared/types'
import { RIG_OUTPUT_EN } from '@shared/types'
import {
  GT1_ASSIGN_COUNT,
  GT1_ASSIGN_CURVES,
  GT1_ASSIGN_TRIGGERS,
  GT1_CHAIN_DEFAULT,
  GT1_CTL_FUNCS,
  GT1_EXP_FUNCS,
  GT1_FX_TYPES,
  GT1_TARGETS,
  GT1_WAVEFORMS,
  findBlock,
  fxTargetCategory,
  gt1KeyFor,
  labelKey,
  matchName,
  matchOption,
  paramText,
  type Gt1Param,
  type Gt1TargetCategory,
  type Gt1Type
} from '@shared/gt1'

/**
 * Turning a model's GT-1 patch into one that can be dialled in as printed.
 *
 * Every block, type and parameter is looked up in the catalogue transcribed
 * from the Parameter Guide (shared/gt1.ts). What matches is rewritten with the
 * editor's own spelling and clamped to the real range — GAIN 130 becomes 120,
 * a HIGH CUT of 6000 Hz becomes the 6.3 kHz step the unit actually has. What
 * does not match is kept, with a warning on it, so the player sees that the
 * model asked for something the unit cannot do instead of silently losing it.
 *
 * Three things never come from the model: the pitch shifter that covers the
 * record's tuning, MASTER BPM and MASTER KEY. They are arithmetic on the song's
 * own data, and the harmonist is a half step off if the key is guessed wrong.
 */

type Json = Record<string, unknown>

const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const str = (v: unknown): string => (v == null ? '' : String(v).trim())
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

/** Facts about the song that settle MASTER BPM and MASTER KEY. */
export interface Gt1SongFacts {
  bpm: number | null
  musicalKey: string | null
}

/** The GT-1 accepts sixteen characters for a patch name. */
export const GT1_NAME_LENGTH = 16

/* ------------------------------------------------------------- values */

function formatHz(hz: number): string {
  if (hz >= 1000) {
    const k = hz / 1000
    return `${Number.isInteger(k) ? k : k.toFixed(k < 10 ? 2 : 1).replace(/0$/, '')} kHz`
  }
  return `${hz} Hz`
}

/** "6.3kHz", "6300", "6300 Hz", 6300 → 6300; null when there is no number. */
function parseHz(raw: string, fallbackKilo: boolean): number | null {
  const m = /(-?[\d.]+)\s*(k)?/i.exec(raw.replace(',', '.'))
  if (!m) return null
  const n = Number.parseFloat(m[1])
  if (!Number.isFinite(n)) return null
  // a bare "6.3" on a frequency that cannot be 6.3 Hz is kilohertz
  return m[2] || (fallbackKilo && n < 20) ? n * 1000 : n
}

function nearestStep(hz: number, steps: readonly number[]): number {
  let best = steps[0]
  for (const s of steps) {
    if (Math.abs(Math.log(s / hz)) < Math.abs(Math.log(best / hz))) best = s
  }
  return best
}

function parseNumber(raw: string): number | null {
  const m = /[-+−]?\d+(?:[.,]\d+)?/.exec(raw)
  if (!m) return null
  const n = Number.parseFloat(m[0].replace('−', '-').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** A HARMONY given as a number: -3 → "-3rd", 8 → "+1oct", 1 → "UNISON". */
function harmonyFromNumber(n: number): string | null {
  const abs = Math.abs(Math.round(n))
  const sign = n < 0 ? '-' : '+'
  if (abs === 0 || abs === 1) return 'UNISON'
  if (abs === 8) return `${sign}1oct`
  if (abs === 15) return `${sign}2oct`
  if (abs > 15) return null
  const suffix = abs === 2 ? 'nd' : abs === 3 ? 'rd' : 'th'
  return `${sign}${abs}${suffix}`
}

/**
 * One parameter, checked against its definition and rewritten in the editor's
 * terms. `raw` is what the model sent: a number, a string, or both.
 */
export function fitParam(def: Gt1Param, raw: { value?: unknown; text?: unknown }): PatchParam {
  const text = str(raw.text)
  const value = raw.value
  const given = typeof value === 'number' ? String(value) : str(value) || text

  if (def.kind === 'enum') {
    let option = given ? matchOption(given, def.options) : null
    if (!option && def.name === 'HARMONY') {
      const n = parseNumber(given)
      option = n === null ? null : harmonyFromNumber(n)
    }
    if (!option && def.name === 'KEY') option = gt1KeyFor(given)
    if (!option && def.options.length === 2 && def.options[0] === 'OFF') {
      if (value === true || /^(1|true|yes|sim)$/i.test(given)) option = 'ON'
      if (value === false || /^(0|false|no|não)$/i.test(given)) option = 'OFF'
    }
    if (option) return { label: def.name, value: null, text: option }
    return {
      label: def.name,
      value: null,
      text: given || '—',
      warning: `A GT-1 não tem essa opção. Opções: ${def.options.slice(0, 8).join(', ')}${def.options.length > 8 ? '…' : ''}`
    }
  }

  if (def.kind === 'freq') {
    if (def.flat && /flat|off|bypass/i.test(given)) return { label: def.name, value: null, text: 'FLAT' }
    const hz = parseHz(given, def.min >= 20)
    if (hz === null) {
      return { label: def.name, value: null, text: given || '—', warning: 'Frequência não reconhecida' }
    }
    const clamped = Math.min(def.max, Math.max(def.min, hz))
    const step = def.steps ? nearestStep(clamped, def.steps) : Math.round(clamped)
    return { label: def.name, value: null, text: formatHz(step) }
  }

  // range
  if (def.bpm && /^\s*bpm/i.test(given)) {
    const note = given.replace(/^\s*bpm\s*/i, '').trim()
    return { label: def.name, value: null, text: note ? `BPM ${note}` : 'BPM' }
  }
  let n = typeof value === 'number' ? value : parseNumber(given)
  if (n === null && def.name === 'THRESHOLD' && /off/i.test(given)) n = 0
  if (n === null) {
    return { label: def.name, value: null, text: given || '—', warning: 'Valor não reconhecido' }
  }
  // a reverb TIME written in milliseconds
  if (def.unit === 's' && n > def.max && n <= def.max * 1000) n = n / 1000
  const factor = 10 ** (def.decimals ?? 0)
  const fitted = Math.round(Math.min(def.max, Math.max(def.min, n)) * factor) / factor
  const param: PatchParam = {
    label: def.name,
    value: fitted,
    text: null,
    min: def.min,
    max: def.max,
    ...(def.unit ? { unit: def.unit } : {}),
    ...(def.decimals ? { decimals: def.decimals } : {})
  }
  if (Math.abs(fitted - n) > 1 / factor) {
    param.warning = `O modelo pediu ${n}; a faixa da GT-1 é ${def.min} a ${def.max}`
  }
  return param
}

export { paramText }

/* ------------------------------------------------------------- blocks */

/** Effects that track pitch or shape the input, and so belong before the amp. */
const BEFORE_AMP = new Set([
  'COMPRESSOR',
  'LIMITER',
  'T.WAH',
  'TONE MODIFY',
  'GUITAR SIM',
  'AC.GTR SIM',
  'SLOW GEAR',
  'OCTAVE',
  'PITCH SHIFTER',
  'HARMONIST',
  'OVERTONE',
  'FEEDBACKER',
  'AC.PROC.'
])

/** Effects that must recognise the pitch they are given: only clean signal will do. */
const TRACKS_PITCH = new Set(['HARMONIST', 'OCTAVE', 'PITCH SHIFTER'])

interface RawParam {
  label: string
  value?: unknown
  text?: unknown
}

function rawParams(v: unknown): RawParam[] {
  return list(v)
    .map((p) => {
      const o = obj(p)
      return { label: str(o.label ?? o.name), value: o.value, text: o.text }
    })
    .filter((p) => p.label)
}

function fitBlock(raw: unknown): PatchBlock | null {
  const o = obj(raw)
  const slotRaw = str(o.slot)
  const modelRaw = str(o.model ?? o.type)
  const params = rawParams(o.params).slice(0, 16)
  const note = str(o.note) || null
  const enabled = o.enabled !== false
  const block = findBlock(slotRaw)

  if (!block) {
    if (!slotRaw && !params.length) return null
    return {
      slot: slotRaw || 'BLOCO',
      model: modelRaw,
      enabled,
      params: params.map((p) => ({
        label: p.label,
        value: typeof p.value === 'number' ? p.value : null,
        text: typeof p.value === 'number' ? null : str(p.text ?? p.value) || null
      })),
      note,
      warning: `A GT-1 não tem um bloco "${slotRaw}".`
    }
  }

  let type: Gt1Type | null = null
  let warning: string | null = null
  if (block.types.length) {
    type = modelRaw ? matchName(modelRaw, block.types) : null
    // the TYPE sometimes arrives as a parameter instead of as the model
    const typeParam = params.find((p) => labelKey(p.label) === 'TYPE')
    if (!type && typeParam) type = matchName(str(typeParam.text ?? typeParam.value), block.types)
    if (!type) warning = `O ${block.slot} da GT-1 não tem o tipo "${modelRaw || '—'}".`
  }
  const catalogue = type?.params ?? block.params ?? []
  /*
   * OD/DS, PREAMP, DELAY and REVERB carry their TYPE as the block's model; a
   * TYPE among the params is the same thing said twice. Inside FX1/FX2 a TYPE
   * param is the effect's own sub-type (the compressor's BOSS/D-COMP…).
   */
  const typeIsSubParam = catalogue.some((p) => p.name === 'TYPE')

  const fitted = new Map<string, PatchParam>()
  const unknown: PatchParam[] = []
  for (const p of params) {
    if (!typeIsSubParam && block.types.length && labelKey(p.label) === 'TYPE') continue
    const def = matchName(p.label, catalogue)
    if (!def) {
      unknown.push({
        label: p.label,
        value: typeof p.value === 'number' ? p.value : null,
        text: typeof p.value === 'number' ? null : str(p.text ?? p.value) || '—',
        warning: type || !block.types.length ? `Não existe em ${type?.name ?? block.slot} na GT-1.` : null
      })
      continue
    }
    if (!fitted.has(def.name)) fitted.set(def.name, fitParam(def, p))
  }

  // the editor's own order, so the card reads like the screen it is copied into
  const ordered = catalogue.map((d) => fitted.get(d.name)).filter((p): p is PatchParam => !!p)

  return {
    slot: block.slot,
    model: type?.name ?? modelRaw,
    enabled,
    params: [...ordered, ...unknown],
    note,
    warning
  }
}

/* --------------------------------------------------------------- chain */

/** The nine movable blocks in the order the model gave, completed and deduplicated. */
export function fitChain(raw: unknown): string[] {
  const seen: string[] = []
  for (const item of list(raw)) {
    const label = findBlock(str(item))?.chain
    if (label && !seen.includes(label)) seen.push(label)
  }
  // anything left out goes back next to its neighbour in the default order
  for (let i = 0; i < GT1_CHAIN_DEFAULT.length; i++) {
    const label = GT1_CHAIN_DEFAULT[i]
    if (seen.includes(label)) continue
    const prev = GT1_CHAIN_DEFAULT.slice(0, i)
      .reverse()
      .find((l) => seen.includes(l))
    seen.splice(prev ? seen.indexOf(prev) + 1 : 0, 0, label)
  }
  return seen
}

/* ---------------------------------------------------------- controllers */

function controlSource(raw: string): { source: string; warning: string | null } | null {
  const k = labelKey(raw)
  if (!k) return null
  if (/^(CTL|CTRL)1?$/.test(k)) return { source: 'CTL1', warning: null }
  if (/^EXP(1|PEDAL)?(SW|SWITCH|TOESWITCH)$/.test(k) || k === 'TOESWITCH')
    return { source: 'EXP SW', warning: null }
  if (/^(EXP|EXP1|EXPPEDAL|EXPRESSION|EXPRESSIONPEDAL|PEDAL)$/.test(k)) return { source: 'EXP1', warning: null }
  if (/^(CTL|CTRL)[23]$/.test(k) || k === 'EXP2') {
    const source = k.startsWith('EXP') ? 'EXP2' : `CTL${k.slice(-1)}`
    return { source, warning: 'Precisa de um pedal externo ligado no jack CTL 2,3/EXP2.' }
  }
  return null
}

const EXP_FUNC_ALIASES: Record<string, string> = {
  FOOTVOLUME: 'FOOT VOL',
  VOLUME: 'FOOT VOL',
  FV: 'FOOT VOL',
  WAH: 'PEDAL FX',
  PDLFX: 'PEDAL FX',
  PEDALFXFOOTVOLUME: 'PDL FX/FV',
  PEDALFXFV: 'PDL FX/FV'
}

function fitControl(raw: unknown): ControlView | null {
  const o = obj(raw)
  const src = controlSource(str(o.source ?? o.control))
  if (!src) return null
  const funcRaw = str(o.func ?? o.function)
  const isPedal = src.source === 'EXP1' || src.source === 'EXP2'
  let func: string | null
  let warning = src.warning
  if (/assign/i.test(funcRaw)) {
    // "drives the ASSIGNs" is FUNC OFF on the unit: the ASSIGNs do the work
    func = 'OFF'
  } else if (isPedal) {
    func =
      matchOption(funcRaw, GT1_EXP_FUNCS) ?? EXP_FUNC_ALIASES[labelKey(funcRaw)] ?? null
    if (src.source === 'EXP2' && func && func !== 'FOOT VOL' && func !== 'OFF') {
      warning = 'O EXP2 só aceita FOOT VOL como FUNCTION; o resto vai por ASSIGN.'
    }
  } else {
    func = matchOption(funcRaw, GT1_CTL_FUNCS)
    if (src.source === 'EXP SW' && (func === 'BPM TAP' || func === 'DELAY TAP')) {
      warning = 'O EXP SW não aceita tap tempo.'
    }
  }
  if (!func) warning = `A GT-1 não tem a FUNC "${funcRaw || '—'}" para ${src.source}.`

  const modeRaw = labelKey(str(o.mode))
  const mode = isPedal ? null : modeRaw.startsWith('MOM') ? 'MOMENT' : 'TOGGLE'
  const solo = func === 'OD SOLO' || func === 'PrA SOLO'
  const soloRaw = parseNumber(str(o.soloLevel ?? o.solo_level))
  return {
    source: src.source,
    func: func ?? funcRaw,
    mode,
    soloLevel: solo ? Math.max(0, Math.min(100, Math.round(soloRaw ?? 50))) : null,
    action: str(o.action),
    when: str(o.when),
    warning
  }
}

function assignSource(raw: string): { source: string; warning: string | null } | null {
  const k = labelKey(raw)
  if (!k) return null
  if (/^(CTL|CTRL)1?$/.test(k)) return { source: 'CTL 1', warning: null }
  if (/^(EXP|EXP1|EXPPEDAL|EXPRESSION|EXPRESSIONPEDAL)$/.test(k)) return { source: 'EXP 1', warning: null }
  if (/^INT(ERNAL)?(PEDAL|PDL)?$/.test(k)) return { source: 'INT PEDAL', warning: null }
  if (/^WAVE(PEDAL|PDL)?$/.test(k)) return { source: 'WAVE PEDAL', warning: null }
  if (/^EXP(1)?SW/.test(k)) {
    return {
      source: 'EXP SW',
      warning: 'O EXP SW não é SOURCE de ASSIGN na GT-1; use a FUNC do EXP SW para isso.'
    }
  }
  if (/^(CTL|CTRL)[23]$/.test(k) || k === 'EXP2') {
    const source = k.startsWith('EXP') ? 'EXP 2' : `CTL${k.slice(-1)}`
    return { source, warning: 'Precisa de um pedal externo ligado no jack CTL 2,3/EXP2.' }
  }
  return null
}

/** Categories the model might name by block rather than by the list's own label. */
const CATEGORY_ALIASES: Record<string, string> = {
  PRA: 'PREAMP',
  AMP: 'PREAMP',
  OD: 'OD/DS',
  DS: 'OD/DS',
  DLY: 'DELAY',
  REV: 'REVERB',
  PDL: 'PEDAL FX',
  WAH: 'PEDAL FX',
  FV: 'FOOT VOL',
  FOOTVOLUME: 'FOOT VOL',
  BPM: 'BPM/KEY',
  KEY: 'BPM/KEY',
  MASTEREQ: 'MASTER'
}

const categoryByName = (name: string): Gt1TargetCategory | null =>
  GT1_TARGETS.find((c) => labelKey(c.category) === labelKey(name)) ?? null

/**
 * The list entry an ASSIGN points at. FX1/FX2 are special: the list has one
 * category per effect ("2 HARMONY"), and which one applies depends on what
 * this patch loaded into the slot — so "FX2 / E.LEVEL" is resolved against the
 * patch, not guessed.
 */
function resolveCategory(
  rawCategory: string,
  rawTarget: string,
  fx: Record<'FX1' | 'FX2', string | null>
): { category: Gt1TargetCategory | null; warning: string | null } {
  const key = labelKey(rawCategory)
  const slotMatch = /^(?:FX)?([12])(.*)$/.exec(key)
  const onOffOrType = ['ONOFF', 'ON', 'OFF', 'TYPE'].includes(labelKey(rawTarget))

  if (slotMatch && (key.startsWith('FX') || slotMatch[2])) {
    const slot = slotMatch[1] === '1' ? 'FX1' : 'FX2'
    const rest = slotMatch[2]
    if (!rest && onOffOrType) return { category: categoryByName(slot), warning: null }
    const loaded = fx[slot]
    // "2 HARMONY" / "FX2 HARMONIST": check it against what the slot holds
    const named = rest
      ? (GT1_TARGETS.find((c) => c.fx?.slot === slot && labelKey(c.category) === `${slotMatch[1]}${rest}`) ??
        (() => {
          const t = matchName(rest, GT1_FX_TYPES)
          const cat = t ? fxTargetCategory(slot, t.name) : null
          return cat ? categoryByName(cat) : null
        })())
      : null
    if (named) {
      const warning =
        loaded && named.fx?.type !== loaded
          ? `O ${slot} desta patch é ${loaded}, não ${named.fx?.type}.`
          : !loaded
            ? `Esta patch não carrega nada no ${slot}.`
            : null
      return { category: named, warning }
    }
    if (loaded) {
      const cat = fxTargetCategory(slot, loaded)
      return { category: cat ? categoryByName(cat) : null, warning: null }
    }
    return { category: null, warning: `Esta patch não carrega nada no ${slot}.` }
  }

  const direct = categoryByName(rawCategory) ?? categoryByName(CATEGORY_ALIASES[key] ?? '')
  return { category: direct, warning: null }
}

function assignValue(param: Gt1Param | null, raw: unknown): string {
  if (!param) return str(raw) || '—'
  const fitted = fitParam(param, typeof raw === 'number' ? { value: raw } : { text: raw })
  return paramText(fitted)
}

function fitAssign(
  raw: unknown,
  index: number,
  fx: Record<'FX1' | 'FX2', string | null>
): AssignView | null {
  const o = obj(raw)
  const src = assignSource(str(o.source))
  if (!src) return null

  const rawCategory = str(o.category ?? o.targetCategory)
  const rawTarget = str(o.target)
  const { category, warning: catWarning } = resolveCategory(rawCategory, rawTarget, fx)
  const target = category
    ? matchName(
        rawTarget,
        category.targets.map((t) => ({ ...t, aliases: t.name === 'ON/OFF' ? ['ON', 'OFF', 'SWITCH'] : [] }))
      )
    : null

  const warnings = [src.warning, catWarning]
  if (!category) warnings.push(`"${rawCategory}" não está na lista TARGET da GT-1.`)
  else if (!target) warnings.push(`${category.category} não tem o alvo "${rawTarget}".`)

  const continuous = src.source !== 'CTL 1' && !src.source.startsWith('CTL')
  const modeRaw = labelKey(str(o.mode))
  const mode = continuous ? 'MOMENT' : modeRaw.startsWith('MOM') ? 'MOMENT' : 'TOGGLE'

  let extra: string | null = null
  if (src.source === 'INT PEDAL') {
    const trigger = matchOption(str(o.trigger), GT1_ASSIGN_TRIGGERS) ?? 'PAT CNG'
    const time = parseNumber(str(o.time))
    const curve = matchOption(str(o.curve), GT1_ASSIGN_CURVES) ?? 'LINEAR'
    extra = `TRIGGER ${trigger} · TIME ${Math.max(0, Math.min(100, Math.round(time ?? 50)))} · CURVE ${curve}`
  } else if (src.source === 'WAVE PEDAL') {
    const rateRaw = str(o.rate ?? o.waveRate)
    const rate = /^\s*bpm/i.test(rateRaw)
      ? rateRaw.toUpperCase().replace(/\s+/, ' ')
      : String(Math.max(0, Math.min(100, Math.round(parseNumber(rateRaw) ?? 50))))
    const waveform = matchOption(str(o.waveform), GT1_WAVEFORMS) ?? 'TRI'
    extra = `WAVE RATE ${rate} · WAVEFORM ${waveform}`
  }

  return {
    number: index + 1,
    source: src.source,
    mode,
    category: category?.category ?? rawCategory,
    target: target?.name ?? rawTarget,
    min: assignValue(target?.param ?? null, o.min),
    max: assignValue(target?.param ?? null, o.max),
    purpose: str(o.purpose ?? o.action),
    extra,
    warning: warnings.filter(Boolean).join(' ') || null
  }
}

/** FUNCs that switch a block on and off, and the ASSIGN category for that block. */
const FUNC_BLOCK: Record<string, string> = {
  FX1: 'FX1',
  'OD/DS': 'OD/DS',
  PREAMP: 'PREAMP',
  FX2: 'FX2',
  DELAY: 'DELAY',
  REVERB: 'REVERB',
  'PEDAL FX': 'PEDAL FX'
}

/** One press, the same block switched twice: the two cancel out on the unit. */
function flagDoubleToggles(controls: ControlView[], assigns: AssignView[]): void {
  const ctl1 = controls.find((c) => c.source === 'CTL1')
  const block = ctl1 ? FUNC_BLOCK[ctl1.func] : undefined
  if (!block) return
  for (const a of assigns) {
    if (a.source === 'CTL 1' && a.category === block && a.target === 'ON/OFF') {
      a.warning = [a.warning, `O CTL1 já liga e desliga o ${block} pela FUNC; os dois juntos se anulam.`]
        .filter(Boolean)
        .join(' ')
    }
  }
}

/* ---------------------------------------------------------------- patch */

function tuningParams(semitones: number): PatchParam[] {
  const ps = GT1_FX_TYPES.find((t) => t.name === 'PITCH SHIFTER')?.params ?? []
  const set: Record<string, unknown> = {
    PITCH: semitones,
    FINE: 0,
    'PRE DELAY': 0,
    FEEDBACK: 0,
    'E.LEVEL': 100,
    'D.LEVEL': 0
  }
  return ps.map((def) => fitParam(def, { value: set[def.name] }))
}

/**
 * One patch. `pitch` is the tuning decision already made by arithmetic; when
 * it is on, FX1 is the pitch shifter in every patch, first in the chain, with
 * nothing of the dry signal left.
 */
export function fitGt1Patch(
  raw: unknown,
  rig: RigView,
  pitch: PitchShifterPlan,
  facts: Gt1SongFacts,
  provider: string,
  model: string
): TonePatchView {
  const o = obj(raw)
  const notes: string[] = [str(o.notes)].filter(Boolean)

  // one block per slot, first one wins
  const blocks: PatchBlock[] = []
  for (const b of list(o.blocks).slice(0, 14)) {
    const fitted = fitBlock(b)
    if (fitted && !blocks.some((x) => x.slot === fitted.slot)) blocks.push(fitted)
  }
  let chain = fitChain(o.chain)
  const bySlot = (slot: string): PatchBlock | undefined => blocks.find((b) => b.slot === slot)
  let fx1Moved = false

  if (pitch.enabled) {
    const fx1 = bySlot('FX1')
    if (fx1 && fx1.model !== 'PITCH SHIFTER') {
      if (!bySlot('FX2')) {
        // FX1 is needed for the tuning; the effect the model put there moves over
        fx1.slot = 'FX2'
        fx1Moved = true
        if (BEFORE_AMP.has(fx1.model)) {
          chain = chain.filter((l) => l !== 'FX2')
          chain.splice(chain.indexOf('FX1') + 1, 0, 'FX2')
        }
      } else {
        blocks.splice(blocks.indexOf(fx1), 1)
        notes.push(`O ${fx1.model} sugerido para o FX1 saiu: o FX1 fica com o PITCH SHIFTER da afinação.`)
      }
    }
    const ps = bySlot('FX1')
    const tuned: PatchBlock = {
      slot: 'FX1',
      model: 'PITCH SHIFTER',
      enabled: true,
      params: tuningParams(pitch.semitones),
      note: `Afinação: guitarra em ${pitch.playedTuning}, disco em ${pitch.recordTuning}. Só o sinal deslocado (D.LEVEL 0).`,
      warning: null
    }
    if (ps) Object.assign(ps, tuned)
    else blocks.unshift(tuned)
    chain = ['FX1', ...chain.filter((l) => l !== 'FX1')]
  }

  /*
   * An effect that has to recognise the note — harmonist, octave, a pitch
   * shifter used as an effect — only tracks a clean signal, so it goes before
   * OD and PrA. With the tuning shifter in FX1 it goes right after it: the
   * harmonist has to hear the notes already in the record's key, which is the
   * key MASTER KEY is set to.
   */
  for (const slot of ['FX1', 'FX2'] as const) {
    const b = bySlot(slot)
    if (!b || !TRACKS_PITCH.has(b.model)) continue
    if (pitch.enabled && slot === 'FX1') continue
    const at = chain.indexOf(slot)
    const firstDrive = chain.findIndex((l) => l === 'OD' || l === 'PrA')
    if (at < firstDrive) continue
    chain.splice(at, 1)
    const anchor = pitch.enabled
      ? chain.indexOf('FX1') + 1
      : chain.findIndex((l) => l === 'OD' || l === 'PrA')
    chain.splice(anchor, 0, slot)
    b.note = [b.note, `${slot} foi para antes do OD/PrA: o ${b.model} só reconhece a nota com o sinal limpo.`]
      .filter(Boolean)
      .join(' ')
  }

  // MASTER: BPM and KEY are the song's, whatever the model said
  let master = bySlot('MASTER')
  if (!master) {
    master = { slot: 'MASTER', model: '', enabled: true, params: [], note: null, warning: null }
    blocks.push(master)
  }
  const masterBlock = master
  const setMaster = (label: string, value: unknown): void => {
    const def = findBlock('MASTER')?.params?.find((p) => p.name === label)
    if (!def) return
    const fitted = fitParam(def, typeof value === 'number' ? { value } : { text: value })
    const i = masterBlock.params.findIndex((p) => p.label === label)
    if (i >= 0) masterBlock.params[i] = fitted
    else masterBlock.params.push(fitted)
  }
  if (facts.bpm) setMaster('BPM', Math.round(facts.bpm))
  const key = gt1KeyFor(facts.musicalKey)
  if (key) setMaster('KEY', key)
  const order = findBlock('MASTER')?.params?.map((p) => p.name) ?? []
  masterBlock.params.sort((a, b) => {
    const ia = order.indexOf(a.label)
    const ib = order.indexOf(b.label)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  masterBlock.enabled = true

  const fx = {
    FX1: bySlot('FX1')?.model || null,
    FX2: bySlot('FX2')?.model || null
  }

  const controls: ControlView[] = []
  for (const c of list(o.controls)) {
    const fitted = fitControl(c)
    if (!fitted || controls.some((x) => x.source === fitted.source)) continue
    if (fx1Moved && fitted.func === 'FX1') fitted.func = 'FX2'
    controls.push(fitted)
  }

  const rawAssigns = list(o.assigns).map((a) => {
    if (!fx1Moved) return a
    // the effect moved from FX1 to FX2, so do the ASSIGNs that pointed at it
    const aa = { ...obj(a) }
    aa.category = str(aa.category).replace(/^FX1$/i, 'FX2').replace(/^1 /, '2 ')
    return aa
  })
  const assigns = rawAssigns
    .map((a, i) => fitAssign(a, i, fx))
    .filter((a): a is AssignView => a !== null)
    .slice(0, GT1_ASSIGN_COUNT)
    .map((a, i) => ({ ...a, number: i + 1 }))
  flagDoubleToggles(controls, assigns)

  const name = str(o.patchName) || 'Patch sugerido'
  return {
    patchName: name.slice(0, GT1_NAME_LENGTH).trim(),
    appliesTo: str(o.appliesTo) || 'Música inteira',
    summary: str(o.summary),
    chain: [rig.guitar, ...chain, RIG_OUTPUT_EN[rig.output]],
    blocks,
    ctrl: null,
    controls,
    assigns,
    listenFor: str(o.listenFor),
    notes: notes.join('\n\n'),
    rig,
    provider,
    model
  }
}

/** The whole answer: patches in playing order and the live cue sheet. */
export function normalizeGt1Plan(
  raw: unknown,
  rig: RigView,
  pitch: PitchShifterPlan,
  facts: Gt1SongFacts,
  provider: string,
  model: string
): TonePlanView {
  const o = obj(raw)
  const source = Array.isArray(o.patches) ? o.patches : [o]
  const patches = source
    .slice(0, 4)
    .map((p) => fitGt1Patch(p, rig, pitch, facts, provider, model))
    // MASTER is always added, so "has blocks" means more than that one
    .filter((p) => p.blocks.some((b) => b.slot !== 'MASTER'))

  const cues: CueView[] = list(o.cues)
    .map((c) => {
      const x = obj(c)
      return { section: str(x.section), patch: str(x.patch), action: str(x.action) }
    })
    .filter((c) => c.action)
    .slice(0, 24)

  return { patches, pitchShifter: pitch, rig, device: 'gt1', cues, provider, model }
}
