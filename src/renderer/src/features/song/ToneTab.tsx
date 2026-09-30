import { useEffect, useState, useCallback, type ReactNode } from 'react'
import {
  NeuCard,
  NeuButton,
  NeuInput,
  NeuSelect,
  Badge,
  Spinner,
  EmptyState,
  Toast,
  useToast,
  cx
} from '../../components/ui'
import { Markdown } from '../../components/ui/markdown'
import { IconTone, IconSparkle, IconTuner } from '../../components/ui/icons'
import { api, isError, formatRelative, type InsightView } from '../../lib/api'
import { useAiStatusLine } from '../../lib/aiActivity'
import type {
  SongView,
  RigView,
  TonePlanView,
  TonePatchView,
  PatchBlock,
  PatchParam,
  PitchShifterPlan,
  MediaAssetView,
  SectionView,
  ToneResearchView,
  ControlView,
  AssignView,
  CueView
} from '@shared/types'
import { findBlock, isGt1, paramText } from '@shared/gt1'
import { useStrings } from '../../lib/i18n'
import { ToneMatch } from './ToneMatch'
import { Gt1Panel } from './Gt1Panel'

/** Object.entries, but keeping the value typed as the string it is. */
function outputEntries(map: Record<string, string>): Array<[string, string]> {
  return Object.entries(map)
}
import { RIG_DEFAULT } from '@shared/types'

/* ------------------------------------------------------------------ knobs */

/**
 * A knob drawn the way it sits on the pedal: pointer at 7 o'clock for the
 * minimum and 5 o'clock for the maximum, with the travelled arc filled in.
 * Reading a row of these is much faster than reading "Gain 70, Bass 45, Mid
 * 60" as a sentence.
 *
 * The range is the device's own when the patch carries it (GAIN 0–120, TONE
 * −50…+50); a centre-detented control fills from 12 o'clock, the way a TONE
 * knob at 0 sits on the real editor.
 */
function Knob({ param }: { param: PatchParam }): ReactNode {
  const size = 46
  const r = 17
  const c = size / 2
  const sweep = 270
  /*
   * Degrees measured clockwise from 3 o'clock in SVG's y-down space, so 135 is
   * the lower-left corner (knob at minimum) and 135 + 270 = 405 is lower-right
   * (maximum) — the usual travel of a real pedal knob.
   */
  const start = 135

  const point = (deg: number, radius: number): [number, number] => {
    const rad = (deg * Math.PI) / 180
    return [c + radius * Math.cos(rad), c + radius * Math.sin(rad)]
  }

  const hasValue = param.value !== null
  const min = param.min ?? 0
  const max = param.max ?? 100
  const fraction = Math.max(0, Math.min(1, ((param.value ?? min) - min) / (max - min || 1)))
  const angle = start + fraction * sweep
  // a bipolar control fills from its zero, not from the bottom of its travel
  const origin = min < 0 && max > 0 ? start + ((0 - min) / (max - min)) * sweep : start
  const [px, py] = point(angle, r - 3)
  const [tx, ty] = point(angle, r - 10)

  // background track and the filled portion, as two arcs on the same circle
  const arc = (from: number, to: number): string => {
    const [x1, y1] = point(from, r)
    const [x2, y2] = point(to, r)
    return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`
  }

  return (
    <div className="flex w-[60px] flex-col items-center gap-1">
      {hasValue ? (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <path
            d={arc(start, start + sweep)}
            fill="none"
            stroke="var(--color-edge)"
            strokeWidth={3}
            strokeLinecap="round"
          />
          {Math.abs(angle - origin) > 0.5 && (
            <path
              d={arc(Math.min(origin, angle), Math.max(origin, angle))}
              fill="none"
              stroke="var(--color-accent-2)"
              strokeWidth={3}
              strokeLinecap="round"
            />
          )}
          <circle cx={c} cy={c} r={r - 5} fill="var(--color-raised)" stroke="var(--color-edge)" />
          <line
            x1={tx}
            y1={ty}
            x2={px}
            y2={py}
            stroke="var(--color-accent-1)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </svg>
      ) : (
        // a selector, not a knob — show the chosen option in a switch-like chip
        <div
          className="neu-inset text-txt grid h-[46px] w-14 place-items-center rounded-[10px] px-1 text-center text-[9px] leading-tight font-semibold"
          title={param.text ?? ''}
        >
          <span className="line-clamp-3">{param.text ?? '—'}</span>
        </div>
      )}
      <span
        className={cx(
          'w-full truncate text-center text-[9px] font-semibold uppercase',
          param.warning ? 'text-warn' : 'text-txt-micro'
        )}
        title={param.warning ?? param.label}
      >
        {param.warning ? '⚠ ' : ''}
        {param.label}
      </span>
      {hasValue && (
        <span className="text-txt-dim text-[10px] whitespace-nowrap tabular-nums">
          {paramText(param)}
        </span>
      )}
    </div>
  )
}

/* -------------------------------------------------------- chain diagram */

/**
 * The signal path as a single row of plugged-in boxes. Drawn in SVG with a
 * viewBox so it scales down to whatever width the card has instead of
 * overflowing — the whole point is that it fits on screen at a glance.
 */
function ChainDiagram({ chain }: { chain: string[] }): ReactNode {
  if (chain.length === 0) return null

  const boxW = 92
  const boxH = 40
  const gap = 26
  const padding = 6
  const width = chain.length * boxW + (chain.length - 1) * gap + padding * 2
  const height = boxH + 26

  return (
    <div className="w-full overflow-x-auto">
      {/* `height: auto` lets the boxes scale with the viewBox ratio rather than
          letterboxing inside a fixed height; below 420px the wrapper scrolls. */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        style={{ height: 'auto', maxWidth: width, minWidth: Math.min(width, 420) }}
        role="img"
        aria-label={`Cadeia de sinal: ${chain.join(' para ')}`}
      >
        {chain.map((label, i) => {
          const x = padding + i * (boxW + gap)
          const y = 18
          const isEnd = i === 0 || i === chain.length - 1
          return (
            <g key={`${label}-${i}`}>
              {i > 0 && (
                <>
                  {/* cable between this box and the previous one */}
                  <line
                    x1={x - gap}
                    y1={y + boxH / 2}
                    x2={x - 6}
                    y2={y + boxH / 2}
                    stroke="var(--color-edge)"
                    strokeWidth={2}
                  />
                  <polygon
                    points={`${x - 6},${y + boxH / 2 - 4} ${x},${y + boxH / 2} ${x - 6},${y + boxH / 2 + 4}`}
                    fill="var(--color-accent-2)"
                  />
                </>
              )}
              <rect
                x={x}
                y={y}
                width={boxW}
                height={boxH}
                rx={10}
                fill={isEnd ? 'var(--color-sunken)' : 'var(--color-raised)'}
                stroke={isEnd ? 'var(--color-accent-2)' : 'var(--color-edge)'}
                strokeWidth={isEnd ? 1.5 : 1}
              />
              <text
                x={x + boxW / 2}
                y={y + boxH / 2 + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={isEnd ? 'var(--color-accent-2)' : 'var(--color-txt)'}
              >
                {label.length > 13 ? `${label.slice(0, 12)}…` : label}
              </text>
              {/* full label under the box, since the one inside gets clipped */}
              {label.length > 13 && (
                <title>{label}</title>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/* ------------------------------------------------------------- pedal card */

/** GT-1 blocks with fixed parameters and no TYPE, named the way the editor names them. */
const TYPELESS_BLOCKS: Record<string, string> = {
  NS: 'NOISE SUPPRESSOR',
  'FOOT VOLUME': 'FOOT VOLUME',
  MASTER: 'PATCH LEVEL, BPM, KEY e EQ'
}

function PedalCard({ block }: { block: PatchBlock }): ReactNode {
  const t = useStrings().tone
  return (
    <div
      className={cx(
        'neu-raised-sm flex flex-col rounded-[16px] p-3',
        !block.enabled && 'opacity-45'
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="micro-label truncate">{block.slot}</span>
        <span
          className={cx(
            'h-2 w-2 shrink-0 rounded-full',
            block.enabled ? 'bg-ok' : 'bg-txt-micro'
          )}
          title={block.enabled ? 'ligado' : t.blockStandby}
        />
      </div>
      <div className="mb-2.5 truncate text-[13px] font-bold" title={block.model}>
        {block.model || TYPELESS_BLOCKS[block.slot] || '—'}
      </div>
      {block.warning && <p className="text-warn -mt-1.5 mb-2 text-[10px] leading-snug">⚠ {block.warning}</p>}
      {block.params.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {block.params.map((p, i) => (
            <Knob key={`${p.label}-${i}`} param={p} />
          ))}
        </div>
      )}
      {block.note && (
        <p className="text-txt-micro mt-2.5 text-[10px] leading-snug">{block.note}</p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ afinação */

/**
 * How to play the song without retuning. The guitar stays in E standard (a
 * physical Drop D at most) and the pitch shifter covers the rest, so a set that
 * jumps between Eb, D and drop tunings needs one guitar.
 */
function PitchCard({ plan, gt1 }: { plan: PitchShifterPlan; gt1: boolean }): ReactNode {
  const t = useStrings().tone
  return (
    <NeuCard className="p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <IconTuner width={15} height={15} className="text-accent-2" />
        <span className="gradient-text text-sm font-bold">Afinação e pitch shifter</span>
        <Badge tone="accent">guitarra em {plan.playedTuning}</Badge>
        {plan.recordTuning && plan.recordTuning !== plan.playedTuning && (
          <Badge tone="info">disco em {plan.recordTuning}</Badge>
        )}
        <Badge tone={plan.enabled ? 'ok' : 'neutral'}>
          {plan.enabled
            ? `PS ${plan.semitones > 0 ? '+' : ''}${plan.semitones}`
            : 'sem pitch shifter'}
        </Badge>
      </div>
      <p className="text-txt-dim text-[12px] leading-relaxed">{plan.note}</p>
      {gt1 && plan.enabled && (
        <p className="text-txt-micro mt-1.5 text-[11px] leading-relaxed">
          {t.pitchGt1(`${plan.semitones > 0 ? '+' : ''}${plan.semitones}`)}
        </p>
      )}
    </NeuCard>
  )
}

/* ------------------------------------------------------------- GT-1 */

/**
 * The GT-1's nine movable blocks in this patch's order, each with the type it
 * loads. A block the patch leaves off is dimmed; one that starts off and is
 * switched on by CTL1 or an ASSIGN is outlined, so the chain shows both what
 * is sounding and what is waiting.
 */
function Gt1Chain({ patch, outputLabel }: { patch: TonePatchView; outputLabel: string }): ReactNode {
  const t = useStrings().tone
  const labels = patch.chain.slice(1, -1)
  // the stored chain ends in English (it is data); the chip shows the interface's word
  const ends = [patch.chain[0], outputLabel]
  const chip = (text: string, key: string): ReactNode => (
    <span key={key} className="neu-inset text-accent-2 rounded-[10px] px-2.5 py-1.5 text-[11px] font-semibold">
      {text}
    </span>
  )
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chip(ends[0], 'in')}
      {labels.map((label, i) => {
        const slot = findBlock(label)?.slot
        const block = patch.blocks.find((b) => b.slot === slot)
        const state = !block ? 'off' : block.enabled ? 'on' : 'standby'
        return (
          <span key={`${label}-${i}`} className="flex items-center gap-1.5">
            <span className="text-txt-micro text-[10px]" aria-hidden>
              →
            </span>
            <span
              className={cx(
                'flex flex-col rounded-[10px] px-2.5 py-1 leading-tight',
                state === 'on' && 'neu-raised-sm',
                state === 'standby' && 'border-accent-2/60 border border-dashed',
                state === 'off' && 'opacity-40'
              )}
              title={
                state === 'on'
                  ? t.chainOn(label)
                  : state === 'standby'
                    ? t.chainStandby(label)
                    : t.chainOff(label)
              }
            >
              <span className="text-[11px] font-bold">{label}</span>
              <span className="text-txt-micro max-w-[110px] truncate text-[9px]">
                {block?.model || (state === 'off' ? 'off' : '')}
              </span>
            </span>
          </span>
        )
      })}
      <span className="text-txt-micro text-[10px]" aria-hidden>
        →
      </span>
      {chip(ends[1], 'out')}
    </div>
  )
}

const CONTROL_NAMES: Record<string, string> = {
  CTL1: 'CTL1',
  'EXP SW': 'EXP SW',
  EXP1: 'EXP',
  CTL2: 'CTL2',
  CTL3: 'CTL3',
  EXP2: 'EXP2'
}

/** CTL1, the EXP pedal and its toe switch, then the ASSIGNs that ride on them. */
function Gt1Controls({ controls, assigns }: { controls: ControlView[]; assigns: AssignView[] }): ReactNode {
  const t = useStrings().tone
  if (!controls.length && !assigns.length) return null
  return (
    <div className="space-y-3">
      {controls.length > 0 && (
        <div>
          <div className="micro-label mb-2">{t.controlsTitle}</div>
          <div className="grid gap-2.5 md:grid-cols-3">
            {controls.map((c) => (
              <div key={c.source} className="neu-inset flex items-start gap-3 rounded-[16px] p-3">
                <span
                  className="neu-raised-sm text-accent-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-[10px] font-bold"
                  title={c.source}
                >
                  {CONTROL_NAMES[c.source] ?? c.source}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-bold">
                    {c.func}
                    {c.mode && <span className="text-txt-micro ml-1.5 text-[10px] font-semibold">{c.mode}</span>}
                    {c.soloLevel !== null && (
                      <span className="text-txt-micro ml-1.5 text-[10px] font-semibold">SOLO LEVEL {c.soloLevel}</span>
                    )}
                  </div>
                  {c.action && <p className="text-txt-dim text-[12px] leading-relaxed">{c.action}</p>}
                  {c.when && <p className="text-txt-micro mt-0.5 text-[11px]">{t.when(c.when)}</p>}
                  {c.warning && <p className="text-warn mt-1 text-[10px]">⚠ {c.warning}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {assigns.length > 0 && (
        <div>
          <div className="micro-label mb-2">{t.assignTitle}</div>
          <div className="neu-inset overflow-x-auto rounded-[16px] p-2">
            <table className="w-full min-w-[620px] text-left text-[12px]">
              <thead className="text-txt-micro text-[10px] uppercase">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">#</th>
                  <th className="px-2 py-1.5 font-semibold">SOURCE</th>
                  <th className="px-2 py-1.5 font-semibold">MODE</th>
                  <th className="px-2 py-1.5 font-semibold">TARGET</th>
                  <th className="px-2 py-1.5 font-semibold">MIN → MAX</th>
                  <th className="px-2 py-1.5 font-semibold">{t.assignPurpose}</th>
                </tr>
              </thead>
              <tbody>
                {assigns.map((a) => (
                  <tr key={a.number} className="border-edge border-t align-top">
                    <td className="text-txt-micro px-2 py-2 tabular-nums">{a.number}</td>
                    <td className="px-2 py-2 font-semibold whitespace-nowrap">{a.source}</td>
                    <td className="text-txt-dim px-2 py-2">{a.mode}</td>
                    <td className="px-2 py-2">
                      <span className="text-txt-dim">{a.category}</span> ›{' '}
                      <span className="font-semibold">{a.target}</span>
                      {a.extra && <div className="text-txt-micro text-[10px]">{a.extra}</div>}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap tabular-nums">
                      {a.min} → <span className="font-semibold">{a.max}</span>
                    </td>
                    <td className="text-txt-dim px-2 py-2">
                      {a.purpose}
                      {a.warning && <div className="text-warn mt-0.5 text-[10px]">⚠ {a.warning}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/** What to press where, for the whole song — the sheet to read before a gig. */
function CuesCard({ cues }: { cues: CueView[] }): ReactNode {
  const t = useStrings().tone
  return (
    <NeuCard className="p-4">
      <div className="micro-label mb-3">{t.cuesTitle}</div>
      <ol className="space-y-2">
        {cues.map((c, i) => (
          <li key={`${c.section}-${i}`} className="flex items-start gap-3">
            <span className="neu-inset text-accent-2 grid h-6 w-6 shrink-0 place-items-center rounded-[8px] text-[10px] font-bold tabular-nums">
              {i + 1}
            </span>
            <div className="min-w-0 text-[12px] leading-relaxed">
              <span className="font-semibold">{c.section || '—'}</span>
              {c.patch && <span className="text-txt-micro"> · {c.patch}</span>}
              <div className="text-txt-dim">{c.action}</div>
            </div>
          </li>
        ))}
      </ol>
    </NeuCard>
  )
}

/**
 * How the record was made, as the web search found it — what the patch is
 * aiming at. The sources are listed so the player can check a claim instead
 * of taking the model's word for it.
 */
function ResearchCard({
  research,
  loading,
  status,
  onResearch
}: {
  research: ToneResearchView | null
  loading: boolean
  status: string | null
  onResearch: () => void
}): ReactNode {
  const r = useStrings().tone.research
  return (
    <NeuCard className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="micro-label">{r.title}</span>
        {research && (
          <Badge tone={research.grounded ? 'ok' : 'warn'}>
            {research.grounded ? r.sources(research.sources.length) : r.noSources}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-3">
          {research && (
            <span className="text-txt-micro text-[10px]">
              {formatRelative(research.createdAt)}
              {research.provider ? ` · ${research.provider}` : ''}
            </span>
          )}
          <NeuButton onClick={onResearch} disabled={loading}>
            <span className="flex items-center gap-2">
              {loading ? <Spinner size={14} /> : <IconSparkle width={15} height={15} />}
              {research ? r.again : r.search}
            </span>
          </NeuButton>
        </div>
      </div>
      {loading && status && <p className="text-txt-micro mb-2 line-clamp-2 text-[11px] italic">{status}</p>}
      {research ? (
        <>
          <Markdown content={research.content} />
          {research.sources.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {research.sources.slice(0, 12).map((src) => (
                <button
                  key={src.url}
                  onClick={() => void api.shell.openExternal(src.url)}
                  className="neu-raised-sm text-txt-dim hover:text-txt max-w-[240px] truncate rounded-[8px] px-2 py-1 text-[11px]"
                  title={src.url}
                >
                  ↗ {src.title}
                </button>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="text-txt-micro text-[11px] leading-relaxed">{r.empty}</p>
      )}
    </NeuCard>
  )
}

/**
 * The unit-wide settings a per-song patch depends on. None of them live in a
 * patch, so no suggestion can set them — but with PREF on SYSTEM the ASSIGNs on
 * CTL1 and the EXP pedal are ignored, and without LINE/PHONES the cabinet
 * simulation is off, which would make every patch here sound wrong.
 */
function Gt1SetupCard({ output }: { output: RigView['output'] }): ReactNode {
  const u = useStrings().tone.setup
  const items: Array<[string, string]> = [
    ['MENU › OUTPUT SELECT', output === 'amp' ? u.outputAmp : u.outputLine],
    ['MENU › PREF', u.pref],
    ['MENU › PLAY › EXP1 HLD', u.hold],
    ['BOSS TONE STUDIO', u.editor],
    [u.matchWhere, u.match]
  ]
  return (
    <NeuCard className="p-4">
      <details>
        <summary className="micro-label cursor-pointer">{u.title}</summary>
        <ul className="mt-3 space-y-2">
          {items.map(([where, what]) => (
            <li key={where} className="text-[12px] leading-relaxed">
              <span className="font-semibold">{where}:</span> <span className="text-txt-dim">{what}</span>
            </li>
          ))}
        </ul>
      </details>
    </NeuCard>
  )
}

/* ---------------------------------------------------------------- CTRL */

/** The one assignable footswitch, and what this patch spends it on. */
function CtrlCard({ ctrl }: { ctrl: NonNullable<TonePatchView['ctrl']> }): ReactNode {
  return (
    <div className="neu-inset flex items-start gap-3 rounded-[16px] p-3">
      <span
        className="neu-raised-sm text-accent-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-[10px] font-bold"
        title="Footswitch atribuível"
      >
        CTRL
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-bold">{ctrl.target}</div>
        <p className="text-txt-dim text-[12px] leading-relaxed">{ctrl.action}</p>
        {ctrl.when && <p className="text-txt-micro mt-0.5 text-[11px]">quando: {ctrl.when}</p>}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- patch card */

/**
 * One patch, with its own chain diagram.
 *
 * A song that goes clean in the middle needs two patches, not one averaged
 * compromise, so each gets its own card, numbered in playing order and labelled
 * with the part of the song it belongs to.
 */
function PatchCard({
  patch,
  index,
  total,
  gt1
}: {
  patch: TonePatchView
  index: number
  total: number
  /** Checked against the GT-1 catalogue: draw its chain, controllers and ASSIGNs. */
  gt1: boolean
}): ReactNode {
  const str = useStrings()
  return (
    <NeuCard className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {total > 1 && (
          <span className="neu-inset text-accent-2 grid h-7 w-7 shrink-0 place-items-center rounded-[9px] text-[11px] font-bold tabular-nums">
            {String(index + 1).padStart(2, '0')}
          </span>
        )}
        <span className="gradient-text text-sm font-bold">{patch.patchName}</span>
        {patch.appliesTo && <Badge tone="info">{patch.appliesTo}</Badge>}
        {patch.provider && (
          <span className="text-txt-micro ml-auto text-[10px]">
            {patch.provider} · {patch.model}
          </span>
        )}
      </div>

      {patch.summary && (
        <p className="text-txt-dim text-[13px] leading-relaxed">{patch.summary}</p>
      )}

      <div className="neu-inset rounded-[16px] px-3 py-2">
        <div className="micro-label mb-1.5">Cadeia de sinal</div>
        {gt1 ? (
          <Gt1Chain patch={patch} outputLabel={str.labels.output[patch.rig.output] ?? patch.chain[patch.chain.length - 1]} />
        ) : (
          <ChainDiagram chain={patch.chain} />
        )}
      </div>

      {patch.blocks.length > 0 && (
        <div>
          <div className="micro-label mb-2">Blocos e ajustes</div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {patch.blocks.map((b, i) => (
              <PedalCard key={`${b.slot}-${i}`} block={b} />
            ))}
          </div>
        </div>
      )}

      {patch.ctrl && <CtrlCard ctrl={patch.ctrl} />}
      {gt1 && <Gt1Controls controls={patch.controls ?? []} assigns={patch.assigns ?? []} />}

      <div className="grid gap-3 sm:grid-cols-2">
        {patch.listenFor && (
          <div className="neu-inset rounded-[16px] p-3">
            <div className="micro-label mb-1.5">O que escutar no original</div>
            <p className="text-txt-dim text-[12px] leading-relaxed">{patch.listenFor}</p>
          </div>
        )}
        {patch.notes && (
          <div className="neu-inset rounded-[16px] p-3">
            <div className="micro-label mb-1.5">Observações</div>
            <p className="text-txt-dim text-[12px] leading-relaxed whitespace-pre-line">{patch.notes}</p>
          </div>
        )}
      </div>
    </NeuCard>
  )
}

/* ----------------------------------------------------------------- tab */

export function ToneTab({
  song,
  media,
  sections
}: {
  song: SongView
  media: MediaAssetView[]
  sections: SectionView[]
}): ReactNode {
  const str = useStrings()
  const { toast, show, clear } = useToast()
  const [rig, setRig] = useState<RigView>(RIG_DEFAULT)
  const [plan, setPlan] = useState<TonePlanView | null>(null)
  const [loading, setLoading] = useState(false)
  const [savingRig, setSavingRig] = useState(false)
  /** How the record was made, from the web; what the patch aims at. */
  const [research, setResearch] = useState<ToneResearchView | null>(null)
  const [researchLoading, setResearchLoading] = useState(false)
  /** The player's request for this song; starts from what the stored plan was asked with. */
  const [wishes, setWishes] = useState('')
  const gt1 = isGt1(rig.processor)
  /**
   * The prose second opinion, kept as an optional extra to the patch.
   *
   * Stored in the database once written, like the patch beside it, so coming
   * back to this song shows the explanation instead of an empty card and a
   * button that costs another request to press.
   */
  const [advice, setAdvice] = useState<InsightView | null>(null)
  const [adviceLoading, setAdviceLoading] = useState(false)
  /** What the model is thinking right now, mirrored under the button. */
  const aiStatus = useAiStatusLine()

  const load = useCallback(async () => {
    /*
     * The insight lookup is wrapped and allowed to fail on its own: a preload
     * without the channel throws on the property access, which inside
     * `Promise.all` would take the rig and the patch down with it. A song with
     * no stored explanation is the normal case, so an absent one is `null`.
     */
    const [savedRig, savedPlan, savedAdvice, savedResearch] = await Promise.all([
      api.gear.rig(),
      api.gear.patch(song.id),
      (async () => api.insights.get(song.id, 'tone_advice'))().catch(() => null),
      (async () => api.gear.research(song.id))().catch(() => null)
    ])
    setRig(savedRig)
    setPlan(savedPlan)
    setWishes(savedPlan?.wishes ?? '')
    setAdvice(savedAdvice)
    setResearch(savedResearch)
  }, [song.id])

  useEffect(() => {
    void load()
  }, [load])

  const saveRig = async (): Promise<void> => {
    setSavingRig(true)
    try {
      await api.gear.setRig(rig)
      show('Equipamento salvo', 'ok')
    } catch (err) {
      show(err instanceof Error ? err.message : 'Falha ao salvar', 'danger')
    } finally {
      setSavingRig(false)
    }
  }

  const suggest = async (): Promise<void> => {
    setLoading(true)
    try {
      // save first, so the AI always sees what is on screen
      await api.gear.setRig(rig)
      const res = await api.llm.tonePatch(song.id, wishes)
      if (isError(res)) show(res.error, 'danger')
      else {
        setPlan(res)
        show(
          res.patches.length > 1
            ? `${res.patches.length} patches — a música troca de timbre no meio`
            : 'Patch pronto',
          'ok'
        )
        // the patch may have run the research first; show what it was based on
        if (res.researchUsed && !research) {
          const stored = await api.gear.research(song.id).catch(() => null)
          if (stored) setResearch(stored)
        }
      }
    } catch (err) {
      show(err instanceof Error ? err.message : 'Falha ao consultar a IA', 'danger')
    } finally {
      setLoading(false)
    }
  }

  const askResearch = async (): Promise<void> => {
    setResearchLoading(true)
    try {
      const res = await api.llm.toneResearch(song.id)
      if (isError(res)) show(res.error, 'danger')
      else {
        setResearch(res)
        show(
          res.grounded ? str.tone.research.ready(res.sources.length) : str.tone.research.ungrounded,
          res.grounded ? 'ok' : 'warn'
        )
      }
    } catch (err) {
      show(err instanceof Error ? err.message : 'Falha ao consultar a IA', 'danger')
    } finally {
      setResearchLoading(false)
    }
  }

  const askAdvice = async (): Promise<void> => {
    setAdviceLoading(true)
    try {
      const res = await api.llm.toneAdvice(song.id)
      if (isError(res)) show(res.error, 'danger')
      else {
        setAdvice({
          content: res.content,
          provider: res.provider,
          model: res.model,
          createdAt: Math.floor(Date.now() / 1000)
        })
      }
    } catch (err) {
      show(err instanceof Error ? err.message : 'Falha ao consultar a IA', 'danger')
    } finally {
      setAdviceLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* the rig the suggestion is written for */}
      <NeuCard className="p-4">
        <div className="micro-label mb-3">Seu equipamento</div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <NeuInput
              label="Guitarra"
              value={rig.guitar}
              placeholder="ex.: Ibanez JEM (chinesa)"
              onChange={(e) => setRig({ ...rig, guitar: e.target.value })}
            />
          </div>
          <div className="min-w-[200px] flex-1">
            <NeuInput
              label="Pedaleira / processador"
              value={rig.processor}
              placeholder="ex.: Boss GT-1"
              onChange={(e) => setRig({ ...rig, processor: e.target.value })}
            />
          </div>
          <div className="w-52">
            <NeuSelect
              label="Saída"
              value={rig.output}
              onChange={(v) => setRig({ ...rig, output: v as RigView['output'] })}
              options={outputEntries(str.labels.output).map(([value, label]) => ({ value, label }))}
            />
          </div>
          <NeuButton onClick={saveRig} disabled={savingRig}>
            {savingRig ? <Spinner size={14} /> : 'Salvar'}
          </NeuButton>
        </div>
        <p className="text-txt-micro mt-3 text-[11px]">
          {gt1
            ? str.tone.rigNoteGt1
            : `A sugestão é escrita para som direto — a IA já compensa o brilho e a falta de gabinete real que a ${str.labels.output[rig.output].toLowerCase()} expõe.`}
        </p>
      </NeuCard>

      {gt1 && <Gt1SetupCard output={rig.output} />}

      {/* what the patch is aiming at: the record's own gear */}
      <ResearchCard
        research={research}
        loading={researchLoading}
        status={researchLoading ? aiStatus : null}
        onResearch={askResearch}
      />

      {/* what to do about the tuning, before any knob is touched */}
      {plan?.pitchShifter && <PitchCard plan={plan.pitchShifter} gt1={plan.device === 'gt1'} />}

      {/* the patches themselves */}
      <NeuCard className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="micro-label">
            {plan && plan.patches.length > 1
              ? `${plan.patches.length} patches para ${rig.processor || 'sua pedaleira'}`
              : `Patch sugerido para ${rig.processor || 'sua pedaleira'}`}
          </div>
          <NeuButton variant="accent" onClick={suggest} disabled={loading}>
            <span className="flex items-center gap-2">
              {loading ? <Spinner size={14} /> : <IconSparkle width={15} height={15} />}
              {plan ? 'Gerar de novo' : 'Sugerir patch'}
            </span>
          </NeuButton>
        </div>

        <div className="mt-3">
          <NeuInput
            label={str.tone.wishes}
            value={wishes}
            maxLength={1200}
            placeholder={str.tone.wishesPlaceholder}
            onChange={(e) => setWishes(e.target.value)}
          />
          <p className="text-txt-micro mt-1.5 text-[10px]">{str.tone.wishesHint}</p>
        </div>

        {loading && aiStatus && (
          <p className="text-txt-micro mt-3 line-clamp-2 text-[11px] italic">{aiStatus}</p>
        )}

        {!plan && (
          <EmptyState
            icon={<IconTone width={24} height={24} />}
            title="Tire o timbre na pedaleira"
            description="A IA usa o tom, gênero, afinação e os trechos da música mais a sua guitarra e pedaleira para montar os patches bloco a bloco, com a cadeia de ligação, a posição de cada knob e o que pôr no botão CTRL."
          />
        )}
      </NeuCard>

      {plan?.patches.map((patch, i) => (
        <PatchCard
          key={`${patch.patchName}-${i}`}
          patch={patch}
          index={i}
          total={plan.patches.length}
          gt1={plan.device === 'gt1'}
        />
      ))}

      {plan?.cues && plan.cues.length > 0 && <CuesCard cues={plan.cues} />}

      {/* from the suggestion to the pedal: .tsl export, or straight over USB */}
      {plan?.device === 'gt1' && plan.patches.length > 0 && <Gt1Panel plan={plan} songTitle={song.title} />}

      {/* the measurement: record stem against what comes out of the unit */}
      <ToneMatch key={song.id} songId={song.id} media={media} sections={sections} durationMs={song.durationMs} />

      {/* prose fallback for the nuances a patch diagram cannot carry */}
      <NeuCard className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="micro-label">Explicação em texto</div>
          <div className="flex items-center gap-3">
            {advice && (
              <span className="text-txt-micro text-[10px]">
                {formatRelative(advice.createdAt)}
                {advice.provider ? ` · ${advice.provider}` : ''}
              </span>
            )}
            <NeuButton
              onClick={askAdvice}
              disabled={adviceLoading}
              title={
                advice
                  ? 'Consulta a IA de novo e substitui a explicação salva'
                  : 'Consulta a IA e guarda a explicação'
              }
            >
              <span className="flex items-center gap-2">
                {adviceLoading ? <Spinner size={14} /> : <IconTone width={15} height={15} />}
                {advice ? 'Explicar de novo' : 'Explicar'}
              </span>
            </NeuButton>
          </div>
        </div>

        {adviceLoading && aiStatus && (
          <p className="text-txt-micro mb-2 line-clamp-2 text-[11px] italic">{aiStatus}</p>
        )}
        {advice ? (
          <Markdown content={advice.content} />
        ) : (
          <p className="text-txt-micro text-[11px]">
            Um texto corrido sobre o timbre, para quando você quiser o porquê de cada ajuste. Fica
            salvo depois da primeira busca.
          </p>
        )}
      </NeuCard>

      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={clear} />}
    </div>
  )
}
