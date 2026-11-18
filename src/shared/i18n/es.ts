import { plural } from './index'
import type { Catalog } from './catalog'

/**
 * Spanish strings.
 *
 * Declared `: Catalog`, so anything missing, spare, or with the wrong argument
 * list is a compile error. Do not restructure this file — change `pt-BR.ts`,
 * the source of truth, and let the compiler point out what needs updating here.
 */
export const es: Catalog = {
  common: {
    save: 'Guardar',
    cancel: 'Cancelar',
    close: 'Cerrar',
    delete: 'Eliminar',
    edit: 'Editar',
    add: 'Añadir',
    remove: 'Quitar',
    open: 'Abrir',
    back: 'Volver',
    search: 'Buscar',
    loading: 'Cargando',
    retry: 'Reintentar',
    confirm: 'Confirmar',
    none: 'ninguno',
    never: 'nunca',
    now: 'ahora',
    yes: 'Sí',
    no: 'No',
    change: 'cambiar',
    test: 'probar',
    show: 'ver',
    hide: 'ocultar',
    empty: '—'
  },

  units: {
    hour: 'h',
    minute: 'min',
    bpm: 'BPM',
    seconds: (n: number) => `${n} ${plural(n, 'segundo', 'segundos')}`,
    songs: (n: number) => `${n} ${plural(n, 'canción', 'canciones')}`,
    sections: (n: number) => `${n} ${plural(n, 'sección', 'secciones')}`,
    tracks: (n: number) => `${n} ${plural(n, 'pista', 'pistas')}`
  },

  nav: {
    setlist: 'Setlist',
    practice: 'Estudiar',
    progress: 'Progreso',
    lab: 'Laboratorio',
    settings: 'Ajustes',
    tuner: 'Afinador',
    song: 'Canción',
    stage: 'Escenario'
  },

  labels: {
    status: {
      not_started: 'Sin empezar',
      learning: 'Aprendiendo',
      shaky: 'Insegura',
      solid: 'Sólida',
      gig_ready: 'Lista para el bolo'
    },
    instrument: {
      guitar: 'Guitarra',
      bass: 'Bajo',
      drums: 'Batería',
      vocals: 'Voz'
    },
    role: {
      lesson_tabs: 'Lesson w/ Tabs',
      backing_track: 'Backing Track',
      guitar_only: 'Guitar Only',
      bass_only: 'Bass Only',
      drums_only: 'Drums Only',
      official: 'Oficial',
      live: 'En directo',
      cover: 'Cover',
      unknown: 'Sin clasificar'
    },
    output: {
      pa: 'PA / mesa de mezclas',
      fones: 'Auriculares',
      amp: 'Amplificador'
    },
    sort: {
      ordem: 'orden',
      banda: 'banda',
      musica: 'canción',
      afinacao: 'afinación',
      duracao: 'duración'
    },
    sortDir: {
      ordem: { asc: 'orden del bolo', desc: 'orden del bolo' },
      banda: { asc: 'A–Z', desc: 'Z–A' },
      musica: { asc: 'A–Z', desc: 'Z–A' },
      afinacao: {
        asc: 'Mi estándar arriba, resto A–Z',
        desc: 'Mi estándar arriba, resto Z–A'
      },
      duracao: { asc: 'más corta → más larga', desc: 'más larga → más corta' }
    }
  },

  settings: {
    title: 'Ajustes',
    intro:
      'Pega aquí tus claves — se cifran en esta máquina y nunca salen de ella. Todo lo que esté apagado solo desactiva su propia función; la aplicación sigue funcionando.',
    firstSteps: 'Primeros pasos',
    firstStepsHint:
      'Solo FFmpeg es obligatorio — sin él, importar audio falla. Lo demás es opcional.',
    todoFfmpeg: 'Instalar FFmpeg y dejarlo en el PATH',
    todoLlm: 'Configurar un proveedor de IA (o ejecutar Ollama en local)',
    todoSpotify: 'Añadir el Client ID de Spotify (opcional)',
    todoYoutube: 'Añadir la clave de YouTube (opcional)',

    noEncryption: 'Sin cifrado del sistema',
    noEncryptionBody:
      'Las claves de API no se pueden guardar — preferimos no guardar nada antes que guardarlas en texto plano. Puedes seguir usando el archivo .env, y el resto de los ajustes funciona con normalidad.',

    saved: 'Guardado',
    saveFailed: 'No se pudo guardar',
    keyStored: 'clave guardada',
    notConfigured: 'sin configurar',
    keepPlaceholder: '•••••••• (déjalo vacío para mantenerla)',
    envWarning:
      'Una variable de entorno está fijando este valor y tiene prioridad sobre lo que guardes aquí. Quítala del entorno para usar este campo.',

    source: {
      env: 'variable de entorno',
      user: 'guardado por ti',
      dotenv: 'del archivo .env',
      default: 'por defecto'
    },

    groupAi: 'Inteligencia artificial',
    groupAiSub: 'Planes de estudio, análisis de técnica y patches de sonido',
    groupSpotify: 'Spotify',
    groupSpotifySub: 'Metadatos y control del reproductor abierto',
    groupYoutube: 'YouTube',
    groupYoutubeSub: 'Búsqueda de lecciones, backing tracks y playthroughs',
    groupLab: 'Laboratorio de audio',
    groupLabSub: 'Separación de pistas y análisis automático',
    groupFfmpeg: 'FFmpeg',

    primaryProvider: 'Proveedor principal',
    primaryProviderHint: 'Si falla, la aplicación prueba los de reserva, en orden.',
    fallback: 'Reserva',
    fallbackHint:
      'Separados por comas, probados en ese orden. Dejar Ollama al final cubre el caso de que todo lo demás esté caído.',

    language: 'Idioma',
    languageAuto: (name: string) => `Automático (${name})`,
    languageHint: 'Automático sigue el idioma del sistema operativo.',

    folders: 'Carpetas',
    folderGuitarPro: 'Guitar Pro',
    folderAudio: 'Audio',
    folderStems: 'Pistas',
    folderDb: 'Base de datos',
    folderSaved: 'Carpeta guardada — reiniciando GuitarLab…',
    foldersHint:
      'Cambiar una carpeta reinicia GuitarLab — las rutas se leen una vez, al arrancar. Las claves, los modelos y las direcciones no reinician nada. Las canciones ya importadas siguen apuntando a los archivos donde están.',

    connect: 'Conectar',
    disconnect: 'Desconectar',
    disconnected: 'Desconectado',
    connected: 'Spotify conectado',
    connecting: 'Abriendo Spotify en tu navegador…',
    connectFailed: 'No se pudo conectar',

    ffmpegMissing: 'no encontrado en el PATH',
    ffmpegHint:
      'El único requisito externo: lee etiquetas, mide loudness y dibuja la forma de onda. La app puede descargarlo por ti.',
    spotifyHint:
      'El inicio de sesión se abre en tu navegador (PKCE, sin contraseña en la aplicación). Sirve para metadatos y para controlar el Spotify ya abierto vía Connect.',
    youtubeQuota: (used: number, limit: number) =>
      `Cuota de hoy: ${used}/${limit} unidades. Cada búsqueda cuesta 100, así que salen unas 100 canciones al día.`,
    llmHint:
      'Se prueba primero el proveedor principal; si falla, la aplicación pasa a los de reserva, en orden.',
    labGpu: (gpu: string) => `GPU: ${gpu}`,
    labGpuUnknown: 'no informada',
    labOffline:
      'Instálalo y enciéndelo en la pestaña Laboratorio. Solo hace falta para las pistas y el análisis automático.',

    fields: {
      spotifyClientId: 'Client ID',
      spotifyClientIdHint:
        'Crea una aplicación en developer.spotify.com/dashboard. Es el flujo PKCE, así que no hay client secret.',
      spotifyRedirectUri: 'Redirect URI',
      spotifyRedirectUriHint:
        'Tiene que estar registrada exactamente así en los ajustes de tu aplicación de Spotify.',
      youtubeApiKey: 'Clave de API',
      youtubeApiKeyHint:
        'console.cloud.google.com → activa "YouTube Data API v3" → crear credencial. La cuota gratuita da para unas 100 canciones al día.',
      geminiApiKey: 'Gemini — clave',
      geminiModel: 'Gemini — modelo',
      openaiApiKey: 'OpenAI — clave',
      openaiModel: 'OpenAI — modelo',
      openaiBaseUrl: 'OpenAI — dirección',
      openaiBaseUrlHint: 'Puedes apuntarlo a cualquier servicio compatible con la API de OpenAI.',
      groqApiKey: 'Groq — clave',
      groqModel: 'Groq — modelo',
      ollamaBaseUrl: 'Ollama — dirección',
      ollamaBaseUrlHint:
        'Modelos locales, sin clave y sin que nada salga de tu máquina. Instálalo desde ollama.com.',
      ollamaModel: 'Ollama — modelo',
      labUrl: 'Dirección del laboratorio',
      demucsModel: 'Modelo de Demucs',
      demucsModelHint: 'htdemucs_6s separa en 6 pistas; htdemucs hace 4 con mejor calidad.',
      demucsSegment: 'Segmento',
      demucsSegmentHint: 'Trocea el audio para que quepa en la memoria de la GPU. Menor = menos VRAM.',
      ffmpegPath: 'Ruta de FFmpeg',
      ffmpegPathHint: 'Vacío usa lo que haya en el PATH. ffprobe se deriva de esa misma ruta.'
    }
  },

  support: {
    title: 'Apoyar el proyecto',
    body:
      'GuitarLab es libre y de código abierto, y va a seguir siéndolo — no hay versión de pago. Si te sirve, puedes devolver algo.',
    sponsor: 'GitHub Sponsors',
    sponsorHint: 'Sin comisiones. Necesita una cuenta de GitHub.',
    kofi: 'Ko-fi',
    kofiHint: 'No hace falta cuenta. Tarjeta o PayPal, desde cualquier país.',
    otherWays: 'Informar de un error o traducir una pantalla ayuda igual.'
  },

  setup: {
    ffmpegMissing:
      'No se encontró FFmpeg. Sin él, importar audio no funciona — es el único requisito obligatorio de la aplicación.',
    howToInstall: 'cómo instalarlo',
    openSettings: 'ajustes',
    dismiss: 'descartar'
  },

  stage: {
    emptyTitle: 'Setlist vacío',
    emptyBody: 'Agrega canciones a un setlist para usar el Modo Escenario.',
    backToSetlist: 'Volver al setlist',
    exit: 'Salir (Esc)',
    exitLabel: 'Salir del modo escenario',
    smaller: 'Reducir la letra (−)',
    bigger: 'Aumentar la letra (+)',
    repertoire: 'Repertorio',
    repertoireKey: 'Repertorio (L)',
    noChart: 'Sin cifrado ni letra guardados para esta canción.',
    noChartHint: 'Cifrado y Letra, en la pantalla de la canción, es donde van.',
    retunes: 'Cambios de afinación',
    previous: 'anterior',
    next: 'siguiente',
    upNext: 'a continuación',
    lastOfSet: 'última del set',
    switchTo: (tuning: string) => `cambiar a ${tuning}`,
    scrollPlay: 'Desplazar solo (A)',
    scrollPause: 'Detener el desplazamiento (A)',
    scrollSpeed: 'velocidad del desplazamiento',
    metronome: 'Metrónomo',
    metronomeBpm: (bpm: number) => `Metrónomo · ${bpm} bpm`,
    metronomeHint: 'Clic al tempo de esta canción (M)',
    metronomeNoBpm: 'Esta canción no tiene BPM guardado',
    help: '←/→ o el pedal cambia de canción · ↑/↓ y espacio desplazan el cifrado · A desplazamiento automático · M metrónomo · +/− tamaño · L repertorio · Esc sale'
  },

  setlist: {
    library: 'Biblioteca',
    noSongs: 'Todavía no hay canciones',
    noSongsBody:
      'Apunta la aplicación a tus archivos e importa. Las tablaturas .gp y el audio van en carpetas separadas.',
    import: 'Importar',
    chooseFolders: 'Elegir carpetas'
  },

  setlistExtra: {
    lastPractice: "Última práctica",
    tuning: "Afinación",
    key: "Tonalidad",
    tempo: "Tempo",
    openSong: "Abrir canción",
    practice: "Practicar",
    chordsLyrics: "Acordes y letra",
    lab: "Laboratorio de audio",
    queueHint: "Añadir al principio de la cola de práctica de hoy en Progreso",
    inQueue: "En la cola de práctica",
    addToQueue: "Añadir a la cola de práctica",
    sortBy: "Ordenar por",
    showOrderHint: "El orden del concierto que organizaste arrastrando",
    tuningChange: "Cambio de afinación",
    hasTab: "Ya tiene tablatura — pulsa para buscar otra versión",
    findTab: "Buscar partituras Guitar Pro (Ultimate Guitar / CifraClub)",,
    hasAudio: "Ya tiene audio — pulsa para descargar otra versión",
    getAudio: "Descargar la pista en WAV/MP3 desde archive.org",
    removeFromSetlist: "Quitar del setlist",
    created: "creadas",
    matched: "vinculadas",
    skipped: "ya existentes",
    errors: "errores"
  },

  practicePicker: {
    choose: "Elige qué practicar",
    noSongs: "No hay canciones importadas",
    noSongsDescription: "Vuelve a Setlist e importa las carpetas gptabs/ y songs/.",
    goToSetlist: "Ir a Setlist"
  },

  extra: {
    importing: "Importando archivos…",
    importFolders: "Importar carpetas",
    importPlaylist: "Cargar lista de reproducción",
    practiceToday: "Qué practicar hoy",
    audio: "Audio",
    emptySetlist: "Setlist vacío",
    emptyStart: "Importa las carpetas gptabs/ y songs/ para empezar. Los archivos Guitar Pro incluyen afinación, tempo y secciones automáticamente.",
    emptyLibrary: "Ya tienes canciones en la biblioteca. Cambia a «Todas» y añádelas al setlist.",
    importNow: "Importar ahora",
    viewAll: "Ver todas las canciones",
    showSongs: "Canciones del concierto",
    dragToReorder: "Arrastra para reordenar",
    sortedHint: "Ordenado — vuelve a «orden» para arrastrar",
    fromSetlist: "Del setlist",
    all: "Todas las canciones",
    close: "Cerrar"
  },

  practiceExtra: {
    audio: "audio",
    notFound: "Canción no encontrada",
    back: "Volver",
    noGuitarPro: "Sin archivo Guitar Pro",
    noGuitarProDesc: "Esta canción no tiene tablatura importada. Coloca un archivo .gp/.gp3/.gp4/.gp5/.gtp en gptabs/ e importa de nuevo.",
    noStems: "No hay pistas separadas",
    hasAudioHint: "Esta canción tiene audio local. Abre el laboratorio de audio y separa las pistas para obtener guitarra aislada y acompañamiento.",
    needAudioHint: "Importa el archivo de audio de esta canción en songs/ antes de separar las pistas.",
    openLab: "Abrir laboratorio",
    studyVideos: "Vídeos de práctica",
    studyVideosHint: "Busca las tres versiones (Lesson w/ Tabs, Backing Track, Guitar Only) en la pantalla de la canción.",
    openSong: "Abrir canción",
    sections: "Secciones",
    all: "todo",
    bars: "compases",
    tracks: "Pistas",
    noInstrument: "sin instrumento",
    showHideTrack: "haz clic para mostrar/ocultar en la partitura",
    mute: "Silenciar pista",
    trackTip: "Haz clic en una pista para mostrarla en la partitura. M la silencia y S la deja sola en el audio: silencia la guitarra y toca con la pista de acompañamiento.",
    tips: "Consejos para esta canción",
    refreshTips: "Volver a consultar a la IA y reemplazar los consejos guardados",
    searchAgain: "Buscar de nuevo",
    tipsDesc: "Un análisis sección por sección de lo que exige, dificultad (1–5 estrellas) y un ejercicio con BPM para cada sección. Se guarda tras la primera búsqueda.",
    gettingTips: "Preguntando a la IA…",
    getTips: "Pedir consejos",
    play: "Reproducir",
    pause: "Poner en pausa",
    metronome: "Metrónomo"
  },

  manual: {
    newSetlist: 'Nuevo setlist',
    renameSetlist: 'Editar el setlist',
    setlistRenamed: (name: string) => `Setlist renombrado a "${name}"`,
    newSong: 'Nueva canción',
    addSong: 'Agregar canción',
    required: 'obligatorio',
    create: 'Crear',
    createAndOpen: 'Crear y abrir',
    moreFields: 'más campos',
    fewerFields: 'menos campos',

    setlistHint:
      'Sólo el nombre es obligatorio. La fecha, el lugar y las notas se completan cuando los sepas.',
    setlistName: 'Nombre del setlist',
    setlistNamePlaceholder: 'ej.: Show en el Sesc',
    band: 'Banda',
    bandPlaceholder: 'ej.: Covers de Metallica',
    eventDate: 'Fecha del show',
    venue: 'Lugar',
    venuePlaceholder: 'ej.: Sesc Pompeia',
    setlistCreated: (name: string) => `Setlist "${name}" creado y activo`,

    songHint:
      'Sólo el título y el artista son obligatorios — el resto lo completa la aplicación cuando importes la tablatura o el audio.',
    songTitle: 'Título',
    songTitlePlaceholder: 'ej.: Master of Puppets',
    artist: 'Artista',
    artistPlaceholder: 'ej.: Metallica',
    album: 'Álbum',
    year: 'Año',
    genre: 'Género',
    duration: 'Duración',
    durationInvalid:
      'No entendí la duración — escríbela como la muestra un reproductor, por ejemplo 4:32.',
    key: 'Tono',
    bpm: 'BPM',
    timeSignature: 'Compás',
    tuning: 'Afinación',
    noTuning: '— ninguna —',
    capo: 'Cejilla',
    notes: 'Notas',
    addTo: 'Ponerla ya en el setlist',
    onlyLibrary: '— sólo en la biblioteca —',
    songCreated: (title: string) => `"${title}" está en la biblioteca`,
    songCreatedIn: (title: string, setlist: string) => `"${title}" entró en ${setlist}`,
    duplicate: (title: string, artist: string) =>
      `"${title}", de ${artist}, ya está en tu biblioteca.`,
    duplicateOpen: 'Abrir la que ya tienes',
    duplicateAnyway: 'Crearla igual'
  },

  lab: {
    title: 'Laboratorio de Audio',
    subtitle: 'Separación de pistas y análisis, en tu propia máquina',
    on: 'Laboratorio activo',
    off: 'Laboratorio apagado',
    jobs: {
      stems: 'Separar pistas',
      rhythm: 'BPM y rejilla de pulsos',
      harmony: 'Tonalidad y acordes',
      transcribe: 'Audio → MIDI',
      lyrics: 'Transcribir la letra'
    },
    jobDesc: {
      stems: 'Demucs separa en voz, batería, bajo, guitarra, piano y otros. Te da el guitar-only y la base.',
      rhythm: 'Detecta tempo, pulsos y compases para fijar el bucle A/B a la rejilla.',
      harmony: 'Detecta la tonalidad y la progresión de acordes a lo largo del tiempo.',
      transcribe: 'basic-pitch convierte el audio en MIDI — un borrador de tablatura.',
      lyrics: 'faster-whisper transcribe la letra con marcas de tiempo.'
    },
    run: 'Ejecutar',
    rerun: 'Ejecutar de nuevo',
    sent: (job: string) => `${job} enviado al laboratorio`,
    sendFailed: 'No se pudo enviar el trabajo',
    jobStatus: {
      queued: 'en cola',
      running: 'ejecutando',
      done: 'terminado',
      error: 'error',
      canceled: 'cancelado'
    },
    stemsMade: (count: number) => `Pistas generadas (${count})`,
    openFolder: 'abrir carpeta',
    history: 'Historial de trabajos',
    chooseSong: 'canción',
    chooseSongPlaceholder: '— elige una canción —',
    noSongs: 'Ninguna canción tiene audio local',
    noSongsDesc:
      'El laboratorio necesita el archivo de audio. Pon mp3/wav/flac en tu carpeta de canciones e impórtalos.',
    songNoAudio: 'Esta canción todavía no tiene audio local',
    songNoAudioDesc:
      'El laboratorio escucha la grabación. Descarga la pista con el botón WAV del setlist, o pon el archivo en tu carpeta de audio e impórtalo.',
    goToSetlist: 'Ir al setlist',
    demucsModel: {
      six: '6 pistas (incluye guitarra)',
      four: '4 pistas (mejor calidad)',
      fourFt: '4 pistas fine-tuned (más lento)'
    },
    setup: {
      title: 'Instalar el laboratorio',
      intro:
        'El laboratorio ejecuta los modelos pesados en tu máquina. No viene en el instalador, para que siga siendo pequeño — elige abajo y la app lo descarga y lo configura sola.',
      gpuFound: (name: string, driver: string) => `${name} · driver ${driver}`,
      gpuNone: 'No se encontró ninguna tarjeta NVIDIA — aquí el paquete de CPU es el correcto',
      recommended: 'recomendado',
      packCpu: 'Procesador (CPU)',
      packCpuDesc:
        'Funciona en cualquier máquina. Separar una canción tarda minutos en vez de segundos.',
      packCuda: 'Tarjeta NVIDIA (CUDA)',
      packCudaDesc:
        'Mucho más rápido. Solo necesita el driver de NVIDIA — sin CUDA Toolkit ni Docker.',
      install: (size: string) => `Instalar · ${size}`,
      installing: 'Instalando',
      cancel: 'Cancelar la instalación',
      canceled: 'Instalación cancelada',
      timeWarning:
        'Puede tardar de unos minutos a media hora, según tu conexión. Puedes salir de esta pestaña — la descarga sigue.',
      phase: {
        uv: 'preparando el instalador',
        python: 'descargando Python',
        venv: 'creando el entorno',
        torch: 'descargando PyTorch',
        demucs: 'instalando Demucs',
        base: 'instalando el resto',
        done: 'listo',
        error: 'falló'
      },
      ready: 'Laboratorio instalado',
      packInUse: (pack: string) => `paquete ${pack}`,
      start: 'Encender',
      stop: 'Apagar',
      starting: 'Encendiendo',
      remove: 'Quitar el laboratorio',
      removeConfirm:
        'Esto borra el entorno de Python del laboratorio. Los modelos descargados se conservan. ¿Continuar?',
      removeModels: 'Borrar los modelos',
      removeModelsConfirm:
        'Esto borra los modelos descargados. Se volverán a descargar cuando hagan falta. ¿Continuar?',
      stale: 'Esta instalación es de una versión anterior',
      staleDesc: 'Reinstala para igualar las versiones que espera esta versión de la app.',
      diskRuntime: 'entorno',
      diskModels: 'modelos',
      models: 'Modelos',
      modelsDesc:
        'Se descargan la primera vez que usas cada uno. Adelántalos aquí para no esperar a mitad de un trabajo.',
      download: 'Descargar',
      downloading: 'Descargando',
      downloaded: 'descargado',
      folders: 'Carpetas'
    }
  },
  tools: {
    ffmpeg: {
      title: 'FFmpeg',
      missing: 'No se encontró FFmpeg',
      missingDesc:
        'La app usa FFmpeg para leer, convertir y medir el volumen del audio. Sin él, importar música no funciona.',
      install: 'Descargar e instalar',
      installing: 'Descargando FFmpeg',
      extracting: 'Instalando',
      installed: (path: string) => `Instalado por la app en ${path}`,
      remove: 'Quitar',
      onPath: 'Encontrado en el sistema'
    }
  },
  tone: {
    rigNoteGt1:
      'Con la GT-1, la sugerencia usa solo lo que su manual permite — se comprueba cada bloque, tipo y rango de valores — y aprovecha CTL1, el pedal EXP y los ASSIGN para tocar la canción entera sin cambiar de patch.',
    pitchGt1: (semitones: string) =>
      `En la GT-1 el pitch shifter es un tipo de FX: FX1 = PITCH SHIFTER, PITCH ${semitones}, FINE 0, PRE DELAY 0 ms, FEEDBACK 0, E.LEVEL 100, D.LEVEL 0, y el FX1 primero en la cadena. Queda el FX2 para el efecto de la canción.`,
    chainOn: (label: string) => `${label}: encendido`,
    chainStandby: (label: string) => `${label}: apagado en el patch, un control lo enciende`,
    chainOff: (label: string) => `${label}: apagado`,
    blockStandby: 'apagado en el patch (un control lo enciende)',
    controlsTitle: 'Pedales y botones',
    when: (when: string) => `cuándo: ${when}`,
    assignTitle: 'ASSIGN — un pisotón mueve varios parámetros',
    assignPurpose: 'para qué',
    wishes: 'Lo que quieres en esta canción (opcional)',
    wishesPlaceholder: 'ej.: armonía una tercera abajo en el solo melódico, wah en el solo, un solo patch',
    wishesHint: 'Va a la IA como regla y queda guardado con el patch.',
    cuesTitle: 'Guion en vivo',
    research: {
      title: 'Cómo se grabó el disco',
      sources: (n: number) => `${n} ${plural(n, 'fuente', 'fuentes')} de la web`,
      noSources: 'sin fuentes: memoria del modelo',
      again: 'Buscar de nuevo',
      search: 'Buscar en la web',
      empty:
        'La IA busca entrevistas, rig rundowns y créditos de producción para saber qué guitarras, amplis, gabinetes, pedales y micrófonos se usaron en esta grabación. Eso es lo que el patch intenta reproducir; al sugerir el patch la búsqueda se hace sola si todavía no existe.',
      ready: (n: number) => `Búsqueda lista, con ${n} ${plural(n, 'fuente', 'fuentes')}`,
      ungrounded: 'Ningún proveedor con búsqueda respondió: el texto es de la memoria del modelo'
    },
    setup: {
      title: 'Antes de armarlo en la GT-1 (una sola vez)',
      outputAmp:
        'el tipo de tu ampli (COMBO AMP, STACK AMP o JC-120; *RETURN si entras por el retorno). En este modo el SP TYPE del PREAMP no actúa.',
      outputLine: 'LINE/PHONES — es lo que activa la simulación de caja (SP TYPE) para PA y auriculares.',
      pref: 'CTL 1, EXP 1 y EXP SW en PATCH. En SYSTEM la GT-1 ignora los ajustes de esos pedales en el patch y los ASSIGN que los usan.',
      hold: 'ON, si quieres que el volumen/wah siga donde está el pedal al cambiar entre patches con la misma función.',
      editor:
        'arma el patch a partir de uno limpio (INIT) y guárdalo en un slot U01–U99; el orden de la cadena se arrastra en la pantalla del editor.',
      matchWhere: 'Para comparar el tono',
      match:
        'MENU › USB: DIRECT MONITOR ON y EFX OUT 100%, y elige la entrada "GT-1" abajo — o la salida de la GT-1 en la UM2 con la ganancia de la UM2 lo bastante baja para no saturar.'
    },
    gt1: {
      title: 'Llevar a la GT-1',
      intro:
        'Graba el patch directo en la pedalera por USB, o exporta un .tsl para importarlo en el BOSS TONE STUDIO. Antes de reemplazar un slot, la app guarda una copia .tsl de lo que había.',
      export: 'Exportar .tsl',
      exported: (path: string) => `Liveset guardado en ${path}. En el BOSS TONE STUDIO: LIVESET › importar, y arrastra los patches a los slots U.`,
      connect: 'Conectar a la GT-1 (USB)',
      connecting: 'Conectando…',
      reading: (done: number, total: number) => `Leyendo los nombres de los slots… ${done}/${total}`,
      connected: 'GT-1 conectada',
      backups: 'Carpeta de copias',
      slot: 'slot',
      chooseSlot: 'elige el slot',
      listen: 'Escuchar ahora',
      listenHint: 'Lo carga en el patch temporal: la GT-1 suena al instante, sin grabar nada.',
      store: (slot: string) => `Grabar en ${slot}`,
      sending: (pct: number) => `Enviando… ${pct}%`,
      playing: (name: string) => `"${name}" sonando en la GT-1 (no grabado — cambiar de patch lo descarta).`,
      confirm: (slot: string, current: string) =>
        `¿Reemplazar "${current || 'vacío'}" en ${slot}? Antes se guarda una copia .tsl.`,
      confirmYes: 'Reemplazar',
      cancel: 'Cancelar',
      backingUp: 'Guardando copia del slot…',
      storing: 'Grabando y comprobando…',
      stored: (slot: string, name: string, backup: string) =>
        `"${name}" grabado en ${slot} y comprobado byte a byte. Copia del anterior: ${backup}`,
      skipped: (list: string) => `No cupo en la GT-1 y quedó en el valor por defecto: ${list}`,
      failed: (detail: string) => `No funcionó: ${detail}`
    },
    match: {
      title: 'Comparar con el original',
      badge: 'stem × tu GT-1',
      empty:
        'Para medir la diferencia entre tu tono y el del disco, separa los stems de esta canción en el Laboratorio con el modelo htdemucs_6s — es el que entrega la guitarra aislada. Con el stem listo, esta área graba lo que sale de la GT-1 y sugiere el GRAPHIC EQ y la MASTER EQ.',
      distance: (list: string) => `distancia: ${list} dB`,
      steps:
        '1) Elige la parte y analiza el original. 2) Conecta la GT-1 al PC — por su USB (entrada "GT-1" con DIRECT MONITOR ON y EFX OUT en 100%) o de la salida de la GT-1 a la entrada de la UM2 — y graba tocando la misma parte, con la misma dinámica. 3) Pasa el GRAPHIC EQ sugerido al BOSS TONE STUDIO y graba de nuevo: la distancia tiene que bajar.',
      reference: 'referencia',
      refGuitar: 'Stem de la guitarra',
      refOther: 'Stem "other"',
      range: 'parte',
      wholeSong: 'Canción entera',
      wholeSongShort: 'canción entera',
      section: 'parte',
      from: 'desde',
      to: 'hasta',
      end: 'fin',
      startAria: 'Inicio de la parte (m:ss)',
      endAria: 'Fin de la parte (m:ss)',
      analyzing: (pct: number) => `Analizando el stem… ${pct}%`,
      analyze: 'Analizar el original',
      analyzeAgain: 'Analizar el original de nuevo',
      rangeChanged: 'La parte cambió desde el análisis — analiza de nuevo.',
      pitch: 'tono del stem',
      pitchDown: 'Bajar un semitono',
      pitchUp: 'Subir un semitono',
      pitchReset: 'Volver al tono original',
      pitchHint:
        'Para cuando el stem vino en otro tono del que tocas: el análisis y el audio que suena mientras grabas salen transpuestos.',
      semitones: (value: string) => `${value} st`,
      pitchChanged: 'El tono cambió desde el análisis — analiza el original de nuevo.',
      pitchUnavailable:
        'No se pudo transponer el audio que suena mientras grabas; sale en el tono original (el análisis sigue transpuesto).',
      takes: 'tomas',
      take: (n: number) => `Toma ${n}`,
      newChart: 'Grabando — el gráfico nuevo aparece cuando pares.',
      used: (range: string, seconds: number) => `${range}: ${seconds} s de guitarra sonando aprovechados`,
      input: 'entrada (GT-1 USB o UM2)',
      systemDefault: 'Predeterminado del sistema',
      inputN: (n: number) => `Entrada ${n}`,
      playAlong: 'tocar encima mientras graba',
      alongReference: 'El stem de referencia',
      alongMix: 'La canción original',
      alongNone: (seconds: number) => `Nada (graba hasta ${seconds} s)`,
      stop: (clock: string) => `Parar (${clock})`,
      record: 'Grabar mi tono',
      meter: 'Nivel de entrada',
      clipping: '¡saturando!',
      weakStem: (db: number) =>
        `El stem de la guitarra está muy bajo en esta parte (${db} dBFS de media): la separación probablemente puso la guitarra en el stem "other". Comparar con lo que quedó aquí ajustaría el EQ a restos de separación.`,
      useOther: 'Usar el stem "other"',
      openFailed: (status: number) => `no pude abrir el audio (HTTP ${status})`,
      silentStem: 'el stem está en silencio en esta parte — elige otra',
      noSignal:
        'No llegó suficiente sonido por la entrada — revisa el dispositivo, el volumen y que la GT-1 tenga DIRECT MONITOR/EFX OUT activados.',
      clipped:
        'La entrada saturó en algún momento: baja el OUTPUT LEVEL/EFX OUT de la GT-1 o la ganancia de la interfaz y graba de nuevo.',
      inputFailed: (detail: string) => `No pude abrir la entrada de audio: ${detail}`,
      refDone: 'Original analizado.',
      yoursDone: 'Tu tono grabado.',
      needYours: 'Falta grabar tu tono para comparar.',
      needRef: 'Falta analizar el original para comparar.',
      legendRef: 'original (stem)',
      legendYou: 'tú (GT-1)',
      legendPrev: 'tú, toma anterior',
      legendNote: 'curvas con el volumen igualado; lo que queda es el equilibrio de frecuencias',
      chartAria: 'Espectro medio del original y de tu tono, por frecuencia',
      seriesRef: 'original',
      seriesYou: 'tú',
      seriesPrev: 'toma anterior',
      missing: 'te falta',
      geqTitle: 'GRAPHIC EQ en un FX libre',
      geqAria: 'Ganancias sugeridas para el GRAPHIC EQ',
      residual: (after: string, before: string) => `queda tras el EQ: ${after} dB (era ${before})`,
      boost: 'subir: el disco tiene más',
      cut: 'cortar: tú tienes más',
      masterTitle: 'MASTER EQ (sin gastar FX) — aproximado',
      masterNote: (residual: string) =>
        `El manual no dice dónde están las esquinas de los shelves LOW/HIGH; la cuenta supone ~120 Hz y ~6 kHz. Quedan ${residual} dB.`,
      whereFirst: 'Dónde tocar primero',
      nothingBig:
        'Ninguna región pasa de 3 dB de diferencia — el equilibrio ya está cerca del disco. De aquí en adelante, compara de oído: ganancia, ataque y ambiente.',
      recordHas: (db: number, advice: string) => `el disco tiene ${db} dB más — ${advice}.`,
      youHave: (db: number, advice: string) => `tú tienes ${db} dB más — ${advice}.`,
      regions: {
        low: {
          name: 'Graves (60–150 Hz)',
          more: 'sube BASS en el PREAMP o BOTTOM en el OD/DS',
          less: 'baja BASS en el PREAMP o BOTTOM en el OD/DS; un SP TYPE cerrado (4x12") también controla el grave'
        },
        lowMid: {
          name: 'Medios-graves (150–500 Hz)',
          more: 'sube BASS/MIDDLE o cambia a un SP TYPE más grande',
          less: 'baja MIDDLE o BASS; es la región que se embarra con distorsión'
        },
        mid: {
          name: 'Medios (0,5–1,6 kHz)',
          more: 'sube MIDDLE, o pon un OD/DS de medios (T-SCREAM, MID BOOST) delante',
          less: 'baja MIDDLE (el disco es más "scooped")'
        },
        highMid: {
          name: 'Medios-agudos (1,6–4,5 kHz)',
          more: 'sube TREBLE, o TONE en el OD/DS',
          less: 'baja TREBLE o TONE en el OD/DS'
        },
        high: {
          name: 'Agudos (4,5–10 kHz)',
          more: 'sube PRESENCE o activa BRIGHT',
          less: 'baja PRESENCE, apaga BRIGHT o usa un HIGH CUT en DELAY/REVERB — en un disco la caja microfoneada corta ese brillo'
        }
      },
      table: 'Tabla por frecuencia',
      frequency: 'frecuencia',
      caveat:
        'El stem de Demucs trae algo de filtración y el disco fue mezclado y masterizado, así que usa la sugerencia como dirección y confirma de oído. Esto mide el equilibrio de frecuencias: ganancia, compresión y ambiente los ajustas comparando los dos sonando.'
    }
  },
  update: {
    available: (version: string) => `Versión ${version} disponible`,
    download: 'Descargar',
    downloading: 'Descargando la actualización',
    ready: (version: string) => `Versión ${version} lista para instalar`,
    restart: 'Reiniciar y actualizar',
    later: 'Más tarde',
    upToDate: 'Estás en la versión más reciente',
    check: 'Buscar actualizaciones'
  },
  errors: {
    songNotFound: 'Canción no encontrada',
    titleRequired: 'La canción necesita un título',
    artistRequired: 'La canción necesita un artista',
    setlistNameRequired: 'El setlist necesita un nombre',
    fileNotFound: (path: string) => `Archivo no encontrado: ${path}`,
    windowUnavailable: 'No hay ventana disponible',
    noLocalAudio: 'Esta canción no tiene ningún archivo de audio local importado',
    noLyrics: 'El resultado no traía letra utilizable',
    emptyQueue: 'Nada en la cola — importa canciones y marca tu progreso.',
    aiNoJson: 'La IA no devolvió un patch en JSON legible — inténtalo de nuevo.',
    aiNoBlocks: 'La IA respondió, pero sin ningún bloque utilizable — inténtalo de nuevo.',
    labUnreachable: (detail: string) =>
      `Laboratorio no disponible: ${detail}. Abre la pestaña Laboratorio para encenderlo.`,
    labRefused: (detail: string) => `El laboratorio rechazó el trabajo: ${detail}`,
    spotifyNotConnected: 'Spotify no está conectado',
    spotifyNotConfigured: 'El Client ID de Spotify no está configurado — añádelo en Ajustes',
    encryptionUnavailable:
      'El sistema operativo no ofrece cifrado, así que la clave no se guardó.'
  }
}
