/**
 * Guitar Pro 1/2 conversion.
 *
 * Run with: npm run test:legacygp
 *
 * alphaTab reads Guitar Pro 3 onwards; legacygp.ts converts the older `.gtp`
 * files into a modern `.gp` on import. No real tab can ship with the
 * repository, so the main check builds a small GP1.04 file byte by byte — the
 * same layout the reader expects — converts it, reopens the result with
 * alphaTab exactly as the app does, and compares note by note. A real GP1 file
 * in gptabs/ (the Red Hot Chili Peppers one that started this) is checked too
 * when it is there.
 */
import * as alphaTab from '@coderline/alphatab'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  convertLegacyGuitarPro,
  convertedPathFor,
  detectLegacyGuitarPro,
  readLegacyGuitarPro,
  readableGuitarProPath
} from '../src/main/importers/legacygp'

let failures = 0
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${label}${detail ? ` -- ${detail}` : ''}`)
  if (!ok) failures++
}

/* ------------------------------------------------- a GP1.04 file, by hand */

class Writer {
  private out: number[] = []
  u8(v: number): this {
    this.out.push(v & 0xff)
    return this
  }
  i8(v: number): this {
    return this.u8(v < 0 ? v + 256 : v)
  }
  i32(v: number): this {
    for (let i = 0; i < 4; i++) this.u8((v >>> (8 * i)) & 0xff)
    return this
  }
  zeros(n: number): this {
    for (let i = 0; i < n; i++) this.u8(0)
    return this
  }
  /** Field-width byte, length byte, text. */
  sized(s: string): this {
    const bytes = [...Buffer.from(s, 'latin1')]
    this.u8(bytes.length + 1).u8(bytes.length)
    for (const b of bytes) this.u8(b)
    return this
  }
  /** Length byte, text (a field exactly as wide as the text). */
  short(s: string): this {
    const bytes = [...Buffer.from(s, 'latin1')]
    this.u8(bytes.length)
    for (const b of bytes) this.u8(b)
    return this
  }
  bytes(): Uint8Array {
    return new Uint8Array(this.out)
  }
}

const E_STANDARD = [64, 59, 55, 50, 45, 40] // highest string first
const BASS = [43, 38, 33, 28, 0, 0]

/** A beat: duration code (-2 whole … 0 quarter, 1 eighth), then what it holds. */
interface HandBeat {
  duration: number
  dotted?: boolean
  triplet?: boolean
  rest?: boolean
  tie?: boolean
  text?: string
  /** mask bit (5 = highest string) → fret, with an optional note effect */
  notes?: Array<{ bit: number; fret: number; effect?: number }>
}

function writeBeat(w: Writer, b: HandBeat): void {
  w.i32(0).i8(b.duration)
  let flags = 0
  if (b.text) flags |= 0x01
  if (b.rest) flags |= 0x08
  if (b.dotted) flags |= 0x10
  if (b.triplet) flags |= 0x20
  if (b.tie) flags |= 0x40
  w.u8(flags)
  if (b.triplet) w.u8(3)
  if (b.text) w.short(b.text)
  if (b.tie || b.rest) return
  const notes = b.notes ?? []
  let played = 0
  let effects = 0
  for (const n of notes) {
    played |= 1 << n.bit
    if (n.effect) effects |= 1 << n.bit
  }
  w.u8(played).u8(effects)
  for (let i = 5; i >= 0; i--) {
    const n = notes.find((x) => x.bit === i)
    if (!n) continue
    w.u8(n.fret)
    if (n.effect) w.u8(n.effect)
  }
}

function buildGp1(): Uint8Array {
  const w = new Writer()
  const version = 'FICHIER GUITARE PRO v1.04'
  w.u8(version.length)
  for (const c of Buffer.from(version, 'latin1')) w.u8(c)
  w.zeros(30 - version.length)
  w.sized('Musica Antiga').sized('Banda de Teste').sized('')
  w.i32(96).i32(0).i32(0) // tempo, no triplet feel, key

  for (let t = 0; t < 8; t++) {
    w.i32(6)
    for (const v of t === 1 ? BASS : E_STANDARD) w.i32(v)
  }

  const bars: Array<{ repeatOpen?: boolean; repeatClose?: number; guitar: HandBeat[]; bass: HandBeat[] }> = [
    {
      guitar: [
        // an E minor shape on the three lowest strings, the middle one hammered
        { duration: 0, text: 'Intro', notes: [{ bit: 0, fret: 0 }, { bit: 1, fret: 2, effect: 1 }, { bit: 2, fret: 2 }] },
        { duration: 0, tie: true },
        { duration: 1, rest: true },
        { duration: 1, notes: [{ bit: 5, fret: 12 }] },
        { duration: 0, dotted: true, notes: [{ bit: 4, fret: 3 }] },
        { duration: 1, notes: [{ bit: 3, fret: 100 }] } // fret 100+ = dead note
      ],
      bass: [{ duration: -2, notes: [{ bit: 3, fret: 0 }] }]
    },
    {
      repeatOpen: true,
      repeatClose: 1,
      guitar: [
        { duration: 1, triplet: true, notes: [{ bit: 2, fret: 5 }] },
        { duration: 1, triplet: true, notes: [{ bit: 2, fret: 7 }] },
        { duration: 1, triplet: true, notes: [{ bit: 2, fret: 9 }] },
        // a shift slide needs a note to land on, on the same string
        { duration: -1, notes: [{ bit: 1, fret: 7, effect: 3 }] },
        { duration: 0, notes: [{ bit: 1, fret: 9 }] }
      ],
      bass: []
    }
  ]

  w.i32(bars.length)
  for (let t = 0; t < 8; t++) {
    w.i32(t === 1 ? 33 : 29) // program: bass, overdrive guitar
    w.i32(24).sized(t === 0 ? 'Guitarra' : t === 1 ? 'Baixo' : '').u8(0)
    w.i32(100).i32(64).i32(0).i32(0).i32(0)
  }
  w.zeros(10)

  for (const bar of bars) {
    w.u8(4).u8(4).zeros(6)
    for (let t = 0; t < 8; t++) {
      const count = t === 0 ? bar.guitar.length : t === 1 ? bar.bass.length : 0
      w.zeros(2).u8(count).zeros(9)
    }
    w.zeros(2)
    let flags = 0
    if (bar.repeatOpen) flags |= 0x01
    if (bar.repeatClose) flags |= 0x02
    w.u8(flags)
    if (bar.repeatClose) w.u8(bar.repeatClose)
    for (const b of bar.guitar) writeBeat(w, b)
    for (const b of bar.bass) writeBeat(w, b)
  }
  return w.bytes()
}

/* ------------------------------------------------------------------ checks */

const reopen = (gp: Uint8Array): alphaTab.model.Score =>
  alphaTab.importer.ScoreLoader.loadScoreFromBytes(gp, new alphaTab.Settings())

const noteList = (beat: alphaTab.model.Beat): string =>
  beat.notes
    .map((n) => `${n.string}:${n.fret}`)
    .sort()
    .join(' ')

console.log('=== 1. reconhece o formato pelo cabecalho ===')
const handmade = buildGp1()
check('GP1.04 feito a mao e reconhecido', detectLegacyGuitarPro(handmade)?.format === 'gp1')
const gp5Header = new Uint8Array(64)
gp5Header.set([...Buffer.from('\x18FICHIER GUITAR PRO v5.10', 'latin1')])
check('GP5 com extensao .gtp nao e tratado como antigo', detectLegacyGuitarPro(gp5Header) === null)
const gp2Header = new Uint8Array(64)
gp2Header.set([...Buffer.from('\x18FICHIER GUITAR PRO v2.21', 'latin1')])
check('GP2 e reconhecido', detectLegacyGuitarPro(gp2Header)?.format === 'gp2')

console.log('\n=== 2. o arquivo feito a mao, lido e convertido ===')
const song = readLegacyGuitarPro(handmade)
check('titulo e artista', song.title === 'Musica Antiga' && song.artist === 'Banda de Teste', `${song.title} / ${song.artist}`)
check('tempo', song.tempo === 96)
check('oito trilhas no arquivo, como o GP1.04 guarda', song.tracks.length === 8)

const score = reopen(convertLegacyGuitarPro(handmade).gp)
check('abre no alphaTab depois de convertido', score.masterBars.length === 2)
check('so as trilhas que tocam', score.tracks.map((t) => t.name).join() === 'Guitarra,Baixo', score.tracks.map((t) => t.name).join())
check('tempo sobrevive', score.tempo === 96, String(score.tempo))
const guitar = score.tracks[0].staves[0]
const bass = score.tracks[1].staves[0]
check('afinacao da guitarra', guitar.tuning.join() === E_STANDARD.join(), guitar.tuning.join())
check('afinacao do baixo, 6 cordas como o arquivo declara', bass.tuning.slice(0, 4).join() === BASS.slice(0, 4).join(), bass.tuning.join())
check('programa MIDI', score.tracks[0].playbackInfo.program === 29 && score.tracks[1].playbackInfo.program === 33)

const beats1 = guitar.bars[0].voices[0].beats
// alphaTab counts strings from the lowest: bit 0 (lowest) → string 1
check('acorde nas cordas certas', noteList(beats1[0]) === '1:0 2:2 3:2', noteList(beats1[0]))
check('texto no tempo', beats1[0].text === 'Intro')
check('hammer-on na nota marcada', beats1[0].notes.find((n) => n.string === 2)?.isHammerPullOrigin === true)
check('ligadura repete as notas ligadas', beats1[1].notes.length === 3 && beats1[1].notes.every((n) => n.isTieDestination))
check('pausa', beats1[2].isRest)
check('corda mais aguda e a 6', noteList(beats1[3]) === '6:12', noteList(beats1[3]))
check('duracao colcheia', beats1[3].duration === alphaTab.model.Duration.Eighth)
check('pontuada', beats1[4].dots === 1 && beats1[4].duration === alphaTab.model.Duration.Quarter)
check('nota abafada', beats1[5].notes[0]?.isDead === true)

const beats2 = guitar.bars[1].voices[0].beats
check('tercina', beats2.slice(0, 3).every((b) => b.tupletNumerator === 3 && b.tupletDenominator === 2))
check('slide', beats2[3].notes[0]?.slideOutType === alphaTab.model.SlideOutType.Shift)
check('minima', beats2[3].duration === alphaTab.model.Duration.Half)
check('repeticao abre e fecha (toca 2 vezes)', score.masterBars[1].isRepeatStart && score.masterBars[1].repeatCount === 2, String(score.masterBars[1].repeatCount))
check('baixo em semibreve', bass.bars[0].voices[0].beats[0].duration === alphaTab.model.Duration.Whole)
check('compasso vazio do baixo continua sendo compasso', bass.bars[1].voices[0].beats.length >= 1)

console.log('\n=== 3. conversao no import: uma vez, sempre a mesma copia ===')
const dir = mkdtempSync(join(tmpdir(), 'guitarlab-legacygp-'))
try {
  const old = join(dir, 'musica-antiga.gtp')
  writeFileSync(old, handmade)
  const first = readableGuitarProPath(old)
  check('le pela copia convertida', first === convertedPathFor(old) && existsSync(first), first)
  check('nome ao lado do original', first.endsWith('musica-antiga (convertido).gp'))
  const stamp = statSync(first).mtimeMs
  check('segunda vez reaproveita a copia', readableGuitarProPath(old) === first && statSync(first).mtimeMs === stamp)
  check('o original fica onde estava', existsSync(old))
  const modern = join(dir, 'moderno.gtp')
  writeFileSync(modern, gp5Header)
  check('.gtp moderno e lido direto, sem copia', readableGuitarProPath(modern) === modern && !existsSync(convertedPathFor(modern)))
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('\n=== 4. um GP1 de verdade, se estiver na biblioteca ===')
const library = join(process.cwd(), 'gptabs')
const real = existsSync(library)
  ? readdirSync(library).find((f) => {
      if (!/\.gtp$/i.test(f)) return false
      return detectLegacyGuitarPro(new Uint8Array(readFileSync(join(library, f)).subarray(0, 64))) !== null
    })
  : undefined
if (!real) {
  console.log('  pula -- nenhum .gtp Guitar Pro 1/2 em gptabs/')
} else {
  const bytes = new Uint8Array(readFileSync(join(library, real)))
  const parsed = readLegacyGuitarPro(bytes)
  const converted = reopen(convertLegacyGuitarPro(bytes).gp)
  const notesIn = (i: number): number =>
    parsed.bars.reduce((n, b) => n + (b.beats[i] ?? []).reduce((m, x) => m + x.notes.length, 0), 0)
  const kept = parsed.tracks.map((_, i) => i).filter((i) => notesIn(i) > 0)
  const notesOut = converted.tracks.map((t) =>
    t.staves[0].bars.reduce((n, b) => n + b.voices[0].beats.reduce((m, x) => m + x.notes.length, 0), 0)
  )
  console.log(`   ${real}: ${parsed.title} — ${converted.tracks.map((t) => t.name).join(', ')}`)
  check('abre depois de convertido', converted.masterBars.length === parsed.bars.length)
  check('nenhuma nota se perde', kept.map(notesIn).join() === notesOut.join(), `${kept.map(notesIn).join()} vs ${notesOut.join()}`)
}

console.log(`\n${failures === 0 ? 'GUITAR PRO ANTIGO OK' : `${failures} VERIFICACAO(OES) FALHARAM`}`)
process.exit(failures === 0 ? 0 : 1)
