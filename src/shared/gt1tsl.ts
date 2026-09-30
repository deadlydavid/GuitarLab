import { GT1_ADDRESSES, GT1_TSL_EXTRAS } from './gt1data'
import type { Gt1Params } from './gt1codec'

/**
 * BOSS TONE STUDIO liveset files (.tsl) for the GT-1.
 *
 * A liveset is JSON: a header, and a list of patches that each carry the
 * unit's named numbers plus a few editor-side keys (the chain repeated as an
 * object, the name as a string). Written the way the editor writes them, so
 * the file imports into BOSS TONE STUDIO like one it exported itself.
 */

interface TslPatch {
  name: string
  params: Record<string, unknown>
}

interface TslFile {
  device?: string
  patchList?: TslPatch[]
}

/** EASY SELECT genres, in the unit's numbering (PATCH CATEGORY). */
export const GT1_GENRES = [
  'JAZZ/FUSION',
  'BLUES',
  'COUNTRY',
  'DISCO',
  'SOUL/FUNK',
  'OLDIES',
  'ROCK',
  'ALTERNATIVE',
  'HARD ROCK',
  'STUDIO',
  'METAL/CORE',
  'ACOUSTIC',
  'R&B',
  'POPS',
  'LATIN',
  'TRADITIONAL',
  'USER 1',
  'USER 2',
  'USER 3'
]

const randomId = (): string => String(1_000_000_000 + Math.floor(Math.random() * 8_999_999_999))

export function gt1NameOf(params: Gt1Params): string {
  return Array.from({ length: 16 }, (_, i) => String.fromCharCode(params[`patch_name${i + 1}`] ?? 32))
    .join('')
    .trimEnd()
}

/** One patch, with every key the editor writes. */
function tslParams(params: Gt1Params): Record<string, unknown> {
  const out: Record<string, unknown> = { ...GT1_TSL_EXTRAS }
  for (const [key, , , size] of GT1_ADDRESSES) {
    const value = params[key]
    out[key] = value
    if (size === 2) {
      out[`${key}_h`] = (value >> 7) & 0x7f
      out[`${key}_l`] = value & 0x7f
    }
  }
  const positions = Array.from({ length: 20 }, (_, i) => params[`fx_chain_position${i + 1}`])
  out.chainParams = {
    ...Object.fromEntries(positions.map((p, i) => [`position${i + 1}`, p])),
    positionList: positions
  }
  out.patchname = gt1NameOf(params)
  return out
}

/** A liveset with these patches, in order, ready to write to a .tsl file. */
export function buildGt1Tsl(liveSetName: string, patches: Gt1Params[]): string {
  const liveSetId = randomId()
  return JSON.stringify({
    liveSetData: { url: null, id: liveSetId, image: null, orderNumber: 1, path: null, name: liveSetName },
    device: 'GT-1',
    version: '1.0.0',
    patchList: patches.map((params, i) => ({
      tcPatch: false,
      id: randomId(),
      liveSetId,
      note: null,
      params: tslParams(params),
      orderNumber: i + 1,
      patchNo: null,
      patchID: null,
      logPatchName: null,
      category: GT1_GENRES[params.patch_category] ?? 'ROCK',
      category2: GT1_GENRES[params.patch_category2] ?? 'STUDIO',
      name: gt1NameOf(params)
    }))
  })
}

/** The patches of a GT-1 liveset, as named numbers. Throws on anything else. */
export function parseGt1Tsl(text: string): Array<{ name: string; params: Gt1Params }> {
  let file: TslFile
  try {
    file = JSON.parse(text) as TslFile
  } catch {
    throw new Error('O arquivo não é um .tsl válido (JSON ilegível).')
  }
  if (file.device !== 'GT-1') throw new Error(`Este .tsl é de "${file.device ?? '?'}", não da GT-1.`)
  return (file.patchList ?? []).map((p) => {
    const params: Gt1Params = {}
    for (const [key] of GT1_ADDRESSES) {
      const v = p.params?.[key]
      if (typeof v !== 'number') throw new Error(`A patch "${p.name}" não tem o parâmetro ${key}.`)
      params[key] = v
    }
    return { name: p.name, params }
  })
}
