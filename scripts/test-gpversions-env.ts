/**
 * Points the app at a throwaway profile before any of its modules load.
 *
 * `config-env` reads `userData` and the media folders the moment it is
 * imported, so this has to be the first import of test-gpversions.ts — ES
 * modules evaluate in import order, and anything later is too late.
 */
import { app } from 'electron'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const TEST_ROOT = mkdtempSync(join(tmpdir(), 'guitarlab-gpversions-'))
// the real library, read before it is redirected: the fixtures come from there
export const REAL_GPTABS = process.env.GPTABS_DIR || join(process.cwd(), 'gptabs')

app.setPath('userData', join(TEST_ROOT, 'guitarlab'))
process.env.GPTABS_DIR = join(TEST_ROOT, 'gptabs')
process.env.SONGS_DIR = join(TEST_ROOT, 'songs')
process.env.STEMS_DIR = join(TEST_ROOT, 'stems')
