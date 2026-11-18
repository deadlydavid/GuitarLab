import { plural } from './index'

/**
 * The source of truth for every string in the app.
 *
 * Brazilian Portuguese leads because every string in this codebase started
 * there: moving them here is a pure move, with no translation risk mixed in.
 * `en.ts` and `es.ts` are declared as `Catalog`, so a missing key, a spare key
 * or a function with the wrong arity is a compile error — `npm run typecheck`,
 * which already runs in `npm test`, is the guard that keeps the three in step.
 *
 * Entries are functions when they interpolate, so the compiler checks the
 * arguments too. There is no `t('some.key')` anywhere: a string key would give
 * back exactly the class of runtime bug this shape removes.
 *
 * There is deliberately no `as const`: it would make every literal part of the
 * type, and then en.ts would have to repeat the Portuguese strings verbatim to
 * compile. Widening to `string` is what lets the type check the *shape* while
 * leaving the words free.
 *
 * Keep entries as plain object literals — no computed keys — so a 30-line
 * script could serialise this to JSON for a translation platform later.
 */
export const ptBR = {
  common: {
    save: 'Salvar',
    cancel: 'Cancelar',
    close: 'Fechar',
    delete: 'Excluir',
    edit: 'Editar',
    add: 'Adicionar',
    remove: 'Remover',
    open: 'Abrir',
    back: 'Voltar',
    search: 'Buscar',
    loading: 'Carregando',
    retry: 'Tentar de novo',
    confirm: 'Confirmar',
    none: 'nenhum',
    never: 'nunca',
    now: 'agora',
    yes: 'Sim',
    no: 'Não',
    change: 'alterar',
    test: 'testar',
    show: 'ver',
    hide: 'ocultar',
    empty: '—'
  },

  units: {
    /** Suffixes for a total running time: "1h 12min". */
    hour: 'h',
    minute: 'min',
    bpm: 'BPM',
    seconds: (n: number) => `${n} ${plural(n, 'segundo', 'segundos')}`,
    songs: (n: number) => `${n} ${plural(n, 'música', 'músicas')}`,
    sections: (n: number) => `${n} ${plural(n, 'trecho', 'trechos')}`,
    tracks: (n: number) => `${n} ${plural(n, 'faixa', 'faixas')}`
  },

  nav: {
    setlist: 'Setlist',
    practice: 'Estudar',
    progress: 'Progresso',
    lab: 'Laboratório',
    settings: 'Ajustes',
    tuner: 'Afinador',
    song: 'Música',
    stage: 'Palco'
  },

  /** Labels that used to live in shared/types.ts and shared/sort.ts. */
  labels: {
    status: {
      not_started: 'Não começou',
      learning: 'Aprendendo',
      shaky: 'Inseguro',
      solid: 'Firme',
      gig_ready: 'Pronto pro show'
    },
    instrument: {
      guitar: 'Guitarra',
      bass: 'Baixo',
      drums: 'Bateria',
      vocals: 'Voz'
    },
    /** Most of these are YouTube jargon and stay in English in every language. */
    role: {
      lesson_tabs: 'Lesson w/ Tabs',
      backing_track: 'Backing Track',
      guitar_only: 'Guitar Only',
      bass_only: 'Bass Only',
      drums_only: 'Drums Only',
      official: 'Oficial',
      live: 'Ao vivo',
      cover: 'Cover',
      unknown: 'Sem classificação'
    },
    output: {
      pa: 'PA / mesa de som',
      fones: 'Fones de ouvido',
      amp: 'Amplificador'
    },
    sort: {
      ordem: 'ordem',
      banda: 'banda',
      musica: 'música',
      afinacao: 'afinação',
      duracao: 'duração'
    },
    sortDir: {
      ordem: { asc: 'ordem do show', desc: 'ordem do show' },
      banda: { asc: 'A–Z', desc: 'Z–A' },
      musica: { asc: 'A–Z', desc: 'Z–A' },
      afinacao: {
        asc: 'E Standard no topo, resto A–Z',
        desc: 'E Standard no topo, resto Z–A'
      },
      duracao: { asc: 'menor → maior', desc: 'maior → menor' }
    }
  },

  settings: {
    title: 'Ajustes',
    intro:
      'Cole aqui as suas chaves — elas ficam criptografadas nesta máquina e nunca saem dela. Tudo que estiver desligado apenas desabilita aquele recurso; o app continua funcionando.',
    firstSteps: 'Primeiros passos',
    firstStepsHint:
      'Só o FFmpeg é obrigatório — sem ele a importação de áudio falha. O resto é opcional.',
    todoFfmpeg: 'Instalar o FFmpeg e deixá-lo no PATH',
    todoLlm: 'Configurar um provedor de IA (ou rodar o Ollama local)',
    todoSpotify: 'Adicionar o Client ID do Spotify (opcional)',
    todoYoutube: 'Adicionar a chave do YouTube (opcional)',

    noEncryption: 'Sem criptografia do sistema',
    noEncryptionBody:
      'As chaves de API não podem ser guardadas — preferimos não gravar nada a gravar em texto puro. Você ainda pode usar o arquivo .env, e o resto dos ajustes funciona normalmente.',

    saved: 'Salvo',
    saveFailed: 'Não deu para salvar',
    keyStored: 'chave guardada',
    notConfigured: 'não configurado',
    keepPlaceholder: '•••••••• (deixe vazio para manter)',
    envWarning:
      'Uma variável de ambiente está definindo esse valor e tem prioridade sobre o que você salvar aqui. Remova-a do ambiente para usar este campo.',

    source: {
      env: 'variável de ambiente',
      user: 'salvo por você',
      dotenv: 'do arquivo .env',
      default: 'padrão'
    },

    groupAi: 'Inteligência artificial',
    groupAiSub: 'Planos de treino, análise de técnica e patches de timbre',
    groupSpotify: 'Spotify',
    groupSpotifySub: 'Metadados e controle do player aberto',
    groupYoutube: 'YouTube',
    groupYoutubeSub: 'Busca de aulas, backing tracks e playthroughs',
    groupLab: 'Laboratório de áudio',
    groupLabSub: 'Separação de stems e análise automática',
    groupFfmpeg: 'FFmpeg',

    primaryProvider: 'Provedor principal',
    primaryProviderHint: 'Se ele falhar, o app tenta os da reserva na ordem abaixo.',
    fallback: 'Reserva',
    fallbackHint:
      'Separados por vírgula, tentados nessa ordem. Deixar o Ollama por último cobre o caso de tudo mais estar fora do ar.',

    language: 'Idioma',
    languageAuto: (name: string) => `Automático (${name})`,
    languageHint: 'Automático segue o idioma do sistema operacional.',

    folders: 'Pastas',
    folderGuitarPro: 'Guitar Pro',
    folderAudio: 'Áudio',
    folderStems: 'Stems',
    folderDb: 'Banco de dados',
    folderSaved: 'Pasta salva — reiniciando o GuitarLab…',
    foldersHint:
      'Trocar uma pasta reinicia o GuitarLab — os caminhos são lidos uma vez, na abertura. Chaves, modelos e endereços não reiniciam nada. As músicas já importadas continuam apontando para os arquivos onde estão.',

    connect: 'Conectar',
    disconnect: 'Desconectar',
    disconnected: 'Desconectado',
    connected: 'Spotify conectado',
    connecting: 'Abrindo o Spotify no seu navegador…',
    connectFailed: 'Falha ao conectar',

    ffmpegMissing: 'não encontrado no PATH',
    ffmpegHint:
      'O único requisito externo: lê tags, mede loudness e gera a forma de onda. O app pode baixá-lo para você.',
    spotifyHint:
      'O login abre no seu navegador (PKCE, sem senha no app). Serve para metadados e para comandar o Spotify aberto via Connect.',
    youtubeQuota: (used: number, limit: number) =>
      `Cota de hoje: ${used}/${limit} unidades. Cada busca custa 100, então dá ~100 músicas por dia.`,
    llmHint:
      'O provedor principal é tentado primeiro; se falhar, o app cai para os da reserva, na ordem.',
    labGpu: (gpu: string) => `GPU: ${gpu}`,
    labGpuUnknown: 'não informada',
    labOffline:
      'Instale e ligue na aba Laboratório. Só é necessário para stems e análise automática.',

    fields: {
      spotifyClientId: 'Client ID',
      spotifyClientIdHint:
        'Crie um app em developer.spotify.com/dashboard. É o fluxo PKCE, então não existe client secret.',
      spotifyRedirectUri: 'Redirect URI',
      spotifyRedirectUriHint:
        'Precisa estar registrado igualzinho nas configurações do seu app do Spotify.',
      youtubeApiKey: 'Chave da API',
      youtubeApiKeyHint:
        'console.cloud.google.com → ative a "YouTube Data API v3" → criar credencial. A cota grátis dá ~100 músicas por dia.',
      geminiApiKey: 'Gemini — chave',
      geminiModel: 'Gemini — modelo',
      openaiApiKey: 'OpenAI — chave',
      openaiModel: 'OpenAI — modelo',
      openaiBaseUrl: 'OpenAI — endereço',
      openaiBaseUrlHint: 'Dá para apontar para qualquer serviço compatível com a API da OpenAI.',
      groqApiKey: 'Groq — chave',
      groqModel: 'Groq — modelo',
      ollamaBaseUrl: 'Ollama — endereço',
      ollamaBaseUrlHint:
        'Modelos locais, sem chave e sem nada saindo da sua máquina. Instale em ollama.com.',
      ollamaModel: 'Ollama — modelo',
      labUrl: 'Endereço do laboratório',
      demucsModel: 'Modelo do Demucs',
      demucsModelHint: 'htdemucs_6s separa em 6 faixas; htdemucs faz 4 com qualidade melhor.',
      demucsSegment: 'Segmento',
      demucsSegmentHint: 'Fatia o áudio para caber na memória da GPU. Menor = menos VRAM.',
      ffmpegPath: 'Caminho do FFmpeg',
      ffmpegPathHint:
        'Vazio usa o que estiver no PATH. O ffprobe é derivado desse mesmo caminho.'
    }
  },

  support: {
    title: 'Apoie o projeto',
    body:
      'O GuitarLab é livre e de código aberto, e vai continuar sendo — não existe versão paga. Se ele te ajuda, dá para retribuir.',
    sponsor: 'GitHub Sponsors',
    sponsorHint: 'Sem taxa nenhuma. Precisa de conta no GitHub.',
    kofi: 'Ko-fi',
    kofiHint: 'Não precisa de conta. Cartão ou PayPal, de qualquer país.',
    otherWays: 'Relatar um bug ou traduzir uma tela ajuda do mesmo jeito.'
  },

  setup: {
    ffmpegMissing:
      'O FFmpeg não foi encontrado. Sem ele, importar áudio não funciona — é o único requisito obrigatório do app.',
    howToInstall: 'como instalar',
    openSettings: 'ajustes',
    dismiss: 'dispensar'
  },

  /**
   * Stage mode: the full-screen performance view.
   *
   * Migrated to the catalogue with the screen itself, rather than left in the
   * .tsx — it is the screen a player is most likely to hand to a bandmate who
   * does not read Portuguese.
   */
  stage: {
    emptyTitle: 'Setlist vazio',
    emptyBody: 'Adicione músicas a um setlist para usar o Modo Palco.',
    backToSetlist: 'Voltar ao setlist',
    exit: 'Sair (Esc)',
    exitLabel: 'Sair do modo palco',
    smaller: 'Diminuir a letra (−)',
    bigger: 'Aumentar a letra (+)',
    repertoire: 'Repertório',
    repertoireKey: 'Repertório (L)',
    noChart: 'Sem cifra ou letra cadastrada para esta música.',
    noChartHint: 'Cifra & Letra, na tela da música, é onde ela entra.',
    retunes: 'Trocas de afinação',
    previous: 'anterior',
    next: 'próxima',
    upNext: 'a seguir',
    lastOfSet: 'última do set',
    switchTo: (tuning: string) => `trocar para ${tuning}`,
    scrollPlay: 'Rolar sozinho (A)',
    scrollPause: 'Parar a rolagem (A)',
    scrollSpeed: 'velocidade da rolagem',
    metronome: 'Metrônomo',
    metronomeBpm: (bpm: number) => `Metrônomo · ${bpm} bpm`,
    metronomeHint: 'Clique no andamento desta música (M)',
    metronomeNoBpm: 'Esta música não tem BPM cadastrado',
    help: '←/→ ou pedal troca de música · ↑/↓ e espaço rolam a cifra · A rolagem automática · M metrônomo · +/− tamanho · L repertório · Esc sai'
  },

  setlist: {
    library: 'Biblioteca',
    noSongs: 'Nenhuma música ainda',
    noSongsBody:
      'Aponte para onde estão seus arquivos e importe. Tablaturas .gp e áudios ficam em pastas separadas.',
    import: 'Importar',
    chooseFolders: 'Escolher pastas'
  },

  /**
   * Adding a setlist or a song by hand, with no file to import.
   *
   * What is required here is the least that makes the thing exist and findable
   * later: a name for the setlist, a title and an artist for the song. All the
   * rest is what a file would have carried, and can be filled in when it shows
   * up.
   */
  setlistExtra: {
    lastPractice: "Último treino",
    tuning: "Afinação",
    key: "Tom",
    tempo: "Andamento",
    openSong: "Abrir música",
    practice: "Estudar",
    chordsLyrics: "Cifra & letra",
    lab: "Laboratório",
    queueHint: "Entra no topo da fila de hoje, na tela de Progresso",
    inQueue: "Na fila de estudos",
    addToQueue: "Add à fila de estudos",
    sortBy: "ordenar",
    showOrderHint: "A ordem do show, do jeito que você arrastou",
    tuningChange: "troca de afinação",
    hasTab: "Já tem tablatura — clique para buscar outra versão",
    findTab: "Buscar tablatura Guitar Pro (Ultimate Guitar / CifraClub)",
    hasAudio: "Já tem áudio — clique para baixar outra versão",
    getAudio: "Baixar a faixa em wav/mp3 do archive.org",
    removeFromSetlist: "Tirar do setlist",
    created: "criadas",
    matched: "casadas",
    skipped: "já existiam",
    errors: "erros"
  },

  practicePicker: {
    choose: "Escolha o que estudar",
    noSongs: "Nenhuma música importada",
    noSongsDescription: "Volte ao Setlist e importe as pastas gptabs/ e songs/.",
    goToSetlist: "Ir para o Setlist"
  },

  extra: {
    importing: "Importando…",
    importFolders: "Importar pastas",
    importPlaylist: "Importar playlist",
    practiceToday: "O que treinar hoje",
    audio: "Áudio",
    emptySetlist: "Setlist vazio",
    emptyStart: "Importe suas pastas gptabs/ e songs/ para começar. Os arquivos Guitar Pro trazem afinação, andamento e seções automaticamente.",
    emptyLibrary: "Você tem músicas na biblioteca. Troque para \"Todas\" e adicione ao setlist.",
    importNow: "Importar agora",
    viewAll: "Ver todas as músicas",
    showSongs: "Músicas do show",
    dragToReorder: "arraste para reordenar",
    sortedHint: "ordenado — volte para \"ordem\" para arrastar",
    fromSetlist: "Do setlist",
    all: "Todas",
    close: "fechar"
  },

  practiceExtra: {
    audio: "áudio",
    notFound: "Música não encontrada",
    back: "Voltar",
    noGuitarPro: "Sem arquivo Guitar Pro",
    noGuitarProDesc: "Essa música não tem tablatura importada. Coloque um .gp/.gp3/.gp4/.gp5/.gtp na pasta gptabs/ e importe de novo.",
    noStems: "Sem stems separados",
    hasAudioHint: "Essa música tem áudio local. Abra o Laboratório e rode a separação de stems para gerar guitarra isolada e backing track.",
    needAudioHint: "Importe o arquivo de áudio dessa música em songs/ para poder separar os stems.",
    openLab: "Abrir Laboratório",
    studyVideos: "Vídeos de estudo",
    studyVideosHint: "Busque as três versões (Lesson w/ Tabs, Backing Track, Guitar Only) na tela da música.",
    openSong: "Abrir a música",
    sections: "Trechos",
    all: "tudo",
    bars: "compassos",
    tracks: "Trilhas",
    noInstrument: "sem instrumento",
    showHideTrack: "clique para mostrar/ocultar na partitura",
    mute: "Silenciar",
    trackTip: "Clique no nome para mostrar a trilha na partitura. M silencia e S deixa em solo no áudio — silencie a guitarra e toque por cima: é o seu backing track direto da tablatura.",
    tips: "Dicas para esta música",
    refreshTips: "Consulta a IA de novo e substitui as dicas salvas",
    searchAgain: "Buscar de novo",
    tipsDesc: "Uma explicação parte por parte: o que cada trecho exige, a dificuldade de 1 a 5 estrelas e um exercício com BPM para cada um. Fica salvo depois da primeira busca.",
    gettingTips: "Consultando…",
    getTips: "Buscar dicas",
    play: "Tocar",
    pause: "Pausar",
    metronome: "Metrônomo"
  },

  manual: {
    newSetlist: 'Novo setlist',
    renameSetlist: 'Editar o setlist',
    setlistRenamed: (name: string) => `Setlist renomeado para "${name}"`,
    newSong: 'Nova música',
    addSong: 'Adicionar música',
    required: 'obrigatório',
    create: 'Criar',
    createAndOpen: 'Criar e abrir',
    moreFields: 'mais campos',
    fewerFields: 'menos campos',

    setlistHint: 'Só o nome é obrigatório. Data, local e anotações você preenche quando souber.',
    setlistName: 'Nome do setlist',
    setlistNamePlaceholder: 'ex.: Show do Sesc',
    band: 'Banda',
    bandPlaceholder: 'ex.: Cover Metallica',
    eventDate: 'Data do show',
    venue: 'Local',
    venuePlaceholder: 'ex.: Sesc Pompeia',
    setlistCreated: (name: string) => `Setlist "${name}" criado e ativo`,

    songHint:
      'Só título e artista são obrigatórios — o resto o app preenche sozinho quando você importar a tablatura ou o áudio.',
    songTitle: 'Título',
    songTitlePlaceholder: 'ex.: Master of Puppets',
    artist: 'Artista',
    artistPlaceholder: 'ex.: Metallica',
    album: 'Álbum',
    year: 'Ano',
    genre: 'Gênero',
    duration: 'Duração',
    durationInvalid: 'Não entendi a duração — escreva como no player, tipo 4:32.',
    key: 'Tom',
    bpm: 'BPM',
    timeSignature: 'Compasso',
    tuning: 'Afinação',
    noTuning: '— nenhuma —',
    capo: 'Capotraste',
    notes: 'Anotações',
    addTo: 'Já colocar no setlist',
    onlyLibrary: '— só na biblioteca —',
    songCreated: (title: string) => `"${title}" entrou na biblioteca`,
    songCreatedIn: (title: string, setlist: string) => `"${title}" entrou em ${setlist}`,
    duplicate: (title: string, artist: string) =>
      `Já existe "${title}", de ${artist}, na sua biblioteca.`,
    duplicateOpen: 'Abrir a que já existe',
    duplicateAnyway: 'Criar assim mesmo'
  },

  /** Errors raised in the main process that reach the interface. */
  /*
   * O laboratório de áudio.
   *
   * Esta tela ficou de fora do catálogo por muito tempo, com o texto fixo em
   * português dentro do componente. Ela entrou aqui quando deixou de exigir
   * Docker: passou a ser a primeira coisa que alguém que não é desenvolvedor
   * encara, e uma instalação de 2,7 GB explicada num idioma que a pessoa não lê
   * é uma instalação que não acontece.
   */
  lab: {
    title: 'Laboratório de Áudio',
    subtitle: 'Separação de stems e análise, rodando na sua máquina',
    on: 'Laboratório ativo',
    off: 'Laboratório desligado',
    jobs: {
      stems: 'Separar stems',
      rhythm: 'BPM e grade de batidas',
      harmony: 'Tom e acordes',
      transcribe: 'Áudio → MIDI',
      lyrics: 'Transcrever letra'
    },
    jobDesc: {
      stems: 'O Demucs separa em vocal, bateria, baixo, guitarra, piano e outros. Gera seu guitar-only e o backing track.',
      rhythm: 'Detecta andamento, batidas e compassos para travar o loop A/B na grade.',
      harmony: 'Detecta a tonalidade e a progressão de acordes ao longo do tempo.',
      transcribe: 'O basic-pitch converte o áudio em MIDI — um rascunho de tablatura.',
      lyrics: 'O faster-whisper transcreve a letra com marcação de tempo.'
    },
    run: 'Rodar',
    rerun: 'Rodar de novo',
    sent: (job: string) => `${job} enviado para o laboratório`,
    sendFailed: 'Falha ao enviar o job',
    jobStatus: {
      queued: 'na fila',
      running: 'rodando',
      done: 'concluído',
      error: 'erro',
      canceled: 'cancelado'
    },
    stemsMade: (count: number) => `Stems gerados (${count})`,
    openFolder: 'abrir pasta',
    history: 'Histórico de jobs',
    chooseSong: 'música',
    chooseSongPlaceholder: '— escolha uma música —',
    noSongs: 'Nenhuma música com áudio local',
    noSongsDesc:
      'O laboratório precisa do arquivo de áudio. Coloque mp3/wav/flac na pasta de músicas e importe.',
    songNoAudio: 'Essa música ainda não tem áudio local',
    songNoAudioDesc:
      'O laboratório escuta a gravação. Baixe a faixa pelo botão WAV no setlist, ou coloque o arquivo na pasta de áudio e importe.',
    goToSetlist: 'Ir para o Setlist',
    demucsModel: {
      six: '6 stems (inclui guitarra)',
      four: '4 stems (melhor qualidade)',
      fourFt: '4 stems fine-tuned (mais lento)'
    },
    setup: {
      title: 'Instalar o laboratório',
      intro:
        'O laboratório roda os modelos pesados na sua máquina. Ele não vem no instalador para não deixá-lo enorme — escolha abaixo e o app baixa e configura tudo sozinho.',
      gpuFound: (name: string, driver: string) => `${name} · driver ${driver}`,
      gpuNone: 'Nenhuma placa NVIDIA encontrada — o pacote de CPU é o certo aqui',
      recommended: 'recomendado',
      packCpu: 'Processador (CPU)',
      packCpuDesc:
        'Funciona em qualquer máquina. Separar uma música leva alguns minutos em vez de alguns segundos.',
      packCuda: 'Placa NVIDIA (CUDA)',
      packCudaDesc:
        'Bem mais rápido. Precisa só do driver da NVIDIA — nada de CUDA Toolkit nem Docker.',
      install: (size: string) => `Instalar · ${size}`,
      installing: 'Instalando',
      cancel: 'Cancelar instalação',
      canceled: 'Instalação cancelada',
      timeWarning:
        'Pode levar de alguns minutos a meia hora, conforme a sua internet. Dá para fechar esta aba — o download continua.',
      phase: {
        uv: 'preparando o instalador',
        python: 'baixando o Python',
        venv: 'criando o ambiente',
        torch: 'baixando o PyTorch',
        demucs: 'instalando o Demucs',
        base: 'instalando o resto',
        done: 'pronto',
        error: 'falhou'
      },
      ready: 'Laboratório instalado',
      packInUse: (pack: string) => `pacote ${pack}`,
      start: 'Ligar',
      stop: 'Desligar',
      starting: 'Ligando',
      remove: 'Remover o laboratório',
      removeConfirm:
        'Isso apaga o ambiente Python do laboratório. Os modelos baixados ficam. Continuar?',
      removeModels: 'Apagar os modelos',
      removeModelsConfirm: 'Isso apaga os modelos baixados. Eles serão baixados de novo quando precisar. Continuar?',
      stale: 'Esta instalação é de uma versão anterior',
      staleDesc: 'Reinstale para acompanhar as versões que esta versão do app espera.',
      diskRuntime: 'ambiente',
      diskModels: 'modelos',
      models: 'Modelos',
      modelsDesc:
        'Baixados na primeira vez que você usa cada um. Antecipe aqui para não esperar no meio de um job.',
      download: 'Baixar',
      downloading: 'Baixando',
      downloaded: 'baixado',
      folders: 'Pastas'
    }
  },
  tools: {
    ffmpeg: {
      title: 'FFmpeg',
      missing: 'O FFmpeg não foi encontrado',
      missingDesc:
        'O app usa o FFmpeg para ler, converter e medir o volume dos áudios. Sem ele, importar música não funciona.',
      install: 'Baixar e instalar',
      installing: 'Baixando o FFmpeg',
      extracting: 'Instalando',
      installed: (path: string) => `Instalado pelo app em ${path}`,
      remove: 'Remover',
      onPath: 'Encontrado no sistema'
    }
  },
  tone: {
    rigNoteGt1:
      'Com a GT-1, a sugestão usa só o que o manual dela permite — cada bloco, tipo e faixa de valor é conferido — e aproveita CTL1, o pedal EXP e os ASSIGN para tocar a música inteira sem trocar de patch.',
    pitchGt1: (semitones: string) =>
      `Na GT-1 o pitch shifter é um tipo de FX: FX1 = PITCH SHIFTER, PITCH ${semitones}, FINE 0, PRE DELAY 0 ms, FEEDBACK 0, E.LEVEL 100, D.LEVEL 0, e o FX1 em primeiro na cadeia. Sobra o FX2 para o efeito da música.`,
    chainOn: (label: string) => `${label}: ligado`,
    chainStandby: (label: string) => `${label}: desligado na patch, um controle liga`,
    chainOff: (label: string) => `${label}: desligado`,
    blockStandby: 'desligado na patch (um controle liga)',
    controlsTitle: 'Pedais e botões',
    when: (when: string) => `quando: ${when}`,
    assignTitle: 'ASSIGN — um pisão mexe em vários parâmetros',
    assignPurpose: 'para quê',
    wishes: 'O que você quer nesta música (opcional)',
    wishesPlaceholder: 'ex.: harmonia uma terça abaixo no solo melódico, wah no solo, um patch só',
    wishesHint: 'Vai para a IA como regra e fica salvo com o patch.',
    cuesTitle: 'Roteiro ao vivo',
    research: {
      title: 'Como o disco foi gravado',
      sources: (n: number) => `${n} ${plural(n, 'fonte', 'fontes')} da web`,
      noSources: 'sem fontes: memória do modelo',
      again: 'Pesquisar de novo',
      search: 'Pesquisar na web',
      empty:
        'A IA procura entrevistas, rig rundowns e créditos de produção para saber quais guitarras, amps, gabinetes, pedais e microfones foram usados nesta gravação. É isso que o patch tenta reproduzir; ao sugerir o patch a pesquisa é feita sozinha, se ainda não existir.',
      ready: (n: number) => `Pesquisa pronta, com ${n} ${plural(n, 'fonte', 'fontes')}`,
      ungrounded: 'Nenhum provedor com busca respondeu: o texto é da memória do modelo'
    },
    setup: {
      title: 'Antes de montar na GT-1 (uma vez só)',
      outputAmp:
        'o tipo do seu amp (COMBO AMP, STACK AMP ou JC-120; *RETURN se entrar no retorno). Nesse modo o SP TYPE do PREAMP não atua.',
      outputLine: 'LINE/PHONES — é o que liga a simulação de caixa (SP TYPE) para PA e fones.',
      pref: 'CTL 1, EXP 1 e EXP SW em PATCH. Em SYSTEM a GT-1 ignora os ajustes desses pedais na patch e os ASSIGN que usam eles.',
      hold: 'ON, se quiser que o volume/wah continue onde o pedal está ao trocar entre patches com a mesma função.',
      editor:
        'monte a patch a partir de uma patch limpa (INIT) e grave num slot U01–U99; a ordem da cadeia se arrasta na tela do editor.',
      matchWhere: 'Para comparar o timbre',
      match:
        'MENU › USB: DIRECT MONITOR ON e EFX OUT 100%, e escolha a entrada "GT-1" abaixo — ou saída da GT-1 na UM2 com o ganho da UM2 baixo o bastante para não clipar.'
    },
    gt1: {
      title: 'Levar para a GT-1',
      intro:
        'Grave a patch direto na pedaleira pelo USB, ou exporte um .tsl para importar no BOSS TONE STUDIO. Antes de substituir um slot, o app salva um backup .tsl do que estava lá.',
      export: 'Exportar .tsl',
      exported: (path: string) => `Liveset salvo em ${path}. No BOSS TONE STUDIO: LIVESET › importar, e arraste as patches para os slots U.`,
      connect: 'Conectar à GT-1 (USB)',
      connecting: 'Conectando…',
      reading: (done: number, total: number) => `Lendo os nomes dos slots… ${done}/${total}`,
      connected: 'GT-1 conectada',
      backups: 'Pasta de backups',
      slot: 'slot',
      chooseSlot: 'escolha o slot',
      listen: 'Ouvir agora',
      listenHint: 'Carrega na temporária: a GT-1 toca na hora, sem gravar nada.',
      store: (slot: string) => `Gravar em ${slot}`,
      sending: (pct: number) => `Enviando… ${pct}%`,
      playing: (name: string) => `"${name}" tocando na GT-1 (não gravada — trocar de patch descarta).`,
      confirm: (slot: string, current: string) =>
        `Substituir "${current || 'vazio'}" em ${slot}? Um backup .tsl dele é salvo antes.`,
      confirmYes: 'Substituir',
      cancel: 'Cancelar',
      backingUp: 'Salvando backup do slot…',
      storing: 'Gravando e conferindo…',
      stored: (slot: string, name: string, backup: string) =>
        `"${name}" gravada em ${slot} e conferida byte a byte. Backup do anterior: ${backup}`,
      skipped: (list: string) => `Não coube na GT-1 e ficou no padrão: ${list}`,
      failed: (detail: string) => `Não deu certo: ${detail}`
    },
    match: {
      title: 'Comparar com o original',
      badge: 'stem × sua GT-1',
      empty:
        'Para medir a diferença entre o seu timbre e o do disco, separe os stems desta música no Laboratório com o modelo htdemucs_6s — é ele que entrega a guitarra isolada. Com o stem pronto, esta área grava o que sai da GT-1 e sugere o GRAPHIC EQ e a MASTER EQ.',
      distance: (list: string) => `distância: ${list} dB`,
      steps:
        '1) Escolha o trecho e analise o original. 2) Ligue a GT-1 no PC — pelo USB dela (entrada "GT-1" com DIRECT MONITOR ON e EFX OUT em 100%) ou pela saída da GT-1 na entrada da UM2 — e grave tocando a mesma parte, com a mesma dinâmica. 3) Passe o GRAPHIC EQ sugerido para o BOSS TONE STUDIO e grave de novo: a distância tem que cair.',
      reference: 'referência',
      refGuitar: 'Stem da guitarra',
      refOther: 'Stem "other"',
      range: 'trecho',
      wholeSong: 'Música inteira',
      wholeSongShort: 'música inteira',
      section: 'trecho',
      from: 'de',
      to: 'até',
      end: 'fim',
      startAria: 'Início do trecho (m:ss)',
      endAria: 'Fim do trecho (m:ss)',
      analyzing: (pct: number) => `Analisando o stem… ${pct}%`,
      analyze: 'Analisar o original',
      analyzeAgain: 'Analisar o original de novo',
      rangeChanged: 'O trecho mudou desde a análise — analise de novo.',
      pitch: 'tom do stem',
      pitchDown: 'Descer meio tom',
      pitchUp: 'Subir meio tom',
      pitchReset: 'Voltar ao tom original',
      pitchHint:
        'Para quando o stem veio num tom diferente do que você toca: a análise e o áudio que toca junto saem transpostos.',
      semitones: (value: string) => `${value} semi`,
      pitchChanged: 'O tom mudou desde a análise — analise o original de novo.',
      pitchUnavailable:
        'Não deu para transpor o áudio que toca junto; ele sai no tom original (a análise continua transposta).',
      takes: 'gravações',
      take: (n: number) => `Gravação ${n}`,
      newChart: 'Gravando — o gráfico novo aparece quando você parar.',
      used: (range: string, seconds: number) => `${range}: ${seconds} s de guitarra tocando aproveitados`,
      input: 'entrada (GT-1 USB ou UM2)',
      systemDefault: 'Padrão do sistema',
      inputN: (n: number) => `Entrada ${n}`,
      playAlong: 'tocar junto enquanto grava',
      alongReference: 'O stem de referência',
      alongMix: 'A música original',
      alongNone: (seconds: number) => `Nada (grava até ${seconds} s)`,
      stop: (clock: string) => `Parar (${clock})`,
      record: 'Gravar meu timbre',
      meter: 'Nível da entrada',
      clipping: 'clipando!',
      weakStem: (db: number) =>
        `O stem da guitarra está muito baixo nesse trecho (${db} dBFS de média): a separação provavelmente pôs a guitarra no stem "other". Comparar com o que sobrou aqui ajustaria o EQ a restos de separação.`,
      useOther: 'Usar o stem "other"',
      openFailed: (status: number) => `não consegui abrir o áudio (HTTP ${status})`,
      silentStem: 'o stem está em silêncio nesse trecho — escolha outro',
      noSignal:
        'Não chegou som suficiente pela entrada — confira o dispositivo, o volume e se a GT-1 está com DIRECT MONITOR/EFX OUT ligados.',
      clipped:
        'A entrada saturou (clipou) em algum momento: baixe o OUTPUT LEVEL/EFX OUT da GT-1 ou o ganho da interface e grave de novo.',
      inputFailed: (detail: string) => `Não consegui abrir a entrada de áudio: ${detail}`,
      refDone: 'Original analisado.',
      yoursDone: 'Seu timbre gravado.',
      needYours: 'Falta gravar o seu timbre para comparar.',
      needRef: 'Falta analisar o original para comparar.',
      legendRef: 'original (stem)',
      legendYou: 'você (GT-1)',
      legendPrev: 'você, gravação anterior',
      legendNote: 'curvas com o volume igualado; o que sobra é o equilíbrio de frequências',
      chartAria: 'Espectro médio do original e do seu timbre, por frequência',
      seriesRef: 'original',
      seriesYou: 'você',
      seriesPrev: 'anterior',
      missing: 'falta em você',
      geqTitle: 'GRAPHIC EQ num FX livre',
      geqAria: 'Ganhos sugeridos para o GRAPHIC EQ',
      residual: (after: string, before: string) => `sobra depois do EQ: ${after} dB (era ${before})`,
      boost: 'subir: o disco tem mais',
      cut: 'cortar: você tem mais',
      masterTitle: 'MASTER EQ (sem gastar FX) — aproximado',
      masterNote: (residual: string) =>
        `O manual não diz onde ficam os cantos dos shelves LOW/HIGH; a conta supõe ~120 Hz e ~6 kHz. Sobra ${residual} dB.`,
      whereFirst: 'Onde mexer primeiro',
      nothingBig:
        'Nenhuma região passa de 3 dB de diferença — o equilíbrio já está perto do disco. Daqui em diante, compare de ouvido: ganho, ataque e ambiência.',
      recordHas: (db: number, advice: string) => `o disco tem ${db} dB a mais — ${advice}.`,
      youHave: (db: number, advice: string) => `você tem ${db} dB a mais — ${advice}.`,
      regions: {
        low: {
          name: 'Graves (60–150 Hz)',
          more: 'suba BASS no PREAMP ou BOTTOM no OD/DS',
          less: 'baixe BASS no PREAMP ou BOTTOM no OD/DS; um SP TYPE fechado (4x12") também segura o grave'
        },
        lowMid: {
          name: 'Médio-graves (150–500 Hz)',
          more: 'suba BASS/MIDDLE ou troque para um SP TYPE maior',
          less: 'baixe MIDDLE ou BASS; é a região que embola em distorção'
        },
        mid: {
          name: 'Médios (0,5–1,6 kHz)',
          more: 'suba MIDDLE, ou um OD/DS de médio (T-SCREAM, MID BOOST) na frente',
          less: 'baixe MIDDLE (o disco é mais "scooped")'
        },
        highMid: {
          name: 'Médio-agudos (1,6–4,5 kHz)',
          more: 'suba TREBLE, ou TONE no OD/DS',
          less: 'baixe TREBLE ou TONE no OD/DS'
        },
        high: {
          name: 'Agudos (4,5–10 kHz)',
          more: 'suba PRESENCE ou ligue BRIGHT',
          less: 'baixe PRESENCE, desligue BRIGHT ou use um HIGH CUT no DELAY/REVERB — num disco a caixa microfonada corta esse brilho'
        }
      },
      table: 'Tabela por frequência',
      frequency: 'frequência',
      caveat:
        'O stem do Demucs traz um pouco de vazamento e o disco foi mixado e masterizado, então use a sugestão como direção e confirme de ouvido. A medida é do equilíbrio de frequências: ganho, compressão e ambiência você ajusta comparando os dois tocando.'
    }
  },
  update: {
    available: (version: string) => `Versão ${version} disponível`,
    download: 'Baixar',
    downloading: 'Baixando a atualização',
    ready: (version: string) => `Versão ${version} pronta para instalar`,
    restart: 'Reiniciar e atualizar',
    later: 'Depois',
    upToDate: 'Você está na versão mais recente',
    check: 'Procurar atualizações'
  },
  errors: {
    songNotFound: 'Música não encontrada',
    titleRequired: 'A música precisa de um título',
    artistRequired: 'A música precisa de um artista',
    setlistNameRequired: 'O setlist precisa de um nome',
    fileNotFound: (path: string) => `Arquivo não encontrado: ${path}`,
    windowUnavailable: 'Janela indisponível',
    noLocalAudio: 'Essa música não tem arquivo de áudio local importado',
    noLyrics: 'Resultado sem letra utilizável',
    emptyQueue: 'Nada na fila — importe músicas e marque o progresso.',
    aiNoJson: 'A IA não devolveu um patch em JSON legível — tente de novo.',
    aiNoBlocks: 'A IA respondeu, mas sem nenhum bloco utilizável — tente de novo.',
    labUnreachable: (detail: string) =>
      `Laboratório indisponível: ${detail}. Abra a aba Laboratório para ligá-lo.`,
    labRefused: (detail: string) => `Laboratório recusou o job: ${detail}`,
    spotifyNotConnected: 'Spotify não conectado',
    spotifyNotConfigured: 'O Client ID do Spotify não está configurado — coloque em Ajustes',
    encryptionUnavailable:
      'O sistema não oferece criptografia, então a chave não foi guardada.'
  }
}
