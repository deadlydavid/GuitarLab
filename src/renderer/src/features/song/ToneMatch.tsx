import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode
} from 'react'
import { NeuCard, NeuButton, NeuSelect, Badge, Spinner, cx } from '../../components/ui'
import { api } from '../../lib/api'
import type { MediaAssetView, SectionView } from '@shared/types'
import {
  FFT_SIZE,
  FrameAnalyzer,
  HOP_SIZE,
  analyzeRange,
  compareProfiles,
  downmix,
  fitGraphicEq,
  fitMasterEq,
  regionDiff,
  summarize,
  transposedBands,
  type Comparison,
  type FrameStats,
  type SpectrumProfile
} from '@shared/spectrum'
import { GT1_GEQ_BANDS, ISO_FREQS } from '@shared/gt1'
import { useStrings } from '../../lib/i18n'
import { createStretcher } from '../practice/stretcher'

/**
 * "How far is my tone from the record?", measured.
 *
 * The reference is the guitar stem the Lab separated; the other side is what
 * comes into the computer from the GT-1 — over its own USB audio, or through an
 * interface like the U-PHORIA UM2. Both are reduced to a long-term average
 * spectrum (shared/spectrum.ts) and compared with the level taken out, and the
 * difference is turned into settings for the GT-1's own EQs. The player
 * records, dials the suggestion into BOSS TONE STUDIO, records again, and the
 * distance number going down is the proof it helped.
 */

/** Series colours, validated for both CVD and the dark surface (dataviz validator). */
const REF_COLOR = '#3a8fd6'
const YOU_COLOR = '#e56a3c'

const INPUT_KEY = 'guitarlab.tonematch.inputDeviceId'
const TUNER_INPUT_KEY = 'guitarlab.tuner.inputDeviceId'
/** A capture with nothing to play along to stops itself after this long. */
const MAX_CAPTURE_S = 90
/** Per song: the stem's transposition, so a song whose stem came out in another key stays fixed. */
const pitchKey = (songId: number): string => `guitarlab.tonematch.semitones.${songId}`
const MAX_SEMITONES = 12
/** Takes kept in a sitting; the oldest drop off. */
const MAX_TAKES = 8

type PlayAlong = 'none' | 'guitar' | 'mix'
type RefSource = 'stem_guitar' | 'stem_other'

/**
 * Below this average level the "guitar" stem is mostly bleed. It happens: on
 * some records the six-stem model files the guitar under "other" (Like a Stone
 * comes out 10 dB louder there), and comparing against leftovers would fit an
 * EQ to separation artefacts.
 */
const WEAK_STEM_DB = -45

function readStored(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function formatHz(hz: number): string {
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz`
  return `${Math.round(hz)} Hz`
}

const signed = (v: number, digits = 1): string => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`
const signedInt = (v: number): string => signed(v, 0)

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** "1:23" or "83" → seconds; null when it is neither. */
function parseClock(raw: string): number | null {
  const t = raw.trim()
  const clock = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(t)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])
  const n = Number(t.replace(',', '.'))
  return t && Number.isFinite(n) && n >= 0 ? n : null
}

/* -------------------------------------------------------- spectrum chart */

const CHART_W = 760
const CHART_H = 250
const PAD = { l: 44, r: 16, t: 14, b: 28 }
const F_MIN = 50
const F_MAX = 12500
const GRID_HZ = [100, 200, 500, 1000, 2000, 5000, 10000]

function xOf(f: number): number {
  const t = Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)
  return PAD.l + t * (CHART_W - PAD.l - PAD.r)
}

/**
 * The two curves on a log-frequency axis, level-matched, with a crosshair
 * that reads out both values and the difference at the nearest band. The take
 * before this one, when there is one, is the same series dashed: the question
 * after changing the EQ is whether the solid line moved toward the blue one.
 */
function SpectrumChart({ cmp, previous }: { cmp: Comparison; previous: number[] | null }): ReactNode {
  const m = useStrings().tone.match
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const all = [...cmp.reference, ...cmp.yours, ...(previous ?? [])]
  // the axis follows the data within reason; anything past it is clipped, not drawn over the legend
  const yMax = Math.min(30, Math.ceil(Math.max(...all, 5) / 10) * 10)
  const yMin = Math.max(-50, Math.floor(Math.min(...all, -20) / 10) * 10)
  const yOf = (db: number): number =>
    PAD.t + ((yMax - db) / (yMax - yMin)) * (CHART_H - PAD.t - PAD.b)

  const path = (values: number[]): string =>
    values
      .map((v, i) => `${i === 0 ? 'M' : 'L'}${xOf(cmp.centers[i]).toFixed(1)},${yOf(v).toFixed(1)}`)
      .join(' ')

  const ticks: number[] = []
  for (let v = yMax; v >= yMin; v -= 10) ticks.push(v)

  const onMove = (e: ReactPointerEvent<SVGSVGElement>): void => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = ((e.clientX - rect.left) / rect.width) * CHART_W
    let best = 0
    for (let i = 1; i < cmp.centers.length; i++) {
      if (Math.abs(xOf(cmp.centers[i]) - x) < Math.abs(xOf(cmp.centers[best]) - x)) best = i
    }
    setHover(best)
  }

  const hx = hover === null ? 0 : xOf(cmp.centers[hover])
  const last = cmp.centers.length - 1
  // a curve that ends below the axis still gets its label inside the plot, not on the tick labels
  const labelY = (db: number): number => Math.max(PAD.t + 10, Math.min(CHART_H - PAD.b - 6, yOf(db) - 6))
  // end labels only when the lines end far enough apart to tell them apart
  const endGap = Math.abs(labelY(cmp.reference[last]) - labelY(cmp.yours[last]))

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        width="100%"
        style={{ height: 'auto', display: 'block' }}
        role="img"
        aria-label={m.chartAria}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PAD.l}
              x2={CHART_W - PAD.r}
              y1={yOf(v)}
              y2={yOf(v)}
              stroke="var(--color-edge)"
              strokeWidth={1}
            />
            <text x={PAD.l - 6} y={yOf(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--color-txt-micro)">
              {v > 0 ? `+${v}` : v} dB
            </text>
          </g>
        ))}
        {GRID_HZ.map((f) => (
          <g key={f}>
            <line
              x1={xOf(f)}
              x2={xOf(f)}
              y1={PAD.t}
              y2={CHART_H - PAD.b}
              stroke="var(--color-edge)"
              strokeWidth={1}
            />
            <text
              x={xOf(f)}
              y={CHART_H - PAD.b + 16}
              textAnchor="middle"
              fontSize={10}
              fill="var(--color-txt-micro)"
            >
              {f >= 1000 ? `${f / 1000}k` : f}
            </text>
          </g>
        ))}

        <defs>
          <clipPath id="spectrum-plot">
            <rect x={PAD.l} y={PAD.t} width={CHART_W - PAD.l - PAD.r} height={CHART_H - PAD.t - PAD.b} />
          </clipPath>
        </defs>
        <g clipPath="url(#spectrum-plot)">
          {previous && (
            <path
              d={path(previous)}
              fill="none"
              stroke={YOU_COLOR}
              strokeOpacity={0.55}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              strokeLinejoin="round"
            />
          )}
          <path d={path(cmp.reference)} fill="none" stroke={REF_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={path(cmp.yours)} fill="none" stroke={YOU_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        </g>

        {endGap >= 12 && (
          <>
            <text x={CHART_W - PAD.r - 4} y={labelY(cmp.reference[last])} textAnchor="end" fontSize={10} fill="var(--color-txt-dim)">
              {m.seriesRef}
            </text>
            <text x={CHART_W - PAD.r - 4} y={labelY(cmp.yours[last])} textAnchor="end" fontSize={10} fill="var(--color-txt-dim)">
              {m.seriesYou}
            </text>
          </>
        )}

        {hover !== null && (
          <g pointerEvents="none">
            <line x1={hx} x2={hx} y1={PAD.t} y2={CHART_H - PAD.b} stroke="var(--color-txt-micro)" strokeWidth={1} />
            {[
              { v: cmp.reference[hover], c: REF_COLOR },
              { v: cmp.yours[hover], c: YOU_COLOR }
            ].map((d) => (
              <circle key={d.c} cx={hx} cy={yOf(d.v)} r={4} fill={d.c} stroke="var(--color-raised)" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>

      {hover !== null && (
        <div
          className="neu-raised-sm pointer-events-none absolute top-2 rounded-[12px] px-3 py-2 text-[11px]"
          style={
            hx / CHART_W > 0.6
              ? { right: `${(1 - hx / CHART_W) * 100 + 2}%` }
              : { left: `${(hx / CHART_W) * 100 + 2}%` }
          }
        >
          <div className="text-txt-micro mb-1 font-semibold">{formatHz(cmp.centers[hover])}</div>
          {[
            { label: m.seriesRef, v: cmp.reference[hover], c: REF_COLOR },
            { label: m.seriesYou, v: cmp.yours[hover], c: YOU_COLOR }
          ].map((row) => (
            <div key={row.label} className="flex items-center gap-2 tabular-nums">
              <span className="inline-block h-[2px] w-3" style={{ background: row.c }} />
              <span className="text-txt font-semibold">{signed(row.v)} dB</span>
              <span className="text-txt-micro">{row.label}</span>
            </div>
          ))}
          {previous && (
            <div className="flex items-center gap-2 tabular-nums">
              <span className="inline-block w-3 border-t-2 border-dashed opacity-60" style={{ borderColor: YOU_COLOR }} />
              <span className="text-txt-dim font-semibold">{signed(previous[hover])} dB</span>
              <span className="text-txt-micro">{m.seriesPrev}</span>
            </div>
          )}
          <div className="text-txt-dim mt-1 tabular-nums">
            {m.missing}: <span className="text-txt font-semibold">{signed(cmp.diff[hover])} dB</span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- GEQ chart */

/**
 * The seven GRAPHIC EQ gains as columns from a zero line: up where the record
 * has more than you, down where you have more. The value sits on each cap
 * because these are the numbers to type into the editor.
 */
function GeqChart({ bands }: { bands: Array<{ freq: number; gain: number }> }): ReactNode {
  const m = useStrings().tone.match
  const [hover, setHover] = useState<number | null>(null)
  const W = 420
  const H = 190
  const top = 8
  const bottom = 26
  // room above and below the columns for their value labels, clear of the axis labels
  const labelRoom = 18
  const span = Math.max(6, ...bands.map((b) => Math.abs(b.gain)))
  const half = (H - top - bottom - 2 * labelRoom) / 2
  const zero = top + labelRoom + half
  const scale = half / span
  const slot = (W - 20) / bands.length
  const barW = Math.min(24, slot * 0.5)

  /** Column with a 4px rounded data end and a square foot on the zero line. */
  const column = (x: number, gain: number): string => {
    const h = Math.abs(gain) * scale
    const r = Math.min(4, h)
    if (gain >= 0) {
      const y = zero - h
      return `M${x},${zero} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${zero} Z`
    }
    const y = zero + h
    return `M${x},${zero} V${y - r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y - r} V${zero} Z`
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: 'auto', display: 'block', maxWidth: 520 }} role="img" aria-label={m.geqAria}>
      <line x1={10} x2={W - 10} y1={zero} y2={zero} stroke="var(--color-txt-micro)" strokeWidth={1} />
      {bands.map((b, i) => {
        const cx0 = 10 + slot * i + slot / 2
        const x = cx0 - barW / 2
        const labelY = b.gain >= 0 ? zero - Math.abs(b.gain) * scale - 6 : zero + Math.abs(b.gain) * scale + 13
        return (
          <g
            key={b.freq}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            tabIndex={0}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            {/* hit area wider than the column */}
            <rect x={cx0 - slot / 2} y={top - 10} width={slot} height={H - top - bottom + 20} fill="transparent" />
            {b.gain !== 0 && (
              <path
                d={column(x, b.gain)}
                fill={b.gain > 0 ? REF_COLOR : YOU_COLOR}
                opacity={hover === null || hover === i ? 1 : 0.55}
              />
            )}
            <text x={cx0} y={b.gain === 0 ? zero - 6 : labelY} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-txt)">
              {b.gain > 0 ? `+${b.gain}` : b.gain}
            </text>
            <text x={cx0} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--color-txt-micro)">
              {b.freq >= 1000 ? `${b.freq / 1000}k` : b.freq}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/* ------------------------------------------------------------------ hints */

/** The bands the "where to start" hints talk about; their words live in the catalogue. */
const REGIONS = [
  { key: 'low', lo: 60, hi: 150 },
  { key: 'lowMid', lo: 150, hi: 500 },
  { key: 'mid', lo: 500, hi: 1600 },
  { key: 'highMid', lo: 1600, hi: 4500 },
  { key: 'high', lo: 4500, hi: 10000 }
] as const

/* ------------------------------------------------------------ component */

interface RefState {
  profile: SpectrumProfile
  start: number
  end: number
  source: RefSource
  /** The transposition it was measured at. */
  semitones: number
}

/** One recording of the player: every "Gravar" makes a new one, and its own chart. */
interface Take {
  id: number
  profile: SpectrumProfile
}

function readSemitones(songId: number): number {
  const n = Number(readStored(pitchKey(songId)))
  return Number.isInteger(n) && Math.abs(n) <= MAX_SEMITONES ? n : 0
}

export function ToneMatch({
  songId,
  media,
  sections,
  durationMs
}: {
  songId: number
  media: MediaAssetView[]
  sections: SectionView[]
  durationMs: number | null
}): ReactNode {
  const m = useStrings().tone.match
  const guitarStem = media.find((x) => x.kind === 'stem_guitar') ?? null
  const otherStem = media.find((x) => x.kind === 'stem_other') ?? null
  const master = media.find((x) => x.kind === 'audio_master') ?? null
  const [refSource, setRefSource] = useState<RefSource>(guitarStem ? 'stem_guitar' : 'stem_other')
  const stem = refSource === 'stem_other' ? otherStem : guitarStem

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [deviceId, setDeviceId] = useState<string>(() => readStored(INPUT_KEY) || readStored(TUNER_INPUT_KEY))
  const [sectionKey, setSectionKey] = useState('all')
  const [startText, setStartText] = useState('0:00')
  const [endText, setEndText] = useState(durationMs ? formatClock(durationMs / 1000) : '')
  const [playAlong, setPlayAlong] = useState<PlayAlong>('guitar')
  const [semitones, setSemitones] = useState(() => readSemitones(songId))

  const [reference, setReference] = useState<RefState | null>(null)
  const [refBusy, setRefBusy] = useState<number | null>(null)
  /** Every take of this sitting, oldest first, so "is it getting closer?" has an answer. */
  const [takes, setTakes] = useState<Take[]>([])
  /** The take on the chart; null follows the newest. */
  const [shownId, setShownId] = useState<number | null>(null)
  const takeSeq = useRef(0)
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [meter, setMeter] = useState({ db: -90, clip: false })
  const [error, setError] = useState<string | null>(null)

  const changePitch = (next: number): void => {
    const value = Math.max(-MAX_SEMITONES, Math.min(MAX_SEMITONES, next))
    setSemitones(value)
    try {
      if (value) localStorage.setItem(pitchKey(songId), String(value))
      else localStorage.removeItem(pitchKey(songId))
    } catch {
      // storage refused: the transposition is just not remembered
    }
  }

  const buffers = useRef(new Map<string, AudioBuffer>())
  const decodeCtx = useRef<AudioContext | null>(null)
  const capture = useRef<{
    stream: MediaStream
    ctx: AudioContext
    timer: number
    frames: FrameStats[]
    player: AudioBufferSourceNode | null
    startedAt: number
    clipped: boolean
  } | null>(null)

  /* ---------------------------------------------------------- devices */

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const inputs = all.filter((d) => d.kind === 'audioinput')
      setDevices(inputs)
      setDeviceId((current) => (current && !inputs.some((d) => d.deviceId === current) ? '' : current))
    } catch {
      setDevices([])
    }
  }, [])

  useEffect(() => {
    void refreshDevices()
    const onChange = (): void => void refreshDevices()
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange)
  }, [refreshDevices])

  const pickDevice = (next: string): void => {
    setDeviceId(next)
    try {
      if (next) localStorage.setItem(INPUT_KEY, next)
      else localStorage.removeItem(INPUT_KEY)
    } catch {
      // storage refused: the choice is just not remembered
    }
  }

  /* ------------------------------------------------------------ range */

  /** Sections with a start time; the end falls back to the next section's start. */
  const timedSections = useMemo(() => {
    const sorted = [...sections].filter((s) => s.startMs !== null).sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0))
    return sorted.map((s, i) => ({
      key: String(s.id),
      name: s.name,
      start: (s.startMs ?? 0) / 1000,
      end: (s.endMs ?? sorted[i + 1]?.startMs ?? durationMs ?? 0) / 1000
    }))
  }, [sections, durationMs])

  const pickSection = (key: string): void => {
    setSectionKey(key)
    if (key === 'all') {
      setStartText('0:00')
      setEndText(durationMs ? formatClock(durationMs / 1000) : '')
      return
    }
    const s = timedSections.find((x) => x.key === key)
    if (!s) return
    setStartText(formatClock(s.start))
    setEndText(s.end > s.start ? formatClock(s.end) : '')
  }

  const start = parseClock(startText) ?? 0
  const endParsed = parseClock(endText)
  const songEnd = durationMs ? durationMs / 1000 : null
  // "Música inteira" with hand-typed times is a part, and is named by its times
  const handPicked =
    start > 0.5 || (endParsed !== null && songEnd !== null && Math.abs(endParsed - songEnd) > 1)
  const rangeLabel =
    sectionKey === 'all'
      ? handPicked
        ? `${formatClock(start)}–${endParsed !== null ? formatClock(endParsed) : m.end}`
        : m.wholeSongShort
      : (timedSections.find((s) => s.key === sectionKey)?.name ?? m.section)

  /* -------------------------------------------------------- decoding */

  const loadBuffer = useCallback(async (path: string): Promise<AudioBuffer> => {
    const cached = buffers.current.get(path)
    if (cached) return cached
    if (!decodeCtx.current) decodeCtx.current = new AudioContext()
    const res = await fetch(api.mediaUrl(path))
    if (!res.ok) throw new Error(m.openFailed(res.status))
    const buffer = await decodeCtx.current.decodeAudioData(await res.arrayBuffer())
    buffers.current.set(path, buffer)
    return buffer
  }, [m])

  useEffect(
    () => () => {
      stopCapture(false)
      void decodeCtx.current?.close()
      decodeCtx.current = null
      buffers.current.clear()
    },
    // teardown only: the refs hold everything it needs
    []
  )

  const analyzeReference = async (): Promise<void> => {
    if (!stem) return
    setError(null)
    setRefBusy(0)
    try {
      const buffer = await loadBuffer(stem.path)
      const end = Math.min(buffer.duration, endParsed ?? buffer.duration)
      const from = Math.min(start, Math.max(0, end - 1))
      const a = Math.floor(from * buffer.sampleRate)
      const b = Math.floor(end * buffer.sampleRate)
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
        buffer.getChannelData(c).subarray(a, b)
      )
      const mono = downmix(channels)
      // measured in shifted bands, summarised in the usual ones: the stem as if it were in the player's key
      const frames = await analyzeRange(
        mono,
        buffer.sampleRate,
        0,
        mono.length / buffer.sampleRate,
        (f) => setRefBusy(f),
        transposedBands(semitones)
      )
      const profile = summarize(frames, buffer.sampleRate)
      if (!profile) throw new Error(m.silentStem)
      setReference({ profile, start: from, end, source: refSource, semitones })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRefBusy(null)
    }
  }

  /* --------------------------------------------------------- capture */

  function stopCapture(keep: boolean): void {
    const c = capture.current
    if (!c) return
    capture.current = null
    window.clearInterval(c.timer)
    try {
      c.player?.stop()
    } catch {
      // already ended
    }
    c.stream.getTracks().forEach((t) => t.stop())
    const rate = c.ctx.sampleRate
    void c.ctx.close()
    setRecording(false)
    if (!keep) return
    const profile = summarize(c.frames, rate)
    if (!profile) {
      setError(m.noSignal)
      return
    }
    if (c.clipped) {
      setError(m.clipped)
    }
    const take = { id: ++takeSeq.current, profile }
    setTakes((all) => [...all.slice(-(MAX_TAKES - 1)), take])
    setShownId(null)
  }

  const startCapture = async (): Promise<void> => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // speech processing would reshape exactly what is being measured
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {})
        }
      })
      void refreshDevices()
      const ctx = new AudioContext()
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = FFT_SIZE
      analyser.smoothingTimeConstant = 0
      source.connect(analyser)

      const analyzer = new FrameAnalyzer(ctx.sampleRate)
      const frame = new Float32Array(FFT_SIZE)
      const frames: FrameStats[] = []

      let player: AudioBufferSourceNode | null = null
      let length = MAX_CAPTURE_S
      const alongPath = playAlong === 'guitar' ? stem?.path : playAlong === 'mix' ? master?.path : null
      if (alongPath) {
        const buffer = await loadBuffer(alongPath)
        const end = Math.min(buffer.duration, endParsed ?? buffer.duration)
        const from = Math.min(start, Math.max(0, end - 1))
        length = end - from
        player = ctx.createBufferSource()
        player.buffer = buffer
        // the stem in the player's key, same tempo: SoundTouch does the pitch, not a resample
        let out: AudioNode = ctx.destination
        if (semitones !== 0) {
          const stretcher = await createStretcher(ctx)
          if (stretcher) {
            stretcher.playbackRate.setValueAtTime(1, ctx.currentTime)
            stretcher.pitchSemitones.setValueAtTime(semitones, ctx.currentTime)
            stretcher.connect(ctx.destination)
            out = stretcher
          } else {
            setError(m.pitchUnavailable)
          }
        }
        player.connect(out)
        player.onended = () => stopCapture(true)
        player.start(ctx.currentTime + 0.05, from, length)
      }

      const startedAt = performance.now()
      const hopMs = (HOP_SIZE / ctx.sampleRate) * 1000
      const timer = window.setInterval(() => {
        const c = capture.current
        if (!c) return
        analyser.getFloatTimeDomainData(frame)
        const stats = analyzer.analyze(frame)
        frames.push(stats)
        let peak = 0
        for (let i = 0; i < frame.length; i++) peak = Math.max(peak, Math.abs(frame[i]))
        if (peak >= 0.99) c.clipped = true
        setMeter({ db: 20 * Math.log10(stats.rms + 1e-9), clip: peak >= 0.99 })
        const secs = (performance.now() - startedAt) / 1000
        setElapsed(secs)
        if (!player && secs >= length) stopCapture(true)
      }, hopMs)

      capture.current = { stream, ctx, timer, frames, player, startedAt, clipped: false }
      setElapsed(0)
      setRecording(true)
    } catch (err) {
      setError(m.inputFailed(err instanceof Error ? err.message : String(err)))
    }
  }

  /* ------------------------------------------------------- comparison */

  // every take against the same reference, so the distances line up as a trend
  const comparisons = useMemo(
    () => (reference ? takes.map((take) => compareProfiles(reference.profile, take.profile)) : []),
    [reference, takes]
  )
  const found = shownId === null ? -1 : takes.findIndex((take) => take.id === shownId)
  const shownIndex = found >= 0 ? found : takes.length - 1
  const yours = takes[shownIndex]?.profile ?? null
  const cmp = comparisons[shownIndex] ?? null
  const previous = shownIndex > 0 ? (comparisons[shownIndex - 1]?.yours ?? null) : null
  const geq = useMemo(() => (cmp ? fitGraphicEq(cmp, yours, GT1_GEQ_BANDS) : null), [cmp, yours])
  const masterEq = useMemo(() => (cmp ? fitMasterEq(cmp, ISO_FREQS) : null), [cmp])

  const rangeStale =
    reference !== null &&
    (reference.source !== refSource ||
      Math.abs(reference.start - start) > 0.5 ||
      (endParsed !== null && Math.abs(reference.end - endParsed) > 0.5))
  const pitchStale = reference !== null && reference.semitones !== semitones
  const refStale = rangeStale || pitchStale
  const weakGuitar =
    reference !== null &&
    reference.source === 'stem_guitar' &&
    reference.profile.levelDb < WEAK_STEM_DB

  /* ------------------------------------------------------------ render */

  if (!guitarStem && !otherStem) {
    return (
      <NeuCard className="p-4">
        <div className="micro-label mb-2">{m.title}</div>
        <p className="text-txt-dim text-[12px] leading-relaxed">{m.empty}</p>
      </NeuCard>
    )
  }

  const inputOptions = [
    { value: '', label: m.systemDefault },
    ...devices
      .filter((d) => d.deviceId !== 'default')
      .map((d, i) => ({ value: d.deviceId, label: d.label || m.inputN(i + 1) }))
  ]

  return (
    <NeuCard className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="gradient-text text-sm font-bold">{m.title}</span>
        <Badge tone="info">{m.badge}</Badge>
        {comparisons.length > 0 && (
          <span className="text-txt-micro ml-auto text-[11px] tabular-nums">
            {m.distance(comparisons.map((c) => c.distance.toFixed(1)).join(' → '))}
          </span>
        )}
      </div>

      <p className="text-txt-dim text-[12px] leading-relaxed">{m.steps}</p>

      <div className="grid gap-3 md:grid-cols-[1fr_1.3fr_0.55fr_0.55fr_auto]">
        <NeuSelect
          label={m.reference}
          value={refSource}
          onChange={(v) => setRefSource(v as RefSource)}
          options={[
            ...(guitarStem ? [{ value: 'stem_guitar', label: m.refGuitar }] : []),
            ...(otherStem ? [{ value: 'stem_other', label: m.refOther }] : [])
          ]}
        />
        <NeuSelect
          label={m.range}
          value={sectionKey}
          onChange={pickSection}
          options={[
            { value: 'all', label: m.wholeSong },
            ...timedSections.map((s) => ({
              value: s.key,
              label: `${s.name} (${formatClock(s.start)}${s.end > s.start ? `–${formatClock(s.end)}` : ''})`
            }))
          ]}
        />
        <label className="w-full">
          <span className="micro-label mb-2 block">{m.from}</span>
          <input
            value={startText}
            onChange={(e) => setStartText(e.target.value)}
            className="neu-inset text-txt w-full rounded-[16px] px-4 py-3 text-sm tabular-nums outline-none"
            aria-label={m.startAria}
          />
        </label>
        <label className="w-full">
          <span className="micro-label mb-2 block">{m.to}</span>
          <input
            value={endText}
            placeholder={m.end}
            onChange={(e) => setEndText(e.target.value)}
            className="neu-inset text-txt placeholder:text-txt-micro w-full rounded-[16px] px-4 py-3 text-sm tabular-nums outline-none"
            aria-label={m.endAria}
          />
        </label>
        <div className="w-full" role="group" aria-label={m.pitch} title={m.pitchHint}>
          <span className="micro-label mb-2 block">{m.pitch}</span>
          <div className="neu-inset flex items-center justify-between gap-1 rounded-[16px] px-1.5 py-1.5">
            <button
              onClick={() => changePitch(semitones - 1)}
              disabled={recording || semitones <= -MAX_SEMITONES}
              className="gradient-text grid h-8 w-8 place-items-center rounded-[10px] text-lg font-bold disabled:opacity-30"
              title={m.pitchDown}
              aria-label={m.pitchDown}
            >
              −
            </button>
            <button
              onClick={() => changePitch(0)}
              disabled={recording || semitones === 0}
              className={cx(
                'min-w-[4.5rem] text-center text-sm font-semibold tabular-nums',
                semitones === 0 ? 'text-txt-dim' : 'text-txt'
              )}
              title={m.pitchReset}
            >
              {m.semitones(signedInt(semitones))}
            </button>
            <button
              onClick={() => changePitch(semitones + 1)}
              disabled={recording || semitones >= MAX_SEMITONES}
              className="gradient-text grid h-8 w-8 place-items-center rounded-[10px] text-lg font-bold disabled:opacity-30"
              title={m.pitchUp}
              aria-label={m.pitchUp}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <NeuButton onClick={analyzeReference} disabled={refBusy !== null || recording}>
          <span className="flex items-center gap-2">
            {refBusy !== null && <Spinner size={14} />}
            {refBusy !== null
              ? m.analyzing(Math.round(refBusy * 100))
              : reference
                ? m.analyzeAgain
                : m.analyze}
          </span>
        </NeuButton>
        {reference && (
          <span className={cx('text-[11px]', refStale ? 'text-warn' : 'text-txt-micro')}>
            {rangeStale
              ? m.rangeChanged
              : pitchStale
                ? m.pitchChanged
                : m.used(rangeLabel, Math.round(reference.profile.seconds)) +
                  (reference.semitones ? ` · ${m.semitones(signedInt(reference.semitones))}` : '')}
          </span>
        )}
      </div>

      <div className="grid items-end gap-3 md:grid-cols-[1.2fr_1fr_auto]">
        <NeuSelect label={m.input} value={deviceId} onChange={pickDevice} options={inputOptions} />
        <NeuSelect
          label={m.playAlong}
          value={playAlong}
          onChange={(v) => setPlayAlong(v as PlayAlong)}
          options={[
            { value: 'guitar', label: m.alongReference },
            ...(master ? [{ value: 'mix', label: m.alongMix }] : []),
            { value: 'none', label: m.alongNone(MAX_CAPTURE_S) }
          ]}
        />
        {recording ? (
          <NeuButton variant="danger" onClick={() => stopCapture(true)}>
            {m.stop(formatClock(elapsed))}
          </NeuButton>
        ) : (
          <NeuButton variant="accent" onClick={startCapture} disabled={refBusy !== null}>
            {m.record}
          </NeuButton>
        )}
      </div>

      {recording && (
        <div className="flex items-center gap-3">
          <div className="neu-inset h-2.5 flex-1 overflow-hidden rounded-full" aria-label={m.meter}>
            <div
              className={cx('h-full rounded-full transition-[width] duration-100', meter.clip ? 'bg-danger' : 'bg-ok')}
              style={{ width: `${Math.max(0, Math.min(100, ((meter.db + 60) / 60) * 100))}%` }}
            />
          </div>
          <span className={cx('text-[11px] tabular-nums', meter.clip ? 'text-danger' : 'text-txt-micro')}>
            {meter.clip ? m.clipping : `${meter.db.toFixed(0)} dBFS`}
          </span>
        </div>
      )}

      {weakGuitar && !refStale && (
        <div className="neu-inset flex flex-wrap items-center gap-3 rounded-[16px] p-3">
          <p className="text-warn min-w-[240px] flex-1 text-[12px] leading-relaxed">
            {m.weakStem(Math.round(reference?.profile.levelDb ?? 0))}
          </p>
          {otherStem && (
            <NeuButton onClick={() => setRefSource('stem_other')}>{m.useOther}</NeuButton>
          )}
        </div>
      )}

      {error && <p className="text-warn text-[12px]">{error}</p>}

      {!cmp && (reference || yours) && (
        <p className="text-txt-micro text-[11px]">
          {[reference ? m.refDone : null, yours ? m.yoursDone : null, reference ? m.needYours : m.needRef]
            .filter(Boolean)
            .join(' ')}
        </p>
      )}

      {recording && cmp && <p className="text-txt-micro text-[11px]">{m.newChart}</p>}

      {cmp && geq && masterEq && (
        <div className={cx('space-y-4 transition-opacity', recording && 'opacity-40')}>
          {takes.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="micro-label mr-1">{m.takes}</span>
              {takes.map((take, i) => (
                <button
                  key={take.id}
                  onClick={() => setShownId(i === takes.length - 1 ? null : take.id)}
                  aria-pressed={i === shownIndex}
                  className={cx(
                    'rounded-[10px] px-2.5 py-1.5 text-[11px] font-semibold tabular-nums transition-all',
                    i === shownIndex ? 'neu-raised-sm gradient-text' : 'neu-inset text-txt-micro hover:text-txt-dim'
                  )}
                >
                  {m.take(take.id)} · {comparisons[i]?.distance.toFixed(1)} dB
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <span className="text-txt-dim flex items-center gap-2">
              <span className="inline-block h-[2px] w-4" style={{ background: REF_COLOR }} /> {m.legendRef}
            </span>
            <span className="text-txt-dim flex items-center gap-2">
              <span className="inline-block h-[2px] w-4" style={{ background: YOU_COLOR }} /> {m.legendYou}
            </span>
            {previous && (
              <span className="text-txt-dim flex items-center gap-2">
                <span className="inline-block w-4 border-t-2 border-dashed opacity-60" style={{ borderColor: YOU_COLOR }} />{' '}
                {m.legendPrev}
              </span>
            )}
            <span className="text-txt-micro">{m.legendNote}</span>
          </div>
          <SpectrumChart key={takes[shownIndex]?.id} cmp={cmp} previous={previous} />

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="neu-inset rounded-[16px] p-3">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <span className="micro-label">{m.geqTitle}</span>
                <span className="text-txt-micro text-[10px] tabular-nums">
                  {m.residual(geq.residual.toFixed(1), cmp.distance.toFixed(1))}
                </span>
              </div>
              <GeqChart bands={geq.bands} />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {geq.bands.map((b) => (
                  <span key={b.freq} className="neu-raised-sm rounded-[8px] px-2 py-1 text-[11px] tabular-nums">
                    {b.freq >= 1000 ? `${b.freq / 1000}kHz` : `${b.freq}Hz`} {b.gain > 0 ? `+${b.gain}` : b.gain}
                  </span>
                ))}
                <span className="neu-raised-sm rounded-[8px] px-2 py-1 text-[11px] tabular-nums">
                  LEVEL {geq.level > 0 ? `+${geq.level}` : geq.level}
                </span>
              </div>
              <div className="text-txt-micro mt-2 flex flex-wrap gap-3 text-[10px]">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: REF_COLOR }} /> {m.boost}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: YOU_COLOR }} /> {m.cut}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="neu-inset rounded-[16px] p-3">
                <div className="micro-label mb-1">{m.masterTitle}</div>
                <p className="text-txt-dim text-[12px] leading-relaxed tabular-nums">
                  LOW GAIN {masterEq.low > 0 ? '+' : ''}
                  {masterEq.low} dB · MID FREQ {formatHz(masterEq.mid.freq)} · MID Q {masterEq.mid.q} · MID GAIN{' '}
                  {masterEq.mid.gain > 0 ? '+' : ''}
                  {masterEq.mid.gain} dB · HIGH GAIN {masterEq.high > 0 ? '+' : ''}
                  {masterEq.high} dB
                </p>
                <p className="text-txt-micro mt-1 text-[10px]">{m.masterNote(masterEq.residual.toFixed(1))}</p>
              </div>

              <div className="neu-inset rounded-[16px] p-3">
                <div className="micro-label mb-1.5">{m.whereFirst}</div>
                {(() => {
                  const hints = REGIONS.map((r) => ({ ...m.regions[r.key], d: regionDiff(cmp, r.lo, r.hi) })).filter(
                    (r) => Math.abs(r.d) >= 3
                  )
                  if (!hints.length) {
                    return <p className="text-txt-dim text-[12px]">{m.nothingBig}</p>
                  }
                  return (
                    <ul className="space-y-1.5">
                      {hints.map((h) => (
                        <li key={h.name} className="text-txt-dim text-[12px] leading-snug">
                          <span className="text-txt font-semibold">{h.name}:</span>{' '}
                          {h.d > 0 ? m.recordHas(Math.round(h.d), h.more) : m.youHave(Math.round(-h.d), h.less)}
                        </li>
                      ))}
                    </ul>
                  )
                })()}
              </div>
            </div>
          </div>

          <details className="text-[11px]">
            <summary className="text-txt-micro cursor-pointer">{m.table}</summary>
            <table className="mt-2 w-full max-w-xl text-left tabular-nums">
              <thead className="text-txt-micro">
                <tr>
                  <th className="py-1 font-semibold">{m.frequency}</th>
                  <th className="py-1 font-semibold">{m.seriesRef}</th>
                  <th className="py-1 font-semibold">{m.seriesYou}</th>
                  <th className="py-1 font-semibold">{m.missing}</th>
                </tr>
              </thead>
              <tbody className="text-txt-dim">
                {cmp.centers.map((f, i) => (
                  <tr key={f}>
                    <td className="py-0.5">{formatHz(f)}</td>
                    <td>{signed(cmp.reference[i])} dB</td>
                    <td>{signed(cmp.yours[i])} dB</td>
                    <td>{signed(cmp.diff[i])} dB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          <p className="text-txt-micro text-[10px] leading-relaxed">{m.caveat}</p>
        </div>
      )}
    </NeuCard>
  )
}
