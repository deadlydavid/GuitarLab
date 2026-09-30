/**
 * The GT-1 patch codec against real patches.
 *
 * Run with: npm run test:gt1codec
 *
 * A patch the app writes to the unit has to be the patch the app showed, so
 * the codec is held to the unit's own data: every factory patch (when BOSS
 * TONE STUDIO is installed) and the committed sample must survive a
 * decode → encode round trip on every value the encoder sets, and a suggested
 * plan must come back from the unit's numbers the way it went in.
 */
import { existsSync, readFileSync } from 'node:fs'
import {
  decodeGt1Patch,
  encodeGt1Patch,
  gt1ParamsFromBytes,
  gt1PatchBytes,
  gt1PatchName,
  gt1RequestMessage,
  gt1WriteMessages,
  rolandChecksum,
  type Gt1Params
} from '../src/shared/gt1codec'
import { GT1_ADDRESSES, GT1_DEFAULTS } from '../src/shared/gt1data'
import { buildGt1Tsl, parseGt1Tsl } from '../src/shared/gt1tsl'
import { normalizeGt1Plan, planPitchShifter } from '../src/main/services/tone'
import { RIG_DEFAULT } from '../src/shared/types'

let failures = 0
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${label}${detail ? ` -- ${detail}` : ''}`)
  if (!ok) failures++
}

function roundTrip(params: Gt1Params): string[] {
  const view = decodeGt1Patch(params)
  const { params: again, touched } = encodeGt1Patch(view, GT1_DEFAULTS)
  const diffs: string[] = []
  for (const key of touched) {
    if (params[key] === undefined) continue
    if (again[key] !== params[key]) diffs.push(`${key}: ${params[key]} → ${again[key]}`)
  }
  return diffs
}

console.log('=== 1. tabela de endereços ===')
check('926 parâmetros com endereço', GT1_ADDRESSES.length === 926, String(GT1_ADDRESSES.length))
const seen = new Set<string>()
let overlap = 0
for (const [, page, offset, size] of GT1_ADDRESSES) {
  for (let i = 0; i < size; i++) {
    const at = `${page}:${offset + i}`
    if (seen.has(at)) overlap++
    seen.add(at)
  }
}
check('nenhum endereço usado duas vezes', overlap === 0, `${overlap}`)
check('todo parâmetro tem padrão', GT1_ADDRESSES.every(([k]) => typeof GT1_DEFAULTS[k] === 'number'))

console.log('\n=== 2. bytes ida e volta ===')
const bytes = gt1PatchBytes(GT1_DEFAULTS as Gt1Params)
const back = gt1ParamsFromBytes(bytes)
check('nada falta na volta', back.missing.length === 0, `${back.missing.length}`)
check(
  'todo valor volta igual',
  GT1_ADDRESSES.every(([k]) => back.params[k] === GT1_DEFAULTS[k])
)
const msgs = gt1WriteMessages(0x00, [0x60, 0x00], bytes)
check('mensagens DT1 com cabeçalho Roland/GT-1', msgs.every((m) => m[0] === 0xf0 && m[1] === 0x41 && m[6] === 0x30 && m[7] === 0x12 && m[m.length - 1] === 0xf7))
check('nenhuma passa de 64 bytes de dado', msgs.every((m) => m.length - 14 <= 64))
check('checksum fecha em zero', msgs.every((m) => (m.slice(8, m.length - 1).reduce((a, b) => a + b, 0) % 128) === 0))
check('RQ1 bem formado', JSON.stringify(gt1RequestMessage(0, [0x10, 3, 0, 0], 128)) === JSON.stringify([0xf0, 0x41, 0, 0, 0, 0, 0x30, 0x11, 0x10, 3, 0, 0, 0, 0, 1, 0, rolandChecksum([0x10, 3, 0, 0, 0, 0, 1, 0]), 0xf7]))
check('nome vira 16 caracteres ASCII', gt1PatchName('Slow Ride Crunch Ação') === 'Slow Ride Crunch')

console.log('\n=== 3. patches reais: decodifica e codifica de novo ===')
const sample = JSON.parse(readFileSync(new URL('./fixtures/gt1-liveset.tsl', import.meta.url), 'utf8')) as {
  patchList: Array<{ name: string; params: Gt1Params }>
}
for (const p of sample.patchList) {
  const diffs = roundTrip(p.params)
  check(`${p.name}: ida e volta sem perda`, diffs.length === 0, diffs.slice(0, 5).join('; '))
}
const mop = decodeGt1Patch(sample.patchList.find((p) => p.name === 'MasterOfPuppets')?.params ?? {})
const block = (slot: string): { model: string; enabled: boolean; params: Array<{ label: string; value: number | null; text?: string | null }> } | undefined =>
  mop.blocks.find((b) => b.slot === slot)
check('lê o BG LEAD', block('PREAMP')?.model === 'BG LEAD')
check('lê o METAL DS ligado', block('OD/DS')?.model === 'METAL DS' && block('OD/DS')?.enabled === true)
check('lê o HARMONIST desligado em -3rd', block('FX2')?.model === 'HARMONIST' && block('FX2')?.params.find((x) => x.label === 'HARMONY')?.text === '-3rd')
check('lê a GEQ em dB', block('FX1')?.params.find((x) => x.label === '6.4kHz')?.value === 15)
check('lê o REVERB TIME em segundos', block('REVERB')?.params.find((x) => x.label === 'TIME')?.value === 3)
check('lê a cadeia na ordem do editor', mop.chain.join(' ') === 'PDL NS OD PrA FX1 FX2 DLY REV FV', mop.chain.join(' '))
check('lê o ASSIGN do delay no CTL1', mop.assigns?.[0]?.source === 'CTL 1' && mop.assigns?.[0]?.category === 'DELAY' && mop.assigns?.[0]?.target === 'ON/OFF')

console.log('\n=== 3b. arquivo .tsl ===')
const rawSample = JSON.parse(readFileSync(new URL('./fixtures/gt1-liveset.tsl', import.meta.url), 'utf8')) as {
  patchList: Array<{ name: string; params: Record<string, unknown> }>
}
const parsed = parseGt1Tsl(JSON.stringify(rawSample))
check('lê as duas patches do .tsl', parsed.length === 2 && parsed[1].name === 'MasterOfPuppets')
const rebuilt = JSON.parse(buildGt1Tsl('Teste', parsed.map((p) => p.params))) as typeof rawSample & { device: string }
check('o .tsl gerado é da GT-1', rebuilt.device === 'GT-1')
const origKeys = Object.keys(rawSample.patchList[1].params).sort().join(',')
const newKeys = Object.keys(rebuilt.patchList[1].params).sort().join(',')
check('mesmo conjunto de chaves que o BTS escreve', origKeys === newKeys, `${Object.keys(rawSample.patchList[1].params).length} × ${Object.keys(rebuilt.patchList[1].params).length}`)
// objects compare by content, not by the order their keys were written in
const canon = (v: unknown): string =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? JSON.stringify(Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))))
    : JSON.stringify(v)
const valueDiffs = Object.keys(rawSample.patchList[1].params).filter(
  (k) => !k.startsWith('fx_chorus_name') && !k.startsWith('fx_feedbacker_name') && canon(rawSample.patchList[1].params[k]) !== canon(rebuilt.patchList[1].params[k])
)
check('e os mesmos valores', valueDiffs.length === 0, valueDiffs.slice(0, 5).join(', '))
check('nome e categorias no cabeçalho da patch', rebuilt.patchList[1].name === 'MasterOfPuppets')
let foreign = ''
try {
  parseGt1Tsl(JSON.stringify({ device: 'KATANA', patchList: [] }))
} catch (err) {
  foreign = err instanceof Error ? err.message : ''
}
check('.tsl de outro aparelho é recusado', /KATANA/.test(foreign))

const bts = 'C:/Program Files (x86)/BOSS TONE STUDIO for GT-1/_assets/data/gt_preset_patches.tsl'
if (existsSync(bts)) {
  const presets = JSON.parse(readFileSync(bts, 'utf8')) as { patchList: Array<{ name: string; params: Gt1Params }> }
  const broken = presets.patchList
    .map((p) => ({ name: p.name, diffs: roundTrip(p.params) }))
    .filter((r) => r.diffs.length)
  check(
    `as ${presets.patchList.length} patches de fábrica voltam iguais`,
    broken.length === 0,
    broken.slice(0, 4).map((b) => `${b.name}: ${b.diffs.slice(0, 3).join(', ')}`).join(' | ')
  )
} else {
  console.log('  AVISO BOSS TONE STUDIO não instalado — patches de fábrica não conferidas')
}

console.log('\n=== 4. plano sugerido → GT-1 → plano ===')
const eb = planPitchShifter({ name: 'Eb Standard', strings: ['D#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'] })
const plan = normalizeGt1Plan(
  {
    patches: [
      {
        patchName: 'SLOW RIDE',
        chain: ['FX1', 'FX2', 'PDL', 'OD', 'PrA', 'NS', 'FV', 'DLY', 'REV'],
        blocks: [
          { slot: 'PREAMP', model: 'TWEED', params: [{ label: 'GAIN', value: 70 }, { label: 'SP TYPE', text: '4x10' }, { label: 'TREBLE', value: 62 }] },
          { slot: 'OD/DS', model: 'T-SCREAM', params: [{ label: 'DRIVE', value: 30 }, { label: 'TONE', value: -5 }] },
          { slot: 'FX2', model: 'HARMONIST', enabled: false, params: [{ label: 'HARMONY', text: '-3rd' }, { label: 'PRE DELAY', value: 20 }] },
          { slot: 'DELAY', model: 'ANALOG', params: [{ label: 'TIME', text: 'BPM 1/8.' }, { label: 'HIGH CUT', text: '3.15kHz' }] },
          { slot: 'REVERB', model: 'SPRING', params: [{ label: 'TIME', value: 2.5 }, { label: 'LOW CUT', text: '100Hz' }] },
          { slot: 'MASTER', params: [{ label: 'PATCH LVL', value: 110 }] }
        ],
        controls: [{ source: 'CTL1', func: 'PrA SOLO', mode: 'TOGGLE', soloLevel: 70 }, { source: 'EXP', func: 'PDL FX/FV' }],
        assigns: [{ source: 'CTL 1', mode: 'TOGGLE', category: 'FX2', target: 'ON/OFF', min: 'OFF', max: 'ON' }, { source: 'CTL 1', category: 'PREAMP', target: 'GAIN', min: 70, max: 95 }]
      }
    ]
  },
  RIG_DEFAULT,
  eb,
  { bpm: 128, musicalKey: 'G' },
  'x',
  'y'
).patches[0]
const enc = encodeGt1Patch(plan)
check('nada ficou de fora na codificação', enc.skipped.length === 0, enc.skipped.join('; '))
const p = enc.params
check('PREAMP TWEED (11), GAIN 70, 4x10 (6)', p.preamp_a_type === 11 && p.preamp_a_gain === 70 && p.preamp_a_sp_type === 6, `${p.preamp_a_type} ${p.preamp_a_gain} ${p.preamp_a_sp_type}`)
check('T-SCREAM (13) com TONE -5 guardado como 45', p.od_ds_type === 13 && p.od_ds_tone === 45 && p.od_ds_on_off === 1)
check('FX1 é o pitch shifter -1 (guardado 23), 100% molhado', p.fx1_fx_type === 10 && p.fx1_pitch_shifter_ps1pitch === 23 && p.fx1_pitch_shifter_ps1level === 100 && p.fx1_pitch_shifter_direct_mix === 0)
check('FX2 HARMONIST (11) desligado, -3rd (12), 20 ms', p.fx2_fx_type === 11 && p.fx2_on_off === 0 && p.fx2_harmonist_hr1harm === 12 && p.fx2_harmonist_hr1pre_dly === 20)
check('DELAY ANALOG (3) em colcheia pontuada (2006)', p.delay_type === 3 && p.delay_delay_time === 2006 && p.delay_high_cut === 7, `${p.delay_type} ${p.delay_delay_time} ${p.delay_high_cut}`)
check('REVERB SPRING (5), 2.5 s (24), LOW CUT 100 Hz (8)', p.reverb_type === 5 && p.reverb_time === 24 && p.reverb_low_cut === 8, `${p.reverb_type} ${p.reverb_time} ${p.reverb_low_cut}`)
check('PATCH LVL 110 guardado como 55, BPM 128, KEY G (7)', p.patch_level === 55 && p.master_bpm === 128 && p.master_key === 7)
check('bloco não usado fica desligado', p.pedal_fx_on_off === 0)
check('cadeia com o harmonist logo depois do FX1', [8, 9, 10].map((i) => p[`fx_chain_position${i}`]).join(',') === '5,6,11')
check('CTL1 = PrA SOLO (2), SOLO LEVEL 70', p.ctl_exp_accel_ctl_func === 2 && p.preamp_a_solo_level === 70)
check('EXP = PDL FX/FV (3)', p.ctl_exp_exp_func === 3)
check('ASSIGN1: CTL 1 → FX2 ON/OFF (índice 140)', p.assign1_on_off === 1 && p.assign1_source === 1 && p.assign1_target === 140 && p.assign1_target_max === 1, `${p.assign1_target}`)
check('ASSIGN2: PREAMP GAIN 70→95', p.assign2_on_off === 1 && p.assign2_target === 132 && p.assign2_target_min === 70 && p.assign2_target_max === 95, `${p.assign2_target}`)
check('ASSIGN3 a 8 desligados', [3, 4, 5, 6, 7, 8].every((n) => p[`assign${n}_on_off`] === 0))
const again = decodeGt1Patch(p)
check('e volta com os mesmos nomes', again.blocks.find((b) => b.slot === 'PREAMP')?.model === 'TWEED' && again.patchName === 'SLOW RIDE')

console.log(`\n${failures === 0 ? 'GT-1 CODEC OK' : `${failures} VERIFICACAO(OES) FALHARAM`}`)
process.exit(failures === 0 ? 0 : 1)
