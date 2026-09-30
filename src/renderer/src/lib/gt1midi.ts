import {
  GT1_PAGES,
  gt1ParamsFromBytes,
  gt1PatchBytes,
  gt1RequestMessage,
  gt1SlotBase,
  gt1WriteMessages,
  rolandChecksum,
  GT1_MODEL_ID,
  type Gt1Params
} from '@shared/gt1codec'
import { GT1_ADDRESSES } from '@shared/gt1data'

/**
 * Talking to a BOSS GT-1 over its USB MIDI port, the way BOSS TONE STUDIO does.
 *
 * Roland SysEx: RQ1 (0x11) asks for bytes at an address, DT1 (0x12) writes
 * them. A patch is seventeen 128-byte pages; the temporary patch — what the
 * unit is playing — lives at 60 00, user patch Unn at 10 (nn-1). Writing the
 * temporary patch changes the sound at once and keeps nothing; the
 * `patch_write` command (7F 00 01 04) then stores it in a user slot.
 *
 * Every write is read back and compared, so "sent" only ever means "the unit
 * now holds exactly this".
 */

export interface Gt1Link {
  input: MIDIInput
  output: MIDIOutput
  device: number
  close: () => void
}

type Listener = (data: Uint8Array) => void

const listeners = new WeakMap<MIDIInput, Set<Listener>>()

function subscribe(input: MIDIInput, fn: Listener): () => void {
  let set = listeners.get(input)
  if (!set) {
    set = new Set()
    listeners.set(input, set)
    const all = set
    input.onmidimessage = (e) => {
      if (e.data) for (const l of all) l(e.data)
    }
  }
  set.add(fn)
  return () => set?.delete(fn)
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Find the GT-1's ports and learn its device ID from the identity reply. */
export async function connectGt1(): Promise<Gt1Link> {
  if (!navigator.requestMIDIAccess) throw new Error('Este ambiente não tem Web MIDI.')
  const access = await navigator.requestMIDIAccess({ sysex: true })
  const input = [...access.inputs.values()].find((p) => /GT-1/i.test(p.name ?? ''))
  const output = [...access.outputs.values()].find((p) => /GT-1/i.test(p.name ?? ''))
  if (!input || !output) {
    throw new Error('GT-1 não encontrada. Ligue a pedaleira no USB e confira o driver "GT-1".')
  }
  const reply = await new Promise<Uint8Array | null>((resolve) => {
    const timer = setTimeout(() => {
      off()
      resolve(null)
    }, 2000)
    const off = subscribe(input, (d) => {
      if (d[0] === 0xf0 && d[1] === 0x7e && d[3] === 0x06 && d[4] === 0x02 && d[5] === 0x41) {
        clearTimeout(timer)
        off()
        resolve(d)
      }
    })
    output.send([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7])
  })
  if (!reply) throw new Error('A GT-1 não respondeu. Ela está ligada e com o cabo USB de dados?')
  return {
    input,
    output,
    device: reply[2],
    close: () => {
      input.onmidimessage = null
      listeners.delete(input)
    }
  }
}

/** The offsets each page must deliver: the ones some parameter lives at. */
const NEEDED = (() => {
  const map = new Map<number, number[]>()
  for (const [, page, offset, size] of GT1_ADDRESSES) {
    const list = map.get(page) ?? []
    for (let i = 0; i < size; i++) list.push(offset + i)
    map.set(page, list)
  }
  return map
})()

/**
 * Read one page at [a0, a1, page, 0], done when every offset a parameter uses
 * has arrived. The unit answers in one or more DT1 messages and may skip unused
 * stretches (the last page starts at 0x10), so counting bytes would wait for
 * data that never comes.
 */
function readPageOnce(link: Gt1Link, a0: number, a1: number, page: number): Promise<number[]> {
  const needed = NEEDED.get(page) ?? []
  return new Promise((resolve) => {
    const row: number[] = []
    const complete = (): boolean => needed.every((o) => row[o] !== undefined)
    const finish = (): void => {
      clearTimeout(timer)
      off()
      resolve(row)
    }
    const timer = setTimeout(finish, 1500)
    const off = subscribe(link.input, (d) => {
      if (d[0] !== 0xf0 || d[1] !== 0x41 || d[7] !== 0x12) return
      if (d[8] !== a0 || d[9] !== a1 || d[10] !== page) return
      const start = d[11]
      d.slice(12, d.length - 2).forEach((v, i) => {
        row[start + i] = v
      })
      if (complete()) finish()
    })
    link.output.send(gt1RequestMessage(link.device, [a0, a1, page, 0], 128))
  })
}

/** A page, asked again when a message got lost on the way — USB MIDI drops one now and then. */
async function readPage(link: Gt1Link, a0: number, a1: number, page: number): Promise<number[]> {
  const needed = NEEDED.get(page) ?? []
  const row: number[] = []
  for (let attempt = 0; attempt < 3; attempt++) {
    const got = await readPageOnce(link, a0, a1, page)
    got.forEach((v, i) => {
      if (v !== undefined) row[i] = v
    })
    if (needed.every((o) => row[o] !== undefined)) return row
    await wait(100)
  }
  throw new Error(`A GT-1 não entregou a página ${page} inteira depois de 3 pedidos.`)
}

/** A whole patch, as named numbers. */
export async function readGt1Patch(link: Gt1Link, slot: 'TEMP' | number): Promise<Gt1Params> {
  const [a0, a1] = gt1SlotBase(slot)
  const pages = new Map<number, number[]>()
  for (let page = 0; page < GT1_PAGES; page++) pages.set(page, await readPage(link, a0, a1, page))
  const { params, missing } = gt1ParamsFromBytes(pages)
  if (missing.length) {
    throw new Error(`Leitura incompleta da patch: faltaram ${missing.length} parâmetros (${missing.slice(0, 4).join(', ')}).`)
  }
  return params
}

/** The names of user patches U01–U99 (or the ones asked for). */
export async function readGt1Names(link: Gt1Link, slots: number[]): Promise<Record<number, string>> {
  const out: Record<number, string> = {}
  for (const slot of slots) {
    const [a0, a1] = gt1SlotBase(slot)
    const name = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        off()
        resolve('')
      }, 1500)
      const off = subscribe(link.input, (d) => {
        if (d[7] !== 0x12 || d[8] !== a0 || d[9] !== a1 || d[10] !== 0 || d[11] !== 0) return
        clearTimeout(timer)
        off()
        resolve(String.fromCharCode(...d.slice(12, 28)).trimEnd())
      })
      link.output.send(gt1RequestMessage(link.device, [a0, a1, 0, 0], 16))
    })
    out[slot] = name
  }
  return out
}

/** Keys whose values differ between two patches, over every parameter with an address. */
export function gt1Diff(a: Gt1Params, b: Gt1Params): string[] {
  return GT1_ADDRESSES.map(([k]) => k).filter((k) => a[k] !== b[k])
}

/**
 * Put a patch in the temporary buffer — the unit plays it at once — and read
 * it back to prove it arrived. Nothing is stored until `storeGt1Temp`.
 */
export async function sendGt1Temp(link: Gt1Link, params: Gt1Params, onProgress?: (f: number) => void): Promise<void> {
  const messages = gt1WriteMessages(link.device, gt1SlotBase('TEMP'), gt1PatchBytes(params))
  for (let i = 0; i < messages.length; i++) {
    link.output.send(messages[i])
    onProgress?.((i + 1) / messages.length)
    // the unit applies each block as it comes; a short gap keeps its buffer from overflowing
    await wait(20)
  }
  await wait(150)
  const back = await readGt1Patch(link, 'TEMP')
  const diff = gt1Diff(params, back)
  if (diff.length) {
    throw new Error(`A GT-1 recebeu a patch diferente em ${diff.length} parâmetros (${diff.slice(0, 4).join(', ')}).`)
  }
}

/** Store the temporary patch in user slot U01–U99, then confirm by reading the slot back. */
export async function storeGt1Temp(link: Gt1Link, slot: number, expected: Gt1Params): Promise<void> {
  if (!Number.isInteger(slot) || slot < 1 || slot > 99) throw new Error('Slot inválido: use de U01 a U99.')
  const n = slot - 1
  const body = [0x7f, 0x00, 0x01, 0x04, (n >> 7) & 0x7f, n & 0x7f]
  link.output.send([0xf0, 0x41, link.device, ...GT1_MODEL_ID, 0x12, ...body, rolandChecksum(body), 0xf7])
  // writing flash takes a moment; poll until the slot reads back as sent
  for (let attempt = 0; attempt < 6; attempt++) {
    await wait(400)
    const stored = await readGt1Patch(link, slot)
    if (gt1Diff(expected, stored).length === 0) return
  }
  throw new Error(`A GT-1 não confirmou a gravação em U${String(slot).padStart(2, '0')}.`)
}
