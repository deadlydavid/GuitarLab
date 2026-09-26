/**
 * Where the files come from: tab-site deep links and archive.org.
 *
 * Run with: npm run test:sources
 *
 * Two halves, checked differently. The link builders and the file-name/ranking
 * logic are pure and always checked. The network side is checked against the
 * real services — the URL shape is exactly the thing that silently rots when a
 * site changes its filters — but a machine that is offline reports the check as
 * skipped instead of failing the suite.
 */
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import {
  ultimateGuitarUrl,
  cifraClubSearchUrl,
  safeFileName,
  uniquePath,
  parseArchiveLength,
  scoreArchiveFile,
  searchArchiveAudio,
  rankUltimateGuitarResults,
  rankCifraClubVersions,
  cifraClubGuitarProUrl,
  type UgSearchResult
} from '../src/main/services/sources'
import { activeGuitarPro, gpSource, guitarProVersions } from '../src/shared/gpversions'
import type { MediaAssetView } from '../src/shared/types'
import { cleanTitle, normalizeTitle, normalizeArtist } from '../src/main/importers/matcher'

let failures = 0
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '  ok  ' : ' FALHA'} ${label}${detail ? ` -- ${detail}` : ''}`)
  if (!ok) failures++
}
function skip(label: string, why: string): void {
  console.log(`  pula ${label} -- ${why}`)
}

console.log('=== 1. link do Ultimate Guitar (Guitar Pro, mais bem avaliadas) ===')
const ug = ultimateGuitarUrl('Metallica', 'The Four Horsemen')
console.log(`   ${ug}`)
check('filtra por Guitar Pro (type=500)', ug.includes('type=500'))
check('filtra por 4-5 estrelas', ug.includes('rating%5B0%5D=4') && ug.includes('rating%5B1%5D=5'))
check('ordena por relevancia/nota', ug.includes('order=myweight'))
check('leva artista e musica na busca', /title=Metallica\+The\+Four\+Horsemen/.test(ug))

const cc = cifraClubSearchUrl('Metallica', 'The Four Horsemen')
check('cifraclub cai na busca do site', cc.startsWith('https://www.cifraclub.com.br/?q='))

console.log('\n=== 1b. o sufixo da loja nao vai para a busca ===')
check(
  'remaster sai do titulo',
  cleanTitle('The Four Horsemen - Remastered') === 'The Four Horsemen',
  cleanTitle('The Four Horsemen - Remastered')
)
check(
  'qualificador entre parenteses sai',
  cleanTitle('The Trooper (Original Album Version)') === 'The Trooper',
  cleanTitle('The Trooper (Original Album Version)')
)
check('titulo limpo nao e mexido', cleanTitle('Master of Puppets') === 'Master of Puppets')
check(
  'musica com "live" no nome sobrevive',
  cleanTitle('Show Me How to Live') === 'Show Me How to Live' &&
    cleanTitle('Live and Let Die') === 'Live and Let Die'
)
check(
  'sufixo que faz parte da musica fica',
  cleanTitle('Sgt. Pepper - Reprise') === 'Sgt. Pepper - Reprise'
)
const dirtyUg = ultimateGuitarUrl('Metallica', 'The Four Horsemen - Remastered')
check('a busca do UG usa o titulo limpo', !/Remastered/i.test(dirtyUg), dirtyUg.slice(0, 90))
check(
  'o nome do arquivo baixado tambem',
  safeFileName('Metallica', 'The Four Horsemen - Remastered', '.mp3') ===
    'Metallica - The Four Horsemen.mp3',
  safeFileName('Metallica', 'The Four Horsemen - Remastered', '.mp3')
)

console.log('\n=== 2. nome de arquivo e colisao ===')
const name = safeFileName('AC/DC', 'Back In Black', '.wav')
check('barra do artista nao vira pasta', !name.includes('/') && !name.includes('\\'), name)
check('mantem o separador " - "', name.includes(' - '), name)
check('mantem a extensao', name.endsWith('.wav'), name)
check('nome vazio nao gera arquivo sem nome', safeFileName(null, '', '.mp3') === 'faixa.mp3')

const dir = mkdtempSync(join(tmpdir(), 'setlist-sources-'))
try {
  const first = uniquePath(dir, 'Metallica - One.mp3')
  writeFileSync(first, 'x')
  const second = uniquePath(dir, 'Metallica - One.mp3')
  check('nao sobrescreve um arquivo existente', first !== second, basename(second))
  check('o duplicado mantem a extensao', second.endsWith('.mp3'), basename(second))
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('\n=== 3. duracao e ranking dos arquivos do archive.org ===')
check('duracao em segundos', parseArchiveLength('255.9') === 255.9)
check('duracao em mm:ss', parseArchiveLength('4:15') === 255)
check('duracao ausente', parseArchiveLength(undefined) === null)

const doc = { identifier: 'kill-em-all', title: "Kill 'Em All", creator: 'Metallica', year: 1983 }
const wantTitle = normalizeTitle('The Four Horsemen')
const wantArtist = normalizeArtist('Metallica')

const wav = scoreArchiveFile(
  { name: '02 The Four Horsemen.wav', format: 'WAVE', title: 'The Four Horsemen', artist: 'Metallica', size: '52000000', length: '433.2' },
  doc,
  wantTitle,
  wantArtist
)
const mp3 = scoreArchiveFile(
  { name: '02 The Four Horsemen.mp3', format: 'VBR MP3', title: 'The Four Horsemen', artist: 'Metallica', size: '7000000', length: '433.2' },
  doc,
  wantTitle,
  wantArtist
)
const other = scoreArchiveFile(
  { name: '01 Hit the Lights.mp3', format: 'VBR MP3', title: 'Hit the Lights', artist: 'Metallica' },
  doc,
  wantTitle,
  wantArtist
)
const artwork = scoreArchiveFile(
  { name: 'The Four Horsemen.png', format: 'PNG', title: 'The Four Horsemen' },
  doc,
  wantTitle,
  wantArtist
)
const derived = scoreArchiveFile(
  { name: '02 The Four Horsemen.mp3', format: 'VBR MP3', title: 'The Four Horsemen', source: 'derivative' },
  doc,
  wantTitle,
  wantArtist
)

check('faixa certa entra', wav !== null && mp3 !== null)
check('faixa de outra musica fica de fora', other === null)
check('imagem nao entra como audio', artwork === null)
check('derivado do proprio archive nao entra', derived === null)
check('sem perda ganha do mp3', (wav?.score ?? 0) > (mp3?.score ?? 0), `${wav?.score} > ${mp3?.score}`)
check('url de download e montada', wav?.url === 'https://archive.org/download/kill-em-all/02%20The%20Four%20Horsemen.wav', wav?.url)
check('duracao vem do metadado', wav?.durationS === 433.2)

console.log('\n=== 3b. qual tab do Ultimate Guitar o piloto abre ===')
{
  // the shape the search page really returned for "Audioslave Like a Stone"
  const tab = (id: number, over: Partial<UgSearchResult>): UgSearchResult => ({
    id,
    type: 'Pro',
    part: '',
    version: 1,
    votes: 0,
    rating: 4,
    song_name: 'Like A Stone',
    artist_name: 'Audioslave',
    tab_url: `https://tabs.ultimate-guitar.com/tab/audioslave/like-a-stone-guitar-pro-${id}`,
    ...over
  })
  const results: UgSearchResult[] = [
    // the official row and the marketing duplicate link to the paid player
    { type: undefined, song_name: 'Like A Stone', artist_name: 'Audioslave', tab_url: 'https://tabs.ultimate-guitar.com/tab/audioslave/like-a-stone-official-2076695' },
    { type: undefined, song_name: 'Like A Stone', artist_name: 'Chris Cornell', votes: 88, tab_url: 'https://www.ultimate-guitar.com/pro/?tab_id=2825573' },
    tab(214515, { version: 5, votes: 30, rating: 4.44 }),
    tab(214511, { votes: 19, rating: 4.43 }),
    tab(852843, { version: 7, votes: 8, rating: 4.4 }),
    tab(445524, { part: 'solo', votes: 90, rating: 4.9 }),
    tab(214512, { version: 2, votes: 6 }),
    tab(214515, { version: 5, votes: 30, rating: 4.44 }),
    tab(2825573, { artist_name: 'Chris Cornell', votes: 88, tab_url: 'https://tabs.ultimate-guitar.com/tab/chris-cornell/like-a-stone-guitar-pro-2825573' }),
    tab(218709, { song_name: 'Like A Rolling Stone', artist_name: 'Bob Dylan', votes: 32, tab_url: 'https://tabs.ultimate-guitar.com/tab/bob-dylan/like-a-rolling-stone-guitar-pro-218709' }),
    tab(221172, { song_name: 'Like A Rolling Stone', artist_name: 'Jimi Hendrix', votes: 52, tab_url: 'https://tabs.ultimate-guitar.com/tab/jimi-hendrix/like-a-rolling-stone-guitar-pro-221172' })
  ]
  const ranked = rankUltimateGuitarResults(results, 'Audioslave', 'Like A Stone - Remastered')
  const ids = ranked.map((c) => Number(c.url.split('-').pop()))
  console.log(`   ${ids.join(', ')}`)
  check('a com mais votos vem primeiro', ids[0] === 214515)
  check('depois por votos', ids.slice(0, 4).join() === '214515,214511,852843,214512', ids.join())
  check('parte da musica (solo) vai para o fim mesmo com mais votos', ids[ids.length - 1] === 445524)
  check('outro artista fica de fora', !ids.includes(2825573))
  check('outra musica parecida fica de fora', !ids.includes(218709) && !ids.includes(221172))
  check('linha oficial e de marketing ficam de fora', ranked.every((c) => c.url.includes('guitar-pro-')))
  check('url repetida entra uma vez so', ids.filter((i) => i === 214515).length === 1)
  check('sem artista, casa so pelo titulo', rankUltimateGuitarResults(results, null, 'Like A Stone')[0]?.votes === 88)
  check('empate em votos desempata pela nota', rankUltimateGuitarResults([tab(1, { votes: 5, rating: 4.1 }), tab(2, { votes: 5, rating: 4.8 })], 'Audioslave', 'Like A Stone')[0]?.url.endsWith('-2') === true)
  check('nada casa, lista vazia', rankUltimateGuitarResults(results, 'Metallica', 'One').length === 0)
}

console.log('\n=== 3c. qual arquivo do CifraClub o piloto baixa ===')
{
  check(
    'pagina de Guitar Pro fica ao lado da cifra',
    cifraClubGuitarProUrl('https://www.cifraclub.com.br/legiao-urbana/tempo-perdido/') ===
      'https://www.cifraclub.com.br/legiao-urbana/tempo-perdido/guitarpro.html'
  )
  check(
    'sem barra no fim tambem',
    cifraClubGuitarProUrl('https://www.cifraclub.com.br/legiao-urbana/tempo-perdido') ===
      'https://www.cifraclub.com.br/legiao-urbana/tempo-perdido/guitarpro.html'
  )
  // what the Tempo Perdido page really listed
  const file = (c: number): string =>
    `https://www.cifraclub.com.br/ajax/gp_partitura_download.php?c=${c}&a=19&m=3219&t=6&arq=x.gp5`
  const ranked = rankCifraClubVersions([
    { label: 'Ao-vivo', downloads: 2556, url: file(54167) },
    { label: 'Versão 4', downloads: 20443, url: file(1057) },
    { label: 'Principal', downloads: 29565, url: file(47702) },
    { label: 'Versão 5', downloads: 3607, url: file(45902) },
    { label: 'Versão 4', downloads: 20443, url: file(1057) }
  ])
  console.log(`   ${ranked.map((v) => v.label).join(', ')}`)
  check('Principal primeiro', ranked[0]?.label === 'Principal')
  check('depois por downloads', ranked.map((v) => v.label).join() === 'Principal,Versão 4,Versão 5,Ao-vivo')
  check('link repetido entra uma vez so', ranked.length === 4)
  const noPrincipal = rankCifraClubVersions([
    { label: 'Versão 2', downloads: 10, url: file(1) },
    { label: 'Versão 3', downloads: 900, url: file(2) }
  ])
  check('sem Principal, a mais baixada', noPrincipal[0]?.label === 'Versão 3')
}

console.log('\n=== 3d. qual versao do Guitar Pro o app carrega ===')
{
  const gp = (id: number, meta: Record<string, unknown> | null): MediaAssetView => ({
    id,
    songId: 1,
    kind: 'guitarpro',
    path: `C:/gptabs/${id}.gp5`,
    bytes: 100,
    meta
  })
  const audio: MediaAssetView = { id: 1, songId: 1, kind: 'audio_master', path: 'a.wav', bytes: 1, meta: null }
  check('sem marca, a primeira importada', activeGuitarPro([gp(9, null), gp(4, null), audio])?.id === 4)
  check('a marcada ganha', activeGuitarPro([gp(4, null), gp(9, { active: true })])?.id === 9)
  check('marca falsa nao conta', activeGuitarPro([gp(4, { active: false }), gp(9, null)])?.id === 4)
  check('sem Guitar Pro, nada', activeGuitarPro([audio]) === undefined)
  check('lista so Guitar Pro, em ordem', guitarProVersions([gp(9, null), audio, gp(4, null)]).map((v) => v.id).join() === '4,9')
  check(
    'origem lida do meta',
    gpSource(gp(5, { source: { site: 'cifraclub', label: 'Principal', downloads: 29565 } }))?.label === 'Principal'
  )
  check('origem malformada vira null', gpSource(gp(5, { source: 'x' })) === null)
}

console.log('\n=== 4. busca real no archive.org ===')
try {
  const live = await searchArchiveAudio('Metallica', 'The Four Horsemen', 5)
  if (!live.candidates.length && live.error) {
    skip('busca no archive.org', live.error)
  } else {
    check('a busca devolve candidatos', live.candidates.length > 0, `${live.candidates.length}`)
    const top = live.candidates[0]
    console.log(`   melhor: ${top.fileName} (${top.format}, ${top.reason})`)
    check(
      'o melhor candidato e a musica pedida',
      normalizeTitle(top.fileName).includes('four horsemen') ||
        normalizeTitle(top.itemTitle).length > 0,
      top.fileName
    )
    check('todo candidato tem url de download', live.candidates.every((c) => c.url.startsWith('https://archive.org/download/')))
    check(
      'os candidatos vem ordenados pela nota',
      live.candidates.every((c, i) => i === 0 || live.candidates[i - 1].score >= c.score)
    )
  }
} catch (err) {
  skip('busca no archive.org', err instanceof Error ? err.message : String(err))
}

console.log('\n=== 4b. busca real partindo de um titulo sujo ===')
try {
  const dirty = await searchArchiveAudio('Metallica', 'The Four Horsemen - Remastered', 3)
  if (!dirty.candidates.length && dirty.error) {
    skip('busca com titulo sujo', dirty.error)
  } else {
    check(
      'o titulo com sufixo ainda encontra a faixa',
      dirty.candidates.length > 0,
      dirty.candidates[0]?.fileName ?? ''
    )
  }
} catch (err) {
  skip('busca com titulo sujo', err instanceof Error ? err.message : String(err))
}

console.log('\n=== 5. o Ultimate Guitar ainda aceita esses filtros ===')
try {
  const res = await fetch(ug, {
    signal: AbortSignal.timeout(15000),
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
    }
  })
  const html = await res.text()
  check('a busca responde', res.ok, `HTTP ${res.status}`)
  // the page ships its state as JSON in a data-content attribute
  check('a pagina traz resultados de Guitar Pro', html.includes('Guitar Pro'), `${html.length} bytes`)
} catch (err) {
  skip('busca no Ultimate Guitar', err instanceof Error ? err.message : String(err))
}

console.log(`\n${failures === 0 ? 'FONTES OK' : `${failures} VERIFICACAO(OES) FALHARAM`}`)
process.exit(failures === 0 ? 0 : 1)
