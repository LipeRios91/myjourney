// Sincronização em nuvem (Firebase Auth + Firestore) — OPCIONAL, desligada
// por padrão. Continua sem "backend próprio" (ver CLAUDE.md): usa o Firebase
// do próprio usuário (projeto gratuito criado por ele no Firebase Console),
// autenticação via Google, e o SDK só é baixado quando a sincronização está
// configurada/em uso — quem não usa essa feature não paga o custo dela.
//
// Limitações conscientes desta v1:
// - Não é tempo real: escreve na nuvem a cada mudança local (push) e só lê
//   da nuvem no boot do app (pull). Editar em dois aparelhos abertos ao
//   mesmo tempo não converge na hora — só no próximo carregamento.
//
// DECISÃO DE SINCRONIZAÇÃO (reescrita depois de uma perda de dados real):
// a v1 decidia push-vs-pull pela flag local `mestre-sync-first-done`. Isso
// tinha um defeito fatal: a flag mora no MESMO localStorage que some quando
// o usuário limpa os dados do navegador. Resultado real: o aparelho zerado
// perdeu a flag, se considerou "primeiro aparelho" de novo, empurrou o
// estado VAZIO por cima da nuvem boa, e o outro aparelho então baixou esse
// vazio — perda total nos dois. Ou seja: perder o dado local promovia o
// aparelho a fonte da verdade.
//
// Agora a decisão olha o DADO em si (PdmBackup.dataWeight), não uma flag
// que some, e nunca deixa "nada" sobrescrever "alguma coisa":
//   1. os dois vazios            -> não faz nada
//   2. local vazio, nuvem cheia  -> PULL (restaura este aparelho)
//   3. local cheio, nuvem vazia  -> PUSH (restaura a nuvem)
//   4. nuvem com bem menos que o local -> CONFLITO, pergunta ao usuário
//   5. os dois com dado parecido -> PULL (nuvem manda, como antes)
//   6. aparelho que nunca sincronizou, com dado dos dois lados -> CONFLITO
// Enquanto um conflito está pendente, `ready` fica false de propósito: sem
// isso, qualquer escrita local durante a indecisão iria pra nuvem e
// sobrescreveria o lado que o usuário talvez quisesse manter.
(function () {
  const CONFIG_KEY = 'mestre-sync-config';
  const FIRST_DONE_KEY = 'mestre-sync-first-done';
  const CONFIG_FIELDS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  const SDK_VERSION = '10.13.0';

  // Toda chave que já passa por window.storage.get/set (progresso de verdade).
  // Preferências de dispositivo (tema, client id do Google Agenda, e a config
  // de sync abaixo) ficam de fora de propósito — não fazem sentido em nuvem.
  const SYNCED_KEYS = [
    'mestre-habits',
    'mestre-missions',
    'mestre-goals',
    'mestre-goal-categories',
    'mestre-gamification',
    'mestre-skills',
    'mestre-profile-photo',
    'mestre-monthly-photos',
    'mestre-diet-entries',
    'mestre-diet-goals',
    'mestre-onboarding',
  ];

  // Chaves grandes demais pra manter histórico de versões na nuvem (fotos em
  // base64 chegam perto do limite de 1 MiB por documento do Firestore) — elas
  // são sincronizadas normalmente, só não ganham cópia de versão anterior.
  const NO_HISTORY_KEYS = ['mestre-profile-photo', 'mestre-monthly-photos'];

  let app = null;
  let db = null;
  let currentUser = null;
  let ready = false; // true depois que init() resolve (configurado e SDK carregado)
  let sdkLoadPromise = null;

  // Último peso conhecido de cada chave na nuvem, preenchido no boot e
  // atualizado a cada push — deixa o guard de escrita destrutiva ser síncrono
  // e barato, sem precisar ler a nuvem antes de cada gravação.
  let cloudWeightCache = {};
  // Conflito aguardando decisão do usuário (ver decideAndApply()).
  let pendingConflict = null;
  // Janela em que escritas destrutivas são permitidas de propósito ("Zerar
  // todo o progresso", importar backup) — fora dela, apagar tudo localmente
  // NÃO apaga a nuvem.
  let destructiveUntil = 0;
  // Última escrita bloqueada pelo guard, pra UI poder avisar em vez de
  // falhar em silêncio.
  let lastBlocked = null;

  function weightOf(key, value) {
    return window.PdmBackup ? window.PdmBackup.dataWeight(key, value) : (value ? 1 : 0);
  }
  function localWeight() {
    return window.PdmBackup ? window.PdmBackup.weightOfLocal() : 0;
  }

  function isCompleteConfig(cfg) {
    return !!cfg && CONFIG_FIELDS.every((f) => String(cfg[f] || '').trim());
  }

  // Config embutida no app (js/sync-defaults.js) — existe pra que limpar os
  // dados do navegador NÃO deixe o app sem saber onde está a nuvem. Ver o
  // comentário longo naquele arquivo.
  function getDefaultConfig() {
    const d = window.PdmSyncDefaults;
    return isCompleteConfig(d) ? d : null;
  }
  function hasDefaultConfig() { return !!getDefaultConfig(); }

  // O que o usuário salvou neste aparelho tem prioridade sobre a embutida
  // (permite apontar pro projeto Firebase dele), mas a embutida é o que
  // garante que sempre exista um caminho de volta pros dados.
  function getConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        const cfg = JSON.parse(raw);
        if (isCompleteConfig(cfg)) return cfg;
      }
    } catch (e) { /* cai pro padrão */ }
    return getDefaultConfig();
  }
  // Só o que foi digitado neste aparelho — usado pela tela de config, que
  // não deve mostrar a embutida como se o usuário a tivesse preenchido.
  function getStoredConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return null;
      const cfg = JSON.parse(raw);
      return isCompleteConfig(cfg) ? cfg : null;
    } catch (e) { return null; }
  }

  function setConfig(cfg) {
    const clean = {};
    CONFIG_FIELDS.forEach((f) => { clean[f] = String((cfg && cfg[f]) || '').trim(); });
    localStorage.setItem(CONFIG_KEY, JSON.stringify(clean));
  }

  function clearConfig() {
    localStorage.removeItem(CONFIG_KEY);
  }

  function isConfigured() { return !!getConfig(); }
  function isSignedIn() { return !!currentUser; }
  function getUserEmail() { return currentUser ? currentUser.email : null; }
  function isFirstDoneOnDevice() { return localStorage.getItem(FIRST_DONE_KEY) === '1'; }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('sync-sdk-load-failed: ' + src));
      document.head.appendChild(s);
    });
  }

  function loadFirebaseSdk() {
    if (window.firebase && window.firebase.firestore) return Promise.resolve();
    if (sdkLoadPromise) return sdkLoadPromise;
    const base = 'https://www.gstatic.com/firebasejs/' + SDK_VERSION + '/';
    sdkLoadPromise = loadScript(base + 'firebase-app-compat.js')
      .then(() => loadScript(base + 'firebase-auth-compat.js'))
      .then(() => loadScript(base + 'firebase-firestore-compat.js'));
    return sdkLoadPromise;
  }

  function ensureApp() {
    if (app) return app;
    const cfg = getConfig();
    if (!cfg) throw new Error('sync-not-configured');
    app = firebase.initializeApp(cfg);
    db = firebase.firestore();
    return app;
  }

  function userDocRef(uid, key) {
    return db.collection('users').doc(uid).collection('data').doc(key);
  }

  function historyDocRef(uid, key) {
    return db.collection('users').doc(uid).collection('history')
      .doc(key + '__' + new Date().toISOString().replace(/[:.]/g, '-'));
  }

  // Lê a nuvem inteira SEM tocar no localStorage — a decisão de aplicar ou
  // não vem depois (ver decideAndApply). Separar leitura de aplicação é o que
  // permite detectar conflito antes de destruir qualquer lado.
  async function readCloudSnapshot() {
    const map = {};
    if (!currentUser) return { map, weight: 0 };
    const snaps = await Promise.all(
      SYNCED_KEYS.map((key) => userDocRef(currentUser.uid, key).get().catch(() => null))
    );
    snaps.forEach((snap, i) => {
      if (snap && snap.exists) {
        const data = snap.data();
        if (data && typeof data.value === 'string') map[SYNCED_KEYS[i]] = data.value;
      }
    });
    const weight = window.PdmBackup ? window.PdmBackup.weightOfMap(map) : Object.keys(map).length;
    return { map, weight };
  }

  function refreshCloudWeightCache(map) {
    cloudWeightCache = {};
    SYNCED_KEYS.forEach((key) => { cloudWeightCache[key] = weightOf(key, map ? map[key] : null); });
  }

  function applyCloudSnapshot(map) {
    SYNCED_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(map, key)) localStorage.setItem(key, map[key]);
    });
    refreshCloudWeightCache(map);
  }

  async function pushAll() {
    if (!currentUser) return;
    const batch = db.batch();
    let any = false;
    SYNCED_KEYS.forEach((key) => {
      const value = localStorage.getItem(key);
      if (value !== null) {
        batch.set(userDocRef(currentUser.uid, key), { value, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        cloudWeightCache[key] = weightOf(key, value);
        any = true;
      }
    });
    if (any) await batch.commit();
  }

  // Guarda a versão que está na nuvem AGORA antes de sobrescrevê-la por uma
  // menor — é o que permite recuperar depois de uma exclusão acidental.
  async function snapshotToHistory(key) {
    if (NO_HISTORY_KEYS.indexOf(key) !== -1) return;
    try {
      const snap = await userDocRef(currentUser.uid, key).get();
      if (!snap.exists) return;
      const data = snap.data();
      if (!data || typeof data.value !== 'string') return;
      await historyDocRef(currentUser.uid, key).set({
        key, value: data.value,
        savedAt: firebase.firestore.FieldValue.serverTimestamp(),
        reason: 'overwrite-menor',
      });
    } catch (e) { /* histórico é best-effort, nunca bloqueia a escrita real */ }
  }

  // Permite, por uma janela curta, que uma escrita que esvazia/encolhe dado
  // chegue na nuvem. Usado só por ações explicitamente destrutivas do
  // usuário ("Zerar todo o progresso", importar backup por cima).
  //
  // A janela é curta e deve ser FECHADA (endDestructive) assim que a ação
  // termina: enquanto ela está aberta a nuvem fica sem proteção, então
  // deixá-la aberta "por garantia" anula o guard inteiro.
  function allowDestructive(ms) {
    destructiveUntil = Date.now() + (ms || 10000);
  }
  function endDestructive() { destructiveUntil = 0; }
  function destructiveAllowed() { return Date.now() < destructiveUntil; }

  // Chamado pelo window.storage.set() depois de toda escrita local — best
  // effort, silencioso (mesma filosofia de js/reminders.js): se falhar (sem
  // rede, sem sync configurado, etc.) o app continua funcionando 100% local.
  //
  // O guard aqui é a segunda linha de defesa contra a perda que já
  // aconteceu: se o app, por qualquer motivo, passar a achar que não tem
  // dado nenhum, essa escrita NÃO apaga o que está na nuvem.
  function pushKey(key, value) {
    if (!ready || !currentUser || !db) return;
    if (SYNCED_KEYS.indexOf(key) === -1) return;

    const newW = weightOf(key, value);
    const oldW = cloudWeightCache[key];

    if (!destructiveAllowed() && typeof oldW === 'number' && oldW > 0) {
      // Catastrófico: zerar na nuvem algo que tinha conteúdo, sem o usuário
      // ter pedido uma ação destrutiva. Bloqueia e registra.
      if (newW === 0) {
        lastBlocked = { key, at: new Date().toISOString(), cloudWeight: oldW };
        if (window.PdmCore) window.PdmCore.toast('Sincronização pausada: evitei apagar seus dados da nuvem.');
        return;
      }
      // Encolheu: provavelmente é exclusão legítima, mas guarda a versão
      // anterior na nuvem antes de sobrescrever.
      if (newW < oldW) {
        snapshotToHistory(key).then(() => writeKey(key, value, newW));
        return;
      }
    }
    writeKey(key, value, newW);
  }

  function writeKey(key, value, newW) {
    userDocRef(currentUser.uid, key)
      .set({ value, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .then(() => { cloudWeightCache[key] = newW; })
      .catch(() => { /* melhor esforço — próxima escrita tenta de novo */ });
  }

  // ---------------------------------------------------------------
  // DECISÃO — ver o comentário no topo do arquivo pras 6 regras.
  // ---------------------------------------------------------------
  async function decideAndApply() {
    const cloud = await readCloudSnapshot();
    const localW = localWeight();
    refreshCloudWeightCache(cloud.map);
    pendingConflict = null;

    if (cloud.weight === 0 && localW === 0) {
      markFirstDone();
      return { action: 'none', reason: 'tudo-vazio' };
    }
    if (localW === 0 && cloud.weight > 0) {
      applyCloudSnapshot(cloud.map);
      markFirstDone();
      return { action: 'pull', restored: true, cloudWeight: cloud.weight, localWeight: localW };
    }
    if (localW > 0 && cloud.weight === 0) {
      await pushAll();
      markFirstDone();
      return { action: 'push', restoredCloud: true, localWeight: localW };
    }
    // Os dois têm dado. Se a nuvem tem MUITO menos, isso cheira a nuvem
    // sobrescrita por um aparelho zerado — não aplica em cima do local sem
    // perguntar (foi exatamente assim que o segundo aparelho foi perdido).
    const cloudMuchSmaller = cloud.weight < localW * 0.5;
    if (cloudMuchSmaller || !isFirstDoneOnDevice()) {
      pendingConflict = {
        cloudMap: cloud.map,
        cloudWeight: cloud.weight,
        localWeight: localW,
        cloudDescribe: window.PdmBackup ? window.PdmBackup.describeMap(cloud.map) : [],
        localDescribe: window.PdmBackup ? window.PdmBackup.describeLocal() : [],
        reason: cloudMuchSmaller ? 'nuvem-menor' : 'aparelho-novo',
      };
      return Object.assign({ action: 'conflict' }, pendingConflict);
    }
    applyCloudSnapshot(cloud.map);
    return { action: 'pull', cloudWeight: cloud.weight, localWeight: localW };
  }

  function markFirstDone() {
    try { localStorage.setItem(FIRST_DONE_KEY, '1'); } catch (e) { /* ignora */ }
  }

  function getPendingConflict() { return pendingConflict; }
  function getLastBlocked() { return lastBlocked; }

  // "Este aparelho sabe onde está a nuvem, não está autenticado, e não tem
  // dado nenhum" — exatamente o estado depois de limpar os dados do
  // navegador. Nesse caso a tela certa é a de recuperação, NÃO o onboarding
  // (que levaria o usuário a criar um objetivo novo enquanto o progresso
  // real dele espera na nuvem). Ver o boot em index.html.
  function shouldOfferRecovery() {
    return !!getConfig() && !currentUser && localWeight() === 0;
  }

  // Chamado pela UI depois que o usuário escolhe qual lado manter.
  async function resolveConflict(choice) {
    if (!pendingConflict) return { ok: false, error: 'sem-conflito' };
    const conflict = pendingConflict;
    if (choice === 'cloud') {
      applyCloudSnapshot(conflict.cloudMap);
      markFirstDone();
      pendingConflict = null;
      ready = true;
      return { ok: true, action: 'pull' };
    }
    if (choice === 'local') {
      allowDestructive(); // sobrescrever a nuvem aqui é intencional
      try { await pushAll(); } finally { endDestructive(); }
      markFirstDone();
      pendingConflict = null;
      ready = true;
      return { ok: true, action: 'push' };
    }
    return { ok: false, error: 'escolha-invalida' };
  }

  function waitForAuthState() {
    return new Promise((resolve) => {
      const unsub = firebase.auth().onAuthStateChanged((user) => {
        unsub();
        resolve(user);
      });
    });
  }

  // Chamado no boot (antes de PdmGamification/PdmGoals/PdmHM.init()). Se não
  // tiver sync configurado ainda, resolve na hora sem baixar nada. Se tiver e
  // o navegador já mantinha sessão salva do Google, decide push/pull conforme
  // a regra de "primeiro aparelho manda" e atualiza o localStorage antes de
  // qualquer outro módulo ler os dados.
  async function init() {
    const cfg = getConfig();
    if (!cfg) return { configured: false };
    try {
      await loadFirebaseSdk();
      ensureApp();
      // Completa um login que saiu por redirecionamento (PWA instalado, ver
      // prefersRedirect() abaixo): sem isso a volta do Google não viraria
      // sessão e o usuário acharia que o login simplesmente não funcionou.
      try { await firebase.auth().getRedirectResult(); } catch (e) { /* ignora */ }
      currentUser = await waitForAuthState();
      let decision = null;
      if (currentUser) decision = await decideAndApply();
      // Com conflito pendente, `ready` fica false de propósito: nenhuma
      // escrita local vai pra nuvem antes de o usuário escolher qual lado
      // manter (senão a indecisão já destruiria um dos lados).
      ready = !!currentUser && (!decision || decision.action !== 'conflict');
      return { configured: true, signedIn: !!currentUser, sync: decision };
    } catch (e) {
      ready = false;
      return { configured: true, signedIn: false, error: String(e && e.message || e) };
    }
  }

  // O popup é o caminho PRINCIPAL em todo ambiente, inclusive no PWA
  // instalado — e isso é deliberado. Ele devolve a credencial por
  // `postMessage` entre as duas janelas, então não depende de cookie/storage
  // de terceiro; o redirecionamento depende (a credencial fica guardada no
  // domínio do handler e tem que ser lida na volta), e é exatamente isso que
  // os navegadores vêm bloqueando. Por isso o redirecionamento é só a saída
  // de emergência, nunca o padrão.
  //
  // `isStandalone()` não escolhe o caminho: ele só muda a LEITURA de um
  // popup que morreu sem resposta. No app instalado o popup às vezes abre
  // numa janela do navegador que o app não consegue acompanhar, e o SDK
  // reporta isso como "fechado pelo usuário" mesmo sem ninguém ter fechado —
  // aí vale tentar o redirecionamento. No navegador comum, esse mesmo erro
  // quer dizer o que diz, e insistir seria passar por cima da pessoa.
  function isStandalone() {
    try {
      if (window.navigator && window.navigator.standalone === true) return true;
      return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    } catch (e) { return false; }
  }

  // Erros em que o popup não tinha como funcionar nesse ambiente — aí vale
  // insistir por redirecionamento, em qualquer navegador.
  const POPUP_FALLBACK_CODES = [
    'auth/popup-blocked',
    'auth/operation-not-supported-in-this-environment',
    'auth/web-storage-unsupported',
  ];

  // Só no app instalado (ver isStandalone acima): aqui esses códigos
  // normalmente significam "a janela do popup se perdeu", não "a pessoa
  // desistiu".
  const STANDALONE_FALLBACK_CODES = [
    'auth/popup-closed-by-user',
    'auth/cancelled-popup-request',
  ];

  function shouldFallbackToRedirect(code) {
    if (POPUP_FALLBACK_CODES.indexOf(code) !== -1) return true;
    return isStandalone() && STANDALONE_FALLBACK_CODES.indexOf(code) !== -1;
  }

  // Fluxo explícito de "Entrar com Google", disparado pelo usuário em
  // Configurações ou na tela de recuperação — precisa vir depois de a config
  // estar resolvida (salva no aparelho ou a embutida).
  async function connect() {
    await loadFirebaseSdk();
    ensureApp();
    const provider = new firebase.auth.GoogleAuthProvider();
    let result;
    try {
      result = await firebase.auth().signInWithPopup(provider);
    } catch (e) {
      if (shouldFallbackToRedirect(e && e.code)) {
        await firebase.auth().signInWithRedirect(provider);
        return { redirecting: true };
      }
      throw e;
    }
    currentUser = result.user;
    const decision = await decideAndApply();
    ready = decision.action !== 'conflict';
    return { user: currentUser, sync: decision };
  }

  async function disconnect() {
    if (window.firebase && firebase.auth) {
      try { await firebase.auth().signOut(); } catch (e) { /* ignora */ }
    }
    currentUser = null;
    ready = false;
  }

  window.PdmSync = {
    SYNCED_KEYS,
    isConfigured, setConfig, getConfig, clearConfig,
    getStoredConfig, hasDefaultConfig, shouldOfferRecovery,
    isSignedIn, getUserEmail, isFirstDoneOnDevice,
    init, connect, disconnect, pushKey,
    // Proteção de dados (ver comentário no topo):
    readCloudSnapshot, pushAll, allowDestructive, endDestructive,
    getPendingConflict, resolveConflict, getLastBlocked,
  };
})();
