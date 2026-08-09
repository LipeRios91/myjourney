// Camada de dados de Dieta — registro diário de refeições (calorias e
// macronutrientes). Domínio independente de Hábitos/Missões/Objetivos e da
// Gamificação (mesmo tratamento de Evolução: acompanhamento pessoal que não
// concede XP) — só lê window.storage e as funções utilitárias globais.
//
// Cada entrada é um "snapshot": grava os valores nutricionais já calculados
// pra porção registrada (kcal/proteína/carbo/gordura totais daquela porção),
// não uma referência a um alimento "vivo" — editar a busca depois não altera
// o que já foi registrado, mesmo princípio de missão/hábito (ver CLAUDE.md).

(function () {
  let ENTRIES = [];
  let GOALS = { kcal: null, protein: null, carbs: null, fat: null };

  const MEAL_TYPES = [
    { key: 'cafe', name: 'Café da manhã' },
    { key: 'almoco', name: 'Almoço' },
    { key: 'lanche', name: 'Lanche' },
    { key: 'jantar', name: 'Jantar' },
    { key: 'outro', name: 'Outro' },
  ];

  // ---------------------------------------------------------------
  // PERSISTÊNCIA
  // ---------------------------------------------------------------
  async function loadEntries() {
    try { const r = await window.storage.get('mestre-diet-entries'); ENTRIES = r ? JSON.parse(r.value) : []; }
    catch (e) { ENTRIES = []; }
  }
  async function saveEntries() {
    try { await window.storage.set('mestre-diet-entries', JSON.stringify(ENTRIES)); }
    catch (e) { if (window.PdmCore) window.PdmCore.toast('Erro ao salvar registro de dieta.'); }
  }
  async function loadGoals() {
    try {
      const r = await window.storage.get('mestre-diet-goals');
      GOALS = r ? Object.assign({ kcal: null, protein: null, carbs: null, fat: null }, JSON.parse(r.value)) : { kcal: null, protein: null, carbs: null, fat: null };
    } catch (e) { GOALS = { kcal: null, protein: null, carbs: null, fat: null }; }
  }
  async function saveGoals() {
    try { await window.storage.set('mestre-diet-goals', JSON.stringify(GOALS)); }
    catch (e) { if (window.PdmCore) window.PdmCore.toast('Erro ao salvar metas de dieta.'); }
  }

  async function init() {
    await loadEntries();
    await loadGoals();
  }

  // ---------------------------------------------------------------
  // TIPOS DE REFEIÇÃO
  // ---------------------------------------------------------------
  function listMealTypes() { return MEAL_TYPES.slice(); }
  function getMealTypeName(key) { const m = MEAL_TYPES.find((x) => x.key === key); return m ? m.name : 'Outro'; }

  // ---------------------------------------------------------------
  // CRUD — ENTRADAS
  // ---------------------------------------------------------------
  function listEntriesForDate(date) {
    return ENTRIES
      .filter((e) => e.date === date)
      .slice()
      .sort((a, b) => a.createdAt < b.createdAt ? -1 : 1);
  }
  function getEntry(id) { return ENTRIES.find((e) => e.id === id) || null; }

  function round1(n) { return Math.round((Number(n) || 0) * 10) / 10; }

  function addEntry(data) {
    const entry = {
      id: uid('diet'),
      date: data.date || todayISO(),
      mealType: data.mealType || 'outro',
      name: (data.name || '').trim() || 'Alimento',
      grams: Math.round(Number(data.grams) || 0),
      kcal: round1(data.kcal),
      protein: round1(data.protein),
      carbs: round1(data.carbs),
      fat: round1(data.fat),
      source: data.source || 'manual', // 'manual' | 'search' | 'photo'
      createdAt: new Date().toISOString(),
    };
    ENTRIES.push(entry);
    saveEntries();
    return entry;
  }

  function updateEntry(id, data) {
    const e = ENTRIES.find((x) => x.id === id);
    if (!e) return null;
    ['date', 'mealType', 'name', 'grams', 'kcal', 'protein', 'carbs', 'fat'].forEach((k) => {
      if (data[k] !== undefined) e[k] = ['kcal', 'protein', 'carbs', 'fat'].includes(k) ? round1(data[k]) : data[k];
    });
    if (typeof e.name === 'string') e.name = e.name.trim();
    if (data.grams !== undefined) e.grams = Math.round(Number(data.grams) || 0);
    saveEntries();
    return e;
  }

  function deleteEntry(id) {
    const idx = ENTRIES.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    ENTRIES.splice(idx, 1);
    saveEntries();
    return true;
  }

  // ---------------------------------------------------------------
  // TOTAIS DO DIA
  // ---------------------------------------------------------------
  function computeDayTotals(date) {
    const entries = listEntriesForDate(date);
    return entries.reduce((acc, e) => {
      acc.kcal += e.kcal || 0;
      acc.protein += e.protein || 0;
      acc.carbs += e.carbs || 0;
      acc.fat += e.fat || 0;
      return acc;
    }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
  }

  // ---------------------------------------------------------------
  // METAS DIÁRIAS (opcionais — null = sem meta definida pro nutriente)
  // ---------------------------------------------------------------
  function getGoals() { return Object.assign({}, GOALS); }
  function setGoals(data) {
    ['kcal', 'protein', 'carbs', 'fat'].forEach((k) => {
      const v = Number(data[k]);
      GOALS[k] = data[k] === null || data[k] === '' || isNaN(v) ? null : v;
    });
    saveGoals();
    return getGoals();
  }

  window.PdmDiet = {
    init,
    listMealTypes, getMealTypeName,
    listEntriesForDate, getEntry, addEntry, updateEntry, deleteEntry,
    computeDayTotals, getGoals, setGoals,
  };
})();
