/**
 * Versions of a song's Guitar Pro file, against a real database.
 *
 * Run with: npm run test:gpversions
 *
 * The tab window files every download as a new version and makes it the one in
 * use; the dialog switches between them; downloading a version the song already
 * has re-activates it instead of filing a "(2)". The ranking and the "which one
 * loads" rule are pure and live in test:sources. What only a database can
 * answer is here: that the flag moves and stays unique, that a switch leaves
 * the song's sections and progress alone, and that the lookup by source finds
 * the copy — and only while the file is still on disk.
 *
 * Runs in a throwaway profile. The Guitar Pro files come from the real gptabs/
 * folder, because no tab can be committed with the repository; a machine with
 * fewer than two of them skips instead of failing.
 */
import { REAL_GPTABS, TEST_ROOT } from './test-gpversions-env'
import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync } from 'node:fs'
import { extname, join } from 'node:path'
import { initDb, getDb, getSqlite, schema } from '../src/main/db/client'
import { listMedia, listSections } from '../src/main/db/repo'
import {
  activateGuitarPro,
  attachGuitarProFile,
  findGuitarProVersion
} from '../src/main/importers/library'
import { activeGuitarPro, gpSource, guitarProVersions } from '../src/shared/gpversions'
import { convertedPathFor, detectLegacyGuitarPro } from '../src/main/importers/legacygp'

let failures = 0
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${label}${detail ? ` -- ${detail}` : ''}`)
  if (!ok) failures++
}

function finish(): void {
  try {
    getSqlite()?.close()
    rmSync(TEST_ROOT, { recursive: true, force: true })
  } catch {
    // a leftover temp folder is not a failed test; the exit below must happen
  }
  console.log(`\n${failures === 0 ? 'VERSOES OK' : `${failures} VERIFICACAO(OES) FALHARAM`}`)
  app.exit(failures === 0 ? 0 : 1)
}

const GP = new Set(['.gp3', '.gp4', '.gp5', '.gpx', '.gp'])

async function run(): Promise<void> {
  const fixtures = existsSync(REAL_GPTABS)
    ? readdirSync(REAL_GPTABS).filter((f) => GP.has(extname(f).toLowerCase())).slice(0, 2)
    : []
  if (fixtures.length < 2) {
    console.log(`  pula tudo -- precisa de 2 arquivos Guitar Pro em ${REAL_GPTABS}`)
    return finish()
  }

  initDb()
  const db = getDb()
  const gptabs = process.env.GPTABS_DIR as string
  mkdirSync(gptabs, { recursive: true })
  const [a, b] = fixtures.map((f) => {
    const target = join(gptabs, f)
    copyFileSync(join(REAL_GPTABS, f), target)
    return target
  })

  const song = db.insert(schema.songs).values({ title: 'Musica de teste' }).returning().get()
  const cifra = { site: 'cifraclub', label: 'Principal', downloads: 29565, id: 'https://www.cifraclub.com.br/ajax/gp_partitura_download.php?c=1' }
  const ug = { site: 'ultimate', label: 'ver 5', votes: 30, id: 'https://tabs.ultimate-guitar.com/tab/x/y-guitar-pro-1' }

  console.log('=== 1. cada download vira uma versao, a ultima em uso ===')
  const first = await attachGuitarProFile(song.id, a, { source: cifra, activate: true })
  check('primeira importa', first.errors.length === 0, first.errors[0]?.message)
  const sectionsBefore = listSections(song.id).length
  const second = await attachGuitarProFile(song.id, b, { source: ug, activate: true })
  check('segunda importa', second.errors.length === 0, second.errors[0]?.message)

  let versions = guitarProVersions(listMedia(song.id))
  check('duas versoes na musica', versions.length === 2, String(versions.length))
  check('a ultima baixada e a usada', activeGuitarPro(versions)?.path === b)
  check('so uma marcada', versions.filter((v) => v.meta?.active === true).length === 1)
  check('origem gravada', gpSource(versions[0])?.label === 'Principal' && gpSource(versions[1])?.votes === 30)
  check('os metadados do arquivo continuam la', typeof versions[0].meta?.barCount === 'number')

  console.log('\n=== 2. trocar a versao em uso ===')
  const principal = versions.find((v) => v.path === a)!
  check('troca aceita', activateGuitarPro(song.id, principal.id))
  versions = guitarProVersions(listMedia(song.id))
  check('agora carrega a Principal', activeGuitarPro(versions)?.path === a)
  check('continua uma so marcada', versions.filter((v) => v.meta?.active === true).length === 1)
  check('secoes intactas na troca', listSections(song.id).length === sectionsBefore, `${listSections(song.id).length} vs ${sectionsBefore}`)
  check('versao de outra musica e recusada', !activateGuitarPro(song.id + 999, principal.id))
  check('id inexistente e recusado', !activateGuitarPro(song.id, 999_999))

  console.log('\n=== 3. a mesma versao baixada de novo ===')
  check('acha pela origem', findGuitarProVersion(song.id, cifra.id) === principal.id)
  check('outra origem nao casa', findGuitarProVersion(song.id, 'https://outra') === null)
  check('outra musica nao casa', findGuitarProVersion(song.id + 999, cifra.id) === null)
  unlinkSync(a)
  check('arquivo apagado do disco nao conta', findGuitarProVersion(song.id, cifra.id) === null)

  console.log('\n=== 4. um .gtp Guitar Pro 1/2 vira versao pela copia convertida ===')
  const legacy = readdirSync(REAL_GPTABS).find(
    (f) =>
      /\.gtp$/i.test(f) &&
      detectLegacyGuitarPro(new Uint8Array(readFileSync(join(REAL_GPTABS, f)).subarray(0, 64))) !== null
  )
  if (!legacy) {
    console.log('  pula -- nenhum .gtp Guitar Pro 1/2 em gptabs/')
  } else {
    const old = join(gptabs, legacy)
    copyFileSync(join(REAL_GPTABS, legacy), old)
    const report = await attachGuitarProFile(song.id, old, { source: { site: 'arquivo', label: 'antiga' }, activate: true })
    check('importa', report.errors.length === 0, report.errors[0]?.message)
    const now = activeGuitarPro(listMedia(song.id))
    check('a versao aponta para o .gp convertido', now?.path === convertedPathFor(old), now?.path)
    check('com as trilhas lidas do arquivo', Array.isArray(now?.meta?.tracks) && (now?.meta?.tracks as unknown[]).length > 0)
    const again = await attachGuitarProFile(song.id, old)
    check('importar de novo nao duplica', again.skipped === 1 && guitarProVersions(listMedia(song.id)).length === 3)
  }

  finish()
}

app.whenReady().then(() =>
  run().catch((err) => {
    console.log(` FALHA inesperada -- ${err instanceof Error ? err.stack : String(err)}`)
    failures++
    finish()
  })
)
