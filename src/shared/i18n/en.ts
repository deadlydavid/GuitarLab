import { plural } from './index'
import type { Catalog } from './catalog'

/**
 * English strings.
 *
 * Declared `: Catalog`, so anything missing, spare, or with the wrong argument
 * list is a compile error. Do not restructure this file — change `pt-BR.ts`,
 * the source of truth, and let the compiler point out what needs updating here.
 */
export const en: Catalog = {
  common: {
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    delete: 'Delete',
    edit: 'Edit',
    add: 'Add',
    remove: 'Remove',
    open: 'Open',
    back: 'Back',
    search: 'Search',
    loading: 'Loading',
    retry: 'Try again',
    confirm: 'Confirm',
    none: 'none',
    never: 'never',
    now: 'just now',
    yes: 'Yes',
    no: 'No',
    change: 'change',
    test: 'test',
    show: 'show',
    hide: 'hide',
    empty: '—'
  },

  units: {
    hour: 'h',
    minute: 'min',
    bpm: 'BPM',
    seconds: (n: number) => `${n} ${plural(n, 'second', 'seconds')}`,
    songs: (n: number) => `${n} ${plural(n, 'song', 'songs')}`,
    sections: (n: number) => `${n} ${plural(n, 'section', 'sections')}`,
    tracks: (n: number) => `${n} ${plural(n, 'track', 'tracks')}`
  },

  nav: {
    setlist: 'Setlist',
    practice: 'Practice',
    progress: 'Progress',
    lab: 'Lab',
    settings: 'Settings',
    tuner: 'Tuner',
    song: 'Song',
    stage: 'Stage'
  },

  labels: {
    status: {
      not_started: 'Not started',
      learning: 'Learning',
      shaky: 'Shaky',
      solid: 'Solid',
      gig_ready: 'Gig ready'
    },
    instrument: {
      guitar: 'Guitar',
      bass: 'Bass',
      drums: 'Drums',
      vocals: 'Vocals'
    },
    role: {
      lesson_tabs: 'Lesson w/ Tabs',
      backing_track: 'Backing Track',
      guitar_only: 'Guitar Only',
      bass_only: 'Bass Only',
      drums_only: 'Drums Only',
      official: 'Official',
      live: 'Live',
      cover: 'Cover',
      unknown: 'Unclassified'
    },
    output: {
      pa: 'PA / mixing desk',
      fones: 'Headphones',
      amp: 'Amplifier'
    },
    sort: {
      ordem: 'order',
      banda: 'band',
      musica: 'song',
      afinacao: 'tuning',
      duracao: 'length'
    },
    sortDir: {
      ordem: { asc: 'show order', desc: 'show order' },
      banda: { asc: 'A–Z', desc: 'Z–A' },
      musica: { asc: 'A–Z', desc: 'Z–A' },
      afinacao: {
        asc: 'E standard on top, rest A–Z',
        desc: 'E standard on top, rest Z–A'
      },
      duracao: { asc: 'shortest → longest', desc: 'longest → shortest' }
    }
  },

  settings: {
    title: 'Settings',
    intro:
      'Paste your keys here — they are encrypted on this machine and never leave it. Anything switched off only disables its own feature; the app keeps working.',
    firstSteps: 'First steps',
    firstStepsHint:
      'Only FFmpeg is required — without it, importing audio fails. Everything else is optional.',
    todoFfmpeg: 'Install FFmpeg and put it on your PATH',
    todoLlm: 'Set up an AI provider (or run Ollama locally)',
    todoSpotify: 'Add your Spotify Client ID (optional)',
    todoYoutube: 'Add your YouTube API key (optional)',

    noEncryption: 'No system encryption',
    noEncryptionBody:
      'API keys cannot be stored — storing nothing beats storing them in plain text. You can still use a .env file, and the rest of the settings work normally.',

    saved: 'Saved',
    saveFailed: 'Could not save',
    keyStored: 'key stored',
    notConfigured: 'not set',
    keepPlaceholder: '•••••••• (leave empty to keep)',
    envWarning:
      'An environment variable is setting this value and outranks anything you save here. Remove it from the environment to use this field.',

    source: {
      env: 'environment variable',
      user: 'saved by you',
      dotenv: 'from the .env file',
      default: 'default'
    },

    groupAi: 'Artificial intelligence',
    groupAiSub: 'Practice plans, technique breakdowns and tone patches',
    groupSpotify: 'Spotify',
    groupSpotifySub: 'Metadata and controlling the running player',
    groupYoutube: 'YouTube',
    groupYoutubeSub: 'Finding lessons, backing tracks and playthroughs',
    groupLab: 'Audio lab',
    groupLabSub: 'Stem separation and automatic analysis',
    groupFfmpeg: 'FFmpeg',

    primaryProvider: 'Primary provider',
    primaryProviderHint: 'If it fails, the app tries the fallbacks below, in order.',
    fallback: 'Fallbacks',
    fallbackHint:
      'Comma-separated, tried in that order. Leaving Ollama last covers the case where everything else is down.',

    language: 'Language',
    languageAuto: (name: string) => `Automatic (${name})`,
    languageHint: 'Automatic follows your operating system.',

    folders: 'Folders',
    folderGuitarPro: 'Guitar Pro',
    folderAudio: 'Audio',
    folderStems: 'Stems',
    folderDb: 'Database',
    folderSaved: 'Folder saved — restarting GuitarLab…',
    foldersHint:
      'Changing a folder restarts GuitarLab — paths are read once, at startup. Keys, models and URLs restart nothing. Songs already imported keep pointing at the files where they are.',

    connect: 'Connect',
    disconnect: 'Disconnect',
    disconnected: 'Disconnected',
    connected: 'Spotify connected',
    connecting: 'Opening Spotify in your browser…',
    connectFailed: 'Could not connect',

    ffmpegMissing: 'not found on PATH',
    ffmpegHint:
      'The one outside requirement: reads tags, measures loudness and draws the waveform. The app can fetch it for you.',
    spotifyHint:
      'Login opens in your browser (PKCE, no password in the app). Used for metadata and for driving an already-running Spotify over Connect.',
    youtubeQuota: (used: number, limit: number) =>
      `Today's quota: ${used}/${limit} units. Each search costs 100, so roughly 100 songs a day.`,
    llmHint:
      'The primary provider is tried first; if it fails, the app falls through to the fallbacks in order.',
    labGpu: (gpu: string) => `GPU: ${gpu}`,
    labGpuUnknown: 'not reported',
    labOffline: 'Install and start it in the Lab tab. Only needed for stems and automatic analysis.',

    fields: {
      spotifyClientId: 'Client ID',
      spotifyClientIdHint:
        'Create an app at developer.spotify.com/dashboard. This is the PKCE flow, so there is no client secret.',
      spotifyRedirectUri: 'Redirect URI',
      spotifyRedirectUriHint:
        'Must be registered exactly like this in your Spotify app settings.',
      youtubeApiKey: 'API key',
      youtubeApiKeyHint:
        'console.cloud.google.com → enable "YouTube Data API v3" → create a credential. The free quota covers about 100 songs a day.',
      geminiApiKey: 'Gemini — key',
      geminiModel: 'Gemini — model',
      openaiApiKey: 'OpenAI — key',
      openaiModel: 'OpenAI — model',
      openaiBaseUrl: 'OpenAI — base URL',
      openaiBaseUrlHint: 'Point this at any OpenAI-compatible service.',
      groqApiKey: 'Groq — key',
      groqModel: 'Groq — model',
      ollamaBaseUrl: 'Ollama — base URL',
      ollamaBaseUrlHint:
        'Local models: no key, and nothing leaves your machine. Install from ollama.com.',
      ollamaModel: 'Ollama — model',
      labUrl: 'Lab URL',
      demucsModel: 'Demucs model',
      demucsModelHint: 'htdemucs_6s gives 6 stems; htdemucs gives 4 at better quality.',
      demucsSegment: 'Segment',
      demucsSegmentHint: 'Chunks the audio to fit in GPU memory. Smaller = less VRAM.',
      ffmpegPath: 'FFmpeg path',
      ffmpegPathHint: 'Empty uses whatever is on your PATH. ffprobe is derived from the same path.'
    }
  },

  support: {
    title: 'Support the project',
    body:
      'GuitarLab is free and open source, and always will be — there is no paid tier. If it helps you, you can give something back.',
    sponsor: 'GitHub Sponsors',
    sponsorHint: 'No fees at all. Needs a GitHub account.',
    kofi: 'Ko-fi',
    kofiHint: 'No account needed. Card or PayPal, from any country.',
    otherWays: 'Reporting a bug or translating a screen helps just as much.'
  },

  setup: {
    ffmpegMissing:
      'FFmpeg was not found. Without it, importing audio does not work — it is the app’s one hard requirement.',
    howToInstall: 'how to install',
    openSettings: 'settings',
    dismiss: 'dismiss'
  },

  stage: {
    emptyTitle: 'Empty setlist',
    emptyBody: 'Add songs to a setlist to use Stage Mode.',
    backToSetlist: 'Back to the setlist',
    exit: 'Exit (Esc)',
    exitLabel: 'Exit stage mode',
    smaller: 'Smaller type (−)',
    bigger: 'Bigger type (+)',
    repertoire: 'Set',
    repertoireKey: 'Set (L)',
    noChart: 'No chord chart or lyrics saved for this song.',
    noChartHint: 'Chords & Lyrics, on the song screen, is where they go.',
    retunes: 'Tuning changes',
    previous: 'previous',
    next: 'next',
    upNext: 'up next',
    lastOfSet: 'last of the set',
    switchTo: (tuning: string) => `switch to ${tuning}`,
    scrollPlay: 'Scroll on its own (A)',
    scrollPause: 'Stop scrolling (A)',
    scrollSpeed: 'scroll speed',
    metronome: 'Metronome',
    metronomeBpm: (bpm: number) => `Metronome · ${bpm} bpm`,
    metronomeHint: "Click at this song's tempo (M)",
    metronomeNoBpm: 'This song has no BPM on file',
    help: '←/→ or a pedal changes song · ↑/↓ and space scroll the chart · A auto-scroll · M metronome · +/− size · L set · Esc exits'
  },

  setlist: {
    library: 'Library',
    noSongs: 'No songs yet',
    noSongsBody:
      'Point the app at your files and import. Tablature (.gp) and audio live in separate folders.',
    import: 'Import',
    chooseFolders: 'Choose folders'
  },

  setlistExtra: {
    lastPractice: "Last practice",
    tuning: "Tuning",
    key: "Key",
    tempo: "Tempo",
    openSong: "Open song",
    practice: "Practice",
    chordsLyrics: "Chords & lyrics",
    lab: "Audio Lab",
    queueHint: "Add to the top of today's practice queue on the Progress screen",
    inQueue: "In practice queue",
    addToQueue: "Add to practice queue",
    sortBy: "Sort by",
    showOrderHint: "The performance order you arranged by dragging",
    tuningChange: "Tuning change",
    hasTab: "Tab already available — click to find another version",
    findTab: "Find a Guitar Pro tab (Ultimate Guitar / CifraClub)",
    hasAudio: "Audio already available — click to download another version",
    getAudio: "Download a WAV/MP3 recording from archive.org",
    removeFromSetlist: "Remove from setlist",
    created: "created",
    matched: "matched",
    skipped: "already existed",
    errors: "errors"
  },

  practicePicker: {
    choose: "Choose what to practice",
    noSongs: "No songs imported",
    noSongsDescription: "Go back to Setlist and import your gptabs/ and songs/ folders.",
    goToSetlist: "Go to Setlist"
  },

  manual: {
    newSetlist: 'New setlist',
    renameSetlist: 'Edit the setlist',
    setlistRenamed: (name: string) => `Setlist renamed to "${name}"`,
    newSong: 'New song',
    addSong: 'Add song',
    required: 'required',
    create: 'Create',
    createAndOpen: 'Create and open',
    moreFields: 'more fields',
    fewerFields: 'fewer fields',

    setlistHint:
      'Only the name is required. The date, the venue and the notes can wait until you know them.',
    setlistName: 'Setlist name',
    setlistNamePlaceholder: 'e.g. Friday at the Roadhouse',
    band: 'Band',
    bandPlaceholder: 'e.g. Metallica covers',
    eventDate: 'Show date',
    venue: 'Venue',
    venuePlaceholder: 'e.g. The Roadhouse',
    setlistCreated: (name: string) => `Setlist "${name}" created, and now active`,

    songHint:
      'Only the title and the artist are required — the app fills the rest in for you when you import the tab or the audio.',
    songTitle: 'Title',
    songTitlePlaceholder: 'e.g. Master of Puppets',
    artist: 'Artist',
    artistPlaceholder: 'e.g. Metallica',
    album: 'Album',
    year: 'Year',
    genre: 'Genre',
    duration: 'Duration',
    durationInvalid: 'That duration did not parse — write it the way a player shows it, like 4:32.',
    key: 'Key',
    bpm: 'BPM',
    timeSignature: 'Time signature',
    tuning: 'Tuning',
    noTuning: '— none —',
    capo: 'Capo',
    notes: 'Notes',
    addTo: 'Put it straight in the setlist',
    onlyLibrary: '— library only —',
    songCreated: (title: string) => `"${title}" is in the library`,
    songCreatedIn: (title: string, setlist: string) => `"${title}" joined ${setlist}`,
    duplicate: (title: string, artist: string) =>
      `"${title}", by ${artist}, is already in your library.`,
    duplicateOpen: 'Open the one you have',
    duplicateAnyway: 'Create it anyway'
  },

  lab: {
    title: 'Audio Lab',
    subtitle: 'Stem separation and analysis, running on your own machine',
    on: 'Lab running',
    off: 'Lab stopped',
    jobs: {
      stems: 'Separate stems',
      rhythm: 'BPM and beat grid',
      harmony: 'Key and chords',
      transcribe: 'Audio → MIDI',
      lyrics: 'Transcribe lyrics'
    },
    jobDesc: {
      stems: 'Demucs splits the track into vocals, drums, bass, guitar, piano and other. Gives you the guitar-only and the backing track.',
      rhythm: 'Finds tempo, beats and bars so the A/B loop can snap to the grid.',
      harmony: 'Finds the key and the chord progression over time.',
      transcribe: 'basic-pitch turns the audio into MIDI — a first draft of a tab.',
      lyrics: 'faster-whisper transcribes the lyrics with timestamps.'
    },
    run: 'Run',
    rerun: 'Run again',
    sent: (job: string) => `${job} sent to the lab`,
    sendFailed: 'Could not submit the job',
    jobStatus: {
      queued: 'queued',
      running: 'running',
      done: 'done',
      error: 'error',
      canceled: 'canceled'
    },
    stemsMade: (count: number) => `Stems produced (${count})`,
    openFolder: 'open folder',
    history: 'Job history',
    chooseSong: 'song',
    chooseSongPlaceholder: '— pick a song —',
    noSongs: 'No song has local audio',
    noSongsDesc: 'The lab needs the audio file. Put mp3/wav/flac in your songs folder and import.',
    songNoAudio: 'This song has no local audio yet',
    songNoAudioDesc:
      'The lab listens to the recording. Grab the track with the WAV button in the setlist, or put the file in your audio folder and import.',
    goToSetlist: 'Go to the setlist',
    demucsModel: {
      six: '6 stems (guitar included)',
      four: '4 stems (best quality)',
      fourFt: '4 stems fine-tuned (slower)'
    },
    setup: {
      title: 'Install the lab',
      intro:
        'The lab runs the heavy models on your machine. It is not in the installer, so the installer stays small — pick below and the app downloads and sets it all up.',
      gpuFound: (name: string, driver: string) => `${name} · driver ${driver}`,
      gpuNone: 'No NVIDIA card found — the CPU pack is the right one here',
      recommended: 'recommended',
      packCpu: 'Processor (CPU)',
      packCpuDesc: 'Works anywhere. Separating a song takes minutes rather than seconds.',
      packCuda: 'NVIDIA card (CUDA)',
      packCudaDesc:
        'Much faster. Needs only the NVIDIA driver — no CUDA Toolkit, no Docker.',
      install: (size: string) => `Install · ${size}`,
      installing: 'Installing',
      cancel: 'Cancel install',
      canceled: 'Install canceled',
      timeWarning:
        'Anywhere from a few minutes to half an hour, depending on your connection. You can leave this tab — the download carries on.',
      phase: {
        uv: 'preparing the installer',
        python: 'downloading Python',
        venv: 'creating the environment',
        torch: 'downloading PyTorch',
        demucs: 'installing Demucs',
        base: 'installing the rest',
        done: 'done',
        error: 'failed'
      },
      ready: 'Lab installed',
      packInUse: (pack: string) => `${pack} pack`,
      start: 'Start',
      stop: 'Stop',
      starting: 'Starting',
      remove: 'Remove the lab',
      removeConfirm:
        "This deletes the lab's Python environment. Downloaded models are kept. Continue?",
      removeModels: 'Delete the models',
      removeModelsConfirm:
        'This deletes the downloaded models. They will be fetched again when needed. Continue?',
      stale: 'This install is from an earlier version',
      staleDesc: 'Reinstall to match the versions this build of the app expects.',
      diskRuntime: 'environment',
      diskModels: 'models',
      models: 'Models',
      modelsDesc:
        'Downloaded the first time you use each one. Get them ahead of time so no job stalls waiting.',
      download: 'Download',
      downloading: 'Downloading',
      downloaded: 'downloaded',
      folders: 'Folders'
    }
  },
  tools: {
    ffmpeg: {
      title: 'FFmpeg',
      missing: 'FFmpeg was not found',
      missingDesc:
        'The app uses FFmpeg to read, convert and measure the loudness of audio. Importing music does not work without it.',
      install: 'Download and install',
      installing: 'Downloading FFmpeg',
      extracting: 'Installing',
      installed: (path: string) => `Installed by the app at ${path}`,
      remove: 'Remove',
      onPath: 'Found on the system'
    }
  },
  tone: {
    rigNoteGt1:
      "With a GT-1, the suggestion only uses what its manual allows — every block, type and value range is checked — and puts CTL1, the EXP pedal and the ASSIGNs to work so the whole song plays without changing patch.",
    pitchGt1: (semitones: string) =>
      `On the GT-1 the pitch shifter is an FX type: FX1 = PITCH SHIFTER, PITCH ${semitones}, FINE 0, PRE DELAY 0 ms, FEEDBACK 0, E.LEVEL 100, D.LEVEL 0, with FX1 first in the chain. FX2 is left for the song's own effect.`,
    chainOn: (label: string) => `${label}: on`,
    chainStandby: (label: string) => `${label}: off in the patch, a controller turns it on`,
    chainOff: (label: string) => `${label}: off`,
    blockStandby: 'off in the patch (a controller turns it on)',
    controlsTitle: 'Pedals and switches',
    when: (when: string) => `when: ${when}`,
    assignTitle: 'ASSIGN — one stomp moves several parameters',
    assignPurpose: 'what for',
    wishes: 'What you want in this song (optional)',
    wishesPlaceholder: 'e.g. harmony a third below on the melodic solo, wah on the solo, a single patch',
    wishesHint: 'Goes to the AI as a rule and is saved with the patch.',
    cuesTitle: 'Live cue sheet',
    research: {
      title: 'How the record was made',
      sources: (n: number) => `${n} web ${plural(n, 'source', 'sources')}`,
      noSources: "no sources: the model's memory",
      again: 'Search again',
      search: 'Search the web',
      empty:
        'The AI looks for interviews, rig rundowns and production credits to find out which guitars, amps, cabinets, pedals and microphones were used on this recording. That is what the patch tries to reproduce; suggesting a patch runs this search on its own if it has not been done yet.',
      ready: (n: number) => `Research done, with ${n} ${plural(n, 'source', 'sources')}`,
      ungrounded: "No provider that can search answered: the text is the model's memory"
    },
    setup: {
      title: 'Before building it on the GT-1 (once)',
      outputAmp:
        'your amp type (COMBO AMP, STACK AMP or JC-120; *RETURN when going into the return). In this mode the PREAMP SP TYPE does nothing.',
      outputLine: 'LINE/PHONES — this is what turns on the cabinet simulation (SP TYPE) for a PA or headphones.',
      pref: 'CTL 1, EXP 1 and EXP SW set to PATCH. On SYSTEM the GT-1 ignores these pedals\' settings in the patch and the ASSIGNs that use them.',
      hold: 'ON, if you want the volume/wah to stay where the pedal is when switching between patches with the same function.',
      editor:
        'build the patch from a clean one (INIT) and write it to a U01–U99 slot; the chain order is dragged on the editor screen.',
      matchWhere: 'To compare the tone',
      match:
        'MENU › USB: DIRECT MONITOR ON and EFX OUT 100%, then pick the "GT-1" input below — or the GT-1 output into the UM2 with the UM2 gain low enough not to clip.'
    },
    gt1: {
      title: 'Send to the GT-1',
      intro:
        'Write the patch straight to the unit over USB, or export a .tsl to import in BOSS TONE STUDIO. Before replacing a slot, the app saves a .tsl backup of what was there.',
      export: 'Export .tsl',
      exported: (path: string) => `Liveset saved to ${path}. In BOSS TONE STUDIO: LIVESET › import, then drag the patches to U slots.`,
      connect: 'Connect to the GT-1 (USB)',
      connecting: 'Connecting…',
      reading: (done: number, total: number) => `Reading slot names… ${done}/${total}`,
      connected: 'GT-1 connected',
      backups: 'Backups folder',
      slot: 'slot',
      chooseSlot: 'pick a slot',
      listen: 'Play now',
      listenHint: 'Loads it into the temporary patch: the GT-1 plays it at once, nothing is stored.',
      store: (slot: string) => `Write to ${slot}`,
      sending: (pct: number) => `Sending… ${pct}%`,
      playing: (name: string) => `"${name}" is playing on the GT-1 (not stored — changing patch discards it).`,
      confirm: (slot: string, current: string) =>
        `Replace "${current || 'empty'}" in ${slot}? A .tsl backup of it is saved first.`,
      confirmYes: 'Replace',
      cancel: 'Cancel',
      backingUp: 'Saving a backup of the slot…',
      storing: 'Writing and checking…',
      stored: (slot: string, name: string, backup: string) =>
        `"${name}" written to ${slot} and checked byte by byte. Backup of the previous one: ${backup}`,
      skipped: (list: string) => `Did not fit the GT-1 and was left at the default: ${list}`,
      failed: (detail: string) => `That did not work: ${detail}`
    },
    match: {
      title: 'Compare with the record',
      badge: 'stem × your GT-1',
      empty:
        'To measure the difference between your tone and the record, separate this song\'s stems in the Lab with the htdemucs_6s model — it is the one that gives the isolated guitar. Once the stem exists, this area records what comes out of the GT-1 and suggests the GRAPHIC EQ and MASTER EQ.',
      distance: (list: string) => `distance: ${list} dB`,
      steps:
        '1) Pick the part and analyse the record. 2) Connect the GT-1 to the computer — over its own USB (the "GT-1" input, with DIRECT MONITOR ON and EFX OUT at 100%) or from the GT-1 output into the UM2 — and record playing the same part with the same dynamics. 3) Put the suggested GRAPHIC EQ into BOSS TONE STUDIO and record again: the distance should drop.',
      reference: 'reference',
      refGuitar: 'Guitar stem',
      refOther: '"Other" stem',
      range: 'part',
      wholeSong: 'Whole song',
      wholeSongShort: 'whole song',
      section: 'part',
      from: 'from',
      to: 'to',
      end: 'end',
      startAria: 'Start of the part (m:ss)',
      endAria: 'End of the part (m:ss)',
      analyzing: (pct: number) => `Analysing the stem… ${pct}%`,
      analyze: 'Analyse the record',
      analyzeAgain: 'Analyse the record again',
      rangeChanged: 'The part changed since the analysis — analyse again.',
      pitch: 'stem pitch',
      pitchDown: 'Down a semitone',
      pitchUp: 'Up a semitone',
      pitchReset: 'Back to the original pitch',
      pitchHint:
        'For a stem that came out in another key than the one you play in: the analysis and the play-along audio are transposed.',
      semitones: (value: string) => `${value} st`,
      pitchChanged: 'The pitch changed since the analysis — analyse the record again.',
      pitchUnavailable:
        'Could not transpose the play-along audio; it plays at the original pitch (the analysis is still transposed).',
      takes: 'takes',
      take: (n: number) => `Take ${n}`,
      newChart: 'Recording — the new chart shows up when you stop.',
      used: (range: string, seconds: number) => `${range}: ${seconds} s of guitar playing used`,
      input: 'input (GT-1 USB or UM2)',
      systemDefault: 'System default',
      inputN: (n: number) => `Input ${n}`,
      playAlong: 'play along while recording',
      alongReference: 'The reference stem',
      alongMix: 'The original song',
      alongNone: (seconds: number) => `Nothing (records up to ${seconds} s)`,
      stop: (clock: string) => `Stop (${clock})`,
      record: 'Record my tone',
      meter: 'Input level',
      clipping: 'clipping!',
      weakStem: (db: number) =>
        `The guitar stem is very quiet in this part (${db} dBFS on average): the separation probably put the guitar in the "other" stem. Comparing against what is left here would fit the EQ to separation leftovers.`,
      useOther: 'Use the "other" stem',
      openFailed: (status: number) => `could not open the audio (HTTP ${status})`,
      silentStem: 'the stem is silent in this part — pick another',
      noSignal:
        'Not enough sound came in — check the device, the level and that the GT-1 has DIRECT MONITOR/EFX OUT on.',
      clipped:
        'The input clipped at some point: lower the GT-1 OUTPUT LEVEL/EFX OUT or the interface gain and record again.',
      inputFailed: (detail: string) => `Could not open the audio input: ${detail}`,
      refDone: 'Record analysed.',
      yoursDone: 'Your tone recorded.',
      needYours: 'Record your tone to compare.',
      needRef: 'Analyse the record to compare.',
      legendRef: 'record (stem)',
      legendYou: 'you (GT-1)',
      legendPrev: 'you, previous take',
      legendNote: 'level-matched curves; what is left is the frequency balance',
      chartAria: 'Average spectrum of the record and of your tone, by frequency',
      seriesRef: 'record',
      seriesYou: 'you',
      seriesPrev: 'previous',
      missing: 'missing in yours',
      geqTitle: 'GRAPHIC EQ in a free FX',
      geqAria: 'Suggested GRAPHIC EQ gains',
      residual: (after: string, before: string) => `left after the EQ: ${after} dB (was ${before})`,
      boost: 'boost: the record has more',
      cut: 'cut: you have more',
      masterTitle: 'MASTER EQ (no FX slot used) — approximate',
      masterNote: (residual: string) =>
        `The manual does not give the LOW/HIGH shelf corners; the maths assumes ~120 Hz and ~6 kHz. ${residual} dB left.`,
      whereFirst: 'Where to start',
      nothingBig:
        'No region is more than 3 dB off — the balance is already close to the record. From here, compare by ear: gain, attack and ambience.',
      recordHas: (db: number, advice: string) => `the record has ${db} dB more — ${advice}.`,
      youHave: (db: number, advice: string) => `you have ${db} dB more — ${advice}.`,
      regions: {
        low: {
          name: 'Lows (60–150 Hz)',
          more: 'raise PREAMP BASS or OD/DS BOTTOM',
          less: 'lower PREAMP BASS or OD/DS BOTTOM; a closed SP TYPE (4x12") also tightens the low end'
        },
        lowMid: {
          name: 'Low mids (150–500 Hz)',
          more: 'raise BASS/MIDDLE or move to a bigger SP TYPE',
          less: 'lower MIDDLE or BASS; this is the region that gets muddy with distortion'
        },
        mid: {
          name: 'Mids (0.5–1.6 kHz)',
          more: 'raise MIDDLE, or put a mid-focused OD/DS (T-SCREAM, MID BOOST) in front',
          less: 'lower MIDDLE (the record is more "scooped")'
        },
        highMid: {
          name: 'Upper mids (1.6–4.5 kHz)',
          more: 'raise TREBLE, or TONE on the OD/DS',
          less: 'lower TREBLE or TONE on the OD/DS'
        },
        high: {
          name: 'Highs (4.5–10 kHz)',
          more: 'raise PRESENCE or turn BRIGHT on',
          less: 'lower PRESENCE, turn BRIGHT off or use a HIGH CUT on DELAY/REVERB — on a record the miked cabinet cuts this sparkle'
        }
      },
      table: 'Table by frequency',
      frequency: 'frequency',
      caveat:
        'A Demucs stem carries some bleed and the record was mixed and mastered, so take the suggestion as a direction and confirm by ear. This measures frequency balance: gain, compression and ambience you match by comparing the two playing.'
    }
  },
  update: {
    available: (version: string) => `Version ${version} available`,
    download: 'Download',
    downloading: 'Downloading the update',
    ready: (version: string) => `Version ${version} ready to install`,
    restart: 'Restart and update',
    later: 'Later',
    upToDate: 'You are on the latest version',
    check: 'Check for updates'
  },
  errors: {
    songNotFound: 'Song not found',
    titleRequired: 'The song needs a title',
    artistRequired: 'The song needs an artist',
    setlistNameRequired: 'The setlist needs a name',
    fileNotFound: (path: string) => `File not found: ${path}`,
    windowUnavailable: 'No window available',
    noLocalAudio: 'This song has no local audio file imported',
    noLyrics: 'The result had no usable lyrics',
    emptyQueue: 'Nothing queued — import songs and mark your progress.',
    aiNoJson: 'The AI did not return a readable JSON patch — try again.',
    aiNoBlocks: 'The AI answered, but with no usable blocks — try again.',
    labUnreachable: (detail: string) => `Lab unavailable: ${detail}. Open the Lab tab to start it.`,
    labRefused: (detail: string) => `The lab refused the job: ${detail}`,
    spotifyNotConnected: 'Spotify is not connected',
    spotifyNotConfigured: 'The Spotify Client ID is not set — add it in Settings',
    encryptionUnavailable:
      'The operating system offers no encryption, so the key was not stored.'
  }
}
