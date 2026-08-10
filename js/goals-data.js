// Camada de dados de Objetivos — a camada estratégica da aplicação.
//
// Hierarquia: Objetivo → Hábito → Missão → Execução.
// Um hábito pertence a no máximo um Objetivo (habit.goalId); missões geradas
// por hábito herdam o goalId automaticamente (ver js/habits-missions-data.js).
// Missões manuais podem, opcionalmente, se vincular a um Objetivo direto.
//
// Depende de window.PdmHM (pra consultar hábitos/missões vinculados e pra
// desvincular quando um objetivo é excluído), window.PdmGamification (só
// informa quando um objetivo é concluído/deixa de estar concluído — nunca
// mexe em XP diretamente) e das funções utilitárias globais (js/utils.js).

(function () {
  let GOALS = [];
  let GOAL_CATEGORIES = [];

  const DEFAULT_GOAL_CATEGORIES = [
    { key: 'saude', name: 'Saúde' },
    { key: 'carreira', name: 'Carreira' },
    { key: 'estudos', name: 'Estudos' },
    { key: 'financas', name: 'Finanças' },
    { key: 'relacionamentos', name: 'Relacionamentos' },
    { key: 'espiritualidade', name: 'Espiritualidade' },
    { key: 'dev_pessoal', name: 'Desenvolvimento Pessoal' },
    { key: 'outros', name: 'Outros' },
  ];

  // ---------------------------------------------------------------
  // PERSISTÊNCIA
  // ---------------------------------------------------------------
  async function loadGoals() {
    try { const r = await window.storage.get('mestre-goals'); GOALS = r ? JSON.parse(r.value) : []; }
    catch (e) { GOALS = []; }
  }
  async function saveGoals() {
    try { await window.storage.set('mestre-goals', JSON.stringify(GOALS)); }
    catch (e) { if (window.PdmCore) window.PdmCore.toast('Erro ao salvar objetivos.'); }
  }
  async function loadGoalCategories() {
    try {
      const r = await window.storage.get('mestre-goal-categories');
      GOAL_CATEGORIES = r ? JSON.parse(r.value) : [];
    } catch (e) { GOAL_CATEGORIES = []; }
  }
  async function saveGoalCategories() {
    try { await window.storage.set('mestre-goal-categories', JSON.stringify(GOAL_CATEGORIES)); }
    catch (e) { if (window.PdmCore) window.PdmCore.toast('Erro ao salvar categorias.'); }
  }

  async function init() {
    await loadGoals();
    await loadGoalCategories();
    if (!GOAL_CATEGORIES.length) {
      GOAL_CATEGORIES = DEFAULT_GOAL_CATEGORIES.map((c) => Object.assign({ isCustom: false }, c));
      saveGoalCategories();
    }
  }

  // ---------------------------------------------------------------
  // CATEGORIAS (padrão + personalizadas)
  // ---------------------------------------------------------------
  function listGoalCategories() { return GOAL_CATEGORIES.slice(); }
  function createGoalCategory(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    const existing = GOAL_CATEGORIES.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    const cat = { key: uid('cat'), name: trimmed, isCustom: true };
    GOAL_CATEGORIES.push(cat);
    saveGoalCategories();
    return cat;
  }

  // ---------------------------------------------------------------
  // CRUD — OBJETIVOS
  // ---------------------------------------------------------------
  function listGoals(opts) {
    opts = opts || {};
    return GOALS
      .filter((g) => opts.includeArchived || !g.archivedAt)
      .slice()
      .sort((a, b) => (a.archivedAt ? 1 : 0) - (b.archivedAt ? 1 : 0) || a.name.localeCompare(b.name, 'pt-BR'));
  }
  function getGoal(id) { return GOALS.find((g) => g.id === id) || null; }

  function createGoal(data) {
    const now = new Date().toISOString();
    const hasNumericGoal = !!data.hasNumericGoal;
    const goal = {
      id: uid('g'),
      name: data.name.trim(),
      description: (data.description || '').trim(),
      category: data.category,
      icon: data.icon || 'flag',
      color: data.color || 'gold',
      status: data.status || 'nao_iniciado',
      startDate: data.startDate || now.slice(0, 10),
      targetDate: data.targetDate || null,
      hasNumericGoal,
      goalUnit: hasNumericGoal ? (data.goalUnit || '') : '',
      goalInitialValue: hasNumericGoal ? (Number(data.goalInitialValue) || 0) : null,
      goalTargetValue: hasNumericGoal ? (Number(data.goalTargetValue) || 0) : null,
      history: [],
      createdAt: now,
      archivedAt: null,
      xpAwarded: false, // garante um único evento de XP por conclusão (evita ganho duplicado)
      completedAt: null, // quando cruzou pra status "concluido" — usado pelas Estatísticas
    };
    GOALS.push(goal);
    saveGoals();
    return goal;
  }

  // Retorna { goal, gamification }: gamification vem preenchido só quando
  // esta chamada cruzou a fronteira de status "concluído" (concedendo ou
  // estornando o XP fixo de objetivo concluído), senão vem null.
  function updateGoal(id, data) {
    const g = GOALS.find((x) => x.id === id);
    if (!g) return { goal: null, gamification: null };
    const wasCompleted = g.status === 'concluido';
    ['name', 'description', 'category', 'icon', 'color', 'status', 'startDate', 'targetDate', 'hasNumericGoal', 'goalUnit', 'goalInitialValue', 'goalTargetValue'].forEach((k) => {
      if (data[k] !== undefined) g[k] = data[k];
    });
    if (typeof g.name === 'string') g.name = g.name.trim();
    if (!g.hasNumericGoal) { g.goalUnit = ''; g.goalInitialValue = null; g.goalTargetValue = null; }
    else { g.goalInitialValue = Number(g.goalInitialValue) || 0; g.goalTargetValue = Number(g.goalTargetValue) || 0; }

    let gamification = null;
    const nowCompleted = g.status === 'concluido';
    if (!wasCompleted && nowCompleted) {
      g.completedAt = new Date().toISOString();
      if (!g.xpAwarded) {
        g.xpAwarded = true;
        gamification = window.PdmGamification ? window.PdmGamification.recordGoalCompleted() : null;
      }
    } else if (wasCompleted && !nowCompleted) {
      g.completedAt = null;
      if (g.xpAwarded) {
        g.xpAwarded = false;
        if (window.PdmGamification) window.PdmGamification.revertGoalCompletion();
      }
    }

    saveGoals();
    return { goal: g, gamification };
  }

  // "Excluir" = arquivar (preserva o objetivo e seu histórico), mas remove de
  // fato a associação com hábitos/missões, conforme a regra de negócio pedida.
  function archiveGoal(id) {
    const g = GOALS.find((x) => x.id === id);
    if (!g) return null;
    g.archivedAt = new Date().toISOString();
    saveGoals();
    if (window.PdmHM) window.PdmHM.unlinkGoal(id);
    return g;
  }
  function restoreGoal(id) {
    const g = GOALS.find((x) => x.id === id);
    if (!g) return null;
    g.archivedAt = null;
    saveGoals();
    return g;
  }

  // ---------------------------------------------------------------
  // HISTÓRICO DE EVOLUÇÃO
  // ---------------------------------------------------------------
  function addHistoryEntry(goalId, data) {
    const g = GOALS.find((x) => x.id === goalId);
    if (!g) return null;
    const entry = {
      id: uid('h'),
      value: Number(data.value) || 0,
      date: data.date || todayISO(),
      note: (data.note || '').trim(),
      createdAt: new Date().toISOString(),
    };
    g.history.push(entry);
    saveGoals();
    return entry;
  }
  function deleteHistoryEntry(goalId, entryId) {
    const g = GOALS.find((x) => x.id === goalId);
    if (!g) return false;
    const idx = g.history.findIndex((e) => e.id === entryId);
    if (idx === -1) return false;
    g.history.splice(idx, 1);
    saveGoals();
    return true;
  }
  function sortedHistory(goal) {
    return goal.history.slice().sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
  }
  function getCurrentValue(goal) {
    const sorted = sortedHistory(goal);
    return sorted.length ? sorted[0].value : (goal.goalInitialValue || 0);
  }

  // ---------------------------------------------------------------
  // PROGRESSO — numérico se houver meta, senão baseado em execução
  // ---------------------------------------------------------------
  function computeGoalProgress(goal) {
    if (goal.hasNumericGoal && goal.goalTargetValue !== goal.goalInitialValue) {
      const current = getCurrentValue(goal);
      const pct = ((current - goal.goalInitialValue) / (goal.goalTargetValue - goal.goalInitialValue)) * 100;
      return {
        type: 'numeric', pct: clampPct(pct), current,
        initial: goal.goalInitialValue, target: goal.goalTargetValue, unit: goal.goalUnit,
      };
    }
    const missions = window.PdmHM ? window.PdmHM.listMissionsByGoal(goal.id) : [];
    const today = todayISO();
    const resolved = missions.filter((m) => m.status === 'concluida' || m.status === 'cancelada' || m.date < today);
    const completed = missions.filter((m) => m.status === 'concluida');
    return {
      type: 'execution',
      pct: resolved.length ? clampPct((completed.length / resolved.length) * 100) : 0,
      completed: completed.length,
      resolved: resolved.length,
    };
  }

  function computeGoalStats(goal) {
    const habits = window.PdmHM ? window.PdmHM.listHabitsByGoal(goal.id) : [];
    const missions = window.PdmHM ? window.PdmHM.listMissionsByGoal(goal.id) : [];
    const completedMissions = missions.filter((m) => m.status === 'concluida').length;
    const pendingMissions = missions.filter((m) => !['concluida', 'cancelada'].includes(m.status)).length;
    const today = todayISO();
    const elapsedDays = goal.startDate ? Math.max(0, daysBetween(goal.startDate, today)) : 0;
    const remainingDays = goal.targetDate ? daysBetween(today, goal.targetDate) : null;
    return {
      habitsCount: habits.length,
      completedMissions,
      pendingMissions,
      elapsedDays,
      remainingDays, // negativo = atrasado
    };
  }

  // Usado pelo "Zerar todo o progresso".
  function resetAll() {
    GOALS = [];
    GOAL_CATEGORIES = DEFAULT_GOAL_CATEGORIES.map((c) => Object.assign({ isCustom: false }, c));
    saveGoals();
    saveGoalCategories();
  }

  window.PdmGoals = {
    resetAll,
    init,
    listGoalCategories,
    createGoalCategory,
    listGoals,
    getGoal,
    createGoal,
    updateGoal,
    archiveGoal,
    restoreGoal,
    addHistoryEntry,
    deleteHistoryEntry,
    sortedHistory,
    getCurrentValue,
    computeGoalProgress,
    computeGoalStats,
  };
})();
