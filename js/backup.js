// Proteção de dados — backup manual (exportar/importar) e a definição de
// "o que conta como dado real do usuário".
//
// Existe por causa de uma perda de dados real: limpar o histórico do
// navegador apagou o localStorage inteiro, e como a flag de "primeiro
// aparelho" da sincronização mora no MESMO localStorage, o aparelho zerado
// se promoveu a fonte da verdade e empurrou o vazio por cima da nuvem boa —
// que então foi baixado pelo outro aparelho. Ver CLAUDE.md, seção
// "Proteção de dados".
//
// Este módulo é a base de duas defesas:
// 1. `dataWeight()` — usado por js/sync.js pra NUNCA deixar um estado vazio
//    sobrescrever um estado com conteúdo (o bug acima), e pra detectar
//    conflito de verdade em vez de adivinhar.
// 2. Backup em arquivo — a única cópia que sobrevive a qualquer coisa
//    (limpar navegador, trocar de aparelho, nuvem corrompida), porque sai do
//    navegador e vira um arquivo que o usuário guarda onde quiser.
//
// Depende só de `localStorage` direto (não de window.storage) de propósito:
// backup/restauração precisa funcionar antes e depois de qualquer módulo de
// dados ter rodado init(), e não deve disparar push de sincronização no meio
// de uma restauração.

(function () {
  const LAST_EXPORT_KEY = 'mestre-last-export'; // preferência de dispositivo, fora do sync
  const FORMAT = 'jornada-do-heroi-backup';
  const FORMAT_VERSION = 1;

  // Mesma lista de js/sync.js (progresso real, não preferência de
  // dispositivo). Mantida aqui também porque o backup precisa funcionar
  // mesmo sem a sincronização configurada/carregada.
  const DATA_KEYS = [
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

  function parse(value) {
    if (value === null || value === undefined) return null;
    try { return JSON.parse(value); } catch (e) { return null; }
  }

  // ---------------------------------------------------------------
  // PESO DO DADO — "isso aqui é conteúdo real do usuário ou é só o estado
  // padrão que todo app recém-instalado escreve?"
  //
  // Crítico pra sincronização: um aparelho recém-aberto JÁ grava várias
  // dessas chaves (categorias padrão, habilidades padrão, estado de
  // gamificação zerado, estado do onboarding). Se "a chave existe" contasse
  // como dado, um aparelho zerado pareceria ter conteúdo e sobrescreveria a
  // nuvem. Por isso cada chave tem sua própria noção de peso, e o padrão de
  // fábrica pesa ZERO.
  // ---------------------------------------------------------------
  function dataWeight(key, value) {
    const data = parse(value);
    if (data === null) return 0;

    switch (key) {
      // Listas puras: peso = quantidade de itens reais.
      case 'mestre-habits':
      case 'mestre-missions':
      case 'mestre-goals':
      case 'mestre-diet-entries':
        return Array.isArray(data) ? data.length : 0;

      // Só o que o usuário criou conta — as padrão vêm de fábrica.
      case 'mestre-goal-categories':
      case 'mestre-skills':
        return Array.isArray(data) ? data.filter((x) => x && (x.isCustom || x.isDefault === false)).length : 0;

      // Progresso de gamificação: XP, eventos e conquistas são o que importa.
      // Um estado zerado (totalXP 0, histórico vazio) pesa 0 de propósito.
      case 'mestre-gamification': {
        if (!data || typeof data !== 'object') return 0;
        let w = 0;
        w += Number(data.totalXP) > 0 ? 1 : 0;
        w += Array.isArray(data.history) ? data.history.length : 0;
        w += Array.isArray(data.achievements) ? data.achievements.length : 0;
        if (data.skills && typeof data.skills === 'object') {
          w += Object.keys(data.skills).filter((k) => Number(data.skills[k]) > 0).length;
        }
        if (data.lifetime && typeof data.lifetime === 'object') {
          w += Object.keys(data.lifetime).filter((k) => Number(data.lifetime[k]) > 0).length;
        }
        if (data.streak && Number(data.streak.totalActiveDays) > 0) w += 1;
        return w;
      }

      // Fotos mensais: cada mês com foto ou peso registrado conta.
      case 'mestre-monthly-photos': {
        if (!data || typeof data !== 'object') return 0;
        return Object.keys(data).filter((m) => {
          const v = data[m];
          if (!v) return false;
          if (typeof v === 'string') return true; // formato antigo (só dataURL)
          return !!(v.photo || v.weight);
        }).length;
      }

      case 'mestre-profile-photo':
        return data && data.dataUrl ? 1 : 0;

      // Metas de dieta: só contam se alguma meta foi realmente definida
      // (o padrão é tudo null).
      case 'mestre-diet-goals': {
        if (!data || typeof data !== 'object') return 0;
        return Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined && data[k] !== '').length;
      }

      // Estado do wizard — nunca conta como progresso por si só. Todo
      // aparelho novo grava isso logo no primeiro boot.
      case 'mestre-onboarding':
        return 0;

      default:
        return 0;
    }
  }

  // Peso total de um mapa { chave: valorString }.
  function weightOfMap(map) {
    return DATA_KEYS.reduce((sum, key) => sum + dataWeight(key, map ? map[key] : null), 0);
  }

  // Peso total do que está no localStorage deste aparelho agora.
  function weightOfLocal() {
    return DATA_KEYS.reduce((sum, key) => sum + dataWeight(key, localStorage.getItem(key)), 0);
  }

  // Quebra o peso por chave — usado na tela de conflito, pra o usuário ver
  // concretamente o que tem de cada lado em vez de um número abstrato.
  function describeMap(map) {
    const parts = [];
    const labels = {
      'mestre-habits': 'hábitos',
      'mestre-missions': 'missões',
      'mestre-goals': 'objetivos',
      'mestre-gamification': 'eventos de XP',
      'mestre-diet-entries': 'registros de dieta',
      'mestre-monthly-photos': 'meses com foto/peso',
    };
    Object.keys(labels).forEach((key) => {
      const w = dataWeight(key, map ? map[key] : null);
      if (w > 0) parts.push(w + ' ' + labels[key]);
    });
    return parts;
  }
  function describeLocal() {
    const map = {};
    DATA_KEYS.forEach((k) => { map[k] = localStorage.getItem(k); });
    return describeMap(map);
  }

  // ---------------------------------------------------------------
  // EXPORTAR — vira um arquivo .json que sai do navegador. É a única cópia
  // que sobrevive a limpar dados do site, trocar de celular ou a nuvem ser
  // sobrescrita.
  // ---------------------------------------------------------------
  function buildBackupObject() {
    const data = {};
    DATA_KEYS.forEach((key) => {
      const v = localStorage.getItem(key);
      if (v !== null) data[key] = v;
    });
    return {
      format: FORMAT,
      version: FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      weight: weightOfLocal(),
      data,
    };
  }

  function exportToFile() {
    const backup = buildBackupObject();
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jornada-do-heroi-' + todayISO() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    try { localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString()); } catch (e) { /* ignora */ }
    return backup;
  }

  function getLastExportAt() {
    try { return localStorage.getItem(LAST_EXPORT_KEY); } catch (e) { return null; }
  }
  function daysSinceLastExport() {
    const at = getLastExportAt();
    if (!at) return null;
    const diff = Date.now() - new Date(at).getTime();
    return Math.floor(diff / 86400000);
  }

  // ---------------------------------------------------------------
  // IMPORTAR — valida antes de encostar em qualquer coisa. Nunca aplica um
  // arquivo pela metade: ou o arquivo é válido e entra inteiro, ou não entra.
  // ---------------------------------------------------------------
  function validateBackup(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, error: 'Arquivo não é um backup válido.' };
    if (obj.format !== FORMAT) return { ok: false, error: 'Esse arquivo não é um backup da Jornada do Herói.' };
    if (!obj.data || typeof obj.data !== 'object') return { ok: false, error: 'Backup sem dados dentro.' };
    const unknown = Object.keys(obj.data).filter((k) => DATA_KEYS.indexOf(k) === -1);
    const invalidJson = Object.keys(obj.data).filter((k) => {
      if (typeof obj.data[k] !== 'string') return true;
      try { JSON.parse(obj.data[k]); return false; } catch (e) { return true; }
    });
    if (invalidJson.length) return { ok: false, error: 'Backup corrompido (conteúdo ilegível em: ' + invalidJson.join(', ') + ').' };
    return {
      ok: true,
      weight: weightOfMap(obj.data),
      exportedAt: obj.exportedAt || null,
      describe: describeMap(obj.data),
      ignoredKeys: unknown,
    };
  }

  function readBackupFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(JSON.parse(String(reader.result))); }
        catch (e) { reject(new Error('Arquivo não é um JSON válido.')); }
      };
      reader.onerror = () => reject(new Error('Não deu pra ler o arquivo.'));
      reader.readAsText(file);
    });
  }

  // Aplica o backup por cima do que existe. Escreve direto no localStorage
  // (sem window.storage) pra não disparar um push por chave no meio da
  // restauração — quem decide reenviar pra nuvem depois é o chamador, de uma
  // vez só e de forma explícita.
  function applyBackup(obj) {
    const check = validateBackup(obj);
    if (!check.ok) return check;
    DATA_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(obj.data, key)) {
        localStorage.setItem(key, obj.data[key]);
      }
    });
    return { ok: true, weight: check.weight, applied: Object.keys(obj.data).length };
  }

  // ---------------------------------------------------------------
  // ARMAZENAMENTO PERSISTENTE — pede ao navegador pra não despejar os dados
  // automaticamente (pressão de armazenamento, inatividade). Não protege
  // contra o usuário limpar os dados do site de propósito, mas protege
  // contra o navegador fazer isso sozinho. Em PWA instalado o Chrome
  // costuma conceder sem nem perguntar.
  // ---------------------------------------------------------------
  async function requestPersistentStorage() {
    try {
      if (!navigator.storage || !navigator.storage.persist) return { supported: false };
      const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      if (already) return { supported: true, persisted: true, asked: false };
      const granted = await navigator.storage.persist();
      return { supported: true, persisted: !!granted, asked: true };
    } catch (e) {
      return { supported: false, error: String((e && e.message) || e) };
    }
  }

  async function getStorageStatus() {
    const out = { supported: false, persisted: false, usageMb: null, quotaMb: null };
    try {
      if (!navigator.storage) return out;
      out.supported = !!navigator.storage.persist;
      if (navigator.storage.persisted) out.persisted = await navigator.storage.persisted();
      if (navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        if (est && est.usage != null) out.usageMb = Math.round((est.usage / 1048576) * 10) / 10;
        if (est && est.quota != null) out.quotaMb = Math.round(est.quota / 1048576);
      }
    } catch (e) { /* mantém o que deu pra descobrir */ }
    return out;
  }

  window.PdmBackup = {
    DATA_KEYS,
    dataWeight, weightOfMap, weightOfLocal, describeMap, describeLocal,
    buildBackupObject, exportToFile, getLastExportAt, daysSinceLastExport,
    validateBackup, readBackupFile, applyBackup,
    requestPersistentStorage, getStorageStatus,
  };
})();
