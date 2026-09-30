/**
 * The tone plan: tuning maths, the shape of what the model returns, and the
 * instructions the prompt is required to carry.
 *
 * Run with: npm run test:tone
 *
 * The tuning side is arithmetic and must never depend on a model getting it
 * right — the player's rule is that the guitar stays in E standard (a physical
 * Drop D at most) and the pitch shifter covers the rest, so this is where that
 * rule is actually enforced.
 */
import {
  planPitchShifter,
  normalizePlan,
  normalizePatch,
  normalizeGt1Plan,
  noteToMidi,
  buildToneContext,
  fitParam,
  fitChain,
  paramText,
  researchFromInsight,
  researchToInsight
} from '../src/main/services/tone'
import { gt1PatchPrompt, tonePatchPrompt } from '../src/main/services/prompts'
import { geminiGrounding, parseResponsesEvent, stripInlineLinks } from '../src/main/services/llm/websearch'
import {
  GT1_FX_TYPES,
  gt1CatalogueText,
  gt1KeyFor,
  gt1TargetsText,
  isGt1,
  type Gt1Param
} from '../src/shared/gt1'
import { RIG_DEFAULT, RIG_OUTPUT_EN, type PatchBlock, type PatchParam } from '../src/shared/types'

let failures = 0
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${label}${detail ? ` -- ${detail}` : ''}`)
  if (!ok) failures++
}

const tuning = (name: string, strings: string[]): { name: string; strings: string[] } => ({
  name,
  strings
})

console.log('=== 1. notas -> MIDI ===')
check('E2 e 40', noteToMidi('E2') === 40, String(noteToMidi('E2')))
check('sustenido', noteToMidi('D#2') === 39, String(noteToMidi('D#2')))
check('bemol equivale ao sustenido', noteToMidi('Eb2') === noteToMidi('D#2'))
check('lixo devolve null', noteToMidi('xyz') === null)

console.log('\n=== 2. afinação -> pitch shifter ===')
const eStandard = planPitchShifter(tuning('E Standard', ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']))
check('E padrão não usa PS', !eStandard.enabled && eStandard.playedTuning === 'E padrão')

const ebStandard = planPitchShifter(
  tuning('Eb Standard', ['D#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'])
)
check('Eb desce 1 semitom no PS', ebStandard.enabled && ebStandard.semitones === -1, `${ebStandard.semitones}`)
check('e a guitarra fica em E padrão', ebStandard.playedTuning === 'E padrão', ebStandard.playedTuning)
check('a nota explica o ajuste', /PITCH SHIFTER/.test(ebStandard.note), ebStandard.note)

const dStandard = planPitchShifter(tuning('D Standard', ['D2', 'G2', 'C3', 'F3', 'A3', 'D4']))
check('D padrão desce 2 semitons', dStandard.enabled && dStandard.semitones === -2, `${dStandard.semitones}`)

const dropD = planPitchShifter(tuning('Drop D', ['D2', 'A2', 'D3', 'G3', 'B3', 'E4']))
check('Drop D é feito na mão, sem PS', !dropD.enabled && dropD.playedTuning === 'Drop D')

// the case the player asked about: Drop D on the guitar plus half a step down
const dropCsharp = planPitchShifter(
  tuning('Drop C#', ['C#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'])
)
check(
  'Drop C# = Drop D na mão + PS -1',
  dropCsharp.enabled && dropCsharp.semitones === -1 && dropCsharp.playedTuning === 'Drop D',
  `${dropCsharp.playedTuning} ${dropCsharp.semitones}`
)

const dropC = planPitchShifter(tuning('Drop C', ['C2', 'G2', 'C3', 'F3', 'A3', 'D4']))
check(
  'Drop C = Drop D na mão + PS -2',
  dropC.enabled && dropC.semitones === -2 && dropC.playedTuning === 'Drop D',
  `${dropC.playedTuning} ${dropC.semitones}`
)

const sevenString = planPitchShifter(
  tuning('E Standard (7)', ['B1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4'])
)
check('7 cordas não vira PS', !sevenString.enabled && /7 cordas/.test(sevenString.note))

const dadgad = planPitchShifter(tuning('DADGAD', ['D2', 'A2', 'D3', 'G3', 'A3', 'D4']))
check('afinação aberta não vira PS', !dadgad.enabled && /não é um deslocamento/.test(dadgad.note))

check('sem afinação assume E padrão', !planPitchShifter(null).enabled)

console.log('\n=== 3. resposta da IA -> plano ===')
const raw = {
  patches: [
    {
      patchName: 'Puppets Clean',
      appliesTo: 'Trecho limpo do meio',
      summary: 'limpo com chorus',
      chain: ['Guitarra', 'COMP', 'PREAMP', 'PA'],
      blocks: [
        {
          slot: 'PREAMP',
          model: 'JC-120',
          enabled: true,
          params: [
            { label: 'Gain', value: 20 },
            { label: 'Tipo', value: null, text: 'CLEAN TWIN' },
            { label: 'Bass', value: '55' },
            { label: 'Fora', value: 900 }
          ]
        }
      ],
      ctrl: { target: 'CHORUS', action: 'liga o chorus', when: 'no arpejo' },
      listenFor: 'as cordas soltas',
      notes: ''
    },
    {
      patchName: 'Puppets Rhythm',
      appliesTo: 'Riff principal',
      blocks: [{ slot: 'PREAMP', model: 'RECTO', params: [{ label: 'Gain', value: 78 }] }],
      ctrl: { target: '', action: 'nada' }
    },
    { patchName: 'Vazio', blocks: [] }
  ]
}

const plan = normalizePlan(raw, RIG_DEFAULT, ebStandard, 'gemini', 'flash')
check('um patch por timbre', plan.patches.length === 2, `${plan.patches.length}`)
check('em ordem', plan.patches[0].patchName === 'Puppets Clean')
check('patch sem bloco é descartado', !plan.patches.some((p) => p.patchName === 'Vazio'))
check('o trecho de cada patch é preservado', plan.patches[0].appliesTo === 'Trecho limpo do meio')
check(
  'knob fora da faixa é preso em 0..100',
  plan.patches[0].blocks[0].params[3].value === 100,
  `${plan.patches[0].blocks[0].params[3].value}`
)
check(
  'knob em texto vira número',
  plan.patches[0].blocks[0].params[2].value === 55,
  `${plan.patches[0].blocks[0].params[2].value}`
)
check('seletor mantém o texto', plan.patches[0].blocks[0].params[1].text === 'CLEAN TWIN')
check('CTRL válido é mantido', plan.patches[0].ctrl?.target === 'CHORUS')
check('CTRL sem alvo vira null', plan.patches[1].ctrl === null)
check('o pitch shifter vem do cálculo, não do modelo', plan.pitchShifter?.semitones === -1)
check('o patch sem cadeia ganha uma pela lista de blocos', plan.patches[1].chain.length >= 3)

const legacy = normalizePlan(
  { patchName: 'Antigo', blocks: [{ slot: 'OD', model: 'TS', params: [] }] },
  RIG_DEFAULT,
  eStandard,
  'ollama',
  'qwen'
)
check('resposta antiga (um patch só) ainda vira plano', legacy.patches.length === 1)
check('e ganha um trecho padrão', legacy.patches[0].appliesTo === 'Música inteira')

check('lixo vira plano vazio', normalizePlan('nada', RIG_DEFAULT, eStandard, 'x', 'y').patches.length === 0)
check(
  'patch sem nada usável não inventa blocos',
  normalizePatch({}, RIG_DEFAULT, 'x', 'y').blocks.length === 0
)

console.log('\n=== 4. o prompt carrega as regras ===')
const context = buildToneContext(
  {
    title: 'Master of Puppets',
    artist: 'Metallica',
    genre: 'Thrash Metal',
    musicalKey: 'Em',
    bpm: 212,
    tuning: tuning('Eb Standard', ['D#2', 'G#2', 'C#3', 'F#3', 'A#3', 'D#4'])
  },
  RIG_DEFAULT,
  ['Intro', 'Riff', 'Clean', 'Solo']
)
check('o contexto leva os trechos da música', /Intro, Riff, Clean, Solo/.test(context))
check('e a afinação do disco', /Eb Standard/.test(context))

/*
 * The prompt scaffolding is fixed English — see services/prompts.ts for why.
 * Only the output directive follows the interface language, and that is
 * covered in test-llm.ts, which has all three catalogues to compare.
 */
const output = RIG_OUTPUT_EN[RIG_DEFAULT.output].toLowerCase()
const prompt = tonePatchPrompt(context, output, ebStandard)
check('manda usar o CTRL', /CTRL/.test(prompt))
check('explica o pitch shifter', /PITCH SHIFTER/.test(prompt) && /-1/.test(prompt))
check(
  'pede patches separados por trecho',
  /appliesTo/.test(prompt) && /at most 4/.test(prompt)
)
check('pede JSON com lista de patches', /"patches":\[/.test(prompt))
check('diz para onde a saida vai', prompt.includes(output))

const promptNoPitch = tonePatchPrompt(context, output, eStandard)
check('sem PS o prompt diz que não precisa', /NO pitch shifter/.test(promptNoPitch))

console.log('\n=== 5. GT-1: a chave, o aparelho e cada valor ===')
check('Em vira G (Em)', gt1KeyFor('Em') === 'G (Em)', String(gt1KeyFor('Em')))
check('F#m vira A (F#m)', gt1KeyFor('F#m') === 'A (F#m)', String(gt1KeyFor('F#m')))
check('Bb maior', gt1KeyFor('Bb') === 'Bb (Gm)', String(gt1KeyFor('Bb')))
check('C# minor por extenso', gt1KeyFor('C# minor') === 'E (C#m)', String(gt1KeyFor('C# minor')))
check('A major', gt1KeyFor('A major') === 'A (F#m)', String(gt1KeyFor('A major')))
check('sem tom, sem KEY', gt1KeyFor(null) === null && gt1KeyFor('???') === null)

check('Boss GT-1 é GT-1', isGt1('Boss GT-1') && isGt1('gt1') && isGt1('BOSS GT 1'))
check('GT-1000 e outras não são', !isGt1('Boss GT-1000') && !isGt1('Line 6 HX Stomp'))

const fxParams = (type: string): Gt1Param[] => GT1_FX_TYPES.find((t) => t.name === type)?.params ?? []
const param = (type: string, name: string): Gt1Param =>
  fxParams(type).find((p) => p.name === name) as Gt1Param
check(
  'HARMONY -3 vira -3rd',
  fitParam(param('HARMONIST', 'HARMONY'), { value: -3 }).text === '-3rd'
)
check(
  'HARMONY "3rd below" não inventa: avisa',
  Boolean(fitParam(param('HARMONIST', 'HARMONY'), { text: 'terça' }).warning)
)
const hc = fitParam(param('CHORUS', 'HIGH CUT'), { text: '6kHz' })
check('HIGH CUT 6 kHz cai no degrau de 6,3 kHz', hc.text === '6.3 kHz', String(hc.text))
check('HIGH CUT FLAT', fitParam(param('CHORUS', 'HIGH CUT'), { text: 'flat' }).text === 'FLAT')
const pre = fitParam(param('PITCH SHIFTER', 'PRE DELAY'), { text: 'BPM 1/8.' })
check('tempo em nota de BPM fica como texto', pre.value === null && pre.text === 'BPM 1/8.', String(pre.text))
const fine = fitParam(param('PITCH SHIFTER', 'FINE'), { value: -80 })
check('FINE −80 é preso em −50, com aviso', fine.value === -50 && Boolean(fine.warning))
check('e imprime com sinal', paramText(fitParam(param('PITCH SHIFTER', 'FINE'), { value: 6 })) === '+6')

console.log('\n=== 6. GT-1: patch conferido contra o manual ===')
const rawGt1 = {
  patches: [
    {
      patchName: 'PUPPETS HARMONY NOME COMPRIDO',
      appliesTo: 'Riff e solos',
      chain: ['FX1', 'OD', 'PREAMP', 'NS', 'FX2', 'DELAY', 'REVERB'],
      blocks: [
        {
          slot: 'FX1',
          model: 'Harmonist',
          enabled: false,
          params: [
            { label: 'Harmony', value: -3 },
            { label: 'E.LEVEL', value: 80 },
            { label: 'Mix', value: 50 }
          ]
        },
        {
          slot: 'PrA',
          model: 'Clean Twin',
          params: [
            { label: 'Treble', value: 55 },
            { label: 'Gain', value: 130 },
            { label: 'Speaker', text: '4x12' },
            { label: 'TYPE', text: 'CLEAN TWIN' }
          ]
        },
        {
          slot: 'OD',
          model: 'Tube Screamer',
          params: [
            { label: 'Drive', value: 40 },
            { label: 'Tone', value: 80 }
          ]
        },
        {
          slot: 'DLY',
          model: 'ANALOG',
          params: [
            { label: 'Delay Time', text: '380ms' },
            { label: 'High Cut', text: '6kHz' },
            { label: 'E.Level', value: 30 }
          ]
        },
        { slot: 'REVERB', model: 'Hall', params: [{ label: 'Time', value: 2.5 }] },
        { slot: 'Looper', model: 'X', params: [{ label: 'Q', value: 3 }] }
      ],
      controls: [
        { source: 'CTL 1', func: 'FX1', mode: 'toggle', action: 'liga a harmonia', when: 'solo' },
        { source: 'EXP pedal', func: 'Wah', action: 'wah no solo', when: 'solo' },
        { source: 'EXP SW', func: 'BPM TAP', action: '', when: '' }
      ],
      assigns: [
        { source: 'CTL1', mode: 'TOGGLE', category: 'FX1', target: 'E.LEVEL', min: 0, max: 80, purpose: 'harmonia' },
        { source: 'CTL1', category: 'PREAMP', target: 'Gain', min: 30, max: 200, purpose: 'mais ganho' },
        { source: 'CTL1', category: 'FX1', target: 'ON/OFF', min: 'OFF', max: 'ON', purpose: 'liga' },
        { source: 'EXP SW', category: 'DELAY', target: 'E.LEVEL', min: 0, max: 40, purpose: '' },
        { source: 'CTL1', category: 'NS', target: 'THRESHOLD', min: 10, max: 30, purpose: '' },
        { source: 'WAVE PEDAL', category: 'PREAMP', target: 'LEVEL', min: 40, max: 60, rate: 'bpm 1/4', waveform: 'sine' }
      ],
      listenFor: 'as duas guitarras em terças',
      notes: ''
    }
  ],
  cues: [
    { section: 'Intro', patch: 'PUPPETS', action: 'CTL1 desligado' },
    { section: 'Vazio', patch: '', action: '' }
  ]
}

// Eb on the record: FX1 becomes the pitch shifter, and the harmonist has to move
const gt1Plan = normalizeGt1Plan(rawGt1, RIG_DEFAULT, ebStandard, { bpm: 212, musicalKey: 'Em' }, 'openai', 'x')
const gp = gt1Plan.patches[0]
const blockOf = (slot: string): PatchBlock | undefined => gp.blocks.find((b) => b.slot === slot)
const paramOf = (slot: string, label: string): PatchParam | undefined =>
  blockOf(slot)?.params.find((p) => p.label === label)

check('plano marcado como GT-1', gt1Plan.device === 'gt1')
check('nome cabe nos 16 caracteres da GT-1', gp.patchName.length <= 16, gp.patchName)
check('FX1 vira o PITCH SHIFTER da afinação', blockOf('FX1')?.model === 'PITCH SHIFTER')
check('PITCH −1, E.LEVEL 100, D.LEVEL 0', paramOf('FX1', 'PITCH')?.value === -1 && paramOf('FX1', 'E.LEVEL')?.value === 100 && paramOf('FX1', 'D.LEVEL')?.value === 0)
check('o harmonist mudou para o FX2', blockOf('FX2')?.model === 'HARMONIST' && blockOf('FX2')?.enabled === false)
check('HARMONY −3 vira −3rd', paramOf('FX2', 'HARMONY')?.text === '-3rd')
check('"Mix" não existe no HARMONIST e fica com aviso', Boolean(paramOf('FX2', 'Mix')?.warning))
const labels = gp.chain.slice(1, -1)
check('a cadeia tem os nove blocos', labels.length === 9 && new Set(labels).size === 9, labels.join(' '))
check('FX1 primeiro, FX2 logo depois (antes do OD)', labels[0] === 'FX1' && labels[1] === 'FX2', labels.join(' '))
check('PREAMP com o nome do editor', blockOf('PREAMP')?.model === 'CLEAN TWIN')
check('GAIN 130 preso em 120, com aviso', paramOf('PREAMP', 'GAIN')?.value === 120 && Boolean(paramOf('PREAMP', 'GAIN')?.warning))
check('SP TYPE vira 4x12"', paramOf('PREAMP', 'SP TYPE')?.text === '4x12"', String(paramOf('PREAMP', 'SP TYPE')?.text))
check('TYPE repetido nos params some', !blockOf('PREAMP')?.params.some((p) => p.label === 'TYPE'))
check('parâmetros na ordem do editor', blockOf('PREAMP')?.params[0].label === 'GAIN')
check('Tube Screamer vira T-SCREAM', blockOf('OD/DS')?.model === 'T-SCREAM', blockOf('OD/DS')?.model)
check('TONE +80 preso em +50', paramOf('OD/DS', 'TONE')?.value === 50)
check('TIME 380 ms', paramOf('DELAY', 'TIME')?.value === 380 && paramOf('DELAY', 'TIME')?.unit === 'ms')
check('HIGH CUT no degrau real', paramOf('DELAY', 'HIGH CUT')?.text === '6.3 kHz')
check('"Hall" é ambíguo (HALL 1 ou 2): avisa', Boolean(blockOf('REVERB')?.warning))
check('bloco que a GT-1 não tem fica com aviso', Boolean(gp.blocks.find((b) => b.slot === 'Looper')?.warning))
check('MASTER entra sempre', Boolean(blockOf('MASTER')))
check('BPM é o da música', paramOf('MASTER', 'BPM')?.value === 212)
check('KEY é a da música', paramOf('MASTER', 'KEY')?.text === 'G (Em)')

const ctl = gp.controls ?? []
check('CTL1 acompanhou o harmonist para o FX2', ctl.find((c) => c.source === 'CTL1')?.func === 'FX2')
check('pedal com "Wah" vira PEDAL FX', ctl.find((c) => c.source === 'EXP1')?.func === 'PEDAL FX')
check('EXP SW não faz tap tempo', Boolean(ctl.find((c) => c.source === 'EXP SW')?.warning))

const as = gp.assigns ?? []
check('ASSIGN no FX1 foi atrás do harmonist: 2 HARMONY', as[0]?.category === '2 HARMONY' && as[0]?.target === 'E.LEVEL', `${as[0]?.category} ${as[0]?.target}`)
check('MIN/MAX no formato do editor', as[0]?.min === '0' && as[0]?.max === '80')
check('GAIN 200 no ASSIGN preso em 120', as[1]?.max === '120', as[1]?.max)
check('FUNC e ASSIGN ligando o mesmo bloco: avisa', Boolean(as[2]?.warning))
check('EXP SW não é SOURCE de ASSIGN', Boolean(as[3]?.warning))
check('NS não está na lista TARGET', Boolean(as[4]?.warning))
check('WAVE PEDAL leva taxa e forma de onda', as[5]?.extra === 'WAVE RATE BPM 1/4 · WAVEFORM SINE' && as[5]?.mode === 'MOMENT', String(as[5]?.extra))
check('roteiro sem ação é descartado', gt1Plan.cues?.length === 1)
check('o modelo antigo de CTRL único não é usado', gp.ctrl === null)

const noPitch = normalizeGt1Plan(rawGt1, RIG_DEFAULT, eStandard, { bpm: null, musicalKey: null }, 'x', 'y')
check('sem PS, o FX1 fica com o que o modelo pôs', noPitch.patches[0].blocks.find((b) => b.slot === 'FX1')?.model === 'HARMONIST')
check('e o ASSIGN aponta para 1 HARMONY', noPitch.patches[0].assigns?.[0]?.category === '1 HARMONY')
check('sem BPM declarado, não inventa', !noPitch.patches[0].blocks.find((b) => b.slot === 'MASTER')?.params.some((p) => p.label === 'BPM'))

const lateHarmony = normalizeGt1Plan(
  {
    patches: [
      {
        patchName: 'X',
        chain: ['FX1', 'PDL', 'OD', 'PrA', 'NS', 'DLY', 'FV', 'FX2', 'REV'],
        blocks: [
          { slot: 'PREAMP', model: 'BG LEAD', params: [{ label: 'GAIN', value: 80 }] },
          { slot: 'FX2', model: 'HARMONIST', params: [{ label: 'HARMONY', text: '-3rd' }] }
        ]
      }
    ]
  },
  RIG_DEFAULT,
  eStandard,
  { bpm: null, musicalKey: 'Em' },
  'x',
  'y'
).patches[0]
const lateOrder = lateHarmony.chain.slice(1, -1)
check(
  'harmonist depois do amp é levado para antes do OD',
  lateOrder.indexOf('FX2') < lateOrder.indexOf('OD'),
  lateOrder.join(' ')
)
check('e a nota do bloco explica por quê', /antes do OD/.test(lateHarmony.blocks.find((b) => b.slot === 'FX2')?.note ?? ''))

check('lixo não vira patch GT-1', normalizeGt1Plan('nada', RIG_DEFAULT, eStandard, { bpm: null, musicalKey: null }, 'x', 'y').patches.length === 0)
check('cadeia vazia vira a padrão', fitChain([]).join(' ') === 'FX1 PDL OD PrA NS DLY FV FX2 REV')

console.log('\n=== 7. GT-1: o prompt carrega o manual ===')
const gt1Prompt = gt1PatchPrompt({
  context,
  output: 'pa',
  pitch: ebStandard,
  bpm: 212,
  masterKey: 'G (Em)',
  research: '### Amps\nMesa Boogie Mark IIC+',
  catalogue: gt1CatalogueText(),
  targets: gt1TargetsText()
})
check('lista os tipos de PREAMP', gt1Prompt.includes('MS1959 I+II') && gt1Prompt.includes('R-FIER MDN'))
check('lista os FX com faixas', gt1Prompt.includes('HARMONIST') && gt1Prompt.includes('GAIN 0..120'))
check('explica CTL1, EXP e ASSIGN', /CTL1/.test(gt1Prompt) && /EXP SW/.test(gt1Prompt) && /ASSIGN 1-6/.test(gt1Prompt))
check('reserva o FX1 para a afinação', /FX1 is RESERVED/.test(gt1Prompt) && /PITCH -1/.test(gt1Prompt))
check('leva a pesquisa da gravação', gt1Prompt.includes('Mesa Boogie Mark IIC+'))
check('leva BPM e KEY calculados', gt1Prompt.includes('MASTER BPM = 212') && gt1Prompt.includes('MASTER KEY = G (Em)'))
check('prefere uma patch por música', /Prefer ONE patch/.test(gt1Prompt))
check('solo e harmonia no mesmo amp não viram patch nova', /harmonised passage played over the same distorted amp is NOT a new patch/.test(gt1Prompt))
check('EQ na MASTER EQ, FX para efeito', /MASTER EQ, which costs no FX slot/.test(gt1Prompt))
check('guitarras harmonizadas pedem HARMONIST no CTL1', /harmonised twin-guitar lines/.test(gt1Prompt))
check('sem pedido do músico, sem seção de pedido', !/THE PLAYER'S REQUEST/.test(gt1Prompt))
const wishPrompt = gt1PatchPrompt({
  context,
  output: 'pa',
  pitch: eStandard,
  bpm: null,
  masterKey: null,
  research: null,
  catalogue: gt1CatalogueText(),
  targets: gt1TargetsText(),
  wishes: '  terça abaixo no solo  '
})
check('o pedido do músico entra como regra', wishPrompt.includes("THE PLAYER'S REQUEST") && wishPrompt.includes('terça abaixo no solo\n'))
check('usa LINE/PHONES e SP TYPE na saída direta', /LINE\/PHONES/.test(gt1Prompt))
check('pede o roteiro ao vivo', /"cues"/.test(gt1Prompt))
check('mantém o começo do schema', gt1Prompt.includes('{"patches":[{"patchName":"","appliesTo":"","summary":""'))
const ampPrompt = gt1PatchPrompt({
  context,
  output: 'amp',
  pitch: eStandard,
  bpm: null,
  masterKey: null,
  research: null,
  catalogue: gt1CatalogueText(),
  targets: gt1TargetsText()
})
check('no amplificador, SP TYPE fica de fora', /SP TYPE has no effect/.test(ampPrompt))
check('sem pesquisa, diz que não há', /No research on the recording/.test(ampPrompt))
check('sem PS, FX1 e FX2 livres', /FX1 and FX2 are both free/.test(ampPrompt))
check('a lista TARGET usa "n" para FX1/FX2', gt1TargetsText().includes('n HARMONY [HARMONY'))

console.log('\n=== 8. pesquisa na web ===')
const stored = researchToInsight({
  content: '### Amps\nBoogie',
  sources: [{ title: 'Premier Guitar', url: 'https://premierguitar.com/x' }],
  grounded: true
})
const back = researchFromInsight({ content: stored, provider: 'openai', model: 'm', createdAt: 1 })
check('pesquisa guardada volta com as fontes', back?.sources.length === 1 && back.grounded && back.content.startsWith('###'))
const plain = researchFromInsight({ content: '### texto solto', provider: null, model: null, createdAt: 1 })
check('linha antiga em markdown puro continua legível', plain?.content === '### texto solto' && plain.sources.length === 0)

const delta = parseResponsesEvent('{"type":"response.output_text.delta","delta":"Oi"}')
check('delta de texto da Responses API', delta?.kind === 'text' && delta.delta === 'Oi')
const search = parseResponsesEvent(
  '{"type":"response.output_item.done","item":{"type":"web_search_call","action":{"type":"search","query":"master of puppets amp"}}}'
)
check('busca feita vira linha de status', search?.kind === 'search' && search.query === 'master of puppets amp')
const done = parseResponsesEvent(
  JSON.stringify({
    type: 'response.completed',
    response: {
      output: [
        { type: 'web_search_call' },
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Mark IIC+ ([premierguitar.com](https://premierguitar.com/a?utm_source=openai)).',
              annotations: [
                { type: 'url_citation', url: 'https://premierguitar.com/a?utm_source=openai', title: 'Rig' },
                { type: 'url_citation', url: 'https://premierguitar.com/a?utm_source=openai', title: 'Rig' }
              ]
            }
          ]
        }
      ]
    }
  })
)
check('resposta final traz texto e fontes sem repetição', done?.kind === 'done' && done.sources.length === 1)
check('o rastreio utm_source sai do link', done?.kind === 'done' && !done.sources[0].url.includes('utm_source'))
check('falha vira erro', parseResponsesEvent('{"type":"response.failed","response":{"error":{"message":"x"}}}')?.kind === 'error')
check('evento desconhecido é ignorado', parseResponsesEvent('{"type":"response.created"}') === null)
check('lixo é ignorado', parseResponsesEvent('não é json') === null)
check(
  'citação entre parênteses sai do texto',
  stripInlineLinks('Usou um Mark IIC+ ([premierguitar.com](https://premierguitar.com/a)).') === 'Usou um Mark IIC+.'
)
check('link solto vira só o texto', stripInlineLinks('veja [aqui](https://x.com)') === 'veja aqui')
const grounding = geminiGrounding({
  groundingMetadata: {
    webSearchQueries: ['master of puppets guitar tone'],
    groundingChunks: [{ web: { uri: 'https://vertexaisearch.cloud.google.com/r/1', title: 'guitarworld.com' } }]
  }
})
check('Gemini: fontes e buscas', grounding.sources[0]?.title === 'guitarworld.com' && grounding.queries.length === 1)

console.log(`\n${failures === 0 ? 'TIMBRE OK' : `${failures} VERIFICACAO(OES) FALHARAM`}`)
process.exit(failures === 0 ? 0 : 1)
