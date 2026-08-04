// Camada de dados de Hábitos e Missões.
//
// Hábito = modelo/template recorrente. Nunca tem status de conclusão.
// Missão = execução real, numa data específica, gerada por um hábito OU criada manualmente.
// Toda a interação de "concluir" acontece na Missão — o hábito nunca é marcado como feito.
//
// Depende de: window.storage (shim de persistência), window.PdmGamification
// (camada de gamificação — só informa que uma missão/hábito aconteceu, nunca
// mexe em XP/streak diretamente), window.PdmCore (só o toast de erro), e das
// funções utilitárias globais de js/utils.js.

(function () {
  let HABITS = [];
  let MISSIONS = [];

  // ---------------------------------------------------------------
  // PERSISTÊNCIA
  // ---------------------------------------------------------------
  async function loadHabits() {
    try {
      const r = await window.storage.get('mestre-habits');
      HABITS = r ? JSON.parse(r.value) : [];
    } catch (e) { HABITS = []; }
  }
  async function saveHabits() {
    try { await window.storage.set('mestre-habits', JSON.stringify(HABITS)); }
    catch (e) { if (window.PdmCore) window.PdmCore.toast('Erro ao salvar hábitos.'); }
  }
  async function loadMissions() {
    try {
      const r = await window.storage.get('mestre-missions');
      MISSIONS = r ? JSON.parse(r.value) : [];
    } catch (e) { MISSIONS = []; }
  }
  async function saveMissions() {
    try { await window.storage.set('mestre-missions', JSON.stringify(MISSIONS)); }
    catch (e) { if (window.PdmCore) window.PdmCore.toast('Erro ao salvar missões.'); }
  }

  // ---------------------------------------------------------------
  // SEED — migra o antigo sistema fixo de missões (QUEST_DEFS) pra
  // hábitos reais, só na primeira vez que o usuário abre esta versão.
  // ---------------------------------------------------------------
  function seedDefaultHabits() {
    const now = new Date().toISOString();
    const base = (over) => Object.assign({
      id: uid('h'),
      description: '',
      color: 'gold',
      icon: 'target',
      frequency: { type: 'daily' },
      startDate: now.slice(0, 10),
      endDate: null,
      schedule: { startTime: null, endTime: null, durationMin: 60 },
      goal: { type: 'none' },
      reminder: { type: 'none' },
      priority: 'media',
      createdAt: now,
      archivedAt: null,
      stats: { currentStreak: 0, bestStreak: 0, totalCompletions: 0, successRate: 0, missedCount: 0, lastCompletedAt: null, updatedAt: now },
    }, over);

    HABITS.push(base({ name: 'Estudo PMP', category: 'trabalho', color: 'gold', icon: 'book', xp: 15, endDate: '2026-09-30', schedule: { startTime: null, endTime: null, durationMin: 60 } }));
    HABITS.push(base({ name: 'Treino', category: 'saude', color: 'rose', icon: 'dumbbell', xp: 15, schedule: { startTime: null, endTime: null, durationMin: 60 } }));
    HABITS.push(base({ name: 'Inglês', category: 'trabalho', color: 'blue', icon: 'globe', xp: 10, endDate: '2026-09-30', schedule: { startTime: null, endTime: null, durationMin: 30 } }));
    HABITS.push(base({ name: 'Inglês (bloco estendido)', category: 'trabalho', color: 'blue', icon: 'globe', xp: 25, startDate: '2026-10-01', schedule: { startTime: null, endTime: null, durationMin: 60 } }));
    HABITS.push(base({ name: 'Guitarra', category: 'hobbies', color: 'purple', icon: 'guitar', xp: 8, schedule: { startTime: null, endTime: null, durationMin: 20 } }));
    saveHabits();
  }

  async function init() {
    await loadHabits();
    await loadMissions();
    if (HABITS.length === 0 && MISSIONS.length === 0) {
      seedDefaultHabits();
    }
    ensureMissionsForDate(todayISO());
  }

  // ---------------------------------------------------------------
  // RECORRÊNCIA — decide se um hábito "acontece" numa data
  // ---------------------------------------------------------------
  function isNthWeekdayOfMonth(d, pos) {
    if (!pos) return false;
    if (d.getDay() !== pos.weekday) return false;
    const dom = d.getDate();
    if (pos.ordinal === -1) {
      const nextWeek = new Date(d);
      nextWeek.setDate(dom + 7);
      return nextWeek.getMonth() !== d.getMonth();
    }
    return Math.floor((dom - 1) / 7) + 1 === pos.ordinal;
  }

  function habitOccursOnDate(habit, dateISO) {
    if (habit.archivedAt) return false;
    if (habit.startDate && dateISO < habit.startDate) return false;
    if (habit.endDate && dateISO > habit.endDate) return false;
    const f = habit.frequency || { type: 'daily' };
    const dow = weekdayOf(dateISO);
    switch (f.type) {
      case 'daily': return true;
      case 'weekdays': return Array.isArray(f.weekdays) && f.weekdays.includes(dow);
      case 'weekly': return dow === f.weeklyDay;
      case 'monthly': {
        const d = isoToDate(dateISO);
        if (f.monthlyMode === 'weekday_position') return isNthWeekdayOfMonth(d, f.weekdayPosition);
        return d.getDate() === (f.dayOfMonth || 1);
      }
      case 'custom': {
        const anchor = habit.startDate || habit.createdAt.slice(0, 10);
        const diff = Math.round((isoToDate(dateISO) - isoToDate(anchor)) / 86400000);
        return diff >= 0 && diff % Math.max(1, f.intervalDays || 1) === 0;
      }
      default: return false;
    }
  }

  // ---------------------------------------------------------------
  // GERAÇÃO AUTOMÁTICA DE MISSÕES
  // ---------------------------------------------------------------
  function makeMissionFromHabit(habit, dateISO) {
    return {
      id: uid('m'),
      habitId: habit.id,
      goalId: habit.goalId || null, // missão herda o Objetivo do hábito automaticamente
      origin: 'habit',
      name: habit.name,
      description: habit.description || '',
      category: habit.category,
      color: habit.color,
      icon: habit.icon,
      scheduledDate: dateISO, // imutável: data original gerada pela recorrência (evita duplicar ao reagendar)
      date: dateISO, // mutável: data efetiva exibida na agenda
      time: (habit.schedule && habit.schedule.startTime) || null,
      endTime: (habit.schedule && habit.schedule.endTime) || null,
      durationMin: (habit.schedule && habit.schedule.durationMin) || null,
      priority: habit.priority || 'media',
      xp: habit.xp || 0,
      notes: '',
      status: 'nao_iniciada',
      completedAt: null,
      xpAwarded: 0,
      xpPenaltyApplied: 0,
      rescheduleHistory: [],
      createdAt: new Date().toISOString(),
    };
  }

  function ensureMissionsForDate(dateISO) {
    let created = false;
    HABITS.filter((h) => !h.archivedAt).forEach((h) => {
      if (!habitOccursOnDate(h, dateISO)) return;
      const exists = MISSIONS.some((m) => m.habitId === h.id && m.scheduledDate === dateISO);
      if (exists) return;
      MISSIONS.push(makeMissionFromHabit(h, dateISO));
      created = true;
    });
    if (created) saveMissions();
    return created;
  }

  // Missões de dias passados que nunca foram concluídas nem canceladas
  // viram "perdidas" e custam o próprio XP configurado nelas — chamado uma
  // vez a cada boot (não há backend/cron: isso é o mais perto que dá de
  // "avaliar o fim do dia" sem servidor). Idempotente: uma missão só é
  // processada enquanto está em nao_iniciada/em_andamento, então rodar de
  // novo no mesmo boot ou em boots seguintes não penaliza duas vezes.
  function processMissedMissions() {
    const today = todayISO();
    let count = 0, xpLost = 0;
    const affectedHabitIds = new Set();
    MISSIONS.forEach((m) => {
      if (m.date < today && (m.status === 'nao_iniciada' || m.status === 'em_andamento')) {
        const result = window.PdmGamification.recordMissionMissed({ xp: m.xp || 0, category: m.category, label: m.name });
        m.status = 'perdida';
        m.xpPenaltyApplied = result.xpLost;
        count++;
        xpLost += result.xpLost;
        if (m.habitId) affectedHabitIds.add(m.habitId);
      }
    });
    if (count) {
      saveMissions();
      affectedHabitIds.forEach((id) => recomputeAndPersistHabitStats(id));
    }
    return { count, xpLost };
  }

  // Quando a config de um hábito muda de forma estrutural, missões futuras
  // que ainda não foram tocadas pelo usuário são regeradas do zero.
  // Missões já concluídas, canceladas, em andamento ou reagendadas ficam intactas.
  function resyncFutureAutoMissions(habit) {
    const today = todayISO();
    MISSIONS = MISSIONS.filter((m) => !(
      m.habitId === habit.id && m.origin === 'habit' &&
      m.scheduledDate >= today && m.status === 'nao_iniciada'
    ));
    saveMissions();
    ensureMissionsForDate(today);
  }

  // ---------------------------------------------------------------
  // ESTATÍSTICAS DO HÁBITO — sempre calculadas a partir das missões atuais
  // ---------------------------------------------------------------
  function computeHabitStats(habitId) {
    const today = todayISO();
    const occ = MISSIONS
      .filter((m) => m.habitId === habitId)
      .slice()
      .sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : a.scheduledDate > b.scheduledDate ? 1 : 0));
    const past = occ.filter((m) => m.scheduledDate <= today);

    let run = 0, bestStreak = 0, completions = 0, missed = 0, resolved = 0, lastCompletedAt = null;
    past.forEach((m) => {
      const isToday = m.scheduledDate === today;
      if (m.status === 'concluida') {
        completions++; run++; resolved++;
        if (run > bestStreak) bestStreak = run;
        if (!lastCompletedAt || (m.completedAt && m.completedAt > lastCompletedAt)) lastCompletedAt = m.completedAt;
      } else if (isToday && (m.status === 'nao_iniciada' || m.status === 'em_andamento')) {
        // hoje ainda não acabou — não conta como perdido, não quebra a sequência
      } else {
        run = 0; missed++; resolved++;
      }
    });

    return {
      currentStreak: run,
      bestStreak,
      totalCompletions: completions,
      successRate: resolved ? Math.round((completions / resolved) * 100) : 0,
      missedCount: missed,
      lastCompletedAt,
      updatedAt: new Date().toISOString(),
    };
  }

  function recomputeAndPersistHabitStats(habitId) {
    const h = HABITS.find((x) => x.id === habitId);
    if (!h) return;
    h.stats = computeHabitStats(habitId);
    saveHabits();
  }

  // Progresso da META do hábito (habit.goal, ex: "3x por semana") — não
  // confundir com o Objetivo estratégico (entidade separada em js/goals-data.js).
  function computeHabitGoalProgress(habit) {
    if (!habit.goal || habit.goal.type !== 'count_per_period') return null;
    const period = habit.goal.period || 'week';
    const today = todayISO();
    let start;
    if (period === 'month') {
      start = today.slice(0, 8) + '01';
    } else {
      start = addDaysISO(today, -weekdayOf(today));
    }
    const count = MISSIONS.filter((m) => m.habitId === habit.id && m.status === 'concluida' && m.scheduledDate >= start && m.scheduledDate <= today).length;
    return { count, target: habit.goal.target || 0, period };
  }

  // ---------------------------------------------------------------
  // CRUD — HÁBITOS
  // ---------------------------------------------------------------
  function listHabits(opts) {
    opts = opts || {};
    return HABITS
      .filter((h) => opts.includeArchived || !h.archivedAt)
      .slice()
      .sort((a, b) => (a.archivedAt ? 1 : 0) - (b.archivedAt ? 1 : 0) || a.name.localeCompare(b.name, 'pt-BR'));
  }
  function getHabit(id) { return HABITS.find((h) => h.id === id) || null; }

  function createHabit(data) {
    const now = new Date().toISOString();
    const habit = {
      id: uid('h'),
      goalId: data.goalId || null, // vínculo com o Objetivo estratégico (js/goals-data.js)
      name: data.name.trim(),
      description: (data.description || '').trim(),
      category: data.category,
      color: data.color || 'gold',
      icon: data.icon || 'target',
      frequency: data.frequency,
      startDate: data.startDate || now.slice(0, 10),
      endDate: data.endDate || null,
      schedule: data.schedule || { startTime: null, endTime: null, durationMin: null },
      goal: data.goal || { type: 'none' },
      reminder: data.reminder || { type: 'none' },
      xp: data.xp != null ? data.xp : 10,
      priority: data.priority || 'media',
      createdAt: now,
      archivedAt: null,
      stats: { currentStreak: 0, bestStreak: 0, totalCompletions: 0, successRate: 0, missedCount: 0, lastCompletedAt: null, updatedAt: now },
    };
    HABITS.push(habit);
    saveHabits();
    ensureMissionsForDate(todayISO());
    if (window.PdmGamification) {
      const gamResult = window.PdmGamification.recordHabitCreated();
      if (window.pdmShowGamificationFeedback) window.pdmShowGamificationFeedback(gamResult);
    }
    return habit;
  }

  function updateHabit(id, data) {
    const h = HABITS.find((x) => x.id === id);
    if (!h) return null;
    const structuralKeys = ['frequency', 'startDate', 'endDate', 'schedule', 'priority', 'xp', 'goalId'];
    const structuralChanged = structuralKeys.some((k) => data[k] !== undefined && JSON.stringify(data[k]) !== JSON.stringify(h[k]));
    ['name', 'description', 'category', 'color', 'icon', 'frequency', 'startDate', 'endDate', 'schedule', 'goal', 'reminder', 'xp', 'priority', 'goalId'].forEach((k) => {
      if (data[k] !== undefined) h[k] = data[k];
    });
    if (typeof h.name === 'string') h.name = h.name.trim();
    saveHabits();
    if (structuralChanged) resyncFutureAutoMissions(h);
    else ensureMissionsForDate(todayISO());
    return h;
  }

  function archiveHabit(id) {
    const h = HABITS.find((x) => x.id === id);
    if (!h) return null;
    h.archivedAt = new Date().toISOString();
    saveHabits();
    const today = todayISO();
    MISSIONS = MISSIONS.filter((m) => !(m.habitId === id && m.origin === 'habit' && m.scheduledDate >= today && m.status === 'nao_iniciada'));
    saveMissions();
    return h;
  }

  function restoreHabit(id) {
    const h = HABITS.find((x) => x.id === id);
    if (!h) return null;
    h.archivedAt = null;
    saveHabits();
    ensureMissionsForDate(todayISO());
    return h;
  }

  function getHabitMissionHistory(habitId) {
    return MISSIONS.filter((m) => m.habitId === habitId).slice().sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1));
  }

  // ---------------------------------------------------------------
  // CONSULTAS/DESVÍNCULO USADAS PELO MÓDULO DE OBJETIVOS (js/goals-data.js)
  // ---------------------------------------------------------------
  function listHabitsByGoal(goalId) {
    return HABITS.filter((h) => h.goalId === goalId).slice().sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
  function listMissionsByGoal(goalId) {
    return MISSIONS.filter((m) => m.goalId === goalId).slice().sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1));
  }
  // "Excluir um objetivo... apenas remover a associação" — limpa goalId dos
  // hábitos e missões vinculados, sem apagar nada deles.
  function unlinkGoal(goalId) {
    let changed = false;
    HABITS.forEach((h) => { if (h.goalId === goalId) { h.goalId = null; changed = true; } });
    if (changed) saveHabits();
    changed = false;
    MISSIONS.forEach((m) => { if (m.goalId === goalId) { m.goalId = null; changed = true; } });
    if (changed) saveMissions();
  }

  // ---------------------------------------------------------------
  // CRUD — MISSÕES
  // ---------------------------------------------------------------
  function listMissionsForDate(dateISO) {
    return MISSIONS.filter((m) => m.date === dateISO).slice().sort((a, b) => {
      const at = a.time || '99:99', bt = b.time || '99:99';
      if (at !== bt) return at < bt ? -1 : 1;
      const prio = { alta: 0, media: 1, baixa: 2 };
      return (prio[a.priority] ?? 1) - (prio[b.priority] ?? 1);
    });
  }
  function getMission(id) { return MISSIONS.find((m) => m.id === id) || null; }

  function createManualMission(data) {
    const now = new Date().toISOString();
    const m = {
      id: uid('m'),
      habitId: null,
      goalId: data.goalId || null, // missão manual pode, opcionalmente, se ligar a um Objetivo
      origin: 'manual',
      name: data.name.trim(),
      description: (data.description || '').trim(),
      category: data.category || 'trabalho',
      color: data.color || 'gold',
      icon: data.icon || 'flag',
      scheduledDate: data.date,
      date: data.date,
      time: data.time || null,
      endTime: null,
      durationMin: data.durationMin || null,
      priority: data.priority || 'media',
      xp: data.xp != null ? data.xp : 10,
      notes: data.notes || '',
      status: 'nao_iniciada',
      completedAt: null,
      xpAwarded: 0,
      xpPenaltyApplied: 0,
      rescheduleHistory: [],
      createdAt: now,
    };
    MISSIONS.push(m);
    saveMissions();
    return m;
  }

  function updateMission(id, patch) {
    const m = MISSIONS.find((x) => x.id === id);
    if (!m) return null;
    if (patch.date && patch.date !== m.date && !['concluida', 'cancelada'].includes(m.status)) {
      m.rescheduleHistory.push({ from: m.date, to: patch.date, at: new Date().toISOString() });
      m.date = patch.date;
      m.status = 'adiada';
    }
    ['name', 'description', 'category', 'color', 'icon', 'time', 'endTime', 'durationMin', 'priority', 'xp', 'notes', 'goalId'].forEach((k) => {
      if (patch[k] !== undefined) m[k] = patch[k];
    });
    if (typeof m.name === 'string') m.name = m.name.trim();
    saveMissions();
    if (m.habitId) recomputeAndPersistHabitStats(m.habitId);
    return m;
  }

  function rescheduleMission(id, newDate) { return updateMission(id, { date: newDate }); }

  // Guarda o id do evento correspondente no Google Agenda (integração
  // unidirecional: app -> Google, ver js/gcal.js), pra reenvios virarem
  // atualização do mesmo evento em vez de criar um duplicado.
  function setMissionGCalEventId(id, eventId) {
    const m = MISSIONS.find((x) => x.id === id);
    if (!m) return null;
    m.gcalEventId = eventId;
    saveMissions();
    return m;
  }

  // Ninguém pode iniciar/concluir uma missão de um dia futuro — só a partir
  // da data marcada. Isso é reforçado aqui (não só na UI) porque é regra de
  // negócio, não só uma restrição de tela.
  function startMission(id) {
    const m = MISSIONS.find((x) => x.id === id);
    if (!m || ['concluida', 'cancelada', 'perdida'].includes(m.status) || m.date > todayISO()) return null;
    m.status = 'em_andamento';
    saveMissions();
    return m;
  }

  // Uma missão "perdida" precisa ser reaberta antes de poder ser concluída
  // de novo (estorna a penalidade e volta pra não-iniciada) — evita
  // completar por cima da penalidade sem passar pelo fluxo de reabrir.
  function completeMission(id) {
    const m = MISSIONS.find((x) => x.id === id);
    if (!m || ['concluida', 'perdida'].includes(m.status) || m.date > todayISO()) return null;
    m.status = 'concluida';
    m.completedAt = new Date().toISOString();

    // O bônus de "planejamento do dia" só faz sentido pra ação de hoje —
    // reconhece o dia como cumprido quando esta era a última missão em
    // aberto (concluída ou cancelada é considerado resolvido).
    const dayMissions = MISSIONS.filter((x) => x.date === m.date);
    const dailyPlanJustCompleted = m.date === todayISO() && dayMissions.every((x) => ['concluida', 'cancelada'].includes(x.status));

    const result = window.PdmGamification.recordMissionCompleted({
      xp: m.xp || 0,
      category: m.category,
      isHabitMission: m.origin === 'habit',
      durationMin: m.durationMin || 0,
      label: m.name,
      dailyPlanJustCompleted,
    });
    m.xpAwarded = result.xpGained;
    saveMissions();
    if (m.habitId) recomputeAndPersistHabitStats(m.habitId);
    return result;
  }

  // Reabre uma missão concluída, cancelada OU perdida, voltando pra "não
  // iniciada". Se ela tinha XP concedido (caso 'concluida') ou penalidade
  // aplicada (caso 'perdida'), o XP é estornado.
  function reopenMission(id) {
    const m = MISSIONS.find((x) => x.id === id);
    if (!m || !['concluida', 'cancelada', 'perdida'].includes(m.status)) return null;
    if (m.status === 'concluida' && m.xpAwarded) {
      window.PdmGamification.revertMissionCompletion({ category: m.category, xpAwarded: m.xpAwarded });
    }
    if (m.status === 'perdida' && m.xpPenaltyApplied) {
      window.PdmGamification.revertMissionMissed({ category: m.category, xpLost: m.xpPenaltyApplied, label: m.name });
    }
    m.status = 'nao_iniciada';
    m.completedAt = null;
    m.xpAwarded = 0;
    m.xpPenaltyApplied = 0;
    saveMissions();
    if (m.habitId) recomputeAndPersistHabitStats(m.habitId);
    return true;
  }

  function cancelMission(id) {
    const m = MISSIONS.find((x) => x.id === id);
    if (!m || m.status === 'concluida') return null;
    m.status = 'cancelada';
    saveMissions();
    if (m.habitId) recomputeAndPersistHabitStats(m.habitId);
    return m;
  }

  function deleteMission(id) {
    const idx = MISSIONS.findIndex((x) => x.id === id);
    if (idx === -1) return false;
    const m = MISSIONS[idx];
    if (m.status === 'concluida' && m.xpAwarded) {
      window.PdmGamification.revertMissionCompletion({ category: m.category, xpAwarded: m.xpAwarded });
    }
    if (m.status === 'perdida' && m.xpPenaltyApplied) {
      window.PdmGamification.revertMissionMissed({ category: m.category, xpLost: m.xpPenaltyApplied, label: m.name });
    }
    const habitId = m.habitId;
    MISSIONS.splice(idx, 1);
    saveMissions();
    if (habitId) recomputeAndPersistHabitStats(habitId);
    return true;
  }

  // Usado pelo "Zerar todo o progresso": apaga todos os hábitos e missões e
  // recomeça do zero com os hábitos padrão (mesmo caminho do primeiro uso).
  function resetAll() {
    HABITS = [];
    MISSIONS = [];
    saveHabits();
    saveMissions();
    seedDefaultHabits();
    ensureMissionsForDate(todayISO());
  }

  window.PdmHM = {
    resetAll,
    init,
    habitOccursOnDate,
    ensureMissionsForDate,
    processMissedMissions,
    listHabits,
    getHabit,
    createHabit,
    updateHabit,
    archiveHabit,
    restoreHabit,
    getHabitMissionHistory,
    listHabitsByGoal,
    listMissionsByGoal,
    unlinkGoal,
    computeHabitGoalProgress,
    listMissionsForDate,
    getMission,
    createManualMission,
    updateMission,
    rescheduleMission,
    setMissionGCalEventId,
    startMission,
    completeMission,
    reopenMission,
    cancelMission,
    deleteMission,
  };
})();
