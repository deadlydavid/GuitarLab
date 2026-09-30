import { LOCALE_PROMPT_NAMES, type Locale } from '@shared/i18n'
import { GT1_CTL_FUNCS } from '@shared/gt1'

/**
 * The prompts, and the one line in each that carries the user's language.
 *
 * Every prompt splits into three parts, and only one of them is translated:
 *
 * 1. **Scaffolding** — the role, the task, the constraints, the JSON schema and
 *    the field names. Permanently English. Three reasons: these models follow a
 *    JSON schema measurably better in English; keeping it fixed removes six
 *    prompts × three languages = eighteen variants from the maintenance
 *    surface, which is what would actually rot; and the vocabulary is English
 *    anyway — preamp, gain, backing track, drop tuning, ChordPro.
 * 2. **The output directive** — one line, generated per language. For prompts
 *    that return JSON it has to be *per field*, because a naive "answer in
 *    Spanish" translates the hardware labels too: a GT-1 prints PREAMP and
 *    OD/DS, and a patch that renames them is a patch nobody can dial in.
 * 3. **The data** — song title, artist, section names. Never translated; it is
 *    the user's own content.
 */

/** "Write your prose in Brazilian Portuguese", for a free-text answer. */
function proseDirective(locale: Locale): string {
  return `Write your answer in ${LOCALE_PROMPT_NAMES[locale]}.`
}

/**
 * The same, for a JSON answer, naming exactly which fields are prose.
 *
 * The second half matters more than the first. Without it, asking for Spanish
 * gets back `"slot": "PREAMPLIFICADOR"`, which does not exist on the device,
 * and a `chain` that no longer matches what is printed on the pedal.
 */
function jsonDirective(locale: Locale, proseFields: string[]): string {
  const fields = proseFields.map((f) => `\`${f}\``).join(', ')
  return (
    `Write the values of ${fields} in ${LOCALE_PROMPT_NAMES[locale]}. ` +
    'Everything else — field names, slot names, model names, and the labels in ' +
    '`chain` and `params` — must stay exactly as the device prints them, in ' +
    'English. Never translate a control or a block name.'
  )
}

/* ------------------------------------------------------------------ tone */

export function tonePatchSystemPrompt(locale: Locale): string {
  return (
    'You are a guitar tech who specialises in multi-effects units. You know the ' +
    'real block order and the real control names of each device. Answer with ' +
    'valid JSON only: no commentary, no code fences. ' +
    jsonDirective(locale, [
      'patchName',
      'appliesTo',
      'summary',
      'listenFor',
      'notes',
      'ctrl.action',
      'ctrl.when'
    ])
  )
}

export function tonePatchPrompt(
  context: string,
  outputLabel: string,
  pitch: {
    enabled: boolean
    playedTuning: string
    recordTuning: string
    semitones: number
  }
): string {
  const pitchLine = pitch.enabled
    ? `The guitar stays in ${pitch.playedTuning} and the PITCH SHIFTER (PS) block ` +
      `moves it ${pitch.semitones} semitone(s) to match the record ` +
      `(${pitch.recordTuning}). Include that block in EVERY patch, with Mix/Balance ` +
      'at 100% (shifted signal only), and mention the adjustment in the "notes" of ' +
      'the first patch.'
    : `The guitar stays in ${pitch.playedTuning} and this song needs NO pitch shifter.`

  return (
    `${context}\n\n` +
    'Build the patches for playing this song on this unit, going direct into ' +
    `${outputLabel} — include cabinet simulation and set the brightness for a direct ` +
    'signal, which tends to come out harsher than through an amp.\n\n' +
    `TUNING. ${pitchLine}\n\n` +
    'SPLITTING INTO PATCHES. If the song changes tone in a marked way — clean in the ' +
    'verse and distorted in the chorus, a solo that wants more gain and delay — return ' +
    'one patch per tone, at most 4, in chronological order. In "appliesTo", say which ' +
    'part of the song each one comes in at, using the section names when they exist. ' +
    'If the tone is the same from start to finish, return a single patch and do not ' +
    'invent divisions.\n\n' +
    'THE CTRL SWITCH. The unit has ONE assignable footswitch (CTRL) besides the patch ' +
    'bank. In "ctrl", say what is worth putting on it FOR THIS PATCH — wah, whammy, ' +
    'solo boost, delay, toggling a block — with what one press does and when in the ' +
    'song you would use it. If nothing in that patch justifies it, return "ctrl": null.\n\n' +
    'Use at most 6 blocks per patch, in the device\'s real chain order. In "params" use ' +
    'at most 4 controls per block: "value" is the knob position from 0 to 100, or null ' +
    'when the control is a choice rather than a knob (fill in "text" in that case). ' +
    'In "chain", list the short labels along the signal path, starting at the guitar ' +
    'and ending at the output.\n\n' +
    'Exact format:\n' +
    '{"patches":[{"patchName":"","appliesTo":"","summary":"",' +
    '"chain":["Guitar","COMP","OD","PREAMP","PA"],' +
    '"blocks":[{"slot":"PREAMP","model":"","enabled":true,' +
    '"params":[{"label":"Gain","value":70,"text":null}],"note":""}],' +
    '"ctrl":{"target":"WAH","action":"","when":""},' +
    '"listenFor":"","notes":""}]}'
  )
}

/* ---------------------------------------------------------- tone: GT-1 */

/**
 * Research first, patch second.
 *
 * The patch is only as close to the record as the model's idea of how the
 * record was made, and "thrash metal, so a high-gain amp" is the cliché, not
 * the recording. This asks the model to go and look — interviews, rig
 * rundowns, production credits — and to say "not documented" instead of
 * filling the gap, because the patch prompt treats what comes back as fact.
 */
export function toneResearchSystemPrompt(locale: Locale): string {
  return (
    'You research how specific recordings were made: guitars, pickups, amps, ' +
    'cabinets, pedals, microphones, studio and production. You search the web ' +
    '(interviews with the players, producers and engineers, rig rundowns, liner ' +
    'notes, gear databases, reputable forums) and you say plainly when something is ' +
    'not documented instead of guessing. Answer in markdown with short ### headings. ' +
    'Keep gear, model and control names exactly as the manufacturer writes them. ' +
    proseDirective(locale)
  )
}

export function toneResearchPrompt(context: string): string {
  return (
    `${context}\n\n` +
    'Find out how the GUITAR parts of this exact studio recording were tracked — the ' +
    'album version, not a live rig, unless the studio rig is unknown (then say so and ' +
    'give the closest documented rig of that era). Cover, in this order, one ### ' +
    'heading each:\n' +
    '1. Recording: studio, year, producer and engineer; how the guitars were tracked ' +
    '(how many layers, double-tracking, panning, re-amping).\n' +
    '2. Guitars: who plays which part, which guitars and pickups.\n' +
    '3. Amps and cabinets: heads or combos with channel and any known settings, ' +
    'speakers, microphones and where they were placed.\n' +
    '4. Effects: pedals and rack units, and in which part of the song each one is heard.\n' +
    '5. Tone by section: how the sound changes between the parts of the song (clean ' +
    'intro, harmonised leads, solo…).\n' +
    '6. What to chase: 3 to 6 bullets with the concrete characteristics of the ' +
    'recorded tone (amount of gain, where the mids sit, how tight the low end is, how ' +
    'dark or bright the top is, delay time, room).\n\n' +
    'Mark anything uncertain as uncertain. Never invent settings or gear. At most 450 words.'
  )
}

export function gt1PatchSystemPrompt(locale: Locale): string {
  return (
    'You are a guitar tech who programs the BOSS GT-1 in BOSS TONE STUDIO every day. ' +
    'You know its blocks, types, parameter names and ranges exactly as listed in the ' +
    'prompt, and you never use a parameter, type or value that is not on that list. ' +
    'Answer with valid JSON only: no commentary, no code fences. ' +
    jsonDirective(locale, [
      'patchName',
      'appliesTo',
      'summary',
      'listenFor',
      'notes',
      'blocks.note',
      'controls.action',
      'controls.when',
      'assigns.purpose',
      'cues.action'
    ])
  )
}

/**
 * The GT-1 patch prompt.
 *
 * Longer than the generic one because it has to be exact: the whole parameter
 * catalogue goes in (generated from the same table the answer is validated
 * against), plus the controller model that lets one patch play a whole song —
 * CTL1, the EXP pedal, its toe switch and six ASSIGNs.
 */
export function gt1PatchPrompt(input: {
  context: string
  output: 'pa' | 'fones' | 'amp'
  pitch: { enabled: boolean; playedTuning: string; recordTuning: string; semitones: number }
  bpm: number | null
  masterKey: string | null
  research: string | null
  catalogue: string
  targets: string
  /** The player's own request for this song, in their words. */
  wishes?: string | null
}): string {
  const { pitch } = input
  const tuning = pitch.enabled
    ? `The guitar stays in ${pitch.playedTuning}; the record is in ${pitch.recordTuning}. ` +
      `FX1 is RESERVED in every patch: TYPE PITCH SHIFTER, PITCH ${pitch.semitones}, FINE 0, ` +
      'PRE DELAY 0 ms, FEEDBACK 0, E.LEVEL 100, D.LEVEL 0 (shifted signal only), and FX1 ' +
      'first in the chain. FX2 is the only free FX slot — spend it on what the song needs most.'
    : `The guitar stays in ${pitch.playedTuning} and the song needs no pitch shifter: FX1 ` +
      'and FX2 are both free.'

  const output =
    input.output === 'amp'
      ? 'The GT-1 goes into the front of a guitar amplifier: OUTPUT SELECT is set for that ' +
        'amp, and SP TYPE has no effect in that mode (it only works with LINE/PHONES), so ' +
        'leave SP TYPE out and shape the tone knowing a real speaker follows.'
      : `The GT-1 goes direct into ${input.output === 'fones' ? 'headphones' : 'a PA / mixing desk'} ` +
        'with OUTPUT SELECT = LINE/PHONES, so SP TYPE is active: always pick a cabinet in ' +
        'PREAMP (ORIGIN, 1x12", 2x12", 4x12"…). A direct signal tends to come out harsher ' +
        'than a miked cabinet — keep PRESENCE and TREBLE honest.'

  const research = input.research
    ? 'HOW THE RECORD WAS MADE (web research — this is the target; match THIS gear, not ' +
      "the genre's cliché):\n" +
      `${input.research}\n\n` +
      'Map each piece of recorded gear to the closest GT-1 type — the lists below say what ' +
      'each type models — and say in that block\'s "note" which real unit it stands in for.'
    : 'No research on the recording is available; use what you reliably know about how ' +
      'this record was made, and say in "notes" what is uncertain.'

  const facts = [
    input.bpm ? `MASTER BPM = ${Math.round(input.bpm)} (the song's tempo).` : null,
    input.masterKey ? `MASTER KEY = ${input.masterKey} (the song's key; the HARMONIST follows it).` : null
  ]
    .filter(Boolean)
    .join(' ')

  const wishes = input.wishes?.trim()
    ? "THE PLAYER'S REQUEST for this song — follow it; if the GT-1 cannot do part of it, " +
      `say so in "notes" and do the closest thing it can:\n${input.wishes.trim()}\n\n`
    : ''

  return (
    `${input.context}\n\n` +
    `${research}\n\n` +
    wishes +
    `TUNING. ${tuning}\n\n` +
    `OUTPUT. ${output}\n\n` +
    (facts ? `SONG FACTS. ${facts}\n\n` : '') +
    'THE GOAL is a patch the player can build in BOSS TONE STUDIO knob by knob and play ' +
    'the whole song with, sounding as close to the record as the GT-1 allows. Use the ' +
    'unit to the full: both FX slots, the chain order, the EXP pedal, CTL1 and the ' +
    'ASSIGNs.\n\n' +
    'HOW MANY PATCHES. Prefer ONE patch for the whole song and move between its parts ' +
    'with the controllers: CTL1 turning a rhythm tone into a lead tone, the harmony or ' +
    'delay coming in, the EXP pedal for wah or volume swells. Return a second (or third) ' +
    'patch ONLY when the amp character itself changes — a clean section against a ' +
    'distorted one, for example — where no knob movement gets there. A lead line, a solo ' +
    'or a harmonised passage played over the same distorted amp is NOT a new patch: it ' +
    'lives in the distorted patch and CTL1 brings it in (ASSIGNs on the FX ON/OFF, ' +
    'PREAMP GAIN, DELAY, PATCH LVL). At most 3 patches, in playing order. In "appliesTo" ' +
    'say which parts of the song each patch covers, using the section names when there ' +
    'are any.\n\n' +
    'FX SLOTS ARE SCARCE. Do the tone-shaping EQ with MASTER EQ, which costs no FX slot, ' +
    'and keep FX1/FX2 for effects the song actually needs (harmony, chorus, compressor, ' +
    'octave…). Spend an FX slot on GRAPHIC EQ or PARA.EQ only when nothing else needs it. ' +
    'If the record has harmonised twin-guitar lines, the patch those lines are played on ' +
    'carries a HARMONIST (off in the patch, switched on by CTL1 through an ASSIGN) so one ' +
    'guitarist can play both parts.\n\n' +
    'THE GT-1, EXACTLY (block → TYPE → parameters and ranges; nothing else exists):\n' +
    `${input.catalogue}\n\n` +
    'CHAIN. The nine blocks FX1, PDL, OD, PrA, NS, DLY, FV, FX2, REV can be put in any ' +
    'order; default FX1 PDL OD PrA NS DLY FV FX2 REV. Put effects that track pitch or ' +
    'shape the input (PITCH SHIFTER, HARMONIST, OCTAVE, PEDAL BND, COMPRESSOR, SLOW GEAR) ' +
    'BEFORE OD and PrA; wah (PDL) before OD; NS right after PrA; modulation, delay and ' +
    'reverb after PrA. "chain" lists all nine labels in the order you want.\n\n' +
    'CONTROLLERS — this is how one patch covers several parts of a song. Built in: CTL1 ' +
    '(footswitch), the EXP pedal (EXP1) and its toe switch (EXP SW). The ▼/▲ switches ' +
    'stay for changing patches; do not use them, and do not use CTL2, CTL3 or EXP2 (they ' +
    'need an external pedal the player does not have).\n' +
    `- CTL1 and EXP SW each have a FUNC: ${GT1_CTL_FUNCS_TEXT}; MODE MOMENT or TOGGLE. With ` +
    'OD SOLO or PrA SOLO also set "soloLevel" 0..100, the volume while the solo is on. ' +
    'EXP SW cannot use BPM TAP or DELAY TAP.\n' +
    '- EXP1 has a FUNCTION: OFF, FOOT VOL, PEDAL FX, PDL FX/FV (with PDL FX/FV the toe ' +
    'switch flips the pedal between wah and volume).\n' +
    '- ASSIGN 1-6: SOURCE (CTL 1, EXP 1, INT PEDAL, WAVE PEDAL), MODE (MOMENT/TOGGLE), ' +
    'TARGET CATEGORY + TARGET from the list below, TARGET MIN (switch off / pedal heel) ' +
    'and TARGET MAX (switch on / pedal toe), in the target\'s own units. Every ASSIGN on ' +
    'the same SOURCE moves with one press, so CTL1 can turn rhythm into lead in one go — ' +
    'e.g. ASSIGN1 CTL 1 → PREAMP GAIN 55→78, ASSIGN2 CTL 1 → FX2 ON/OFF OFF→ON (harmony), ' +
    'ASSIGN3 CTL 1 → DELAY E.LEVEL 0→35, ASSIGN4 CTL 1 → MASTER PATCH LVL 100→115. ' +
    'INT PEDAL moves the target once from MIN to MAX after a TRIGGER (PAT CNG, EXP1 LO, ' +
    'EXP1 MID, EXP1 HI, EXP1 SW, CTL1 PDL) over TIME 0..100 with CURVE LINEAR/SLOW/FAST; ' +
    'WAVE PEDAL cycles it at a RATE (0..100 or a BPM note) with WAVEFORM SAW/TRI/SINE. ' +
    'Both need MODE MOMENT.\n' +
    `- TARGET list ("n" = 1 for FX1, 2 for FX2, and must match the effect loaded in that ` +
    `slot): ${input.targets}\n` +
    '- Rules: when an ASSIGN uses CTL 1 or EXP 1, set that control\'s own FUNC/FUNCTION to ' +
    'OFF unless you really want both actions; never let a FUNC and an ASSIGN switch the ' +
    'same block. An FX slot that CTL1 or an ASSIGN turns on is still listed in "blocks", ' +
    'with "enabled": false and its full settings.\n\n' +
    'TRICKS THE GT-1 CAN DO. Twin-guitar harmony: the player plays the main melody and ' +
    'the HARMONIST in a free FX slot plays the second guitar — a third BELOW by default ' +
    '(HARMONY -3rd); use +3rd only when the record\'s second guitar sits above the ' +
    'melody. MASTER KEY in the song\'s key, the HARMONIST before OD/PrA in the chain (and ' +
    'right after the tuning PITCH SHIFTER when FX1 holds one, so it hears the notes in ' +
    'the record\'s key). It tracks single notes only, so switch it on for the harmonised ' +
    'lines and off for chords. A fake double-tracked rhythm (stereo output): CHORUS MODE STEREO2 with DEPTH ' +
    '0, or PITCH SHIFTER PITCH 0 with FINE ±6..10 and PRE DELAY 15..30 ms. Solo boost ' +
    'that keeps the tone: OD SOLO or PrA SOLO on CTL1 with a SOLO LEVEL, or an ASSIGN on ' +
    'PATCH LVL. Delay in time with the song: TIME as a BPM note ("BPM 1/8.", "BPM 1/4") ' +
    'rides MASTER BPM.\n\n' +
    'VALUES. "value" is the number exactly as BOSS TONE STUDIO shows it, in the ' +
    "parameter's own range and unit (GAIN 0..120, TONE -50..+50, DELAY TIME in ms, " +
    'REVERB TIME in seconds, EQ gains in dB). Use "text" with "value": null for choices ' +
    '(sub-types, SP TYPE, ON/OFF, HIGH CUT/LOW CUT/FREQ like "6.3kHz" or "FLAT", Q, ' +
    'RATIO, HARMONY, KEY) and for BPM-synced times like "BPM 1/8.". Give EVERY parameter ' +
    'of each block you list. Leave out blocks that stay off and are never switched on; ' +
    'always include a MASTER block (PATCH LVL, BPM, KEY and the MASTER EQ) and set PATCH ' +
    'LVL so every patch of the song sits at the same loudness. "patchName" has at most 16 ' +
    'characters (the GT-1\'s limit).\n\n' +
    'EQ. A recorded guitar is a miked cabinet inside a mix: the top usually rolls off ' +
    'above 6-8 kHz and the low end is tightened below 80-100 Hz. Get close with the amp ' +
    'knobs and SP TYPE first; use MASTER EQ for the rest. The app then measures the ' +
    'player\'s sound against the isolated guitar stem and suggests GEQ values, so aim for ' +
    'a musical starting point, not an EQ puzzle.\n\n' +
    '"cues" is the live cue sheet for the whole song in playing order: for each part ' +
    '(section names when there are any), which patch is active and exactly what the ' +
    'player does with the feet (press CTL1, EXP pedal to the toe, press EXP SW…).\n\n' +
    'Exact format:\n' +
    '{"patches":[{"patchName":"","appliesTo":"","summary":"",' +
    '"chain":["FX1","PDL","OD","PrA","NS","DLY","FV","FX2","REV"],' +
    '"blocks":[{"slot":"PREAMP","model":"MS1959 I+II","enabled":true,' +
    '"params":[{"label":"GAIN","value":70,"text":null},{"label":"SP TYPE","value":null,"text":"4x12\\""}],' +
    '"note":""},{"slot":"MASTER","model":"","enabled":true,"params":[{"label":"PATCH LVL","value":100,"text":null}],"note":""}],' +
    '"controls":[{"source":"CTL1","func":"OFF","mode":"TOGGLE","soloLevel":null,"action":"","when":""},' +
    '{"source":"EXP1","func":"PDL FX/FV","mode":null,"soloLevel":null,"action":"","when":""}],' +
    '"assigns":[{"source":"CTL 1","mode":"TOGGLE","category":"PREAMP","target":"GAIN","min":55,"max":78,"purpose":""}],' +
    '"listenFor":"","notes":""}],' +
    '"cues":[{"section":"","patch":"","action":""}]}'
  )
}

/** The FUNC list minus NUMBER +1/-1: a patch that changes patch is not what CTL1 is for here. */
const GT1_CTL_FUNCS_TEXT = GT1_CTL_FUNCS.filter((f) => !f.startsWith('NUMBER')).join(', ')

/* -------------------------------------------------------------- markdown */

export function practicePlanSystemPrompt(locale: Locale): string {
  return (
    'You are a guitar, bass and drums teacher. Be direct and practical: short ' +
    'markdown, no filler, no encouragement padding. ' +
    proseDirective(locale)
  )
}

export function techniqueSystemPrompt(locale: Locale): string {
  return (
    'You are an instrument teacher. Be objective: short markdown with short ' +
    'headings, and no restating of the question. ' +
    proseDirective(locale)
  )
}

/**
 * The per-part walkthrough behind "Dicas para esta música".
 *
 * Two things make this prompt worth its own function. It asks the model to go
 * part by part rather than to summarise the song, because the answer is read
 * next to a tablature that is already open at one of those parts; and it pins
 * the difficulty to a five-star scale with the anchors spelled out, because
 * "difficult" from a model that has read a thousand transcription forums drifts
 * upward until everything is a five.
 *
 * The stars are asked for as literal filled/empty characters rather than a
 * number so they survive the markdown renderer with no parsing on our side.
 */
export function techniquePrompt(context: string, sectionScope: string | null): string {
  const scope = sectionScope
    ? `Focus on ${sectionScope}, but keep the same structure below.`
    : 'Cover every part of the song, in playing order.'

  return (
    `${context}\n\n${scope}\n\n` +
    'Write the answer as markdown, in this shape:\n\n' +
    '1. A `##` heading per part of the song, named after the section when the ' +
    'sections are listed above, and by what happens musically when they are not ' +
    '(for example "Intro - arpejo limpo").\n' +
    '2. Directly under each heading, one line exactly like ' +
    '`**Dificuldade:** ★★★☆☆ (3/5) - <six words on what makes it that hard>`. ' +
    'Use the filled star ★ and the empty star ☆, five characters in total.\n' +
    '3. Then, for that part: what is actually played (technique, position on the ' +
    'neck, which hand carries the work), what usually goes wrong, and one ' +
    'concrete exercise with the BPM to start at and the BPM to reach.\n' +
    '4. Finish with a `##` heading for the practice order - which parts to attack ' +
    'first and why.\n\n' +
    'The five-star scale is for THIS instrument and THIS song, anchored like ' +
    'this: 1 = open chords and whole notes; 2 = power chords and simple ' +
    'pentatonic phrases; 3 = fast alternate picking, barre chords, small ' +
    'stretches; 4 = sweep picking, tapping, wide stretches, fast position ' +
    'shifts; 5 = the hardest thing a guitarist plays, at the limit of the ' +
    'instrument. Most parts of most songs are 2 or 3 - do not inflate.\n\n' +
    'Be concrete and short: at most 120 words per part, no encouragement, no ' +
    'restating of the question.'
  )
}

/* ---------------------------------------------------------- song sections */

export function sectionsSystemPrompt(locale: Locale): string {
  return (
    'You know the arrangements of recorded songs bar by bar. Answer with valid ' +
    'JSON only: no commentary, no code fences. ' +
    jsonDirective(locale, ['sections.name'])
  )
}

/**
 * The song's structure, for when the Guitar Pro file carries no markers.
 *
 * The bar numbers are what make the answer useful - they are what the loop
 * buttons in the practice screen set - but a model that does not know the song
 * well will invent them, and a made-up bar range loops over the wrong music. So
 * bars are optional, the seconds are the fallback, and the model is told to
 * leave a field null rather than guess it.
 */
export function sectionsPrompt(context: string, barCount: number | null): string {
  const bars = barCount
    ? `The Guitar Pro file has ${barCount} bars, numbered from 1. Every bar number must fall inside that range.`
    : 'There is no tablature for this song, so leave every bar number null and give seconds instead.'

  return (
    `${context}\n\n` +
    'Break this song into the parts a guitarist would practise separately - ' +
    'intro, verse, chorus, bridge, solo, riff, breakdown, outro. Between 3 and ' +
    '14 parts, in playing order, covering the song from start to finish with no ' +
    'gaps.\n\n' +
    `${bars}\n\n` +
    'For each part give: "name" (what the player would call it, such as "Solo 1" ' +
    'or "Refrao"), "kind" (exactly one of intro, verse, chorus, bridge, solo, ' +
    'outro, riff, breakdown, other), "startBar" and "endBar" (1-based and ' +
    'inclusive, or null), and "startSec" and "endSec" (seconds from the start of ' +
    'the recording, or null).\n\n' +
    'ACCURACY OVER COMPLETENESS. If you do not actually know where a part falls, ' +
    'set that number to null. A null is fine; a confident wrong bar number sends ' +
    'the practice loop to the wrong music.\n\n' +
    'Exact format:\n' +
    '{"sections":[{"name":"","kind":"intro","startBar":1,"endBar":8,' +
    '"startSec":0,"endSec":19}]}'
  )
}

export function toneAdviceSystemPrompt(locale: Locale): string {
  return (
    'You know guitar tone and multi-effects units. Answer in markdown with short ' +
    '### headings. Keep device control names, block names and model names exactly ' +
    'as the unit prints them, in English. ' +
    proseDirective(locale)
  )
}

/* ------------------------------------------------------ machine-readable */

/**
 * These two return data, not prose, so they take no locale at all.
 *
 * The video classifier answers with role identifiers the app already knows, and
 * the ChordPro converter reformats the user's own chart — chord symbols and
 * ChordPro directives are the same in every language. Passing a language here
 * would only give the model licence to translate something it should not.
 */
export function classifyVideosSystemPrompt(): string {
  return (
    'Classify YouTube videos for a guitar practice app. Answer with valid JSON ' +
    'only: no commentary, no code fences.'
  )
}

export function toChordProSystemPrompt(): string {
  return (
    'You convert plain-text chord sheets into ChordPro. Keep the lyrics exactly ' +
    'as written and place each chord inline in square brackets at the syllable ' +
    'it falls on. Answer with the ChordPro only: no commentary, no code fences.'
  )
}
