import { app, BrowserWindow, session, type DownloadItem, type Session } from 'electron'
import { unlinkSync } from 'node:fs'
import { extname, basename } from 'node:path'
import { config } from '../config'
import {
  activateGuitarPro,
  attachGuitarProFile,
  attachAudioFile,
  findGuitarProVersion
} from '../importers/library'
import {
  rankCifraClubVersions,
  rankUltimateGuitarResults,
  uniquePath,
  type CifraVersion,
  type UgCandidate,
  type UgSearchResult
} from './sources'
import type { DownloadProgress } from '@shared/types'
import type { GpSource } from '@shared/gpversions'

/**
 * The "baixar tablatura" flow.
 *
 * Ultimate Guitar and CifraClub have no API, so the app never fetches a tab
 * from its own process. It opens the site in a real browser window instead —
 * in a persistent partition of its own, so a login survives — and intercepts
 * the downloads: whatever lands goes straight into gptabs/ (or songs/ for
 * audio), is imported onto the song the user came from as the version in use,
 * and the window closes.
 *
 * A pilot can also do the clicking (see `Pilot` below). On CifraClub it opens
 * the song's Guitar Pro page and takes the "Principal" file; on Ultimate
 * Guitar it opens the most-voted Guitar Pro tab and presses Download. Whenever
 * it cannot — no file, every candidate blocked, a login it cannot make — it
 * says why and leaves the window where it is. Without a pilot the window is
 * just the site, for picking another version by hand.
 */

const GP_EXT = new Set(['.gp3', '.gp4', '.gp5', '.gpx', '.gp', '.gp7', '.gtp', '.ptb'])
const AUDIO_EXT = new Set(['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.opus'])
const PARTITION = 'persist:tabsites'

/**
 * Ultimate Guitar's service worker.
 *
 * Once it is registered in a logged-in session every UG page renders blank:
 * the worker answers the React bundles and the page never hydrates. Nothing
 * the app needs goes through it, so it is refused outright, and whatever copy
 * an earlier version of the app let register is cleared at startup.
 */
const UG_SERVICE_WORKER = '*://*.ultimate-guitar.com/sw_*'

/**
 * The browser's own user agent, without the tokens Electron and the app add.
 *
 * CifraClub answers any request whose user agent says "Electron" with a 403,
 * and this window is a Chromium like any other: the version it reports is the
 * one it really runs.
 */
function browserUserAgent(ua: string): string {
  const name = app.getName().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return ua
    .replace(/ Electron\/\S+/, '')
    .replace(new RegExp(` ${name}\\/\\S+`, 'i'), '')
}

export type DownloadListener = (event: DownloadProgress) => void

/** Which song the next download from this session belongs to. */
let pendingSongId: number | null = null
let listener: DownloadListener | null = null
let wired: Promise<void> | null = null

function kindForExt(ext: string): { dir: string; kind: 'guitarpro' | 'audio' } | null {
  if (GP_EXT.has(ext)) return { dir: config.paths.gptabs, kind: 'guitarpro' }
  if (AUDIO_EXT.has(ext)) return { dir: config.paths.songs, kind: 'audio' }
  return null
}

/**
 * Where a download belongs, and under what name.
 *
 * The extension in `Content-Disposition` is the first answer, but tab sites
 * hand out plenty of links whose filename carries none — the type only shows up
 * in the URL that served it. Falling back to the URL is what keeps a `.gtp`
 * from bouncing out to the Save dialog and landing in the user's Downloads
 * folder instead of gptabs/, and the recovered extension is appended to the
 * saved name so the importer (which matches on extension) still sees it.
 */
function destinationFor(
  fileName: string,
  url: string
): { dir: string; kind: 'guitarpro' | 'audio'; fileName: string } | null {
  const own = kindForExt(extname(fileName).toLowerCase())
  if (own) return { ...own, fileName }

  let urlExt = ''
  try {
    const parsed = new URL(url)
    urlExt = extname(parsed.pathname).toLowerCase()
    // CifraClub serves every file from one script and names it in the query
    if (!kindForExt(urlExt)) urlExt = extname(parsed.searchParams.get('arq') ?? '').toLowerCase()
  } catch {
    // a data: or blob: URL has no path to read an extension from
  }
  const fromUrl = urlExt ? kindForExt(urlExt) : null
  if (!fromUrl) return null
  return { ...fromUrl, fileName: `${fileName}${urlExt}` }
}

function emit(event: DownloadProgress): void {
  listener?.(event)
}

/** A status line for the dialog while a pilot works: no file yet, no bytes. */
function say(songId: number, status: 'searching' | 'error', message: string, site = 'Tablatura'): void {
  emit({
    songId,
    kind: 'guitarpro',
    fileName: site,
    receivedBytes: 0,
    totalBytes: null,
    status,
    message
  })
}

/**
 * What the page says about the file that is coming down, read while the page
 * that offered it is still on screen.
 *
 * On CifraClub that is the link the download came from — its name and its
 * download count; on Ultimate Guitar the tab being shown. Anything else is
 * named after the file.
 */
const DESCRIBE_DOWNLOAD = (fileUrl: string): string => `((fileUrl) => {
  const host = location.hostname
  const page = location.href
  if (/cifraclub/.test(host)) {
    const a = [...document.querySelectorAll('a[href*="gp_partitura_download"]')].find((l) => l.href === fileUrl)
    const lines = a ? a.innerText.split('\\n').map((l) => l.trim()).filter(Boolean) : []
    const count = lines.find((l) => /downloads?$/i.test(l)) || ''
    return { site: 'cifraclub', label: lines[0] || '', downloads: Number(count.replace(/\\D/g, '')) || undefined, id: fileUrl, pageUrl: page }
  }
  if (/ultimate-guitar/.test(host)) {
    const s = window.UGAPP && window.UGAPP.store
    const t = s && s.page && s.page.data && s.page.data.tab
    return t
      ? { site: 'ultimate', label: 'ver ' + t.version + (t.part ? ' (' + t.part + ')' : ''), votes: t.votes, id: page.split(/[?#]/)[0], pageUrl: page }
      : { site: 'ultimate', label: '', pageUrl: page }
  }
  return { site: host, label: '', pageUrl: page }
})(${JSON.stringify(fileUrl)})`

async function describeDownload(fileUrl: string, fileName: string): Promise<GpSource> {
  const fallback = basename(fileName, extname(fileName))
  const win = browserWindow
  let host = ''
  try {
    host = new URL(fileUrl).hostname
  } catch {
    // keep the empty host
  }
  if (!win || win.isDestroyed()) return { site: host, label: fallback }
  const read = win.webContents.mainFrame
    .executeJavaScript(DESCRIBE_DOWNLOAD(fileUrl))
    .catch(() => null) as Promise<GpSource | null>
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 3000))
  const described = await Promise.race([read, timeout])
  if (!described) return { site: host, label: fallback }
  return { ...described, label: described.label || fallback }
}

/** Import what arrived, as the version in use; true when it is on the song. */
async function importDownloaded(
  songId: number,
  kind: 'guitarpro' | 'audio',
  path: string,
  source: GpSource
): Promise<boolean> {
  const fileName = basename(path)
  emit({ songId, kind, fileName, receivedBytes: 0, totalBytes: null, status: 'importing' })
  try {
    const report =
      kind === 'guitarpro'
        ? await attachGuitarProFile(songId, path, { source, activate: true })
        : await attachAudioFile(songId, path)
    const failed = report.errors[0]
    emit({
      songId,
      kind,
      fileName,
      receivedBytes: 0,
      totalBytes: null,
      status: failed ? 'error' : 'done',
      message: failed
        ? failed.message
        : kind === 'guitarpro'
          ? `"${source.label}" importada e em uso`
          : (report.details[0]?.note ?? 'importado')
    })
    return !failed
  } catch (err) {
    emit({
      songId,
      kind,
      fileName,
      receivedBytes: 0,
      totalBytes: null,
      status: 'error',
      message: err instanceof Error ? err.message : String(err)
    })
    return false
  }
}

/**
 * A version the song already has came down again: keep the copy it has, make
 * that the one in use, and throw the new file away.
 */
function reuseExisting(songId: number, assetId: number, path: string, source: GpSource): void {
  try {
    unlinkSync(path)
  } catch {
    // a copy left behind in gptabs/ is untidy, not wrong
  }
  activateGuitarPro(songId, assetId)
  emit({
    songId,
    kind: 'guitarpro',
    fileName: basename(path),
    receivedBytes: 0,
    totalBytes: null,
    status: 'done',
    message: `"${source.label}" já estava na música — agora é a versão em uso`
  })
}

function wire(target: Session): Promise<void> {
  if (wired) return wired

  target.setUserAgent(browserUserAgent(target.getUserAgent()))
  target.webRequest.onBeforeRequest({ urls: [UG_SERVICE_WORKER] }, (_details, callback) =>
    callback({ cancel: true })
  )

  target.on('will-download', (_event, item: DownloadItem) => {
    const songId = pendingSongId
    const dest = destinationFor(item.getFilename(), item.getURL())

    if (!dest || songId === null) {
      // not a file this app knows what to do with: let the user save it wherever
      return
    }

    pilot?.downloadStarted()
    const fileName = dest.fileName
    // Read now, while the page that offered the file is still the one on
    // screen — and by the link that was clicked, the first in the chain:
    // CifraClub hands the file over through a redirect to its CDN, whose URL
    // appears nowhere on the page.
    const described = describeDownload(item.getURLChain()[0] ?? item.getURL(), fileName)
    const savePath = uniquePath(dest.dir, fileName)
    item.setSavePath(savePath)

    item.on('updated', (_e, state) => {
      if (state !== 'progressing') return
      emit({
        songId,
        kind: dest.kind,
        fileName,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes() || null,
        status: 'downloading'
      })
    })

    item.once('done', (_e, state) => {
      if (state !== 'completed') {
        emit({
          songId,
          kind: dest.kind,
          fileName,
          receivedBytes: item.getReceivedBytes(),
          totalBytes: item.getTotalBytes() || null,
          status: 'error',
          message: state === 'cancelled' ? 'download cancelado' : 'download interrompido'
        })
        return
      }
      void described.then(async (source) => {
        const existing =
          dest.kind === 'guitarpro' && source.id ? findGuitarProVersion(songId, source.id) : null
        if (existing !== null) {
          reuseExisting(songId, existing, savePath, source)
          closeBrowserSoon()
          return
        }
        // the file is in the folder and on the song: the window has done its job
        if (await importDownloaded(songId, dest.kind, savePath, source)) closeBrowserSoon()
      })
    })
  })

  wired = target
    .clearStorageData({ storages: ['serviceworkers', 'cachestorage'] })
    .catch(() => {
      // a profile the worker never reached has nothing to clear
    })
  return wired
}

export function setDownloadListener(fn: DownloadListener | null): void {
  listener = fn
}

/* ------------------------------------------------------------------ window */

/**
 * Only one such window is kept around: opening another site reuses it, so the
 * user does not end up with a pile of browser windows behind the app.
 */
let browserWindow: BrowserWindow | null = null
let parentWindow: BrowserWindow | null = null

function closeBrowserSoon(): void {
  const win = browserWindow
  if (!win || win.isDestroyed()) return
  // long enough to see the page acknowledge the click, short enough not to wait on it
  setTimeout(() => {
    if (!win.isDestroyed()) win.close()
    if (parentWindow && !parentWindow.isDestroyed()) parentWindow.focus()
  }, 700)
}

export interface PilotTarget {
  site: 'ultimate' | 'cifraclub'
  artist: string | null
  title: string
}

/**
 * Open a tab site with downloads pointed at the project folders.
 *
 * With `auto`, that site's pilot takes over; without it the window is the plain
 * manual flow — the user browses, and whatever they download still lands on the
 * song as a new version.
 */
export async function openTabBrowser(
  url: string,
  songId: number,
  parent: BrowserWindow | null,
  auto?: PilotTarget
): Promise<void> {
  pendingSongId = songId
  parentWindow = parent
  const target = session.fromPartition(PARTITION)
  await wire(target)

  pilot?.stop()
  pilot = !auto ? null : auto.site === 'cifraclub' ? new CifraPilot(songId) : new UgPilot(songId, auto)
  pilot?.begin()

  if (browserWindow && !browserWindow.isDestroyed()) {
    void browserWindow.loadURL(url)
    browserWindow.focus()
    return
  }

  const win = new BrowserWindow({
    width: 1180,
    height: 880,
    parent: parent ?? undefined,
    backgroundColor: '#1c1c22',
    autoHideMenuBar: true,
    title: 'Baixar tablatura',
    webPreferences: {
      session: target,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  browserWindow = win

  win.on('closed', () => {
    browserWindow = null
    pilot?.stop()
    pilot = null
  })

  // On navigation, not on a load event: the page's data is there as soon as its
  // first script runs, while dom-ready and the load event both wait on the ads
  // the site serves — never arriving at all, some visits. The pilot polls for
  // what it needs, so starting early costs nothing.
  win.webContents.on('did-navigate', () => {
    loadSeq++
    void pilot?.step(win, loadSeq)
  })

  // Tab sites open the download in a new tab; keep it in the same window.
  // The referrer has to travel with it: Ultimate Guitar answers a download
  // request that does not come from the tab page with a redirect back to that
  // page instead of the file, which is exactly what "logged in and it still
  // does not download" looked like.
  win.webContents.setWindowOpenHandler(({ url: nextUrl, referrer, postBody }) => {
    if (!win.isDestroyed()) {
      win.webContents
        .loadURL(nextUrl, {
          httpReferrer: referrer,
          ...(postBody
            ? { postData: postBody.data, extraHeaders: `Content-Type: ${postBody.contentType}` }
            : {})
        })
        // a navigation that turns into a download is reported as aborted
        .catch(() => {})
    }
    return { action: 'deny' }
  })

  void win.loadURL(url)
}

/* ------------------------------------------------------------------- pilot */

/** Bumped on every page load, so a step still polling an old page gives up. */
let loadSeq = 0
let pilot: Pilot | null = null

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function samePage(a: string, b: string): boolean {
  const strip = (u: string): string => u.split(/[?#]/)[0].replace(/\/$/, '')
  return strip(a) === strip(b)
}

/**
 * Does on a tab site what the user would, one page at a time.
 *
 * A pilot is driven by page loads rather than by a script of its own, so it
 * can never fight the user: it acts only on the pages it opened itself, and
 * any other page — a login through Google, a result the user clicked — leaves
 * it waiting. Every candidate gets one attempt; one that does not turn into a
 * download within a few seconds is skipped for the next.
 */
abstract class Pilot {
  protected stopped = false
  protected downloading = false
  private downloadTimer: NodeJS.Timeout | null = null

  constructor(protected readonly songId: number) {}

  /** The site's name on the dialog's status line. */
  protected abstract readonly site: string

  /** Say what is happening as soon as the window opens. */
  abstract begin(): void

  /** React to the window having navigated. */
  abstract step(win: BrowserWindow, seq: number): Promise<void>

  stop(): void {
    this.stopped = true
    if (this.downloadTimer) clearTimeout(this.downloadTimer)
  }

  downloadStarted(): void {
    this.downloading = true
    if (this.downloadTimer) clearTimeout(this.downloadTimer)
  }

  protected say(status: 'searching' | 'error', message: string): void {
    say(this.songId, status, message, this.site)
  }

  protected fail(message: string): void {
    this.say('error', message)
    this.stop()
  }

  /**
   * Run a snippet in the page now.
   *
   * Through the main frame, not `webContents.executeJavaScript`: that one holds
   * the code until the page stops loading, and on an ad-heavy page that is half
   * a minute after the data the pilot needs was already there. The frame is
   * read fresh on every call because a cross-site navigation swaps it.
   */
  protected run(win: BrowserWindow, script: string): Promise<unknown> {
    return win.webContents.mainFrame.executeJavaScript(script)
  }

  protected alive(win: BrowserWindow, seq: number): boolean {
    return !this.stopped && pilot === this && seq === loadSeq && !win.isDestroyed()
  }

  /** Run a snippet in the page, polling until it answers something truthy. */
  protected async poll<T>(
    win: BrowserWindow,
    seq: number,
    script: string,
    timeoutMs: number
  ): Promise<T | null> {
    const deadline = Date.now() + timeoutMs
    while (this.alive(win, seq)) {
      const value = (await this.run(win, script).catch(() => null)) as T | null
      if (value) return value
      if (Date.now() > deadline) return null
      await wait(400)
    }
    return null
  }

  /**
   * After a click that should start a download: if nothing arrives in time,
   * the site is not going to serve this one — move on.
   */
  protected expectDownload(win: BrowserWindow, onTimeout: () => void): void {
    if (this.downloadTimer) clearTimeout(this.downloadTimer)
    this.downloadTimer = setTimeout(() => {
      if (!this.stopped && pilot === this && !win.isDestroyed() && !this.downloading) onTimeout()
    }, 15_000)
  }
}

/* ---------------------------------------------------------------- cifraclub */

/** Every file a CifraClub Guitar Pro page offers, as the page lists them. */
const READ_CIFRA_VERSIONS = `(() => {
  const links = [...document.querySelectorAll('a[href*="gp_partitura_download"]')]
  if (!links.length) return null
  return links.map((a) => {
    const lines = a.innerText.split('\\n').map((l) => l.trim()).filter(Boolean)
    const count = lines.find((l) => /downloads?$/i.test(l)) || ''
    return { label: lines[0] || 'Guitar Pro', downloads: Number(count.replace(/\\D/g, '')) || 0, url: a.href }
  })
})()`

/** Click the link to one file, the way the user would. */
const CLICK_CIFRA_VERSION = (url: string): string => `((url) => {
  const a = [...document.querySelectorAll('a[href*="gp_partitura_download"]')].find((l) => l.href === url)
  if (!a) return false
  a.click()
  return true
})(${JSON.stringify(url)})`

function isCifraGuitarProPage(url: string): boolean {
  return /^https:\/\/www\.cifraclub\.com\.br\/[^?#]+\/guitarpro\.html/.test(url)
}

/**
 * CifraClub: open the song's Guitar Pro page, take "Principal".
 *
 * No login is involved — the files are public. If the principal file does not
 * come down, the next most-downloaded one is tried. A song with no files
 * redirects away from the Guitar Pro page, and that is reported as such.
 */
class CifraPilot extends Pilot {
  protected readonly site = 'CifraClub'
  private versions: CifraVersion[] | null = null
  private index = -1

  begin(): void {
    this.say('searching', 'procurando a versão principal no CifraClub…')
  }

  async step(win: BrowserWindow, seq: number): Promise<void> {
    if (this.stopped || this.downloading || this.versions !== null) return
    if (!isCifraGuitarProPage(win.webContents.getURL())) {
      return this.fail('o CifraClub não tem Guitar Pro dessa música (ou não achei a música) — procure na janela')
    }
    const found = await this.poll<CifraVersion[]>(win, seq, READ_CIFRA_VERSIONS, 12_000)
    if (!this.alive(win, seq)) return
    if (!found) return this.fail('o CifraClub não tem arquivos Guitar Pro dessa música — procure na janela')
    this.versions = rankCifraClubVersions(found)
    return this.next(win)
  }

  private async next(win: BrowserWindow): Promise<void> {
    const versions = this.versions ?? []
    this.index++
    const version = versions[this.index]
    if (!version) {
      return this.fail(`nenhuma das ${versions.length} versões do CifraClub baixou — escolha na janela`)
    }
    this.say('searching', `baixando "${version.label}" — ${version.downloads} downloads`)
    const clicked = await this.run(win, CLICK_CIFRA_VERSION(version.url)).catch(() => false)
    if (this.stopped || win.isDestroyed()) return
    if (!clicked) {
      void win.webContents.loadURL(version.url, { httpReferrer: win.webContents.getURL() }).catch(() => {})
    }
    this.expectDownload(win, () => void this.next(win))
  }
}

/* ----------------------------------------------------------- ultimate guitar */

/** The search page's own data: who is logged in, and the result rows. */
const READ_SEARCH = `(() => {
  const s = window.UGAPP && window.UGAPP.store
  const d = s && s.page && s.page.data
  if (!s || !d || !Array.isArray(d.results)) return null
  return {
    loggedIn: Boolean(s.user && s.user.id > 0),
    results: d.results.map((r) => ({
      id: r.id, type: r.type, part: r.part, version: r.version, votes: r.votes,
      rating: r.rating, song_name: r.song_name, artist_name: r.artist_name, tab_url: r.tab_url
    }))
  }
})()`

/**
 * What a tab page offers: the site's Download button (a form posting to
 * /tab/download), a notice that the artist had the tab taken down, or neither
 * yet because the page is still rendering.
 */
const READ_TAB = `(() => {
  const button = [...document.querySelectorAll('form button[type=submit]')].find(
    (b) => b.innerText.trim().toLowerCase() === 'download' && /\\/tab\\/download/.test(b.form.action)
  )
  if (button) return 'download'
  if (/told us we can.t show this tab|this tab is not available/i.test(document.body.innerText)) return 'blocked'
  return null
})()`

const CLICK_DOWNLOAD = `(() => {
  const button = [...document.querySelectorAll('form button[type=submit]')].find(
    (b) => b.innerText.trim().toLowerCase() === 'download' && /\\/tab\\/download/.test(b.form.action)
  )
  if (!button) return false
  button.click()
  return true
})()`

const OPEN_LOGIN = `(() => {
  if (document.querySelector('input[name=password]')) return true
  const button = [...document.querySelectorAll('button')].find(
    (b) => b.offsetParent && /^log in$/i.test(b.innerText.trim())
  )
  if (!button) return false
  button.click()
  return true
})()`

/**
 * Fill the login modal the way typing would.
 *
 * The fields are React-controlled: assigning `.value` is ignored unless it goes
 * through the native setter and an input event follows.
 */
function fillLogin(username: string, password: string): string {
  return `(() => {
    const user = document.querySelector('input[name=username]')
    const pass = document.querySelector('input[name=password]')
    if (!user || !pass || !pass.form) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    for (const [el, value] of [[user, ${JSON.stringify(username)}], [pass, ${JSON.stringify(password)}]]) {
      setter.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const submit = pass.form.querySelector('button[type=submit]')
    if (!submit) return false
    submit.click()
    return true
  })()`
}

/**
 * After submitting: logged in, refused (with the site's own words), stopped at
 * a captcha, or still waiting.
 *
 * A captcha counts only when it is on screen: reCAPTCHA keeps an invisible
 * frame on every page, and its challenge frame sits hidden until it fires.
 */
const READ_LOGIN = `(() => {
  const s = window.UGAPP && window.UGAPP.store
  if (s && s.user && s.user.id > 0) return { state: 'in' }
  const pass = document.querySelector('input[name=password]')
  if (!pass || !pass.form) return { state: 'in' }
  const captcha = [...document.querySelectorAll('iframe')].some((f) => {
    if (!/recaptcha|hcaptcha|turnstile|challenges\\.cloudflare/i.test(f.src)) return false
    const r = f.getBoundingClientRect()
    return r.width > 50 && r.height > 50 && r.bottom > 0 && r.top < innerHeight &&
      getComputedStyle(f).visibility !== 'hidden'
  })
  if (captcha) return { state: 'captcha' }
  const text = pass.form.innerText
  const error = text.split('\\n').map((l) => l.trim()).find((l) => /incorrect|invalid|wrong|not found|too many/i.test(l))
  return error ? { state: 'refused', message: error } : { state: 'waiting' }
})()`

function isUgSearch(url: string): boolean {
  return /^https:\/\/www\.ultimate-guitar\.com\/search\.php/.test(url)
}

/**
 * Ultimate Guitar: pick the most-voted Guitar Pro tab of this song and press
 * Download.
 *
 * Downloading needs a login. A tab the artist had removed shows a notice
 * instead of the button, and the pilot moves on to the next candidate.
 */
class UgPilot extends Pilot {
  protected readonly site = 'Ultimate Guitar'
  private candidates: UgCandidate[] | null = null
  private index = -1
  private expecting: string | null = null
  private triedLogin = false

  constructor(
    songId: number,
    private readonly target: PilotTarget
  ) {
    super(songId)
  }

  begin(): void {
    this.say('searching', 'procurando a tab com mais votos…')
  }

  async step(win: BrowserWindow, seq: number): Promise<void> {
    if (this.stopped || this.downloading) return
    const url = win.webContents.getURL()
    if (this.candidates === null && isUgSearch(url)) return this.onSearch(win, seq)
    if (this.expecting && samePage(url, this.expecting)) return this.onTab(win, seq)
  }

  private async onSearch(win: BrowserWindow, seq: number): Promise<void> {
    const page = await this.poll<{ loggedIn: boolean; results: UgSearchResult[] }>(
      win,
      seq,
      READ_SEARCH,
      12_000
    )
    if (!this.alive(win, seq)) return
    if (!page) return this.fail('a página de busca do Ultimate Guitar não carregou — escolha na janela')

    // logged out there is no Download button at all, only "Log in"
    if (!page.loggedIn) return this.login(win, seq)

    const ranked = rankUltimateGuitarResults(page.results, this.target.artist, this.target.title)
    if (!ranked.length) {
      return this.fail('nenhuma tab Guitar Pro dessa música na busca — escolha na janela')
    }
    this.candidates = ranked
    this.next(win)
  }

  /** Open the next candidate, or give up with the reason. */
  private next(win: BrowserWindow): void {
    const candidates = this.candidates ?? []
    this.index++
    const candidate = candidates[this.index]
    if (!candidate) {
      return this.fail(
        `nenhuma das ${candidates.length} tabs pôde ser baixada (o artista tirou do ar) — escolha na janela`
      )
    }
    this.expecting = candidate.url
    const label = `${candidate.song}${candidate.part ? ` (${candidate.part})` : ''} ver ${candidate.version}`
    this.say('searching', `abrindo "${label}" — ${candidate.votes} votos`)
    void win.loadURL(candidate.url)
  }

  private async onTab(win: BrowserWindow, seq: number): Promise<void> {
    const state = await this.poll<'download' | 'blocked'>(win, seq, READ_TAB, 15_000)
    if (!this.alive(win, seq)) return
    if (state !== 'download') return this.next(win)

    const clicked = await this.run(win, CLICK_DOWNLOAD).catch(() => false)
    if (!clicked) return this.next(win)
    this.say('searching', 'baixando…')
    this.expectDownload(win, () => {
      if (this.alive(win, loadSeq)) this.next(win)
    })
  }

  /**
   * Log in with the account from Settings, once.
   *
   * Without one — or when the site refuses it — the pilot does not give up: it
   * says so and keeps waiting on this search page, so a login made by hand in
   * the window (which reloads it) picks the flow back up.
   */
  private async login(win: BrowserWindow, seq: number): Promise<void> {
    const { username, password } = config.ultimateGuitar
    if (!username || !password || this.triedLogin) {
      this.say(
        'error',
        this.triedLogin
          ? 'não consegui entrar no Ultimate Guitar — faça login na janela e o download continua'
          : 'entre na sua conta do Ultimate Guitar na janela (ou salve o login em Ajustes) e o download continua'
      )
      return
    }
    this.triedLogin = true
    this.say('searching', 'entrando na sua conta do Ultimate Guitar…')

    // The page's data shows up before React has wired its buttons, so a click
    // can land on a button that does nothing yet. Both steps are retried with
    // short waits rather than waited on once for long.
    let ready: boolean | null = null
    for (let attempt = 0; attempt < 5 && !ready && this.alive(win, seq); attempt++) {
      await this.run(win, OPEN_LOGIN).catch(() => false)
      ready = await this.poll<boolean>(
        win,
        seq,
        `Boolean(document.querySelector('input[name=password]'))`,
        2500
      )
    }
    if (!this.alive(win, seq)) return
    if (!ready) {
      this.say('error', 'não achei o login do Ultimate Guitar — entre pela janela e o download continua')
      return
    }

    let result: { state: string; message?: string } | null = null
    for (let attempt = 0; attempt < 2 && !result && this.alive(win, seq); attempt++) {
      await this.run(win, fillLogin(username, password)).catch(() => false)
      result = await this.poll<{ state: string; message?: string }>(
        win,
        seq,
        `(() => { const r = ${READ_LOGIN}; return r.state === 'waiting' ? null : r })()`,
        8000
      )
    }
    // a login that reloads the page arrives as a fresh search step on its own
    if (!this.alive(win, seq)) return

    // A captcha is the site asking for a person, and it gets one: the window
    // comes forward, the user solves it and presses LOG IN, and the pilot picks
    // up from there. It never tries to answer the captcha itself.
    if (result?.state === 'captcha') {
      this.say(
        'error',
        'o Ultimate Guitar pediu um captcha — resolva na janela e clique em LOG IN; o download continua sozinho'
      )
      if (!win.isDestroyed()) {
        win.show()
        win.focus()
      }
      result = await this.poll<{ state: string }>(
        win,
        seq,
        `(() => { const r = ${READ_LOGIN}; return r.state === 'in' ? r : null })()`,
        5 * 60_000
      )
      if (!this.alive(win, seq)) return
      if (!result) {
        this.say('error', 'o login não foi concluído — entre pela janela e o download continua')
        return
      }
    }

    if (result?.state === 'in') {
      this.say('searching', 'login feito, procurando a tab com mais votos…')
      void win.loadURL(win.webContents.getURL())
      return
    }
    this.say(
      'error',
      `o Ultimate Guitar recusou o login${result?.message ? ` ("${result.message}")` : ''} — confira em Ajustes ou entre pela janela`
    )
  }
}
