import * as alphaTab from '@coderline/alphatab'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

/**
 * Guitar Pro 1 and 2, the `.gtp` files from the late nineties.
 *
 * alphaTab — which both parses tabs for the importer and draws them in the
 * renderer — reads Guitar Pro 3 onwards and nothing older. Renaming does not
 * help: it picks the reader by the file's header, not its extension, and a
 * `.gtp` holding GP4 or GP5 data already opens as it is. What is left are the
 * files that really are GP1/GP2, and plenty of them still circulate on tab
 * sites under their original upload.
 *
 * So those are converted once, on import: this reads the old binary layout
 * into a plain model, builds an alphaTab score from it, and writes a modern
 * `.gp` next to the original, which is what gets imported and played. The
 * original stays where it was.
 *
 * The layout follows what TuxGuitar's GP1/GP2 readers document about these
 * formats; the code is this app's own. What the old formats cannot say is not
 * invented: they have one voice per track, six strings at most per note mask,
 * and a handful of effects (hammer, slide, bend, vibrato, harmonics, tap, slap,
 * pop, fade-in), and that is what comes across.
 */

/* ------------------------------------------------------------------ model */

export interface LegacyNote {
  /** 1 = the highest string, as the old formats count them. */
  string: number
  fret: number
  dead: boolean
  tied: boolean
  hammer: boolean
  slide: boolean
  /** Bend height in semitones, 0 for none. */
  bend: number
}

export interface LegacyBeat {
  /** 1 = whole, 2 = half, 4 = quarter, 8, 16, 32, 64. */
  duration: number
  dotted: boolean
  triplet: boolean
  rest: boolean
  notes: LegacyNote[]
  text: string | null
  chord: { name: string; firstFret: number; frets: number[] } | null
  vibrato: boolean
  fadeIn: boolean
  tap: boolean
  slap: boolean
  pop: boolean
  harmonic: 'natural' | 'artificial' | null
  /** A tempo change starting at this beat (GP2 only). */
  tempo: number | null
}

export interface LegacyBar {
  numerator: number
  denominator: number
  repeatOpen: boolean
  /** Extra times the section plays; 0 when the bar closes no repeat. */
  repeatClose: number
  /** Which alternate ending(s) this bar is, as a bitmask (bit 0 = first). */
  alternateEndings: number
  /** One list of beats per track. */
  beats: LegacyBeat[][]
}

export interface LegacyTrack {
  name: string
  program: number
  /** MIDI note per string, highest string first. */
  tuning: number[]
  primaryChannel: number
  secondaryChannel: number
}

export interface LegacySong {
  format: 'gp1' | 'gp2'
  version: string
  title: string
  artist: string
  tempo: number
  tripletFeel: boolean
  tracks: LegacyTrack[]
  bars: LegacyBar[]
}

/* ------------------------------------------------------------------ reader */

const VERSIONS: Record<string, { format: 'gp1' | 'gp2'; code: number }> = {
  'FICHIER GUITARE PRO v1': { format: 'gp1', code: 0 },
  'FICHIER GUITARE PRO v1.01': { format: 'gp1', code: 1 },
  'FICHIER GUITARE PRO v1.02': { format: 'gp1', code: 2 },
  'FICHIER GUITARE PRO v1.03': { format: 'gp1', code: 3 },
  'FICHIER GUITARE PRO v1.04': { format: 'gp1', code: 4 },
  'FICHIER GUITAR PRO v2.20': { format: 'gp2', code: 0 },
  'FICHIER GUITAR PRO v2.21': { format: 'gp2', code: 1 }
}

/** MIDI channels per track slot: the old formats fix them, track 8 on 9 (drums). */
const CHANNELS: Array<[number, number]> = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [8, 10],
  [11, 12],
  [13, 14],
  [9, 9]
]

/** Latin text in the author's code page, like every Guitar Pro before 6. */
const decoder = new TextDecoder('windows-1252')

class Reader {
  private pos = 0
  constructor(private readonly bytes: Uint8Array) {}

  private need(n: number): void {
    if (this.pos + n > this.bytes.length) {
      throw new Error(`arquivo Guitar Pro antigo truncado (byte ${this.pos} de ${this.bytes.length})`)
    }
  }

  u8(): number {
    this.need(1)
    return this.bytes[this.pos++]
  }

  i8(): number {
    const v = this.u8()
    return v > 127 ? v - 256 : v
  }

  i32(): number {
    this.need(4)
    const b = this.bytes
    const p = this.pos
    this.pos += 4
    return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) | 0
  }

  skip(n: number): void {
    this.need(n)
    this.pos += n
  }

  /** `len` bytes of text out of a field `size` bytes wide (0 = exactly `len`). */
  private text(size: number, len: number): string {
    const width = size > 0 ? size : len
    this.need(width)
    const used = Math.max(0, Math.min(len, width))
    const s = decoder.decode(this.bytes.subarray(this.pos, this.pos + used))
    this.pos += width
    return s.replace(/\0+$/, '').trim()
  }

  /** A length byte, then the text in a field of fixed width. */
  byteString(size: number): string {
    return this.text(size, this.u8())
  }

  /** A field-width byte, then a length byte, then the text. */
  sizedString(): string {
    return this.byteString(this.u8() - 1)
  }
}

/** Which old format a file is, from its header; null for anything else. */
export function detectLegacyGuitarPro(bytes: Uint8Array): { format: 'gp1' | 'gp2'; code: number; version: string } | null {
  if (bytes.length < 31) return null
  const len = bytes[0]
  if (len < 1 || len > 30) return null
  const version = decoder.decode(bytes.subarray(1, 1 + len))
  const known = VERSIONS[version]
  return known ? { ...known, version } : null
}

function durationFrom(code: number): number {
  // -2 whole, -1 half, 0 quarter, 1 eighth… as a power of two
  const value = 2 ** (code + 2)
  return Math.min(64, Math.max(1, value))
}

/** A bend's height: the old formats store it in eighths, offset by 26 semitones. */
function readBend(r: Reader): number {
  r.skip(6)
  const semitones = Math.max(r.u8() / 8 - 26, 1)
  r.skip(1)
  return semitones
}

/** Turn a stored "ending number" into the bit of the endings not used yet since the repeat opened. */
function endingBits(bars: LegacyBar[], value: number): number {
  let used = 0
  for (let i = bars.length - 1; i >= 0; i--) {
    used |= bars[i].alternateEndings
    if (bars[i].repeatOpen) break
  }
  let bits = 0
  for (let i = 0; i < 8; i++) if (value > i && (used & (1 << i)) === 0) bits |= 1 << i
  return bits
}

export function readLegacyGuitarPro(bytes: Uint8Array): LegacySong {
  const detected = detectLegacyGuitarPro(bytes)
  if (!detected) throw new Error('não é um arquivo Guitar Pro 1 ou 2')
  const { format, code, version } = detected
  const gp2 = format === 'gp2'
  // GP1.03 onwards (and GP2) carry eight tracks with names and mixer settings
  const rich = gp2 || code > 2

  const r = new Reader(bytes)
  r.skip(31) // version string, one length byte and a 30-byte field

  const title = r.sizedString()
  const artist = r.sizedString()
  r.sizedString() // notice

  const tempo = r.i32()
  const tripletFeel = r.i32() === 1
  if (rich) r.i32() // key signature

  const trackCount = rich ? 8 : 1
  const tunings: number[][] = []
  for (let t = 0; t < trackCount; t++) {
    const strings = gp2 || code > 1 ? r.i32() : 6
    const tuning: number[] = []
    for (let s = 0; s < strings; s++) tuning.push(r.i32())
    tunings.push(tuning)
  }

  const barCount = r.i32()

  const tracks: LegacyTrack[] = []
  for (let t = 0; t < trackCount; t++) {
    const program = r.i32()
    let name = `Trilha ${t + 1}`
    if (rich) {
      r.i32() // frets
      name = r.sizedString() || name
      r.skip(1) // solo
      r.skip(4 * 5) // volume, balance, chorus, reverb, capo offset
    }
    tracks.push({
      name,
      program,
      tuning: tunings[t],
      primaryChannel: CHANNELS[t][0],
      secondaryChannel: CHANNELS[t][1]
    })
  }
  if (rich) r.skip(10)

  const bars: LegacyBar[] = []
  // the last beat of each track, where a tie picks its notes from
  const lastBeat: Array<LegacyBeat | null> = new Array(trackCount).fill(null)

  for (let b = 0; b < barCount; b++) {
    const numerator = r.u8()
    const denominator = r.u8()
    r.skip(6)
    const beatCounts: number[] = []
    for (let t = 0; t < trackCount; t++) {
      r.skip(2)
      const count = r.u8()
      beatCounts.push(count > 127 ? 0 : count)
      r.skip(9)
    }
    r.skip(2)
    const flags = r.u8()
    const bar: LegacyBar = {
      numerator: numerator || 4,
      denominator: denominator || 4,
      repeatOpen: (flags & 0x01) !== 0,
      repeatClose: (flags & 0x02) !== 0 ? r.u8() : 0,
      alternateEndings: 0,
      beats: []
    }
    if ((flags & 0x04) !== 0) bar.alternateEndings = endingBits(bars, r.u8())

    for (let t = 0; t < trackCount; t++) {
      const trackBeats: LegacyBeat[] = []
      const stringCount = tracks[t].tuning.length
      for (let i = 0; i < beatCounts[t]; i++) {
        const beat = readBeat(r, gp2, code, stringCount, lastBeat[t])
        trackBeats.push(beat)
        lastBeat[t] = beat
      }
      bar.beats.push(trackBeats)
    }
    bars.push(bar)
  }

  return { format, version, title, artist, tempo: tempo > 0 ? tempo : 120, tripletFeel, tracks, bars }
}

function readBeat(
  r: Reader,
  gp2: boolean,
  code: number,
  stringCount: number,
  previous: LegacyBeat | null
): LegacyBeat {
  r.i32() // position, recomputed from the durations
  const beat: LegacyBeat = {
    duration: durationFrom(r.i8()),
    dotted: false,
    triplet: false,
    rest: false,
    notes: [],
    text: null,
    chord: null,
    vibrato: false,
    fadeIn: false,
    tap: false,
    slap: false,
    pop: false,
    harmonic: null,
    tempo: null
  }

  const flags = r.u8()
  if (gp2) {
    const more = r.u8()
    if ((more & 0x02) !== 0) beat.tempo = readMixChange(r)
    if ((more & 0x01) !== 0) r.skip(2) // stroke type and speed
  }

  beat.dotted = (flags & 0x10) !== 0
  if ((flags & 0x20) !== 0) {
    beat.triplet = true
    r.skip(1)
  }

  let beatBend = 0
  if ((flags & 0x04) !== 0) {
    const effect = r.u8()
    beat.vibrato = effect === 1 || effect === 2
    beat.fadeIn = effect === 4
    beat.tap = effect === 5
    beat.slap = effect === 6
    beat.pop = effect === 7
    if (effect === 3) beatBend = readBend(r)
    if (effect === 8) beat.harmonic = 'natural'
    if (effect === 9) beat.harmonic = 'artificial'
  }

  if ((flags & 0x02) !== 0) {
    if (gp2 || code > 3) {
      const name = r.byteString(0)
      r.skip(1)
      if (r.i32() < 12) r.skip(32)
      const firstFret = r.i32()
      const frets: number[] = []
      if (firstFret !== 0) for (let i = 0; i < 6; i++) frets.push(r.i32())
      beat.chord = { name, firstFret, frets: frets.slice(0, stringCount) }
    } else {
      const name = r.sizedString()
      beat.chord = name ? { name, firstFret: 0, frets: [] } : null
    }
  }

  if ((flags & 0x01) !== 0) beat.text = r.byteString(0) || null

  if ((flags & 0x40) !== 0) {
    // a tie: the same notes as the beat before, held
    for (const n of previous?.notes ?? []) {
      beat.notes.push({ ...n, tied: true, hammer: false, slide: false, bend: 0 })
    }
    beat.rest = beat.notes.length === 0
  } else if ((flags & 0x08) !== 0) {
    beat.rest = true
  } else {
    const played = r.u8()
    const withEffects = r.u8()
    const grace = gp2 ? r.u8() : 0
    for (let i = 5; i >= 0; i--) {
      if ((played & (1 << i)) === 0) continue
      const fret = r.u8()
      if (gp2) r.skip(1) // dynamic
      const note: LegacyNote = {
        string: stringCount - i,
        fret: fret < 100 ? fret : 0,
        dead: fret >= 100,
        tied: false,
        hammer: false,
        slide: false,
        bend: beatBend
      }
      if ((withEffects & (1 << i)) !== 0) {
        const effect = r.u8()
        note.hammer = effect === 1 || effect === 2
        note.slide = effect === 3 || effect === 4
        if (effect === 5 || effect === 6) note.bend = readBend(r)
      }
      if ((grace & (1 << i)) !== 0) r.skip(3)
      // a mask bit past the strings this track has cannot be placed
      if (note.string >= 1) beat.notes.push(note)
    }
    beat.rest = beat.notes.length === 0
  }

  return beat
}

/** GP2's mixer change on a beat; only the tempo is kept. */
function readMixChange(r: Reader): number | null {
  const flags = r.u8()
  let tempo: number | null = null
  if ((flags & 0x20) !== 0) {
    tempo = r.i32()
    r.skip(1)
  }
  for (const bit of [0x10, 0x08, 0x04, 0x02]) if ((flags & bit) !== 0) r.skip(2)
  if ((flags & 0x01) !== 0) r.skip(1)
  return tempo && tempo > 0 ? tempo : null
}

/* ------------------------------------------------------------ alphaTab score */

const { model } = alphaTab

/**
 * Build an alphaTab score from the old model.
 *
 * Tracks the file reserves but never uses — GP1.03 and GP2 always carry eight
 * — are left out, so the result opens on the instruments that actually play.
 */
export function legacyToScore(song: LegacySong): alphaTab.model.Score {
  const score = new model.Score()
  score.title = song.title
  score.artist = song.artist
  // the score's tempo is read off the first bar's automation, set below

  const used = song.tracks
    .map((_, t) => t)
    .filter((t) => song.bars.some((bar) => (bar.beats[t] ?? []).some((b) => b.notes.length > 0)))
  const keep = used.length ? used : [0]

  for (const [index, bar] of song.bars.entries()) {
    const master = new model.MasterBar()
    master.timeSignatureNumerator = bar.numerator
    master.timeSignatureDenominator = bar.denominator
    master.isRepeatStart = bar.repeatOpen
    // the old formats count the extra passes; alphaTab counts every pass
    if (bar.repeatClose > 0) master.repeatCount = bar.repeatClose + 1
    master.alternateEndings = bar.alternateEndings
    if (song.tripletFeel) master.tripletFeel = model.TripletFeel.Triplet8th
    const tempo =
      index === 0
        ? song.tempo
        : (bar.beats.flat().find((b) => b.tempo !== null)?.tempo ?? null)
    if (tempo) master.tempoAutomations = [model.Automation.buildTempoAutomation(false, 0, tempo, 2)]
    score.addMasterBar(master)
  }

  let chordId = 0
  for (const t of keep) {
    const source = song.tracks[t]
    const track = new model.Track()
    track.name = source.name
    track.playbackInfo.program = source.program
    track.playbackInfo.primaryChannel = source.primaryChannel
    track.playbackInfo.secondaryChannel = source.secondaryChannel
    score.addTrack(track)

    const staff = new model.Staff()
    staff.showTablature = true
    staff.showStandardNotation = true
    staff.stringTuning = new model.Tuning('', [...source.tuning], false)
    track.addStaff(staff)

    for (const bar of song.bars) {
      const target = new model.Bar()
      staff.addBar(target)
      const voice = new model.Voice()
      target.addVoice(voice)

      const beats = bar.beats[t] ?? []
      if (!beats.length) {
        // a bar the track sits out still needs a beat to be a bar
        const rest = new model.Beat()
        rest.duration = model.Duration.Whole
        rest.isEmpty = true
        voice.addBeat(rest)
        continue
      }

      for (const b of beats) {
        const beat = new model.Beat()
        beat.duration = b.duration as alphaTab.model.Duration
        beat.dots = b.dotted ? 1 : 0
        if (b.triplet) {
          beat.tupletNumerator = 3
          beat.tupletDenominator = 2
        }
        if (b.text) beat.text = b.text
        beat.fadeIn = b.fadeIn
        beat.tap = b.tap
        beat.slap = b.slap
        beat.pop = b.pop
        if (b.chord?.name) {
          const chord = new model.Chord()
          chord.name = b.chord.name
          chord.firstFret = Math.max(1, b.chord.firstFret)
          chord.strings = b.chord.frets.length ? b.chord.frets : []
          chord.showDiagram = b.chord.frets.some((f) => f >= 0)
          const id = String(++chordId)
          staff.addChord(id, chord)
          beat.chordId = id
        }

        for (const n of b.notes) {
          const note = new model.Note()
          // alphaTab counts strings from the lowest; the old formats from the highest
          note.string = source.tuning.length - n.string + 1
          note.fret = n.fret
          note.isDead = n.dead
          note.isTieDestination = n.tied
          note.isHammerPullOrigin = n.hammer
          if (n.slide) note.slideOutType = model.SlideOutType.Shift
          if (b.vibrato) note.vibrato = model.VibratoType.Slight
          if (b.harmonic) {
            note.harmonicType =
              b.harmonic === 'natural' ? model.HarmonicType.Natural : model.HarmonicType.Artificial
          }
          if (n.bend > 0) {
            // alphaTab measures bends in quarter tones, over 60 steps
            const height = Math.round(n.bend * 2)
            note.bendType = model.BendType.Custom
            note.addBendPoint(new model.BendPoint(0, 0))
            note.addBendPoint(new model.BendPoint(30, height))
            note.addBendPoint(new model.BendPoint(60, height))
          }
          beat.addNote(note)
        }
        voice.addBeat(beat)
      }
    }
  }

  score.finish(new alphaTab.Settings())
  return score
}

/** The whole conversion: old bytes in, Guitar Pro 7 bytes out. */
export function convertLegacyGuitarPro(bytes: Uint8Array): { gp: Uint8Array; song: LegacySong } {
  const song = readLegacyGuitarPro(bytes)
  const score = legacyToScore(song)
  const gp = new alphaTab.exporter.Gp7Exporter().export(score, new alphaTab.Settings())
  return { gp, song }
}

/** Where the converted copy of an old file lives: next to it, named after it. */
export function convertedPathFor(path: string): string {
  const stem = basename(path, extname(path))
  return join(dirname(path), `${stem} (convertido).gp`)
}

/**
 * The file the importer should read for `path`.
 *
 * Anything alphaTab reads is returned as is. A GP1/GP2 file is converted once
 * and its converted copy returned from then on — the same file every scan, so
 * a folder import never files the song twice.
 */
export function readableGuitarProPath(path: string): string {
  const head = new Uint8Array(readFileSync(path).subarray(0, 64))
  if (!detectLegacyGuitarPro(head)) return path
  const target = convertedPathFor(path)
  if (!existsSync(target)) {
    const { gp } = convertLegacyGuitarPro(new Uint8Array(readFileSync(path)))
    writeFileSync(target, gp)
  }
  return target
}
