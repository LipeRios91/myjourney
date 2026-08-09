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
// - Resolução de conflito é simples, não por timestamp por campo: o
//   PRIMEIRO aparelho a conectar a sincronização vira a "fonte da verdade"
//   e envia tudo que já tinha pra nuvem. TODO aparelho conectado depois
//   disso (ou reaberto depois) passa a BAIXAR da nuvem no boot, sobrescrevendo
//   o que tinha localmente. Ou seja: se você já tem progresso em dois
//   aparelhos diferentes e nunca sincronizou nenhum, conecte primeiro o
//   aparelho com o progresso que você quer manter — o segundo aparelho vai
//   perder o que tinha de local (a UI avisa isso antes de conectar).
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
  ];

  let app = null;
  let db = null;
  let currentUser = null;
  let ready = false; // true depois que init() resolve (configurado e SDK carregado)
  let sdkLoadPromise = null;

  function getConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return null;
      const cfg = JSON.parse(raw);
      if (!CONFIG_FIELDS.every((f) => cfg && String(cfg[f] || '').trim())) return null;
      return cfg;
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

  async function pullAll() {
    if (!currentUser) return;
    const snaps = await Promise.all(
      SYNCED_KEYS.map((key) => userDocRef(currentUser.uid, key).get().catch(() => null))
    );
    snaps.forEach((snap, i) => {
      if (snap && snap.exists) {
        const data = snap.data();
        if (data && typeof data.value === 'string') localStorage.setItem(SYNCED_KEYS[i], data.value);
      }
    });
  }

  async function pushAll() {
    if (!currentUser) return;
    const batch = db.batch();
    let any = false;
    SYNCED_KEYS.forEach((key) => {
      const value = localStorage.getItem(key);
      if (value !== null) {
        batch.set(userDocRef(currentUser.uid, key), { value, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        any = true;
      }
    });
    if (any) await batch.commit();
  }

  // Chamado pelo window.storage.set() depois de toda escrita local — best
  // effort, silencioso (mesma filosofia de js/reminders.js): se falhar (sem
  // rede, sem sync configurado, etc.) o app continua funcionando 100% local.
  function pushKey(key, value) {
    if (!ready || !currentUser || !db) return;
    if (SYNCED_KEYS.indexOf(key) === -1) return;
    userDocRef(currentUser.uid, key)
      .set({ value, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
      .catch(() => { /* melhor esforço — próxima escrita tenta de novo */ });
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
      currentUser = await waitForAuthState();
      if (currentUser) {
        if (isFirstDoneOnDevice()) {
          await pullAll();
        } else {
          await pushAll();
          localStorage.setItem(FIRST_DONE_KEY, '1');
        }
      }
      ready = true;
      return { configured: true, signedIn: !!currentUser };
    } catch (e) {
      ready = false;
      return { configured: true, signedIn: false, error: String(e && e.message || e) };
    }
  }

  // Fluxo explícito de "Entrar com Google", disparado pelo usuário na tela
  // de Perfil — precisa vir depois de setConfig() ter sido chamado.
  async function connect() {
    await loadFirebaseSdk();
    ensureApp();
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await firebase.auth().signInWithPopup(provider);
    currentUser = result.user;
    if (isFirstDoneOnDevice()) {
      await pullAll();
    } else {
      await pushAll();
      localStorage.setItem(FIRST_DONE_KEY, '1');
    }
    ready = true;
    return currentUser;
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
    isSignedIn, getUserEmail, isFirstDoneOnDevice,
    init, connect, disconnect, pushKey,
  };
})();
