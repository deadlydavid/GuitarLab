/**
 * The tone-match maths, on signals whose answer is known in advance.
 *
 * Run with: npm run test:spectrum
 *
 * A sine has to land in its own band, white noise has to come out flat, a
 * recording with gaps has to be averaged over the playing only, and an EQ
 * curve applied on purpose has to be found again by the fit — within the
 * one-decibel step the GT-1's editor moves in.
 */
import {
  DEFAULT_BANDS,
  FFT_SIZE,
  FrameAnalyzer,
  analyzeRange,
  compareProfiles,
  fitGraphicEq,
  fitMasterEq,
  relative,
  summarize,
  transposedBands,
  type SpectrumProfile
} from '../src/shared/spectrum'
import { GT1_GEQ_BANDS, ISO_FREQS } from '../src/shared/gt1'

let failures = 0
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${label}${detail ? ` -- ${detail}` : ''}`)
  if (!ok) failures++
}

const SR = 48000

/** A deterministic PRNG, so a failure reproduces. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

function noise(seconds: number, amp: number, seed = 1): Float32Array {
  const r = rng(seed)
  const out = new Float32Array(Math.floor(seconds * SR))
  for (let i = 0; i < out.length; i++) out[i] = (r() * 2 - 1) * amp
  return out
}

/** A profile with a known shape, for the fitting tests. */
function profileFrom(db: (f: number) => number): SpectrumProfile {
  return {
    centers: DEFAULT_BANDS.centers,
    db: DEFAULT_BANDS.centers.map(db),
    frames: 100,
    seconds: 17,
    levelDb: -20,
    gateDb: -50
  }
}

const bump = (f: number, center: number, sigma: number): number =>
  Math.exp(-0.5 * (Math.log2(f / center) / sigma) ** 2)

async function main(): Promise<void> {
  console.log('=== 1. FFT e bandas ===')
  const analyzer = new FrameAnalyzer(SR)
  const sine = new Float32Array(FFT_SIZE)
  for (let i = 0; i < sine.length; i++) sine[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / SR)
  const frame = analyzer.analyze(sine)
  const loudest = frame.bands.indexOf(Math.max(...frame.bands))
  const center = DEFAULT_BANDS.centers[loudest]
  check('seno de 1 kHz cai na banda de 1 kHz', Math.abs(center - 1000) < 60, `${center.toFixed(0)} Hz`)
  check('RMS do seno é amplitude/√2', Math.abs(frame.rms - 0.5 / Math.SQRT2) < 0.01, frame.rms.toFixed(3))
  check(
    'toda banda tem pelo menos um bin, mesmo a de 50 Hz',
    frame.bands.every((b) => Number.isFinite(b))
  )

  console.log('\n=== 2. espectro médio ===')
  const white = noise(6, 0.3)
  const whiteProfile = summarize(await analyzeRange(white, SR, 0, 6), SR)
  check('ruído branco gera perfil', whiteProfile !== null)
  if (whiteProfile) {
    const rel = relative(whiteProfile.db, whiteProfile.centers)
    const mid = rel.filter((_, i) => whiteProfile.centers[i] >= 100 && whiteProfile.centers[i] <= 8000)
    const spread = Math.max(...mid) - Math.min(...mid)
    check('ruído branco sai plano (±1,5 dB)', spread < 3, `${spread.toFixed(2)} dB de variação`)
  }

  // four seconds playing, four of silence: the average is over the playing
  const gapped = new Float32Array(8 * SR)
  gapped.set(noise(4, 0.3, 7), 0)
  const gappedProfile = summarize(await analyzeRange(gapped, SR, 0, 8), SR)
  check(
    'o silêncio fica fora da média',
    gappedProfile !== null && gappedProfile.seconds > 3 && gappedProfile.seconds < 4.6,
    `${gappedProfile?.seconds.toFixed(2)} s aproveitados`
  )
  check(
    'silêncio puro não gera perfil',
    summarize(await analyzeRange(new Float32Array(3 * SR), SR, 0, 3), SR) === null
  )

  const partial = await analyzeRange(white, SR, 1, 2)
  check('o trecho escolhido limita os frames', partial.length > 3 && partial.length < 12, `${partial.length} frames`)

  console.log('\n=== 3. comparação ===')
  const flat = profileFrom(() => -30)
  const same = compareProfiles(flat, flat)
  check('iguais dão distância 0', same.distance < 1e-9)
  const louder = profileFrom(() => -18)
  check('só o volume diferente também dá 0', compareProfiles(flat, louder).distance < 1e-9)

  console.log('\n=== 4. GRAPHIC EQ recupera uma curva conhecida ===')
  // the player's sound is the record minus +6 dB at 400 Hz and plus 4 dB at 3.2 kHz
  const record = profileFrom(() => -30)
  const player = profileFrom((f) => -30 - 6 * bump(f, 400, 0.45) + 4 * bump(f, 3200, 0.45))
  const cmp = compareProfiles(record, player)
  const geq = fitGraphicEq(cmp, player, GT1_GEQ_BANDS)
  const gain = (hz: number): number => geq.bands.find((b) => b.freq === hz)?.gain ?? NaN
  check('400 Hz em torno de +6', Math.abs(gain(400) - 6) <= 1.5, `${gain(400)} dB`)
  check('3,2 kHz em torno de −4', Math.abs(gain(3200) + 4) <= 1.5, `${gain(3200)} dB`)
  check(
    'as outras bandas ficam perto de 0',
    [100, 1600, 6400].every((hz) => Math.abs(gain(hz)) <= 2),
    geq.bands.map((b) => `${b.freq}:${b.gain}`).join(' ')
  )
  check('ganhos inteiros, dentro de ±20', geq.bands.every((b) => Number.isInteger(b.gain) && Math.abs(b.gain) <= 20))
  check('o resíduo cai bem abaixo da diferença', geq.residual < cmp.distance / 2, `${geq.residual.toFixed(2)} de ${cmp.distance.toFixed(2)} dB`)

  /*
   * A guitar has its energy in the mids, so boosting the mids makes it
   * louder and LEVEL has to come down to keep the patch where it was.
   */
  const guitarLike = (f: number): number => -30 + 20 * bump(f, 800, 0.6)
  const mids = compareProfiles(
    profileFrom((f) => guitarLike(f) + 8 * bump(f, 800, 0.45)),
    profileFrom(guitarLike)
  )
  const boost = fitGraphicEq(mids, profileFrom(guitarLike), GT1_GEQ_BANDS)
  check('reforçar onde está a energia dá LEVEL negativo', boost.level <= -2, `LEVEL ${boost.level}`)

  console.log('\n=== 5. MASTER EQ ===')
  const midBump = compareProfiles(profileFrom(() => -30), profileFrom((f) => -30 - 5 * bump(f, 800, 0.6)))
  const master = fitMasterEq(midBump, ISO_FREQS)
  check('acha o médio perto de 800 Hz', master.mid.freq >= 500 && master.mid.freq <= 1250, `${master.mid.freq} Hz Q${master.mid.q}`)
  check('com ganho positivo', master.mid.gain >= 3, `${master.mid.gain} dB`)
  check('shelves quase neutros', Math.abs(master.low) <= 2 && Math.abs(master.high) <= 2, `LOW ${master.low} HIGH ${master.high}`)

  console.log('\n=== 6. stem em outro tom ===')
  /*
   * A stem measured "transposed" has to read like the same instrument really
   * playing in the other key. A sawtooth keeps its harmonic recipe whatever
   * the note, so A2 moved up an octave must come out as A3, and a sine moved
   * two semitones must land where a sine two semitones higher lands.
   */
  const saw = (hz: number): Float32Array => {
    const out = new Float32Array(3 * SR)
    for (let k = 1; k * hz < 11000; k++) {
      for (let i = 0; i < out.length; i++) out[i] += (0.3 / k) * Math.sin((2 * Math.PI * k * hz * i) / SR)
    }
    return out
  }
  const peakBand = (p: SpectrumProfile | null): number => (p ? p.db.indexOf(Math.max(...p.db)) : -1)
  const tone = (hz: number): Float32Array => {
    const out = new Float32Array(2 * SR)
    for (let i = 0; i < out.length; i++) out[i] = 0.5 * Math.sin((2 * Math.PI * hz * i) / SR)
    return out
  }
  check('0 semitons devolve as bandas de sempre', transposedBands(0) === DEFAULT_BANDS)
  const upTwo = summarize(await analyzeRange(tone(440), SR, 0, 2, undefined, transposedBands(2)), SR)
  const real494 = summarize(await analyzeRange(tone(440 * 2 ** (2 / 12)), SR, 0, 2), SR)
  check(
    'A4 subido 2 semitons cai na banda do B4',
    peakBand(upTwo) >= 0 && peakBand(upTwo) === peakBand(real494),
    `${DEFAULT_BANDS.centers[peakBand(upTwo)]?.toFixed(0)} Hz × ${DEFAULT_BANDS.centers[peakBand(real494)]?.toFixed(0)} Hz`
  )
  const downThree = summarize(await analyzeRange(tone(440), SR, 0, 2, undefined, transposedBands(-3)), SR)
  const real370 = summarize(await analyzeRange(tone(440 * 2 ** (-3 / 12)), SR, 0, 2), SR)
  check('e descido 3, na do F#4', peakBand(downThree) === peakBand(real370))

  const shifted = summarize(await analyzeRange(saw(110), SR, 0, 3, undefined, transposedBands(12)), SR)
  const octave = summarize(await analyzeRange(saw(220), SR, 0, 3), SR)
  if (shifted && octave) {
    /*
     * Same shape, not same numbers: the transposed reading carries a constant
     * offset (the power per bin), and only the bands holding a harmonic count —
     * a synthetic sawtooth leaves the ones between them empty, where only
     * leakage is left. A real guitar leaves no band empty.
     */
    const top = Math.max(...octave.db)
    const offsets = octave.db
      .map((v, i) => (v > top - 45 && octave.centers[i] <= 10000 ? v - shifted.db[i] : null))
      .filter((v): v is number => v !== null)
    const spread = Math.max(...offsets) - Math.min(...offsets)
    check(
      'dente de serra em A2 + 12 semitons tem o formato do A3 (±0,5 dB)',
      offsets.length >= 20 && spread <= 1,
      `${offsets.length} bandas com harmônico, variação de ${spread.toFixed(2)} dB`
    )
  } else {
    check('dente de serra gera perfil', false)
  }

  console.log(`\n${failures === 0 ? 'ESPECTRO OK' : `${failures} VERIFICACAO(OES) FALHARAM`}`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
