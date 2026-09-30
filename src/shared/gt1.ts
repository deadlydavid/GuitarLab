/**
 * The BOSS GT-1, as its Parameter Guide describes it.
 *
 * Everything the tone prompt tells the model about the unit, and everything the
 * answer is checked against, comes from this one table: the blocks, the types
 * each block can load, every parameter with its real range, the footswitch
 * functions and the ASSIGN target list. Keeping both sides on the same data is
 * what stops the prompt promising a control the validator then rejects — or
 * the model inventing a "MIX" knob the unit does not have and the user hunting
 * for it in BOSS TONE STUDIO.
 *
 * Transcribed from "GT-1 Parameter Guide / Sound List" (Roland, 2016). Where
 * the guide gives only the ends of a range ("630 Hz–12.5 kHz"), the steps in
 * between are Roland's standard one-third-octave series, which is what the
 * unit and the editor both show. Pure data and pure functions: the renderer
 * uses the EQ bands, the main process uses everything.
 */

import type { PatchParam } from './types'

/* ----------------------------------------------------------------- shapes */

export type Gt1Unit = 'dB' | 'ms' | 's' | '%' | 'st'

export type Gt1Param =
  | {
      name: string
      kind: 'range'
      min: number
      max: number
      unit?: Gt1Unit
      /** Decimal places the editor shows; 0 when omitted. */
      decimals?: number
      /** Also accepts a note value synced to MASTER BPM ("BPM 1/8."). */
      bpm?: boolean
      aliases?: string[]
    }
  | { name: string; kind: 'enum'; options: readonly string[]; aliases?: string[] }
  | {
      name: string
      kind: 'freq'
      /** Allowed frequencies in Hz; absent when only the ends are known. */
      steps?: readonly number[]
      min: number
      max: number
      /** Whether FLAT (filter bypassed) is one of the settings. */
      flat: boolean
      aliases?: string[]
    }

export interface Gt1Type {
  name: string
  /** What it models, in the guide's words — the model maps recorded gear with it. */
  models?: string
  aliases?: string[]
  params: Gt1Param[]
}

/* --------------------------------------------------------------- builders */

const range = (
  name: string,
  min: number,
  max: number,
  extra: Partial<Extract<Gt1Param, { kind: 'range' }>> = {}
): Gt1Param => ({ name, kind: 'range', min, max, ...extra })
const pct = (name: string, aliases?: string[]): Gt1Param => range(name, 0, 100, { aliases })
const sign50 = (name: string, aliases?: string[]): Gt1Param => range(name, -50, 50, { aliases })
const db20 = (name: string, aliases?: string[]): Gt1Param =>
  range(name, -20, 20, { unit: 'dB', aliases })
const choice = (name: string, options: readonly string[], aliases?: string[]): Gt1Param => ({
  name,
  kind: 'enum',
  options,
  aliases
})
const onOff = (name: string): Gt1Param => choice(name, ['OFF', 'ON'])

/** Roland's one-third-octave series, the steps every EQ/cut frequency moves in. */
export const ISO_FREQS = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
  2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500
] as const

const isoBetween = (lo: number, hi: number): number[] => ISO_FREQS.filter((f) => f >= lo && f <= hi)

const highCut = (name = 'HIGH CUT', aliases = ['HI CUT']): Gt1Param => ({
  name,
  kind: 'freq',
  steps: isoBetween(630, 12500),
  min: 630,
  max: 12500,
  flat: true,
  aliases
})
const lowCut = (name = 'LOW CUT'): Gt1Param => ({
  name,
  kind: 'freq',
  steps: isoBetween(20, 800),
  min: 20,
  max: 800,
  flat: true,
  aliases: ['LO CUT']
})
const eqFreq = (name: string, aliases?: string[]): Gt1Param => ({
  name,
  kind: 'freq',
  steps: isoBetween(20, 10000),
  min: 20,
  max: 10000,
  flat: false,
  aliases
})
const eqQ = (name: string, aliases?: string[]): Gt1Param =>
  choice(name, ['0.5', '1', '2', '4', '8', '16'], aliases)

const rate = (name = 'RATE'): Gt1Param => range(name, 0, 100, { bpm: true })
const preDelay = (): Gt1Param => range('PRE DELAY', 0, 300, { unit: 'ms', bpm: true })

/* ------------------------------------------------------------- FX1 / FX2 */

export const GT1_FX_TYPES: Gt1Type[] = [
  {
    name: 'COMPRESSOR',
    aliases: ['COMP'],
    params: [
      choice('TYPE', ['BOSS', 'HI-BAND', 'LIGHT', 'D-COMP', 'ORANGE', 'FAT', 'MILD', 'STEREO']),
      pct('SUSTAIN'),
      pct('ATTACK'),
      pct('LEVEL'),
      sign50('TONE')
    ],
    models: 'BOSS = BOSS CS-3, D-COMP = MXR DynaComp, ORANGE = Dan Armstrong Orange Squeezer'
  },
  {
    name: 'LIMITER',
    params: [
      choice('TYPE', ['BOSS', 'RACK 160D', 'VTG RACK U']),
      pct('THRESHOLD', ['THRESH']),
      choice('RATIO', [
        '1:1',
        '1.2:1',
        '1.4:1',
        '1.6:1',
        '1.8:1',
        '2:1',
        '2.3:1',
        '2.6:1',
        '3:1',
        '3.5:1',
        '4:1',
        '5:1',
        '6:1',
        '8:1',
        '10:1',
        '12:1',
        '20:1',
        'INF:1'
      ]),
      pct('LEVEL'),
      pct('ATTACK'),
      pct('RELEASE')
    ],
    models: 'RACK 160D = dbx 160X, VTG RACK U = UREI 1178'
  },
  {
    name: 'T.WAH',
    aliases: ['TOUCH WAH', 'AUTO WAH'],
    params: [
      choice('MODE', ['LPF', 'BPF']),
      choice('POLARITY', ['DOWN', 'UP']),
      pct('SENS'),
      pct('FREQ'),
      pct('PEAK'),
      pct('LEVEL')
    ]
  },
  {
    name: 'GRAPHIC EQ',
    aliases: ['GEQ', 'GRAPHIC'],
    params: [
      db20('100Hz'),
      db20('200Hz'),
      db20('400Hz'),
      db20('800Hz'),
      db20('1.6kHz'),
      db20('3.2kHz'),
      db20('6.4kHz'),
      db20('LEVEL')
    ]
  },
  {
    name: 'PARA.EQ',
    aliases: ['PARAMETRIC EQ', 'PEQ', 'PARA EQ'],
    params: [
      db20('LOW GAIN'),
      eqFreq('LM FREQ', ['LOW-MID FREQ', 'LOW MID FREQ', 'LOW-MID FREQUENCY']),
      eqQ('LM Q', ['LOW-MID Q', 'LOW MID Q']),
      db20('LM GAIN', ['LOW-MID GAIN', 'LOW MID GAIN']),
      eqFreq('HM FREQ', ['HIGH-MID FREQ', 'HIGH MID FREQ', 'HIGH-MID FREQUENCY']),
      eqQ('HM Q', ['HIGH-MID Q', 'HIGH MID Q']),
      db20('HM GAIN', ['HIGH-MID GAIN', 'HIGH MID GAIN']),
      db20('HIGH GAIN'),
      db20('LEVEL')
    ]
  },
  {
    name: 'TONE MODIFY',
    aliases: ['TONE MOD'],
    params: [
      choice('TYPE', ['FAT', 'PRESENCE', 'MILD', 'TIGHT', 'ENHANCE', 'RESO 1', 'RESO 2', 'RESO 3']),
      sign50('LOW'),
      sign50('HIGH'),
      pct('LEVEL'),
      pct('RESONANCE')
    ]
  },
  {
    name: 'GUITAR SIM',
    aliases: ['GUITAR SIMULATOR'],
    params: [
      choice(
        'TYPE',
        ['S→H', 'H→S', 'H→HALF TN', 'S→HOLLOW', 'H→HOLLOW', 'S→AC', 'H→AC', 'PIEZO→AC'],
        []
      ),
      sign50('LOW'),
      sign50('HIGH'),
      pct('LEVEL'),
      pct('BODY')
    ],
    models: 'S = single coil, H = humbucker; S→H turns a single coil into a humbucker'
  },
  {
    name: 'AC.GTR SIM',
    aliases: ['AC.GUITAR SIM', 'AC.GUITAR SIMULATOR', 'ACOUSTIC GUITAR SIMULATOR', 'AC GTR SIM'],
    params: [pct('BODY'), sign50('LOW'), sign50('HIGH'), pct('LEVEL')]
  },
  {
    name: 'SLOW GEAR',
    params: [pct('SENS'), pct('RISE TIME', ['RISE']), pct('LEVEL')]
  },
  {
    name: 'OCTAVE',
    params: [pct('-1 OCT', ['-1OCT', '1 OCT']), pct('-2 OCT', ['-2OCT', '2 OCT']), pct('D.LEVEL')]
  },
  {
    name: 'PITCH SHIFTER',
    aliases: ['PITCH SHIFT', 'PS', 'P.SHIFT'],
    params: [
      range('PITCH', -24, 24, { unit: 'st' }),
      pct('D.LEVEL'),
      sign50('FINE'),
      preDelay(),
      pct('E.LEVEL'),
      pct('FEEDBACK')
    ]
  },
  {
    name: 'HARMONIST',
    aliases: ['HARMONY', 'HARMONIZER'],
    params: [
      choice('HARMONY', [
        '-2oct',
        '-14th',
        '-13th',
        '-12th',
        '-11th',
        '-10th',
        '-9th',
        '-1oct',
        '-7th',
        '-6th',
        '-5th',
        '-4th',
        '-3rd',
        '-2nd',
        'UNISON',
        '+2nd',
        '+3rd',
        '+4th',
        '+5th',
        '+6th',
        '+7th',
        '+1oct',
        '+9th',
        '+10th',
        '+11th',
        '+12th',
        '+13th',
        '+14th',
        '+2oct'
      ]),
      preDelay(),
      pct('FEEDBACK'),
      pct('E.LEVEL'),
      pct('D.LEVEL')
    ],
    models: 'diatonic harmony in the MASTER KEY; single notes only'
  },
  {
    name: 'OVERTONE',
    params: [
      pct('LOWER', ['LOWER LEVEL']),
      pct('UPPER', ['UPPER LEVEL']),
      pct('D.LEVEL'),
      pct('DETUNE'),
      sign50('TONE')
    ]
  },
  {
    name: 'FEEDBACKER',
    params: [onOff('TRIGGER'), pct('DEPTH', ['DEPTH1'])]
  },
  {
    name: 'AC.PROC.',
    aliases: ['AC.PROCESSOR', 'AC PROCESSOR', 'ACOUSTIC PROCESSOR', 'AC.PROC'],
    params: [
      choice('TYPE', ['SMALL', 'MEDIUM', 'BRIGHT', 'POWER']),
      sign50('BASS'),
      sign50('MIDDLE'),
      sign50('TREBLE'),
      sign50('PRESENCE'),
      pct('LEVEL')
    ]
  },
  {
    name: 'PHASER',
    params: [
      choice('TYPE', ['4 STAGE', '8 STAGE', '12 STAGE', 'BiPHASE']),
      rate(),
      pct('DEPTH'),
      pct('RESONANCE'),
      pct('MANUAL'),
      pct('LEVEL')
    ]
  },
  {
    name: 'FLANGER',
    params: [
      rate(),
      pct('DEPTH'),
      pct('RESONANCE'),
      pct('MANUAL'),
      // the guide gives only the ends of this one, so it is clamped, not snapped
      { name: 'LOW CUT', kind: 'freq', min: 55, max: 800, flat: true, aliases: ['LO CUT'] },
      pct('LEVEL')
    ]
  },
  {
    name: 'TREMOLO',
    params: [pct('WAVE', ['WAVE SHAPE']), rate(), pct('DEPTH'), pct('LEVEL')]
  },
  {
    name: 'ROTARY',
    params: [
      choice('SPEED', ['SLOW', 'FAST'], ['SPEED SELECT']),
      rate('RATE SLOW'),
      rate('RATE FAST'),
      pct('TRANSITION', ['TRANSITION TIME']),
      range('B/H BAL', 0, 100, { unit: '%', aliases: ['BALANCE', 'BASS/HORN BALANCE'] }),
      pct('LEVEL')
    ],
    models: 'B/H BAL is the horn share: 0 = all bass rotor (100:0), 100 = all horn (0:100)'
  },
  {
    name: 'UNI-V',
    aliases: ['UNIVIBE', 'UNI-VIBE', 'UNI VIBE'],
    params: [rate(), pct('DEPTH'), pct('LEVEL')],
    models: 'Shin-ei Uni-Vibe'
  },
  {
    name: 'VIBRATO',
    params: [rate(), pct('DEPTH'), onOff('TRIGGER'), pct('RISE TIME', ['RISE']), pct('LEVEL')]
  },
  {
    name: 'CHORUS',
    params: [
      choice('MODE', ['MONO', 'STEREO1', 'STEREO2']),
      rate(),
      pct('DEPTH'),
      pct('E.LEVEL'),
      lowCut(),
      highCut()
    ],
    models: 'DEPTH 0 = doubling; STEREO2 = dry left, effect right'
  },
  {
    name: 'SUB DELAY',
    aliases: ['SUBDELAY', 'SUB DLY'],
    params: [
      choice('TYPE', ['MONO', 'PAN']),
      range('TIME', 1, 1000, { unit: 'ms', bpm: true, aliases: ['DELAY TIME'] }),
      pct('FEEDBACK'),
      range('E.LEVEL', 0, 120),
      highCut(),
      range('TAP TIME', 0, 100, { unit: '%', aliases: ['TAP'] }),
      pct('D.LEVEL')
    ]
  }
]

/** What the ASSIGN TARGET list calls each FX type ("2 HARMONY", "1 P.SHIFT"…). */
const FX_TARGET_TAG: Record<string, string> = {
  COMPRESSOR: 'COMP',
  LIMITER: 'LIMITER',
  'T.WAH': 'T.WAH',
  'GRAPHIC EQ': 'GEQ',
  'PARA.EQ': 'PEQ',
  'TONE MODIFY': 'ToneMOD',
  'GUITAR SIM': 'GtrSIM',
  'AC.GTR SIM': 'AcG.SIM',
  'SLOW GEAR': 'SlwGEAR',
  OCTAVE: 'OCTAVE',
  'PITCH SHIFTER': 'P.SHIFT',
  HARMONIST: 'HARMONY',
  OVERTONE: 'OvrTONE',
  FEEDBACKER: 'FEEDBCKR',
  'AC.PROC.': 'AcPROC',
  PHASER: 'PHASER',
  FLANGER: 'FLANGER',
  TREMOLO: 'TREMOLO',
  ROTARY: 'ROTARY',
  'UNI-V': 'UNI-V',
  VIBRATO: 'VIBRATO',
  CHORUS: 'CHORUS',
  'SUB DELAY': 'SubDELAY'
}

/* ------------------------------------------------------------- PEDAL FX */

const wahParams = [
  pct('PDL POS', ['PEDAL POSITION', 'PEDAL POS']),
  pct('PDL MIN', ['PEDAL MIN']),
  pct('PDL MAX', ['PEDAL MAX']),
  pct('LEVEL')
]

export const GT1_PEDAL_TYPES: Gt1Type[] = [
  { name: 'CRY WAH', models: 'Dunlop Cry Baby', aliases: ['CRYBABY', 'CRY BABY'], params: wahParams },
  { name: 'VO WAH', models: 'VOX V846', aliases: ['VOX WAH'], params: wahParams },
  { name: 'FAT WAH', models: 'bold wah', params: wahParams },
  { name: 'LIGHT WAH', models: 'refined, neutral wah', params: wahParams },
  { name: '7STR WAH', models: 'wide range for 7-string/baritone', aliases: ['7STRING WAH'], params: wahParams },
  { name: 'RESO WAH', models: 'synth-filter resonance', params: wahParams },
  {
    name: 'PEDAL BND',
    models: 'pitch bend by pedal; single notes only',
    aliases: ['PEDAL BEND', 'WHAMMY'],
    params: [range('PITCH', -24, 24, { unit: 'st' }), pct('PDL POS', ['PEDAL POSITION']), pct('LEVEL')]
  }
]

/* ---------------------------------------------------------------- OD/DS */

const odParams: Gt1Param[] = [
  range('DRIVE', 0, 120, { aliases: ['GAIN', 'DIST'] }),
  sign50('TONE'),
  pct('E.LEVEL', ['LEVEL']),
  sign50('BOTTOM'),
  pct('D.LEVEL')
]

const od = (name: string, models: string, aliases?: string[]): Gt1Type => ({
  name,
  models,
  aliases,
  params: odParams
})

export const GT1_OD_TYPES: Gt1Type[] = [
  od('MID BOOST', 'midrange booster, for solos before the amp'),
  od('CLEAN BST', 'clean booster with punch', ['CLEAN BOOST']),
  od('TREBLE BST', 'bright treble booster (Rangemaster-style)', ['TREBLE BOOST']),
  od('CRUNCH', 'amp-like crunch'),
  od('NATURAL OD', 'natural overdrive'),
  od('WARM OD', 'warm overdrive'),
  od('FAT DS', 'thick distortion'),
  od('LEAD DS', 'smooth, deep lead distortion'),
  od('METAL DS', 'distortion for heavy riffs'),
  od('OCT FUZZ', 'octave fuzz, rich harmonics'),
  od('A-DIST', 'MDP distortion, even across the neck'),
  od('BLUES OD', 'BOSS BD-2 Blues Driver'),
  od('OD-1', 'BOSS OD-1'),
  od('T-SCREAM', 'Ibanez TS-808 Tube Screamer', ['TS808', 'TUBE SCREAMER']),
  od('TURBO OD', 'BOSS OD-2 Turbo Overdrive'),
  od('DISTORTION', 'basic, traditional distortion'),
  od('RAT', 'ProCo RAT'),
  od('GUV DS', "Marshall Guv'nor"),
  od('DST+', 'MXR Distortion+', ['DIST+', 'DISTORTION+']),
  od('METAL ZONE', 'BOSS MT-2 Metal Zone'),
  od('60S FUZZ', 'Dallas Arbiter Fuzz Face', ['FUZZ FACE']),
  od('MUFF FUZZ', 'Electro-Harmonix Big Muff Pi', ['BIG MUFF'])
]

/* --------------------------------------------------------------- PREAMP */

export const GT1_SPEAKERS = [
  'OFF',
  'ORIGIN',
  '1x8"',
  '1x10"',
  '1x12"',
  '2x12"',
  '4x10"',
  '4x12"',
  '8x12"'
] as const

const preampParams: Gt1Param[] = [
  range('GAIN', 0, 120, { aliases: ['DRIVE'] }),
  pct('BASS'),
  pct('MIDDLE', ['MID']),
  pct('TREBLE'),
  pct('PRESENCE'),
  pct('LEVEL', ['VOLUME', 'MASTER']),
  onOff('BRIGHT'),
  choice('SP TYPE', GT1_SPEAKERS, ['SPEAKER', 'SPEAKER TYPE', 'CABINET', 'CAB', 'SP'])
]

const amp = (name: string, models: string, aliases?: string[]): Gt1Type => ({
  name,
  models,
  aliases,
  params: preampParams
})

export const GT1_PREAMP_TYPES: Gt1Type[] = [
  amp('NATRL CLN', 'neutral clean, minimal amp colour', ['NATURAL CLEAN']),
  amp('FUL RANGE', 'flat full-range amp, good for acoustic', ['FULL RANGE']),
  amp('CB CRUNCH', 'combo crunch, very touch-sensitive', ['COMBO CRUNCH']),
  amp('ST CRUNCH', 'stack crunch with 4x12 character', ['STACK CRUNCH']),
  amp('HiGAIN STK', 'vintage Marshall revamped to high gain', ['HIGAIN STACK', 'HI GAIN STACK']),
  amp('POWER DRV', 'straight drive, rhythm to lead', ['POWER DRIVE']),
  amp('XTREM LD', 'large stack lead with smoothed response', ['EXTREM LEAD', 'EXTREME LEAD']),
  amp('CORE MTL', 'modern metal stack', ['CORE METAL']),
  amp('JC-120', 'Roland JC-120', ['JC120']),
  amp('CLEAN TWIN', 'Fender Twin Reverb', ['TWIN']),
  amp('PR CRUNCH', 'Fender Pro Reverb', ['PRO CRUNCH']),
  amp('TWEED', 'Fender Bassman 4x10 combo', ['BASSMAN']),
  amp('DxCRUNCH', 'Fender Deluxe Reverb', ['DELUXE CRUNCH', 'DX CRUNCH']),
  amp('VO DRIVE', 'VOX AC-30TB drive, 60s British rock', ['VOX DRIVE']),
  amp('VO LEAD', 'VOX AC-30TB lead', ['VOX LEAD']),
  amp('MATCH DRV', 'Matchless D/C-30 left input', ['MATCH DRIVE']),
  amp('BG LEAD', 'MESA/Boogie combo lead, late 70s-80s (Mark series)', ['BOOGIE LEAD']),
  amp('BG DRIVE', 'MESA/Boogie with TREBLE SHIFT on', ['BOOGIE DRIVE']),
  amp('MS1959 I', 'Marshall 1959 Super Lead, input I (trebly)', ['MS1959I', 'MS 1959 I']),
  amp('MS1959 I+II', 'Marshall 1959 Super Lead, inputs I and II jumpered', ['MS 1959 I+II']),
  amp('R-FIER VTG', 'MESA/Boogie Dual Rectifier ch2 Vintage', ['R-FIER VINTAGE', 'RECTIFIER VINTAGE']),
  amp('R-FIER MDN', 'MESA/Boogie Dual Rectifier ch2 Modern', ['R-FIER MODERN', 'RECTIFIER MODERN']),
  amp('T-AMP LD', 'Hughes & Kettner Triamp AMP3', ['T-AMP LEAD', 'TRIAMP']),
  amp('SLDN', 'Soldano SLO-100', ['SOLDANO']),
  amp('5150 DRV', 'Peavey EVH 5150 lead channel', ['5150 DRIVE', '5150']),
  amp('BGNR UB', 'Bogner Uberschall high-gain channel', ['BOGNER', 'UBERSCHALL']),
  amp('ORNG ROCK', 'Orange Rockerverb dirty channel', ['ORANGE ROCK', 'ORANGE'])
]

/* ------------------------------------------------------- NS, FV, delays */

export const GT1_NS_PARAMS: Gt1Param[] = [
  range('THRESHOLD', 0, 100, { aliases: ['THRESH'] }),
  pct('RELEASE'),
  choice('DETECT', ['INPUT', 'NS INPUT', 'FV OUT'])
]

export const GT1_FV_PARAMS: Gt1Param[] = [pct('MIN'), pct('MAX'), pct('LEVEL')]

const delayTime = (max: number): Gt1Param =>
  range('TIME', 1, max, { unit: 'ms', bpm: true, aliases: ['DELAY TIME'] })

const delayCommon: Gt1Param[] = [
  delayTime(2000),
  pct('FEEDBACK'),
  highCut(),
  range('E.LEVEL', 0, 120)
]

export const GT1_DELAY_TYPES: Gt1Type[] = [
  { name: 'STANDARD', models: 'simple mono delay', params: delayCommon },
  {
    name: 'PAN',
    models: 'stereo tap delay, L at TAP TIME % of R',
    params: [...delayCommon, range('TAP TIME', 0, 100, { unit: '%', aliases: ['TAP'] })]
  },
  { name: 'REVERSE', models: 'reverse playback', params: delayCommon },
  { name: 'ANALOG', models: 'mild analog (BBD) delay', params: delayCommon },
  { name: 'TAPE', models: 'tape echo with wow', params: delayCommon },
  {
    name: 'MODULATE',
    models: 'modulated delay',
    aliases: ['MOD', 'MOD DELAY'],
    params: [
      ...delayCommon,
      pct('MOD RATE', ['MODULATION RATE']),
      pct('MOD DEPTH', ['MODULATION DEPTH'])
    ]
  },
  {
    name: 'TERA ECHO',
    models: 'MDP ambience that follows picking dynamics',
    params: [
      pct('TIME'),
      pct('FEEDBACK'),
      pct('E.LEVEL'),
      sign50('TONE'),
      pct('D.LEVEL'),
      onOff('HOLD')
    ]
  }
]

const reverbCommon: Gt1Param[] = [
  range('TIME', 0.1, 10, { unit: 's', decimals: 1, aliases: ['REVERB TIME', 'DECAY'] }),
  pct('E.LEVEL', ['LEVEL']),
  lowCut(),
  highCut()
]

export const GT1_REVERB_TYPES: Gt1Type[] = [
  { name: 'AMBIENCE', models: 'distant ambience mic, openness without a tail', params: reverbCommon },
  { name: 'ROOM', models: 'small room, warm', params: reverbCommon },
  { name: 'HALL 1', models: 'concert hall, clear and spacious', params: reverbCommon },
  { name: 'HALL 2', models: 'concert hall, mild', params: reverbCommon },
  { name: 'PLATE', models: 'plate reverb, bright metallic top', params: reverbCommon },
  {
    name: 'SPRING',
    models: 'guitar-amp spring reverb',
    params: [...reverbCommon, pct('SPRING', ['SPRING SENS'])]
  },
  { name: 'MODULATE', models: 'hall with a wavering tail', params: reverbCommon },
  {
    name: 'DELAY',
    models: 'a second, simpler delay inside the REVERB block',
    params: [
      delayTime(650),
      range('E.LEVEL', 0, 120),
      pct('FEEDBACK'),
      highCut(),
      pct('D.LEVEL')
    ]
  }
]

/* --------------------------------------------------------------- MASTER */

/** MASTER KEY, the key the HARMONIST follows. Major first, relative minor after. */
export const GT1_KEYS = [
  'C (Am)',
  'Db (Bbm)',
  'D (Bm)',
  'Eb (Cm)',
  'E (C#m)',
  'F (Dm)',
  'F# (D#m)',
  'G (Em)',
  'Ab (Fm)',
  'A (F#m)',
  'Bb (Gm)',
  'B (G#m)'
] as const

export const GT1_MASTER_PARAMS: Gt1Param[] = [
  range('PATCH LVL', 0, 200, { aliases: ['PATCH LEVEL'] }),
  range('BPM', 40, 250, { aliases: ['MASTER BPM', 'TEMPO'] }),
  choice('KEY', GT1_KEYS, ['MASTER KEY']),
  db20('LOW GAIN', ['MASTER LOW GAIN', 'LOW']),
  db20('MID GAIN', ['MASTER MID GAIN', 'MID']),
  eqFreq('MID FREQ', ['MASTER MID FREQ', 'MID FREQUENCY']),
  eqQ('MID Q', ['MASTER MID Q']),
  db20('HIGH GAIN', ['MASTER HIGH GAIN', 'HIGH'])
]

/* ---------------------------------------------------------------- blocks */

/**
 * The blocks of a patch, by the name the editor gives each one, with the short
 * label the effect-chain screen prints and the types it can hold.
 */
export interface Gt1Block {
  slot: string
  chain: string
  aliases: string[]
  /** Types the block can load; empty for blocks with fixed parameters. */
  types: Gt1Type[]
  /** Parameters of a block that has no TYPE. */
  params?: Gt1Param[]
}

export const GT1_BLOCKS: Gt1Block[] = [
  { slot: 'FX1', chain: 'FX1', aliases: ['FX 1', 'EFFECT 1'], types: GT1_FX_TYPES },
  { slot: 'PEDAL FX', chain: 'PDL', aliases: ['PDL', 'WAH', 'PEDALFX'], types: GT1_PEDAL_TYPES },
  {
    slot: 'OD/DS',
    chain: 'OD',
    aliases: ['OD', 'DS', 'OD-DS', 'OVERDRIVE', 'DISTORTION'],
    types: GT1_OD_TYPES
  },
  { slot: 'PREAMP', chain: 'PrA', aliases: ['PRA', 'AMP', 'PRE AMP'], types: GT1_PREAMP_TYPES },
  {
    slot: 'NS',
    chain: 'NS',
    aliases: ['NOISE SUPPRESSOR', 'NOISE GATE', 'GATE'],
    types: [],
    params: GT1_NS_PARAMS
  },
  { slot: 'DELAY', chain: 'DLY', aliases: ['DLY'], types: GT1_DELAY_TYPES },
  {
    slot: 'FOOT VOLUME',
    chain: 'FV',
    aliases: ['FV', 'FOOT VOL', 'VOLUME'],
    types: [],
    params: GT1_FV_PARAMS
  },
  { slot: 'FX2', chain: 'FX2', aliases: ['FX 2', 'EFFECT 2'], types: GT1_FX_TYPES },
  { slot: 'REVERB', chain: 'REV', aliases: ['REV', 'RVB'], types: GT1_REVERB_TYPES },
  {
    slot: 'MASTER',
    chain: '',
    aliases: ['MASTER EQ', 'MASTER SETTING', 'PATCH'],
    types: [],
    params: GT1_MASTER_PARAMS
  }
]

/** The effect chain as the unit ships it; the order is editable per patch. */
export const GT1_CHAIN_DEFAULT = ['FX1', 'PDL', 'OD', 'PrA', 'NS', 'DLY', 'FV', 'FX2', 'REV']

/** The GRAPHIC EQ's seven bands, in Hz. */
export const GT1_GEQ_BANDS = [100, 200, 400, 800, 1600, 3200, 6400] as const

/* ----------------------------------------------------------- controllers */

/** FUNC for CTL1 and EXP SW (EXP SW cannot tap tempo). */
export const GT1_CTL_FUNCS = [
  'OFF',
  'OD SOLO',
  'PrA SOLO',
  'FX1',
  'OD/DS',
  'PREAMP',
  'FX2',
  'DELAY',
  'REVERB',
  'PEDAL FX',
  'TUNER',
  'BPM TAP',
  'DELAY TAP',
  'LEVEL +10',
  'LEVEL +20',
  'LEVEL -10',
  'LEVEL -20',
  'NUMBER +1',
  'NUMBER -1',
  // lights CTL1's LED when the switch drives ASSIGNs rather than a block
  'LED ON/OFF'
] as const

export const GT1_EXP_FUNCS = ['OFF', 'FOOT VOL', 'PEDAL FX', 'PDL FX/FV'] as const

/** The built-in controls; CTL2, CTL3 and EXP2 need a pedal plugged into the CTL 2,3/EXP2 jack. */
export const GT1_CONTROLS = ['CTL1', 'EXP SW', 'EXP1'] as const
export const GT1_EXTERNAL_CONTROLS = ['CTL2', 'CTL3', 'EXP2'] as const

export const GT1_ASSIGN_SOURCES = ['CTL 1', 'EXP 1', 'INT PEDAL', 'WAVE PEDAL'] as const
export const GT1_ASSIGN_EXTERNAL_SOURCES = ['CTL2', 'CTL3', 'EXP 2'] as const
export const GT1_ASSIGN_TRIGGERS = [
  'PAT CNG',
  'EXP1 LO',
  'EXP1 MID',
  'EXP1 HI',
  'EXP1 SW',
  'CTL1 PDL',
  'EXP2 PDL',
  'CTL2PDL',
  'CTL3PDL'
] as const
export const GT1_ASSIGN_CURVES = ['LINEAR', 'SLOW', 'FAST'] as const
export const GT1_WAVEFORMS = ['SAW', 'TRI', 'SINE'] as const
export const GT1_ASSIGN_COUNT = 6

/* ------------------------------------------------------------ ASSIGN list */

export interface Gt1Target {
  name: string
  /** The parameter it moves, when the catalogue has it — gives MIN/MAX their range. */
  param: Gt1Param | null
}

export interface Gt1TargetCategory {
  category: string
  targets: Gt1Target[]
  /** For "1 HARMONY"-style categories: which FX slot and which type they belong to. */
  fx?: { slot: 'FX1' | 'FX2'; type: string }
}

const byName = (params: Gt1Param[], name: string): Gt1Param | null =>
  params.find((p) => p.name === name) ?? null

const typeParam = (types: Gt1Type[], typeName: string, param: string): Gt1Param | null =>
  byName(types.find((t) => t.name === typeName)?.params ?? [], param)

const blockOnOff = (): Gt1Target => ({ name: 'ON/OFF', param: onOff('ON/OFF') })
const blockType = (types: Gt1Type[]): Gt1Target => ({
  name: 'TYPE',
  param: choice(
    'TYPE',
    types.map((t) => t.name)
  )
})

function fxCategories(n: 1 | 2): Gt1TargetCategory[] {
  const slot = n === 1 ? 'FX1' : 'FX2'
  return [
    { category: slot, targets: [blockOnOff(), blockType(GT1_FX_TYPES)] },
    ...GT1_FX_TYPES.map((t) => ({
      category: `${n} ${FX_TARGET_TAG[t.name]}`,
      targets: t.params.map((p) => ({ name: p.name, param: p })),
      fx: { slot, type: t.name } as const
    }))
  ]
}

const odAll = GT1_OD_TYPES[0].params
const preAll = GT1_PREAMP_TYPES[0].params
const std = GT1_DELAY_TYPES.find((t) => t.name === 'MODULATE')?.params ?? []
const pan = GT1_DELAY_TYPES.find((t) => t.name === 'PAN')?.params ?? []
const tera = GT1_DELAY_TYPES.find((t) => t.name === 'TERA ECHO')?.params ?? []
const spring = GT1_REVERB_TYPES.find((t) => t.name === 'SPRING')?.params ?? []
const revDelay = GT1_REVERB_TYPES.find((t) => t.name === 'DELAY')?.params ?? []

/** The TARGET list from the guide, in its order, each target tied to its parameter. */
export const GT1_TARGETS: Gt1TargetCategory[] = [
  ...fxCategories(1),
  {
    category: 'OD/DS',
    targets: [
      blockOnOff(),
      blockType(GT1_OD_TYPES),
      ...['DRIVE', 'BOTTOM', 'TONE', 'E.LEVEL', 'D.LEVEL'].map((n) => ({ name: n, param: byName(odAll, n) }))
    ]
  },
  {
    category: 'PREAMP',
    targets: [
      blockOnOff(),
      blockType(GT1_PREAMP_TYPES),
      ...['GAIN', 'LEVEL', 'BASS', 'MIDDLE', 'TREBLE', 'PRESENCE', 'BRIGHT', 'SP TYPE'].map((n) => ({
        name: n,
        param: byName(preAll, n)
      }))
    ]
  },
  ...fxCategories(2),
  {
    category: 'DELAY',
    targets: [
      blockOnOff(),
      blockType(GT1_DELAY_TYPES),
      { name: 'TIME', param: byName(std, 'TIME') },
      { name: 'FEEDBACK', param: byName(std, 'FEEDBACK') },
      { name: 'HIGH CUT', param: byName(std, 'HIGH CUT') },
      { name: 'E.LEVEL', param: byName(std, 'E.LEVEL') },
      { name: 'TAP TIME', param: byName(pan, 'TAP TIME') },
      { name: 'MOD RATE', param: byName(std, 'MOD RATE') },
      { name: 'MOD DEPTH', param: byName(std, 'MOD DEPTH') },
      { name: 'TE TIME', param: byName(tera, 'TIME') },
      { name: 'TE FEEDBK', param: byName(tera, 'FEEDBACK') },
      { name: 'TE TONE', param: byName(tera, 'TONE') },
      { name: 'TE E.LEVEL', param: byName(tera, 'E.LEVEL') },
      { name: 'TE D.LEVEL', param: byName(tera, 'D.LEVEL') },
      { name: 'TE HOLD', param: byName(tera, 'HOLD') }
    ]
  },
  {
    category: 'REVERB',
    targets: [
      blockOnOff(),
      blockType(GT1_REVERB_TYPES),
      { name: 'TIME', param: byName(spring, 'TIME') },
      { name: 'LOW CUT', param: byName(spring, 'LOW CUT') },
      { name: 'HIGH CUT', param: byName(spring, 'HIGH CUT') },
      { name: 'E.LEVEL', param: byName(spring, 'E.LEVEL') },
      { name: 'SPRING', param: byName(spring, 'SPRING') },
      { name: 'DLY TIME', param: byName(revDelay, 'TIME') },
      { name: 'DLY FB', param: byName(revDelay, 'FEEDBACK') },
      { name: 'DLY HI CUT', param: byName(revDelay, 'HIGH CUT') },
      { name: 'DLY E.LEVEL', param: byName(revDelay, 'E.LEVEL') },
      { name: 'DLY D.LEVEL', param: byName(revDelay, 'D.LEVEL') }
    ]
  },
  { category: 'FOOT VOL', targets: [{ name: 'LEVEL', param: byName(GT1_FV_PARAMS, 'LEVEL') }] },
  {
    category: 'PEDAL FX',
    targets: [
      blockOnOff(),
      blockType(GT1_PEDAL_TYPES),
      { name: 'WAH LEVEL', param: typeParam(GT1_PEDAL_TYPES, 'CRY WAH', 'LEVEL') },
      { name: 'WAHPDMIN', param: typeParam(GT1_PEDAL_TYPES, 'CRY WAH', 'PDL MIN') },
      { name: 'WAHPDMAX', param: typeParam(GT1_PEDAL_TYPES, 'CRY WAH', 'PDL MAX') },
      { name: 'WAHPDPOS', param: typeParam(GT1_PEDAL_TYPES, 'CRY WAH', 'PDL POS') },
      { name: 'PB LEVEL', param: typeParam(GT1_PEDAL_TYPES, 'PEDAL BND', 'LEVEL') },
      { name: 'PB PITCH', param: typeParam(GT1_PEDAL_TYPES, 'PEDAL BND', 'PITCH') },
      { name: 'PB PD POS', param: typeParam(GT1_PEDAL_TYPES, 'PEDAL BND', 'PDL POS') }
    ]
  },
  {
    category: 'MASTER',
    targets: ['PATCH LVL', 'LOW GAIN', 'MID FREQ', 'MID Q', 'MID GAIN', 'HIGH GAIN'].map((n) => ({
      name: n,
      param: byName(GT1_MASTER_PARAMS, n)
    }))
  },
  {
    category: 'BPM/KEY',
    targets: ['BPM', 'KEY'].map((n) => ({ name: n, param: byName(GT1_MASTER_PARAMS, n) }))
  }
]

/** The target category the FX type loaded in `slot` answers to: FX2 + HARMONIST → "2 HARMONY". */
export function fxTargetCategory(slot: 'FX1' | 'FX2', type: string): string | null {
  const tag = FX_TARGET_TAG[type]
  return tag ? `${slot === 'FX1' ? 1 : 2} ${tag}` : null
}

/* ----------------------------------------------------------------- lookup */

/**
 * Compare labels the way a person reading the editor would: case, spacing,
 * dots and arrows do not matter; signs and digits do.
 */
export function labelKey(raw: string): string {
  return raw
    .replace(/[−–]/g, '-')
    .toUpperCase()
    .replace(/[^A-Z0-9+\-]/g, '')
}

/** Find a name among options (plus their aliases), exactly or by an unambiguous prefix. */
export function matchName<T extends { name: string; aliases?: string[] }>(
  raw: string,
  items: readonly T[]
): T | null {
  const key = labelKey(raw)
  if (!key) return null
  // the spelling as written first: "12:1" and "1.2:1" share a folded key
  const plain = raw.trim().toUpperCase()
  const verbatim = items.find((item) => [item.name, ...(item.aliases ?? [])].some((n) => n.toUpperCase() === plain))
  if (verbatim) return verbatim
  const keys = (item: T): string[] => [item.name, ...(item.aliases ?? [])].map(labelKey)
  const exact = items.find((item) => keys(item).includes(key))
  if (exact) return exact
  if (key.length < 3) return null
  const loose = items.filter((item) =>
    keys(item).some((k) => k.length >= 3 && (k.startsWith(key) || key.startsWith(k)))
  )
  return loose.length === 1 ? loose[0] : null
}

export function matchOption(raw: string, options: readonly string[]): string | null {
  return matchName(raw, options.map((name) => ({ name })))?.name ?? null
}

/** A block by its editor name, its chain label ("PrA", "DLY") or a common alias. */
export function findBlock(slot: string): Gt1Block | null {
  const named = GT1_BLOCKS.map((block) => ({
    name: block.slot,
    aliases: [block.chain, ...block.aliases].filter(Boolean),
    block
  }))
  return matchName(slot, named)?.block ?? null
}

/** Whether the rig's processor is a GT-1 — the only unit this catalogue is for. */
export function isGt1(processor: string | null | undefined): boolean {
  return /\bgt[\s-]?1\b/i.test(processor ?? '')
}

/* -------------------------------------------------------------- the key */

const PITCH_CLASS: Record<string, number> = {
  C: 0,
  'C#': 1,
  DB: 1,
  D: 2,
  'D#': 3,
  EB: 3,
  E: 4,
  F: 5,
  'F#': 6,
  GB: 6,
  G: 7,
  'G#': 8,
  AB: 8,
  A: 9,
  'A#': 10,
  BB: 10,
  B: 11
}

/**
 * The MASTER KEY setting for a song key: "Em" → "G (Em)", "Bb" → "Bb (Gm)".
 *
 * Arithmetic, like the pitch-shifter plan: the harmonist follows this setting,
 * and a model that picks the relative major wrong puts every harmony note a
 * half step off.
 */
export function gt1KeyFor(musicalKey: string | null | undefined): string | null {
  if (!musicalKey) return null
  const m = /^\s*([A-Ga-g])\s*([#♯b♭]?)\s*(.*)$/.exec(musicalKey)
  if (!m) return null
  const accidental = m[2] === '♯' ? '#' : m[2] === '♭' ? 'B' : m[2].toUpperCase()
  const root = PITCH_CLASS[`${m[1].toUpperCase()}${accidental}`]
  if (root === undefined) return null
  const rest = m[3].trim().toLowerCase()
  const minor = /^(m(?!aj)|min|minor|menor|-)/.test(rest)
  const major = minor ? (root + 3) % 12 : root
  return GT1_KEYS[major]
}

/* --------------------------------------------------------- prompt listing */

function describeParam(p: Gt1Param): string {
  if (p.kind === 'enum') return `${p.name} [${p.options.join('|')}]`
  if (p.kind === 'freq') {
    const fmt = (hz: number): string => (hz >= 1000 ? `${hz / 1000}kHz` : `${hz}Hz`)
    const span = `${fmt(p.min)}-${fmt(p.max)}`
    return `${p.name} ${p.flat ? `${span} or FLAT` : span}`
  }
  const sign = (n: number): string => (p.min < 0 && n > 0 ? `+${n}` : String(n))
  const unit = p.unit ? ` ${p.unit}` : ''
  return `${p.name} ${sign(p.min)}..${sign(p.max)}${unit}${p.bpm ? ' or BPM note' : ''}`
}

function describeType(t: Gt1Type): string {
  const models = t.models ? ` (${t.models})` : ''
  return `${t.name}${models}`
}

/**
 * The whole catalogue as prompt text: every block, type and parameter with its
 * range. Generated from the same table the validator reads, so the two cannot
 * drift apart.
 */
export function gt1CatalogueText(): string {
  const params = (list: Gt1Param[]): string => list.map(describeParam).join('; ')
  const lines: string[] = []

  lines.push('FX1 and FX2 (same list; TYPE = one of):')
  for (const t of GT1_FX_TYPES) {
    lines.push(`  ${describeType(t)}: ${params(t.params)}`)
  }
  lines.push('PEDAL FX (TYPE = one of):')
  for (const t of GT1_PEDAL_TYPES) lines.push(`  ${describeType(t)}: ${params(t.params)}`)
  lines.push(`OD/DS: ${params(odParams)}. TYPE = one of:`)
  lines.push(`  ${GT1_OD_TYPES.map(describeType).join('; ')}`)
  lines.push(`PREAMP: ${params(preampParams)}. TYPE = one of:`)
  lines.push(`  ${GT1_PREAMP_TYPES.map(describeType).join('; ')}`)
  lines.push(`NS: ${params(GT1_NS_PARAMS)} (THRESHOLD 0 = OFF)`)
  lines.push(`FOOT VOLUME: ${params(GT1_FV_PARAMS)}`)
  lines.push('DELAY (TYPE = one of):')
  for (const t of GT1_DELAY_TYPES) lines.push(`  ${describeType(t)}: ${params(t.params)}`)
  lines.push('REVERB (TYPE = one of):')
  for (const t of GT1_REVERB_TYPES) lines.push(`  ${describeType(t)}: ${params(t.params)}`)
  lines.push(`MASTER (no TYPE): ${params(GT1_MASTER_PARAMS)}`)
  return lines.join('\n')
}

/** The ASSIGN TARGET list as prompt text, grouped the way the editor groups it. */
export function gt1TargetsText(): string {
  return GT1_TARGETS.filter((c) => !c.fx || c.fx.slot === 'FX1')
    .map((c) => {
      const category = c.fx ? c.category.replace(/^1 /, 'n ') : c.category
      return `${category} [${c.targets.map((t) => t.name).join(', ')}]`
    })
    .join('; ')
}

/** How a fitted value prints: "+12", "461 ms", "2.5 s", "6.3 kHz", "-3rd". */
export function paramText(p: PatchParam): string {
  if (p.value === null) return p.text ?? '—'
  const signed = (p.min ?? 0) < 0 && p.value > 0 ? '+' : ''
  const number = p.decimals ? p.value.toFixed(p.decimals) : String(p.value)
  return `${signed}${number}${p.unit ? ` ${p.unit}` : ''}`
}
