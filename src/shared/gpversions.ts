/**
 * A song can hold several Guitar Pro files — the site's principal version, a
 * live transcription, the one a friend sent — and exactly one of them is the
 * one the app loads.
 *
 * That choice lives in each asset's `meta` (`active: true`) rather than in a
 * column: it is one flag on a JSON blob the importer already writes, and a song
 * whose files predate versions (none flagged) keeps loading what it always
 * loaded, the first one imported.
 *
 * Free of Node and DOM imports so the main process and the renderer agree on
 * which file "the tab" is.
 */

import type { MediaAssetView } from './types'

/** Where a version came from, as the dialog shows it. */
export interface GpSource {
  /** 'cifraclub', 'ultimate', 'arquivo', or the host it was downloaded from. */
  site: string
  /** The site's own name for it: "Principal", "Versão 4", "ver 2 (solo)". */
  label: string
  /**
   * What makes it the same version next time: the file's own link on
   * CifraClub, the tab page on Ultimate Guitar (whose download links carry a
   * per-session token). Absent for a file picked from disk.
   */
  id?: string
  /** The page it was picked from. */
  pageUrl?: string
  /** CifraClub counts downloads… */
  downloads?: number
  /** …Ultimate Guitar counts votes. */
  votes?: number
}

/** Every Guitar Pro file of a song, oldest first. */
export function guitarProVersions(media: MediaAssetView[]): MediaAssetView[] {
  return media.filter((m) => m.kind === 'guitarpro').sort((a, b) => a.id - b.id)
}

/** The version the app loads: the one flagged active, else the first imported. */
export function activeGuitarPro(media: MediaAssetView[]): MediaAssetView | undefined {
  const versions = guitarProVersions(media)
  return versions.find((m) => m.meta?.active === true) ?? versions[0]
}

export function gpSource(asset: MediaAssetView): GpSource | null {
  const raw = asset.meta?.source
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Partial<GpSource>
  return typeof s.site === 'string' && typeof s.label === 'string' ? (s as GpSource) : null
}
