import type { AssignView, ControlView, PatchBlock, PatchParam, TonePatchView } from './types'
import { GT1_ADDRESSES, GT1_DEFAULTS } from './gt1data'
import {
  GT1_ASSIGN_CURVES,
  GT1_ASSIGN_TRIGGERS,
  GT1_BLOCKS,
  GT1_CTL_FUNCS,
  GT1_EXP_FUNCS,
  GT1_FX_TYPES,
  GT1_TARGETS,
  GT1_WAVEFORMS,
  ISO_FREQS,
  findBlock,
  labelKey,
  matchName,
  matchOption,
  paramText,
  type Gt1Param,
  type Gt1Type
} from './gt1'

/**
 * A GT-1 patch as the unit stores it, and the way to and from the app's view.
 *
 * The unit (and BOSS TONE STUDIO's .tsl files) keep a patch as roughly a
 * thousand named numbers inherited from the GT-100: `preamp_a_gain`,
 * `fx2_harmonist_hr1harm`, `fx_chain_position9`. This module translates a
 * patch the app suggested — blocks, knobs in the editor's units, CTL1/EXP and
 * the ASSIGNs — into those numbers, and back.
 *
 * Every encoding here was checked against real data: the patches in the
 * player's own .tsl read back from the unit byte for byte, and the 99 factory
 * patches survive a decode → encode round trip (scripts/test-gt1codec.ts).
 * The value tables follow the GT-1 manual's own lists, which is what the unit
 * uses; the numbering of the chain blocks is Roland's `FX CHAIN` table from the
 * GT-100 MIDI implementation, which the GT-1 inherits.
 */

export type Gt1Params = Record<string, number>

/* ------------------------------------------------------------- the chain */

/** Chain labels → block numbers in the unit's FX CHAIN table. */
const CHAIN_ID: Record<string, number> = { FX1: 5, PDL: 11, OD: 15, PrA: 2, NS: 13, DLY: 7, FV: 12, FX2: 6, REV: 9 }
const CHAIN_LABEL = Object.fromEntries(Object.entries(CHAIN_ID).map(([k, v]) => [v, k])) as Record<number, string>
/** Blocks the GT-1 does not move sit before and after the nine it does. */
const CHAIN_HEAD = [0, 1, 4, 8, 10, 14, 17]
const CHAIN_TAIL = [18, 3, 19, 16]

/* ------------------------------------------------------------ note values */

/** Note values in the order of Roland's `BPM NOTE` table (delay and pre-delay times). */
const TIME_NOTES = ['1/16', '1/8T', '1/16.', '1/8', '1/4T', '1/8.', '1/4', '1/2T', '1/4.', '1/2', '1/1T', '1/2.', '1/1']

function noteIndex(text: string): number | null {
  const m = /1\s*\/\s*(16|1|2|4|8)\s*(\.|T|dot|trip)?/i.exec(text)
  if (!m) return null
  const suffix = !m[2] ? '' : /^(\.|dot)/i.test(m[2]) ? '.' : 'T'
  const i = TIME_NOTES.indexOf(`1/${m[1]}${suffix}`)
  return i >= 0 ? i : null
}

/* ----------------------------------------------------- frequency tables */

const HIGH_CUT = [...ISO_FREQS.filter((f) => f >= 630 && f <= 12500), 'FLAT'] as const
const LOW_CUT = ['FLAT', ...ISO_FREQS.filter((f) => f >= 20 && f <= 800)] as const
const EQ_FREQ = ISO_FREQS.filter((f) => f >= 20 && f <= 10000)
const FLANGER_LOW_CUT = ['FLAT', 55, 110, 165, 200, 280, 340, 400, 500, 630, 800] as const

function freqTable(def: Extract<Gt1Param, { kind: 'freq' }>): ReadonlyArray<number | 'FLAT'> {
  if (!def.steps) return FLANGER_LOW_CUT
  if (!def.flat) return EQ_FREQ
  return def.min >= 630 ? HIGH_CUT : LOW_CUT
}

function hzOf(text: string): number | 'FLAT' | null {
  if (/flat/i.test(text)) return 'FLAT'
  const m = /([\d.]+)\s*(k)?/i.exec(text)
  if (!m) return null
  return Number.parseFloat(m[1]) * (m[2] ? 1000 : 1)
}

/* ---------------------------------------------------------------- codecs */

/** A knob or selector from the app's view → the number the unit stores. */
export function encodeValue(def: Gt1Param, p: PatchParam): number | null {
  const text = p.text ?? ''
  if (def.kind === 'enum') {
    const option = matchOption(text || String(p.value ?? ''), def.options)
    return option ? def.options.indexOf(option) : null
  }
  if (def.kind === 'freq') {
    const table = freqTable(def)
    const hz = hzOf(text || String(p.value ?? ''))
    if (hz === null) return null
    if (hz === 'FLAT') return table.indexOf('FLAT') >= 0 ? table.indexOf('FLAT') : null
    let best = -1
    table.forEach((f, i) => {
      if (f === 'FLAT') return
      if (best < 0 || Math.abs(Math.log(f / hz)) < Math.abs(Math.log((table[best] as number) / hz))) best = i
    })
    return best
  }
  // ranges
  if (p.value === null) {
    if (!def.bpm) return null
    const note = noteIndex(text)
    if (note === null) return null
    if (def.unit === 'ms') return def.max + 1 + (def.name === 'PRE DELAY' ? Math.min(note, 6) : note)
    return 101 + (12 - note) // RATE: Roland's BPM NOTE2 runs from the whole note down
  }
  const v = p.value
  if (def.unit === 's') return Math.max(0, Math.round(v * 10) - 1)
  if (def.name === 'PATCH LVL') return Math.round(v / 2)
  if (def.min < 0) return Math.round(v - def.min)
  return Math.round(v)
}

/** The number the unit stores → the app's view of that knob or selector. */
export function decodeValue(def: Gt1Param, raw: number): PatchParam {
  if (def.kind === 'enum') return { label: def.name, value: null, text: def.options[raw] ?? String(raw) }
  if (def.kind === 'freq') {
    const f = freqTable(def)[raw]
    const text = f === undefined ? String(raw) : f === 'FLAT' ? 'FLAT' : f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`
    return { label: def.name, value: null, text }
  }
  const base = { label: def.name, min: def.min, max: def.max, ...(def.unit ? { unit: def.unit } : {}) }
  if (def.bpm && raw > def.max && (def.unit === 'ms' || raw > 100)) {
    const note = def.unit === 'ms' ? raw - def.max - 1 : 12 - (raw - 101)
    return { label: def.name, value: null, text: `BPM ${TIME_NOTES[note] ?? '?'}` }
  }
  if (def.unit === 's') return { ...base, value: (raw + 1) / 10, decimals: 1 }
  if (def.name === 'PATCH LVL') return { ...base, value: raw * 2 }
  if (def.min < 0) return { ...base, value: raw + def.min }
  return { ...base, value: raw }
}

/* ------------------------------------------------------ parameter layout */

type KeyMap = Record<string, string>

/** Where each FX type keeps its parameters, as suffixes of `fx1_` / `fx2_`. */
const FX_KEYS: Record<string, KeyMap> = {
  COMPRESSOR: { TYPE: 'adv_comp_type', SUSTAIN: 'adv_comp_sustain', ATTACK: 'adv_comp_attack', LEVEL: 'adv_comp_level', TONE: 'adv_comp_tone' },
  LIMITER: { TYPE: 'limiter_type', THRESHOLD: 'limiter_thresh', RATIO: 'limiter_ratio', LEVEL: 'limiter_level', ATTACK: 'limiter_attack', RELEASE: 'limiter_release' },
  'T.WAH': { MODE: 't_wah_mode', POLARITY: 't_wah_polar', SENS: 't_wah_sens', FREQ: 't_wah_freq', PEAK: 't_wah_peak', LEVEL: 't_wah_effect_level' },
  // the GT-1's seven bands sit in the first seven slots of the GT-100's ten
  'GRAPHIC EQ': {
    '100Hz': 'graphic_eq_31hz',
    '200Hz': 'graphic_eq_62hz',
    '400Hz': 'graphic_eq_125hz',
    '800Hz': 'graphic_eq_250hz',
    '1.6kHz': 'graphic_eq_500hz',
    '3.2kHz': 'graphic_eq_1khz',
    '6.4kHz': 'graphic_eq_2khz',
    LEVEL: 'graphic_eq_level'
  },
  'PARA.EQ': {
    'LOW GAIN': 'parametric_eq_low_gain',
    'LM FREQ': 'parametric_eq_low_mid_freq',
    'LM Q': 'parametric_eq_low_mid_q',
    'LM GAIN': 'parametric_eq_low_mid_gain',
    'HM FREQ': 'parametric_eq_high_mid_freq',
    'HM Q': 'parametric_eq_high_mid_q',
    'HM GAIN': 'parametric_eq_high_mid_gain',
    'HIGH GAIN': 'parametric_eq_high_gain',
    LEVEL: 'parametric_eq_level'
  },
  'TONE MODIFY': { TYPE: 'tone_modify_type', LOW: 'tone_modify_low', HIGH: 'tone_modify_high', LEVEL: 'tone_modify_level', RESONANCE: 'tone_modify_reso' },
  'GUITAR SIM': { TYPE: 'guitar_sim_type', LOW: 'guitar_sim_low', HIGH: 'guitar_sim_high', LEVEL: 'guitar_sim_level', BODY: 'guitar_sim_body' },
  'AC.GTR SIM': { BODY: 'acsim_body', LOW: 'acsim_low', HIGH: 'acsim_high', LEVEL: 'acsim_level' },
  'SLOW GEAR': { SENS: 'slow_gear_sens', 'RISE TIME': 'slow_gear_rise_time', LEVEL: 'slow_gear_level' },
  // the TARGET list follows memory order: -2 OCT is the first slot, -1 OCT the second
  OCTAVE: { '-2 OCT': 'octave_range', '-1 OCT': 'octave_level', 'D.LEVEL': 'octave_direct_mix' },
  'PITCH SHIFTER': {
    PITCH: 'pitch_shifter_ps1pitch',
    'D.LEVEL': 'pitch_shifter_direct_mix',
    FINE: 'pitch_shifter_ps1fine',
    'PRE DELAY': 'pitch_shifter_ps1pre_dly',
    'E.LEVEL': 'pitch_shifter_ps1level',
    FEEDBACK: 'pitch_shifter_ps1f_back'
  },
  HARMONIST: {
    HARMONY: 'harmonist_hr1harm',
    'PRE DELAY': 'harmonist_hr1pre_dly',
    FEEDBACK: 'harmonist_hr1f_back',
    'E.LEVEL': 'harmonist_hr1level',
    'D.LEVEL': 'harmonist_direct_mix'
  },
  OVERTONE: { LOWER: 'overtone_lower_level', UPPER: 'overtone_upper_level', 'D.LEVEL': 'overtone_direct_level', DETUNE: 'overtone_detune', TONE: 'overtone_tone' },
  FEEDBACKER: { TRIGGER: 'feedbacker_trigger', DEPTH: 'feedbacker_depth' },
  'AC.PROC.': { TYPE: 'ac_processor_type', BASS: 'ac_processor_bass', MIDDLE: 'ac_processor_middle', TREBLE: 'ac_processor_treble', PRESENCE: 'ac_processor_presence', LEVEL: 'ac_processor_level' },
  PHASER: { TYPE: 'phaser_type', RATE: 'phaser_rate', DEPTH: 'phaser_depth', RESONANCE: 'phaser_reso', MANUAL: 'phaser_manual', LEVEL: 'phaser_effect_level' },
  FLANGER: { RATE: 'flanger_rate', DEPTH: 'flanger_depth', RESONANCE: 'flanger_reso', MANUAL: 'flanger_manual', 'LOW CUT': 'flanger_low_cut', LEVEL: 'flanger_effect_level' },
  TREMOLO: { WAVE: 'tremolo_wave_shape', RATE: 'tremolo_rate', DEPTH: 'tremolo_depth', LEVEL: 'tremolo_level' },
  // the GT-1 rotary is the GT-100's ROTARY 2
  ROTARY: { SPEED: 'rotary2_speed_sel', 'RATE SLOW': 'rotary2_rate_slow', 'RATE FAST': 'rotary2_rate_fast', TRANSITION: 'rotary2_risetime', 'B/H BAL': 'rotary2_balance', LEVEL: 'rotary2_level' },
  'UNI-V': { RATE: 'uni_v_rate', DEPTH: 'uni_v_depth', LEVEL: 'uni_v_level' },
  VIBRATO: { RATE: 'vibrato_rate', DEPTH: 'vibrato_depth', TRIGGER: 'vibrato_trigger', 'RISE TIME': 'vibrato_rise_time', LEVEL: 'vibrato_level' },
  CHORUS: { MODE: 'chorus_mode', RATE: 'chorus_rate', DEPTH: 'chorus_depth', 'E.LEVEL': 'chorus_e_level', 'LOW CUT': 'chorus_lowcut', 'HIGH CUT': 'chorus_hicut' },
  'SUB DELAY': {
    TYPE: 'sub_delay_type',
    TIME: 'sub_delay_time',
    FEEDBACK: 'sub_delay_f_back',
    'E.LEVEL': 'sub_delay_effect_level',
    'HIGH CUT': 'sub_delay_high_cut',
    'TAP TIME': 'sub_delay_tap_time',
    'D.LEVEL': 'sub_delay_direct_mix'
  }
}

/** Full keys for an FX type in a slot: FX2's overtone lives under its own prefix. */
function fxKey(slot: 'FX1' | 'FX2', type: string, label: string): string | null {
  const suffix = FX_KEYS[type]?.[label]
  if (!suffix) return null
  if (slot === 'FX2' && type === 'OVERTONE') return `prm_fx2_${suffix}`
  return `${slot === 'FX1' ? 'fx1' : 'fx2'}_${suffix}`
}

const WAH_KEYS: KeyMap = { 'PDL POS': 'pedal_fx_wah_position', 'PDL MIN': 'pedal_fx_wah_pedal_min', 'PDL MAX': 'pedal_fx_wah_pedal_max', LEVEL: 'pedal_fx_wah_effect_level' }
const BEND_KEYS: KeyMap = { PITCH: 'pedal_fx_pedal_bend_pitch', 'PDL POS': 'pedal_fx_pedal_bend_position', LEVEL: 'pedal_fx_pedal_bend_effect_level' }
const DELAY_KEYS: KeyMap = {
  TIME: 'delay_delay_time',
  FEEDBACK: 'delay_f_back',
  'HIGH CUT': 'delay_high_cut',
  'E.LEVEL': 'delay_effect_level',
  'TAP TIME': 'delay_tap_time',
  'MOD RATE': 'delay_mod_rate',
  'MOD DEPTH': 'delay_mod_depth'
}
const TERA_KEYS: KeyMap = {
  TIME: 'dly_teraecho_time',
  FEEDBACK: 'dly_teraecho_feedback',
  'E.LEVEL': 'dly_teraecho_effect_level',
  TONE: 'dly_teraecho_tone',
  'D.LEVEL': 'dly_teraecho_direct_level',
  HOLD: 'dly_teraecho_hold'
}
const REVERB_KEYS: KeyMap = {
  TIME: 'reverb_time',
  'E.LEVEL': 'reverb_effect_level',
  'LOW CUT': 'reverb_low_cut',
  'HIGH CUT': 'reverb_high_cut',
  SPRING: 'reverb_spring_sens'
}
const REVERB_DELAY_KEYS: KeyMap = {
  TIME: 'reverb_dd_delaytime',
  'E.LEVEL': 'reverb_dd_effectlevel',
  FEEDBACK: 'reverb_dd_feedback',
  'HIGH CUT': 'reverb_dd_highcut',
  'D.LEVEL': 'reverb_dd_directlevel'
}

/** Per block: its ON/OFF key, its TYPE key, and the keys of the type loaded. */
interface BlockLayout {
  onOff: string | null
  typeKey: string | null
  keys: (type: string) => KeyMap
}

const LAYOUT: Record<string, BlockLayout> = {
  'PEDAL FX': { onOff: 'pedal_fx_on_off', typeKey: 'pedal_fx_wah_type', keys: (t) => (t === 'PEDAL BND' ? BEND_KEYS : WAH_KEYS) },
  'OD/DS': {
    onOff: 'od_ds_on_off',
    typeKey: 'od_ds_type',
    keys: () => ({ DRIVE: 'od_ds_drive', TONE: 'od_ds_tone', 'E.LEVEL': 'od_ds_effect_level', BOTTOM: 'od_ds_bottom', 'D.LEVEL': 'od_ds_direct_mix' })
  },
  PREAMP: {
    onOff: 'preamp_a_on_off',
    typeKey: 'preamp_a_type',
    keys: () => ({
      GAIN: 'preamp_a_gain',
      BASS: 'preamp_a_bass',
      MIDDLE: 'preamp_a_middle',
      TREBLE: 'preamp_a_treble',
      PRESENCE: 'preamp_a_presence',
      LEVEL: 'preamp_a_level',
      BRIGHT: 'preamp_a_bright',
      'SP TYPE': 'preamp_a_sp_type'
    })
  },
  NS: { onOff: 'ns1_on_off', typeKey: null, keys: () => ({ THRESHOLD: 'ns1_threshold', RELEASE: 'ns1_release', DETECT: 'ns1_detect' }) },
  'FOOT VOLUME': { onOff: null, typeKey: null, keys: () => ({ LEVEL: 'foot_volume_level', MIN: 'foot_volume_volume_min', MAX: 'foot_volume_volume_max' }) },
  DELAY: { onOff: 'delay_on_off', typeKey: 'delay_type', keys: (t) => (t === 'TERA ECHO' ? TERA_KEYS : DELAY_KEYS) },
  REVERB: { onOff: 'reverb_on_off', typeKey: 'reverb_type', keys: (t) => (t === 'DELAY' ? REVERB_DELAY_KEYS : REVERB_KEYS) },
  MASTER: {
    onOff: null,
    typeKey: null,
    keys: () => ({
      'PATCH LVL': 'patch_level',
      BPM: 'master_bpm',
      KEY: 'master_key',
      'LOW GAIN': 'master_eq_low_gain',
      'MID GAIN': 'master_eq_mid_gain',
      'MID FREQ': 'master_eq_mid_freq',
      'MID Q': 'master_eq_mid_q',
      'HIGH GAIN': 'master_eq_high_gain'
    })
  }
}

function layoutFor(slot: string): BlockLayout {
  if (slot === 'FX1' || slot === 'FX2') {
    const s: 'FX1' | 'FX2' = slot
    return {
      onOff: `${s.toLowerCase()}_on_off`,
      typeKey: `${s.toLowerCase()}_fx_type`,
      keys: (t) => {
        const map: KeyMap = {}
        for (const label of Object.keys(FX_KEYS[t] ?? {})) map[label] = fxKey(s, t, label) as string
        return map
      }
    }
  }
  return LAYOUT[slot]
}

function typesOf(slot: string): Gt1Type[] {
  return GT1_BLOCKS.find((b) => b.slot === slot)?.types ?? []
}

function paramDefs(slot: string, type: string | null): Gt1Param[] {
  const block = GT1_BLOCKS.find((b) => b.slot === slot)
  if (!block) return []
  if (!block.types.length) return block.params ?? []
  return block.types.find((t) => t.name === type)?.params ?? []
}

/* ------------------------------------------------------------ controllers */

const TARGET_FLAT = GT1_TARGETS.flatMap((c) => c.targets.map((t) => ({ category: c.category, target: t })))
const SOURCES = ['EXP 1', 'CTL 1', 'EXP 2', 'CTL2', 'CTL3', 'INT PEDAL', 'WAVE PEDAL']
const CONTROL_KEYS: Record<string, { func: string; mode: string | null; exp: boolean }> = {
  CTL1: { func: 'ctl_exp_accel_ctl_func', mode: 'ctl_exp_accel_ctl_src_mode', exp: false },
  'EXP SW': { func: 'ctl_exp_exp_sw_func', mode: 'ctl_exp_exp_sw_src_mode', exp: false },
  EXP1: { func: 'ctl_exp_exp_func', mode: null, exp: true },
  CTL2: { func: 'ctl_exp_sub_ctl1_func', mode: 'ctl_exp_sub_ctl1_src_mode', exp: false },
  CTL3: { func: 'ctl_exp_sub_ctl2_func', mode: 'ctl_exp_sub_ctl2_src_mode', exp: false },
  EXP2: { func: 'ctl_exp_sub_exp_func', mode: null, exp: true }
}

/* ---------------------------------------------------------------- name */

/** Sixteen printable ASCII characters, accents folded — what the display can show. */
export function gt1PatchName(name: string): string {
  const ascii = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, ' ')
  return ascii.slice(0, 16).padEnd(16, ' ')
}

/* ---------------------------------------------------------------- encode */

export interface EncodeResult {
  params: Gt1Params
  /** Every key this patch set on purpose; the rest came from the base. */
  touched: Set<string>
  /** Settings that could not be expressed on the unit and were left at the base value. */
  skipped: string[]
}

/**
 * The app's view of a GT-1 patch → the unit's numbers.
 *
 * `base` supplies everything the patch does not mention — by default the
 * neutral factory-average patch. Blocks the patch leaves out are switched off,
 * ASSIGNs beyond the ones it lists are switched off, and CTL1 does nothing
 * unless the patch says what it does.
 */
export function encodeGt1Patch(patch: TonePatchView, base: Gt1Params = GT1_DEFAULTS): EncodeResult {
  const params: Gt1Params = { ...base }
  const touched = new Set<string>()
  const skipped: string[] = []
  const set = (key: string, value: number): void => {
    params[key] = value
    touched.add(key)
  }

  // name
  const name = gt1PatchName(patch.patchName)
  for (let i = 0; i < 16; i++) set(`patch_name${i + 1}`, name.charCodeAt(i))

  // blocks: everything with an on/off switch starts off, the patch turns on what it uses
  for (const slot of ['FX1', 'FX2', 'PEDAL FX', 'OD/DS', 'PREAMP', 'NS', 'DELAY', 'REVERB']) {
    const onOff = layoutFor(slot).onOff
    if (onOff) set(onOff, 0)
  }
  for (const block of patch.blocks) {
    const slot = findBlock(block.slot)?.slot
    if (!slot) {
      skipped.push(`${block.slot}: bloco desconhecido`)
      continue
    }
    const layout = layoutFor(slot)
    const types = slot === 'FX1' || slot === 'FX2' ? GT1_FX_TYPES : typesOf(slot)
    let type: string | null = null
    if (types.length) {
      type = matchName(block.model, types)?.name ?? null
      if (!type) {
        skipped.push(`${slot}: tipo "${block.model}"`)
        continue
      }
      if (layout.typeKey) set(layout.typeKey, types.findIndex((t) => t.name === type))
    }
    if (layout.onOff) set(layout.onOff, block.enabled ? 1 : 0)
    const keys = layout.keys(type ?? '')
    const defs = paramDefs(slot, type)
    for (const p of block.params) {
      if (p.warning && p.value === null && !p.text) continue
      const def = matchName(p.label, defs)
      const key = def ? keys[def.name] : undefined
      if (!def || !key) {
        if (!(slot !== 'FX1' && slot !== 'FX2' && labelKey(p.label) === 'TYPE')) skipped.push(`${slot} ${p.label}`)
        continue
      }
      const raw = encodeValue(def, p)
      if (raw === null) {
        skipped.push(`${slot} ${p.label} = ${paramText(p)}`)
        continue
      }
      set(key, raw)
      // the rotary has one transition time on the GT-1 and two in memory
      if (key.endsWith('rotary2_risetime')) set(key.replace('risetime', 'falltime'), raw)
    }
    // NS threshold 0 is the GT-1's "OFF"
    if (slot === 'NS' && params.ns1_threshold === 0) set('ns1_on_off', 0)
  }

  // chain: the nine movable blocks between the fixed head and tail
  const labels = patch.chain.filter((l) => l in CHAIN_ID)
  const order = labels.length === 9 ? labels : ['FX1', 'PDL', 'OD', 'PrA', 'NS', 'FV', 'FX2', 'DLY', 'REV']
  const chain = [...CHAIN_HEAD, ...order.map((l) => CHAIN_ID[l]), ...CHAIN_TAIL]
  chain.forEach((id, i) => set(`fx_chain_position${i + 1}`, id))

  // controllers: CTL1 does nothing unless the patch says what it does
  set('ctl_exp_accel_ctl_func', 0)
  for (const c of patch.controls ?? []) {
    const keys = CONTROL_KEYS[c.source]
    if (!keys) continue
    const list: readonly string[] = keys.exp ? GT1_EXP_FUNCS : GT1_CTL_FUNCS
    const func = list.indexOf(c.func)
    if (func < 0) {
      skipped.push(`${c.source}: FUNC ${c.func}`)
      continue
    }
    set(keys.func, func)
    if (keys.mode && c.mode) set(keys.mode, c.mode === 'MOMENT' ? 0 : 1)
    if (c.soloLevel !== null) set(c.func === 'OD SOLO' ? 'od_ds_solo_level' : 'preamp_a_solo_level', c.soloLevel)
  }

  // ASSIGNs: the patch's list, the rest switched off
  const assigns = patch.assigns ?? []
  /*
   * A CTL1 that only drives ASSIGNs gets FUNC LED ON/OFF, as the manual
   * suggests: the switch's light then shows whether the ASSIGNs are engaged,
   * which is the one thing a player needs to see mid-song.
   */
  if (params.ctl_exp_accel_ctl_func === 0 && assigns.some((a) => a.source === 'CTL 1')) {
    set('ctl_exp_accel_ctl_func', GT1_CTL_FUNCS.indexOf('LED ON/OFF'))
  }
  // each ASSIGN keeps its number when it has a free one, otherwise takes the next free slot
  const slotOf = new Map<AssignView, number>()
  const used = new Set<number>()
  for (const a of assigns) {
    if (a.number >= 1 && a.number <= 8 && !used.has(a.number)) {
      slotOf.set(a, a.number)
      used.add(a.number)
    }
  }
  for (const a of assigns) {
    if (slotOf.has(a)) continue
    const free = [1, 2, 3, 4, 5, 6, 7, 8].find((n) => !used.has(n))
    if (free === undefined) break
    slotOf.set(a, free)
    used.add(free)
  }
  const bySlot = new Map([...slotOf.entries()].map(([a, n]) => [n, a]))
  for (let n = 1; n <= 8; n++) {
    const a = bySlot.get(n)
    set(`assign${n}_on_off`, 0)
    if (!a) continue
    const index = TARGET_FLAT.findIndex((t) => t.category === a.category && t.target.name === a.target)
    const source = SOURCES.indexOf(a.source)
    const def = TARGET_FLAT[index]?.target.param
    if (index < 0 || source < 0 || !def) {
      skipped.push(`ASSIGN${n}: ${a.source} → ${a.category} ${a.target}`)
      continue
    }
    const range = (text: string): number | null => {
      const parsed: PatchParam =
        def.kind === 'range' && !/^\s*bpm/i.test(text)
          ? { label: def.name, value: Number.parseFloat(text.replace('−', '-').replace(/[^\d.+-]/g, '')), text: null }
          : { label: def.name, value: null, text }
      if (parsed.value !== null && !Number.isFinite(parsed.value)) return null
      return encodeValue(def, parsed)
    }
    const min = range(a.min)
    const max = range(a.max)
    if (min === null || max === null) {
      skipped.push(`ASSIGN${n}: MIN/MAX ${a.min} → ${a.max}`)
      continue
    }
    set(`assign${n}_on_off`, 1)
    set(`assign${n}_source`, source)
    set(`assign${n}_source_mode`, a.mode === 'MOMENT' ? 0 : 1)
    set(`assign${n}_target`, index)
    set(`assign${n}_target_min`, min)
    set(`assign${n}_target_max`, max)
    set(`assign${n}_act_range_lo`, 0)
    set(`assign${n}_act_range_hi`, 127)
    const extra = a.extra ?? ''
    const trigger = /TRIGGER ([A-Z0-9 ]+?)(?: ·|$)/.exec(extra)?.[1]
    if (trigger) set(`assign${n}_int_pdl_trigger`, Math.max(0, GT1_ASSIGN_TRIGGERS.indexOf(trigger as never)))
    const time = /TIME (\d+)/.exec(extra)?.[1]
    if (time) set(`assign${n}_int_pdl_time`, Number(time))
    const curve = /CURVE (\w+)/.exec(extra)?.[1]
    if (curve) set(`assign${n}_int_pdl_curve`, Math.max(0, GT1_ASSIGN_CURVES.indexOf(curve as never)))
    const rate = /WAVE RATE (BPM [^·]+|\d+)/.exec(extra)?.[1]?.trim()
    if (rate) {
      const note = /bpm/i.test(rate) ? noteIndex(rate) : null
      set(`assign${n}_wave_rate`, note !== null ? 101 + (12 - note) : Number(rate))
    }
    const wave = /WAVEFORM (\w+)/.exec(extra)?.[1]
    if (wave) set(`assign${n}_waveform`, Math.max(0, GT1_WAVEFORMS.indexOf(wave as never)))
  }

  return { params, touched, skipped }
}

/* ---------------------------------------------------------------- decode */

/** The unit's numbers → the app's view, so a patch read from the unit or a .tsl can be shown. */
export function decodeGt1Patch(params: Gt1Params): TonePatchView {
  const name = Array.from({ length: 16 }, (_, i) => String.fromCharCode(params[`patch_name${i + 1}`] ?? 32))
    .join('')
    .trimEnd()
  const blocks: PatchBlock[] = []
  for (const slot of ['FX1', 'PEDAL FX', 'OD/DS', 'PREAMP', 'NS', 'DELAY', 'FOOT VOLUME', 'FX2', 'REVERB', 'MASTER']) {
    const layout = layoutFor(slot)
    const types = slot === 'FX1' || slot === 'FX2' ? GT1_FX_TYPES : typesOf(slot)
    const type = layout.typeKey ? (types[params[layout.typeKey]]?.name ?? null) : null
    const keys = layout.keys(type ?? '')
    const defs = paramDefs(slot, type)
    blocks.push({
      slot,
      model: type ?? '',
      enabled: layout.onOff ? params[layout.onOff] === 1 : true,
      params: defs
        .filter((d) => keys[d.name] && params[keys[d.name]] !== undefined)
        .map((d) => decodeValue(d, params[keys[d.name]])),
      note: null,
      warning: null
    })
  }

  const positions = Array.from({ length: 20 }, (_, i) => params[`fx_chain_position${i + 1}`])
  const chain = positions.map((id) => CHAIN_LABEL[id]).filter(Boolean)

  const controls: ControlView[] = []
  for (const [source, keys] of Object.entries(CONTROL_KEYS)) {
    if (source === 'CTL2' || source === 'CTL3' || source === 'EXP2') continue
    const list: readonly string[] = keys.exp ? GT1_EXP_FUNCS : GT1_CTL_FUNCS
    const func = list[params[keys.func]] ?? String(params[keys.func])
    const solo = func === 'OD SOLO' ? params.od_ds_solo_level : func === 'PrA SOLO' ? params.preamp_a_solo_level : null
    controls.push({
      source,
      func,
      mode: keys.mode ? (params[keys.mode] ? 'TOGGLE' : 'MOMENT') : null,
      soloLevel: solo ?? null,
      action: '',
      when: ''
    })
  }

  const assigns: AssignView[] = []
  for (let n = 1; n <= 8; n++) {
    if (!params[`assign${n}_on_off`]) continue
    const t = TARGET_FLAT[params[`assign${n}_target`]]
    const def = t?.target.param
    const show = (raw: number): string => (def ? paramText(decodeValue(def, raw)) : String(raw))
    const source = SOURCES[params[`assign${n}_source`]] ?? String(params[`assign${n}_source`])
    let extra: string | null = null
    if (source === 'INT PEDAL') {
      extra = `TRIGGER ${GT1_ASSIGN_TRIGGERS[params[`assign${n}_int_pdl_trigger`]]} · TIME ${params[`assign${n}_int_pdl_time`]} · CURVE ${GT1_ASSIGN_CURVES[params[`assign${n}_int_pdl_curve`]]}`
    } else if (source === 'WAVE PEDAL') {
      const r = params[`assign${n}_wave_rate`]
      const rate = r > 100 ? `BPM ${TIME_NOTES[12 - (r - 101)]}` : String(r)
      extra = `WAVE RATE ${rate} · WAVEFORM ${GT1_WAVEFORMS[params[`assign${n}_waveform`]]}`
    }
    assigns.push({
      number: n,
      source,
      mode: params[`assign${n}_source_mode`] ? 'TOGGLE' : 'MOMENT',
      category: t?.category ?? '?',
      target: t?.target.name ?? '?',
      min: show(params[`assign${n}_target_min`]),
      max: show(params[`assign${n}_target_max`]),
      purpose: '',
      extra
    })
  }

  return {
    patchName: name,
    appliesTo: '',
    summary: '',
    chain,
    blocks,
    ctrl: null,
    controls,
    assigns,
    listenFor: '',
    notes: '',
    rig: { guitar: '', processor: 'Boss GT-1', output: 'pa' }
  }
}

/* ------------------------------------------------------------- the wire */

/** A patch's bytes, page by page, in the unit's memory layout. */
export function gt1PatchBytes(params: Gt1Params): Map<number, number[]> {
  const pages = new Map<number, number[]>()
  for (const [key, page, offset, size] of GT1_ADDRESSES) {
    const value = params[key] ?? GT1_DEFAULTS[key]
    const bytes = size === 2 ? [(value >> 7) & 0x7f, value & 0x7f] : [value & 0x7f]
    const row = pages.get(page) ?? []
    bytes.forEach((b, i) => {
      row[offset + i] = b
    })
    pages.set(page, row)
  }
  return pages
}

/** Read bytes, page → offset → value, back into named numbers. */
export function gt1ParamsFromBytes(pages: Map<number, Array<number | undefined>>): { params: Gt1Params; missing: string[] } {
  const params: Gt1Params = {}
  const missing: string[] = []
  for (const [key, page, offset, size] of GT1_ADDRESSES) {
    const row = pages.get(page) ?? []
    const bytes = Array.from({ length: size }, (_, i) => row[offset + i])
    if (bytes.some((b) => b === undefined)) {
      missing.push(key)
      continue
    }
    params[key] = size === 2 ? ((bytes[0] as number) << 7) | (bytes[1] as number) : (bytes[0] as number)
  }
  return { params, missing }
}

/** Roland's checksum: the low seven bits that make address + data sum to zero. */
export function rolandChecksum(bytes: number[]): number {
  return (128 - (bytes.reduce((a, b) => a + b, 0) % 128)) % 128
}

/** GT-1 model ID in Roland SysEx, from the editor's address map. */
export const GT1_MODEL_ID = [0x00, 0x00, 0x00, 0x30]

/** Data set (DT1) messages writing `pages` at `base` (two address bytes), in runs of `chunk` bytes. */
export function gt1WriteMessages(device: number, base: [number, number], pages: Map<number, number[]>, chunk = 64): number[][] {
  const messages: number[][] = []
  for (const [page, row] of [...pages.entries()].sort((a, b) => a[0] - b[0])) {
    let offset = 0
    while (offset < row.length) {
      while (offset < row.length && row[offset] === undefined) offset++
      if (offset >= row.length) break
      const data: number[] = []
      const start = offset
      while (offset < row.length && row[offset] !== undefined && data.length < chunk) data.push(row[offset++])
      const body = [base[0], base[1], page, start, ...data]
      messages.push([0xf0, 0x41, device, ...GT1_MODEL_ID, 0x12, ...body, rolandChecksum(body), 0xf7])
    }
  }
  return messages
}

/** Data request (RQ1) for `size` bytes at a four-byte address. */
export function gt1RequestMessage(device: number, address: number[], size: number): number[] {
  const body = [...address, 0, 0, (size >> 7) & 0x7f, size & 0x7f]
  return [0xf0, 0x41, device, ...GT1_MODEL_ID, 0x11, ...body, rolandChecksum(body), 0xf7]
}

/** Memory base of a slot: the temporary (edit) patch, or user patch U01–U99. */
export function gt1SlotBase(slot: 'TEMP' | number): [number, number] {
  return slot === 'TEMP' ? [0x60, 0x00] : [0x10, slot - 1]
}

/** How many pages a patch spans in memory (00–10). */
export const GT1_PAGES = 0x11
