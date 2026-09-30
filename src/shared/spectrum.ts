/**
 * Tone matching by long-term average spectrum.
 *
 * The question it answers: where, in frequency, does the player's sound differ
 * from the guitar on the record? Both signals — the isolated guitar stem and
 * what comes out of the GT-1 — are cut into overlapping frames, each frame's
 * power spectrum is summed into sixth-octave bands, and the frames where the
 * guitar is actually playing are averaged. Level is taken out of the
 * comparison (one curve is shifted so the two agree on average between 100 Hz
 * and 5 kHz), so what is left is tonal balance, which is what an EQ fixes.
 *
 * From the difference it fits the GT-1's own EQs: the seven-band GRAPHIC EQ by
 * least squares, and an approximate MASTER EQ (two shelves and one bell). Pure
 * maths, no DOM and no Node, so the renderer runs it on live audio and the
 * test script runs it on synthetic signals.
 *
 * What it cannot do: a Demucs stem carries bleed and artefacts, the record was
 * mixed and mastered, and a spectrum says nothing about feel. The fit is where
 * to put the EQ knobs, not a promise the result will sound identical.
 */

/** 16384 samples: about 2.9 Hz per bin at 48 kHz, enough to resolve 50 Hz bands. */
export const FFT_SIZE = 16384
/** Half-overlapping frames. */
export const HOP_SIZE = FFT_SIZE / 2

/* ------------------------------------------------------------------ FFT */

interface FftTables {
  cos: Float64Array
  sin: Float64Array
  rev: Uint32Array
  window: Float64Array
}

const tableCache = new Map<number, FftTables>()

function tablesFor(n: number): FftTables {
  const cached = tableCache.get(n)
  if (cached) return cached
  const bits = Math.log2(n)
  if (!Number.isInteger(bits)) throw new Error(`FFT de tamanho ${n}: precisa ser potência de 2`)
  const cos = new Float64Array(n / 2)
  const sin = new Float64Array(n / 2)
  for (let k = 0; k < n / 2; k++) {
    cos[k] = Math.cos((2 * Math.PI * k) / n)
    sin[k] = Math.sin((2 * Math.PI * k) / n)
  }
  const rev = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    let r = 0
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b)
    rev[i] = r
  }
  // Hann: low leakage, and the same window on both sides keeps them comparable
  const window = new Float64Array(n)
  for (let i = 0; i < n; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
  const tables = { cos, sin, rev, window }
  tableCache.set(n, tables)
  return tables
}

/** In-place iterative radix-2 FFT. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  const { cos, sin, rev } = tablesFor(n)
  for (let i = 0; i < n; i++) {
    const j = rev[i]
    if (j > i) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
      const ti = im[i]
      im[i] = im[j]
      im[j] = ti
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    const step = n / size
    for (let start = 0; start < n; start += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const a = start + j
        const b = a + half
        const tre = re[b] * cos[k] + im[b] * sin[k]
        const tim = im[b] * cos[k] - re[b] * sin[k]
        re[b] = re[a] - tre
        im[b] = im[a] - tim
        re[a] += tre
        im[a] += tim
      }
    }
  }
}

/* ---------------------------------------------------------------- bands */

export interface BandLayout {
  centers: number[]
  lo: number[]
  hi: number[]
}

/** Sixth-octave bands from about 50 Hz to 12.7 kHz, centred on 1 kHz. */
export function sixthOctaveBands(fMin = 50, fMax = 12500): BandLayout {
  const centers: number[] = []
  const first = Math.round(6 * Math.log2(fMin / 1000))
  const last = Math.round(6 * Math.log2(fMax / 1000))
  for (let k = first; k <= last; k++) centers.push(1000 * 2 ** (k / 6))
  return {
    centers,
    lo: centers.map((c) => c * 2 ** (-1 / 12)),
    hi: centers.map((c) => c * 2 ** (1 / 12))
  }
}

export const DEFAULT_BANDS = sixthOctaveBands()

/**
 * The bands to measure a recording with so it reads as if it had been
 * transposed by `semitones` — for a stem that came out in another key than the
 * one the player tunes to.
 *
 * Transposing by a ratio r moves the energy at f to r·f, so what would land in
 * a band [lo, hi] after the shift sits in [lo/r, hi/r] now. Measuring there
 * gives the transposed spectrum with no resampling and none of a pitch
 * shifter's artefacts; the power per bin changes by the same factor in every
 * band, and the level matching in the comparison takes that out. Summarise the
 * frames with the untransposed layout: those are the bands they now stand for.
 */
export function transposedBands(semitones: number, layout: BandLayout = DEFAULT_BANDS): BandLayout {
  if (!semitones) return layout
  const back = 2 ** (-semitones / 12)
  return {
    centers: layout.centers.map((f) => f * back),
    lo: layout.lo.map((f) => f * back),
    hi: layout.hi.map((f) => f * back)
  }
}

/** Which FFT bins fall in each band, for one sample rate. */
function binRanges(layout: BandLayout, sampleRate: number, n: number): Array<[number, number]> {
  const binHz = sampleRate / n
  const maxBin = n / 2
  return layout.centers.map((c, i) => {
    let start = Math.ceil(layout.lo[i] / binHz)
    let end = Math.min(maxBin, Math.ceil(layout.hi[i] / binHz))
    // a band narrower than a bin still gets the bin nearest its centre
    if (end <= start) {
      start = Math.min(maxBin - 1, Math.round(c / binHz))
      end = start + 1
    }
    return [start, end]
  })
}

/* ---------------------------------------------------------------- frames */

export interface FrameStats {
  /** Linear RMS of the frame, before windowing. */
  rms: number
  /** Mean power per bin in each band. */
  bands: Float64Array
}

/**
 * Stateful frame analyser for one sample rate: reuses its buffers, so a live
 * capture does not allocate 16k-sample arrays several times a second.
 */
export class FrameAnalyzer {
  private readonly re = new Float64Array(FFT_SIZE)
  private readonly im = new Float64Array(FFT_SIZE)
  private readonly ranges: Array<[number, number]>

  constructor(
    readonly sampleRate: number,
    readonly layout: BandLayout = DEFAULT_BANDS
  ) {
    this.ranges = binRanges(layout, sampleRate, FFT_SIZE)
  }

  /** `samples` holds FFT_SIZE samples from `offset` on; missing ones count as silence. */
  analyze(samples: Float32Array, offset = 0): FrameStats {
    const { window } = tablesFor(FFT_SIZE)
    const { re, im } = this
    let sum = 0
    for (let i = 0; i < FFT_SIZE; i++) {
      const v = samples[offset + i] ?? 0
      sum += v * v
      re[i] = v * window[i]
      im[i] = 0
    }
    fft(re, im)
    const bands = new Float64Array(this.ranges.length)
    for (let b = 0; b < this.ranges.length; b++) {
      const [start, end] = this.ranges[b]
      let acc = 0
      for (let k = start; k < end; k++) acc += re[k] * re[k] + im[k] * im[k]
      bands[b] = acc / (end - start)
    }
    return { rms: Math.sqrt(sum / FFT_SIZE), bands }
  }
}

/** Mix channels down to one, for a stereo stem. */
export function downmix(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]
  const out = new Float32Array(channels[0].length)
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length
  return out
}

/**
 * Every frame of a stretch of audio, handing control back to the caller every
 * few frames so a long stem does not freeze the screen while it is analysed.
 */
export async function analyzeRange(
  samples: Float32Array,
  sampleRate: number,
  startSec: number,
  endSec: number,
  onProgress?: (fraction: number) => void,
  layout: BandLayout = DEFAULT_BANDS
): Promise<FrameStats[]> {
  const analyzer = new FrameAnalyzer(sampleRate, layout)
  const first = Math.max(0, Math.floor(startSec * sampleRate))
  const last = Math.min(samples.length, Math.floor(endSec * sampleRate))
  const frames: FrameStats[] = []
  const total = Math.max(1, Math.floor((last - first - FFT_SIZE) / HOP_SIZE) + 1)
  let count = 0
  for (let at = first; at + FFT_SIZE <= last; at += HOP_SIZE) {
    frames.push(analyzer.analyze(samples, at))
    if (++count % 24 === 0) {
      onProgress?.(count / total)
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  onProgress?.(1)
  return frames
}

/* -------------------------------------------------------------- profile */

export interface SpectrumProfile {
  centers: number[]
  /** Average power per band, in dB (absolute, before any normalisation). */
  db: number[]
  /** Frames that passed the gate, and how long they add up to. */
  frames: number
  seconds: number
  /** RMS level of the kept frames, dBFS. */
  levelDb: number
  /** The level a frame had to reach to count, dBFS. */
  gateDb: number
}

const toDb = (power: number): number => 10 * Math.log10(power + 1e-20)

/** Below this a frame is digital silence, not quiet playing. */
const SILENCE_DB = -90

/**
 * Average the frames where the guitar is playing.
 *
 * The gate sits 30 dB under the loudest 5% of frames: silence between phrases
 * and the stem's bleed-only stretches would otherwise pull the average toward
 * the noise floor, which says nothing about the tone. The absolute floor is
 * only there to drop digital silence — a separation that left the guitar at
 * −70 dBFS is still a guitar, and saying "too quiet" is the caller's job.
 */
export function summarize(
  frames: FrameStats[],
  sampleRate: number,
  layout: BandLayout = DEFAULT_BANDS
): SpectrumProfile | null {
  if (!frames.length) return null
  const levels = frames.map((f) => 20 * Math.log10(f.rms + 1e-12))
  const sorted = [...levels].sort((a, b) => a - b)
  const p95 = sorted[Math.floor(0.95 * (sorted.length - 1))]
  const gate = Math.max(SILENCE_DB, p95 - 30)
  const kept = frames.filter((_, i) => levels[i] >= gate)
  if (kept.length < 3) return null

  const sums = new Float64Array(layout.centers.length)
  let energy = 0
  for (const f of kept) {
    for (let b = 0; b < sums.length; b++) sums[b] += f.bands[b]
    energy += f.rms * f.rms
  }
  return {
    centers: layout.centers,
    db: Array.from(sums, (s) => toDb(s / kept.length)),
    frames: kept.length,
    seconds: (kept.length * HOP_SIZE) / sampleRate,
    levelDb: toDb(energy / kept.length),
    gateDb: gate
  }
}

/* ----------------------------------------------------------- comparison */

/** Shift a curve so its mean between `lo` and `hi` Hz is 0 dB. */
export function relative(db: number[], centers: number[], lo = 100, hi = 5000): number[] {
  const inside = db.filter((_, i) => centers[i] >= lo && centers[i] <= hi)
  const mean = inside.reduce((a, b) => a + b, 0) / Math.max(1, inside.length)
  return db.map((v) => v - mean)
}

function smooth(values: number[]): number[] {
  return values.map((v, i) => {
    const a = values[i - 1] ?? v
    const b = values[i + 1] ?? v
    return (a + 2 * v + b) / 4
  })
}

export interface Comparison {
  centers: number[]
  /** Both curves normalised to the same average level, dB. */
  reference: number[]
  yours: number[]
  /** Reference minus yours, lightly smoothed: positive means the record has more there. */
  diff: number[]
  /** RMS of the difference between 80 Hz and 8 kHz — the number to drive down. */
  distance: number
}

/** The widest a single band's difference is allowed to pull the fit. */
const DIFF_LIMIT = 18

export function compareProfiles(reference: SpectrumProfile, yours: SpectrumProfile): Comparison {
  const { centers } = reference
  const ref = relative(reference.db, centers)
  const you = relative(yours.db, centers)
  const raw = ref.map((r, i) => Math.max(-DIFF_LIMIT, Math.min(DIFF_LIMIT, r - you[i])))
  const inRange = raw.filter((_, i) => centers[i] >= 80 && centers[i] <= 8000)
  const distance = Math.sqrt(inRange.reduce((a, d) => a + d * d, 0) / Math.max(1, inRange.length))
  return { centers, reference: ref, yours: you, diff: smooth(raw), distance }
}

/** Mean of the difference over a frequency range, for the "where it differs" hints. */
export function regionDiff(cmp: Comparison, lo: number, hi: number): number {
  const inside = cmp.diff.filter((_, i) => cmp.centers[i] >= lo && cmp.centers[i] < hi)
  return inside.reduce((a, b) => a + b, 0) / Math.max(1, inside.length)
}

/* ------------------------------------------------------------ EQ fitting */

/** Solve a small symmetric system by Gaussian elimination with partial pivoting. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length
  const m = a.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
    ;[m[col], m[pivot]] = [m[pivot], m[col]]
    const p = m[col][col] || 1e-12
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = m[r][col] / p
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c]
    }
  }
  return m.map((row, i) => row[n] / (row[i] || 1e-12))
}

/** Least squares with a little ridge, so neighbouring bands do not fight each other. */
function leastSquares(shapes: number[][], target: number[], ridge: number): number[] {
  const k = shapes.length
  const ata = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => {
      let s = 0
      for (let x = 0; x < target.length; x++) s += shapes[i][x] * shapes[j][x]
      return s + (i === j ? ridge : 0)
    })
  )
  const atb = shapes.map((row) => row.reduce((s, v, x) => s + v * target[x], 0))
  return solve(ata, atb)
}

/** A bell on a log-frequency axis; `sigma` in octaves. */
function bell(centers: number[], freq: number, sigma: number): number[] {
  return centers.map((f) => Math.exp(-0.5 * (Math.log2(f / freq) / sigma) ** 2))
}

/** Bandwidth in octaves of a peaking filter with this Q, as a Gaussian's sigma. */
function sigmaForQ(q: number): number {
  const octaves = (2 * Math.asinh(1 / (2 * q))) / Math.LN2
  return octaves / 2.355
}

const clampDb = (v: number): number => Math.max(-20, Math.min(20, Math.round(v)))

function residualRms(target: number[], curve: number[], mask: boolean[]): number {
  let s = 0
  let n = 0
  for (let i = 0; i < target.length; i++) {
    if (!mask[i]) continue
    s += (target[i] - curve[i]) ** 2
    n++
  }
  return Math.sqrt(s / Math.max(1, n))
}

export interface GraphicEqFit {
  bands: Array<{ freq: number; gain: number }>
  /** GEQ LEVEL that keeps the patch at the same loudness after the boosts and cuts. */
  level: number
  /** The rounded EQ's response at every analysis band, dB. */
  curve: number[]
  /** What is left of the difference after the EQ, RMS dB. */
  residual: number
}

/**
 * Fit the GRAPHIC EQ's seven octave bands to the difference.
 *
 * Each band is modelled as a bell half an octave wide either side, which is
 * close to how a one-octave graphic EQ band overlaps its neighbours. The gains
 * come out in whole dB, the step the editor moves in, clamped to ±20.
 */
export function fitGraphicEq(
  cmp: Comparison,
  yours: SpectrumProfile | null,
  bandFreqs: readonly number[]
): GraphicEqFit {
  const mask = cmp.centers.map((f) => f >= 70 && f <= 9000)
  const target = cmp.diff.map((d, i) => (mask[i] ? d : 0))
  const shapes = bandFreqs.map((f) => bell(cmp.centers, f, 0.45).map((v, i) => (mask[i] ? v : 0)))
  const gains = leastSquares(shapes, target, 0.15).map(clampDb)

  const full = bandFreqs.map((f) => bell(cmp.centers, f, 0.45))
  const curve = cmp.centers.map((_, i) => gains.reduce((s, g, k) => s + g * full[k][i], 0))

  // loudness change the EQ causes on the player's own spectrum, undone by LEVEL
  let level = 0
  if (yours) {
    let before = 0
    let after = 0
    for (let i = 0; i < yours.db.length; i++) {
      const p = 10 ** (yours.db[i] / 10)
      before += p
      after += p * 10 ** (curve[i] / 10)
    }
    level = clampDb(-10 * Math.log10(after / before))
  }

  return {
    bands: bandFreqs.map((freq, k) => ({ freq, gain: gains[k] })),
    level,
    curve,
    residual: residualRms(cmp.diff, curve, mask)
  }
}

export interface MasterEqFit {
  low: number
  high: number
  mid: { freq: number; q: number; gain: number }
  curve: number[]
  residual: number
}

/**
 * Fit the MASTER EQ: a low shelf, a high shelf and one mid bell.
 *
 * The Parameter Guide does not give the shelves' corner frequencies, so they
 * are modelled around 120 Hz and 6 kHz — close enough to point the knobs the
 * right way, which is why the screen calls this one approximate. The bell is
 * searched over the unit's real MID FREQ steps and Q values.
 */
export function fitMasterEq(
  cmp: Comparison,
  midFreqs: readonly number[],
  qs: readonly number[] = [0.5, 1, 2, 4]
): MasterEqFit {
  const mask = cmp.centers.map((f) => f >= 60 && f <= 10000)
  const target = cmp.diff.map((d, i) => (mask[i] ? d : 0))
  const lowShelf = cmp.centers.map((f) => 1 / (1 + Math.exp(Math.log2(f / 120) / 0.35)))
  const highShelf = cmp.centers.map((f) => 1 / (1 + Math.exp(-Math.log2(f / 6000) / 0.35)))
  const masked = (v: number[]): number[] => v.map((x, i) => (mask[i] ? x : 0))

  let best: MasterEqFit | null = null
  for (const freq of midFreqs.filter((f) => f >= 100 && f <= 6300)) {
    for (const q of qs) {
      const mid = bell(cmp.centers, freq, sigmaForQ(q))
      const [low, high, gain] = leastSquares(
        [masked(lowShelf), masked(highShelf), masked(mid)],
        target,
        0.15
      ).map(clampDb)
      const curve = cmp.centers.map((_, i) => low * lowShelf[i] + high * highShelf[i] + gain * mid[i])
      const residual = residualRms(cmp.diff, curve, mask)
      if (!best || residual < best.residual - 1e-9) {
        best = { low, high, mid: { freq, q, gain }, curve, residual }
      }
    }
  }
  return (
    best ?? {
      low: 0,
      high: 0,
      mid: { freq: 1000, q: 1, gain: 0 },
      curve: cmp.centers.map(() => 0),
      residual: 0
    }
  )
}
