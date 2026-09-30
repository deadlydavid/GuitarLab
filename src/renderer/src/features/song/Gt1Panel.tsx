import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NeuCard, NeuButton, Spinner, cx } from '../../components/ui'
import { api } from '../../lib/api'
import { useStrings } from '../../lib/i18n'
import type { TonePlanView } from '@shared/types'
import { encodeGt1Patch } from '@shared/gt1codec'
import { buildGt1Tsl, gt1NameOf } from '@shared/gt1tsl'
import {
  connectGt1,
  readGt1Names,
  readGt1Patch,
  sendGt1Temp,
  storeGt1Temp,
  type Gt1Link
} from '../../lib/gt1midi'

/**
 * From the suggestion to the pedal.
 *
 * Two ways out, both from the same encoding (shared/gt1codec.ts): a .tsl the
 * player imports in BOSS TONE STUDIO, or straight to the unit over USB MIDI —
 * into the temporary patch to hear it, or into a user slot to keep it. A slot
 * is never overwritten without its old contents being saved as a .tsl first,
 * and every write is read back from the unit before it is called done.
 */

const slotLabel = (n: number): string => `U${String(n).padStart(2, '0')}`
const ALL_SLOTS = Array.from({ length: 99 }, (_, i) => i + 1)

type Status = { tone: 'ok' | 'warn' | 'info'; text: string } | null

export function Gt1Panel({ plan, songTitle }: { plan: TonePlanView; songTitle: string }): ReactNode {
  const t = useStrings().tone.gt1
  const link = useRef<Gt1Link | null>(null)
  const [connected, setConnected] = useState(false)
  const [names, setNames] = useState<Record<number, string>>({})
  const [slots, setSlots] = useState<Array<number | null>>(() => plan.patches.map(() => null))
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ index: number; slot: number } | null>(null)
  const [status, setStatus] = useState<Status>(null)

  const encoded = useMemo(() => plan.patches.map((p) => encodeGt1Patch(p)), [plan])
  const skipped = encoded.flatMap((e) => e.skipped)

  useEffect(() => {
    setSlots(plan.patches.map(() => null))
  }, [plan])
  useEffect(() => () => link.current?.close(), [])

  const fail = (err: unknown): void =>
    setStatus({ tone: 'warn', text: t.failed(err instanceof Error ? err.message : String(err)) })

  const exportTsl = async (): Promise<void> => {
    setStatus(null)
    try {
      const content = buildGt1Tsl(songTitle, encoded.map((e) => e.params))
      const path = await api.gt1.exportTsl(`${songTitle} - GuitarLab`, content)
      if (path) setStatus({ tone: 'ok', text: t.exported(path) })
    } catch (err) {
      fail(err)
    }
  }

  const connect = async (): Promise<void> => {
    setStatus(null)
    setBusy(t.connecting)
    try {
      link.current?.close()
      const l = await connectGt1()
      link.current = l
      const found: Record<number, string> = {}
      for (let i = 0; i < ALL_SLOTS.length; i += 11) {
        const batch = ALL_SLOTS.slice(i, i + 11)
        Object.assign(found, await readGt1Names(l, batch))
        setBusy(t.reading(Math.min(i + 11, 99), 99))
        setNames({ ...found })
      }
      setConnected(true)
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const listen = async (index: number): Promise<void> => {
    if (!link.current) return
    setStatus(null)
    setBusy(t.sending(0))
    try {
      await sendGt1Temp(link.current, encoded[index].params, (f) => setBusy(t.sending(Math.round(f * 100))))
      setStatus({ tone: 'ok', text: t.playing(gt1NameOf(encoded[index].params)) })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  const store = async (index: number, slot: number): Promise<void> => {
    if (!link.current) return
    setConfirm(null)
    setStatus(null)
    const params = encoded[index].params
    try {
      // the old patch goes to disk before anything is written over it
      setBusy(t.backingUp)
      const previous = await readGt1Patch(link.current, slot)
      // local time, so the file name matches the clock the player saw
      const now = new Date()
      const pad = (n: number): string => String(n).padStart(2, '0')
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
      const backupName = `${slotLabel(slot)}-${gt1NameOf(previous) || 'vazio'}-${stamp}`
      const backup = await api.gt1.saveBackup(
        backupName,
        buildGt1Tsl(`Backup ${slotLabel(slot)} ${gt1NameOf(previous)}`, [previous])
      )
      setBusy(t.sending(0))
      await sendGt1Temp(link.current, params, (f) => setBusy(t.sending(Math.round(f * 100))))
      setBusy(t.storing)
      await storeGt1Temp(link.current, slot, params)
      setNames((n) => ({ ...n, [slot]: gt1NameOf(params) }))
      setStatus({ tone: 'ok', text: t.stored(slotLabel(slot), gt1NameOf(params), backup) })
    } catch (err) {
      fail(err)
    } finally {
      setBusy(null)
    }
  }

  return (
    <NeuCard className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="gradient-text text-sm font-bold">{t.title}</span>
        {connected && <span className="text-ok text-[11px] font-semibold">● {t.connected}</span>}
      </div>
      <p className="text-txt-dim text-[12px] leading-relaxed">{t.intro}</p>

      <div className="flex flex-wrap items-center gap-2">
        <NeuButton onClick={exportTsl} disabled={busy !== null}>
          {t.export}
        </NeuButton>
        <NeuButton variant={connected ? 'default' : 'accent'} onClick={connect} disabled={busy !== null}>
          <span className="flex items-center gap-2">
            {busy === t.connecting && <Spinner size={14} />}
            {t.connect}
          </span>
        </NeuButton>
        <NeuButton variant="ghost" onClick={() => void api.gt1.openBackups()}>
          {t.backups}
        </NeuButton>
      </div>

      {connected && (
        <div className="space-y-2">
          {plan.patches.map((patch, i) => {
            const slot = slots[i]
            return (
              <div key={`${patch.patchName}-${i}`} className="neu-inset flex flex-wrap items-center gap-3 rounded-[16px] p-3">
                <div className="min-w-[160px] flex-1">
                  <div className="text-[13px] font-bold">{gt1NameOf(encoded[i].params)}</div>
                  {patch.appliesTo && <div className="text-txt-micro text-[11px]">{patch.appliesTo}</div>}
                </div>
                <label className="flex items-center gap-2">
                  <span className="micro-label">{t.slot}</span>
                  <select
                    value={slot ?? ''}
                    onChange={(e) => setSlots((s) => s.map((v, j) => (j === i ? (e.target.value ? Number(e.target.value) : null) : v)))}
                    className="neu-inset text-txt cursor-pointer rounded-[12px] px-3 py-2 text-[12px] outline-none"
                    aria-label={t.slot}
                  >
                    <option value="" style={{ background: '#212128' }}>
                      {t.chooseSlot}
                    </option>
                    {ALL_SLOTS.map((n) => (
                      <option key={n} value={n} style={{ background: '#212128' }}>
                        {slotLabel(n)} — {names[n] || '…'}
                      </option>
                    ))}
                  </select>
                </label>
                <NeuButton onClick={() => void listen(i)} disabled={busy !== null} title={t.listenHint}>
                  {t.listen}
                </NeuButton>
                <NeuButton
                  variant="accent"
                  onClick={() => slot && setConfirm({ index: i, slot })}
                  disabled={busy !== null || !slot}
                >
                  {slot ? t.store(slotLabel(slot)) : t.store('…')}
                </NeuButton>
              </div>
            )
          })}
        </div>
      )}

      {confirm && (
        <div className="border-warn/50 flex flex-wrap items-center gap-3 rounded-[16px] border p-3">
          <p className="text-txt min-w-[220px] flex-1 text-[12px]">
            {t.confirm(slotLabel(confirm.slot), names[confirm.slot] ?? '')}
          </p>
          <NeuButton variant="danger" onClick={() => void store(confirm.index, confirm.slot)}>
            {t.confirmYes}
          </NeuButton>
          <NeuButton variant="ghost" onClick={() => setConfirm(null)}>
            {t.cancel}
          </NeuButton>
        </div>
      )}

      {busy && busy !== t.connecting && (
        <p className="text-txt-micro flex items-center gap-2 text-[11px]">
          <Spinner size={12} /> {busy}
        </p>
      )}
      {status && (
        <p className={cx('text-[12px] leading-relaxed break-words', status.tone === 'warn' ? 'text-warn' : 'text-ok')}>
          {status.text}
        </p>
      )}
      {skipped.length > 0 && <p className="text-warn text-[11px]">{t.skipped(skipped.join('; '))}</p>}
    </NeuCard>
  )
}
