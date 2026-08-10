// Camada de Estatísticas e Evolução — consolida e analisa dados que já
// existem em outros módulos. É o ÚNICO módulo do app com permissão de
// depender simultaneamente de Hábitos & Missões, Objetivos e Gamificação
// (todo o resto do app mantém esses três desacoplados entre si de
// propósito) — porque análise cross-domain é literalmente a razão desse
// módulo existir. Só LÊ, nunca escreve de volta em nenhum dos três: XP,
// nível, streak, Battle Pass, conquistas, progresso de objetivo e
// estatística de hábito continuam sendo calculados só pelos módulos donos
// (PdmGamification/PdmGoals/PdmHM) — este arquivo nunca duplica essas
// regras, só lê o resultado já calculado e agrega por período/filtro.
//
// Princípio inegociável: nenhuma métrica aqui é inventada. Quando não há
// dado suficiente pra calcular algo com confiança (ex: taxa de conclusão
// sem nenhuma missão resolvida no período), a função devolve `null` pro
// campo, nunca um 0 disfarçado de resultado real — quem decide como exibir
// "dados insuficientes" é a UI (js/stats-ui.js), não este arquivo.

(function () {
  // ---------------------------------------------------------------
  // PERÍODOS
  // ---------------------------------------------------------------
  const PERIOD_LABELS = {
    today: 'Hoje',
    '7d': 'Últimos 7 dias',
    '30d': 'Últimos 30 dias',
    '90d': 'Últimos 90 dias',
    year: 'Este ano',
    custom: 'Período personalizado',
  };

  function getPeriodRange(key, customStart, customEnd) {
    const today = todayISO();
    let start, end = today;
    switch (key) {
      case 'today': start = today; break;
      case '7d': start = addDaysISO(today, -6); break;
      case '30d': start = addDaysISO(today, -29); break;
      case '90d': start = addDaysISO(today, -89); break;
      case 'year': start = today.slice(0, 4) + '-01-01'; break;
      case 'custom':
        start = customStart && customStart <= (customEnd || today) ? customStart : addDaysISO(today, -6);
        end = customEnd || today;
        break;
      default: key = '7d'; start = addDaysISO(today, -6);
    }
    if (end > today) end = today; // nunca analisa o futuro
    const days = daysBetween(start, end) + 1;
    return { key, start, end, days, label: PERIOD_LABELS[key] || 'Personalizado' };
  }

  // Período imediatamente anterior, com a mesma duração — base de toda
  // comparação "período atual vs. anterior" pedida na spec.
  function getPreviousRange(range) {
    const end = addDaysISO(range.start, -1);
    const start = addDaysISO(end, -(range.days - 1));
    return { key: range.key, start, end, days: range.days, label: 'Período anterior' };
  }

  function inRange(dateISO, range) { return dateISO >= range.start && dateISO <= range.end; }

  // ---------------------------------------------------------------
  // FILTROS — objetivo / habilidade / hábito / tipo de missão. Aplicados
  // sempre sobre uma lista de missões já buscada por período.
  // ---------------------------------------------------------------
  function applyMissionFilters(missions, filters) {
    if (!filters) return missions;
    return missions.filter((m) => {
      if (filters.goalId && m.goalId !== filters.goalId) return false;
      if (filters.skillKey && m.category !== filters.skillKey) return false;
      if (filters.habitId && m.habitId !== filters.habitId) return false;
      if (filters.origin && m.origin !== filters.origin) return false;
      return true;
    });
  }

  function missionsForRange(range, filters) {
    return applyMissionFilters(window.PdmHM.listMissionsInRange(range.start, range.end), filters);
  }

  // ---------------------------------------------------------------
  // AGREGAÇÃO BÁSICA DE STATUS — usada por Visão Geral, Missões, Hábitos e
  // Objetivos, todos com a mesma definição de "taxa de conclusão".
  // ---------------------------------------------------------------
  function summarizeStatus(missions) {
    const completed = missions.filter((m) => m.status === 'concluida');
    const pending = missions.filter((m) => m.status === 'nao_iniciada' || m.status === 'em_andamento');
    const overdue = missions.filter((m) => m.status === 'perdida');
    const cancelled = missions.filter((m) => m.status === 'cancelada');
    const rescheduled = missions.filter((m) => m.rescheduleHistory && m.rescheduleHistory.length > 0);
    const resolved = completed.length + overdue.length + cancelled.length;
    const onTime = completed.filter((m) => m.completedAt && m.completedAt.slice(0, 10) <= m.scheduledDate);
    return {
      total: missions.length,
      completed: completed.length,
      pending: pending.length,
      overdue: overdue.length,
      cancelled: cancelled.length,
      rescheduled: rescheduled.length,
      completionRate: resolved ? Math.round((completed.length / resolved) * 100) : null,
      onTimeRate: completed.length ? Math.round((onTime.length / completed.length) * 100) : null,
    };
  }

  // ---------------------------------------------------------------
  // HISTÓRICO DE XP (PdmGamification.getHistory) — já é um ledger com
  // timestamp por evento, cobrindo missão concluída/perdida, objetivo
  // concluído, bônus de habilidade e de planejamento do dia. Limitado aos
  // últimos 200 eventos (ver js/gamification-data.js) — se o período pedido
  // for mais antigo que o evento mais velho ainda no log, o total pode estar
  // incompleto; `possiblyTruncated` sinaliza isso pra UI avisar em vez de
  // fingir precisão que não existe.
  function sumHistoryXp(range) {
    const history = window.PdmGamification.getHistory();
    const inR = history.filter((h) => inRange(h.at.slice(0, 10), range));
    const xp = inR.reduce((acc, h) => acc + h.xp, 0);
    const oldestCovered = history.length ? history[history.length - 1].at.slice(0, 10) : null;
    const possiblyTruncated = history.length >= 200 && (!oldestCovered || oldestCovered > range.start);
    return { xp, eventCount: inR.length, possiblyTruncated };
  }

  // ---------------------------------------------------------------
  // SÉRIE DIÁRIA — base do heatmap e da "Evolução diária". Um dia conta pra
  // essa série quando tem pelo menos uma missão CONCLUÍDA com completedAt
  // naquele dia (mesma semântica de "dia ativo" da streak, ver
  // gamification-data.js registerStreakDay).
  // ---------------------------------------------------------------
  function computeDailySeries(range, filters) {
    const missions = applyMissionFilters(window.PdmHM.listAllMissions(), filters)
      .filter((m) => m.status === 'concluida' && m.completedAt);
    const byDay = {};
    missions.forEach((m) => {
      const day = m.completedAt.slice(0, 10);
      if (!inRange(day, range)) return;
      if (!byDay[day]) byDay[day] = { completed: 0, xp: 0 };
      byDay[day].completed += 1;
      byDay[day].xp += m.xpAwarded || 0;
    });
    const days = [];
    let d = range.start;
    let guard = 0;
    while (d <= range.end && guard < 3660) { // trava de segurança, nunca deveria chegar perto disso
      const e = byDay[d];
      days.push({ date: d, completed: e ? e.completed : 0, xp: e ? e.xp : 0 });
      d = addDaysISO(d, 1);
      guard++;
    }
    return days;
  }

  function average(nums) { return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null; }

  // Agrupa a série diária em semanas (segunda a domingo) — usado pra média
  // semanal/mensal e melhor/pior período dentro da Evolução da Disciplina.
  function weekStartOf(dateISO) {
    const dow = weekdayOf(dateISO); // 0=domingo
    const offset = (dow + 6) % 7; // dias desde a última segunda
    return addDaysISO(dateISO, -offset);
  }
  function groupByWeek(dailySeries) {
    const byWeek = {};
    dailySeries.forEach((d) => {
      const wk = weekStartOf(d.date);
      if (!byWeek[wk]) byWeek[wk] = { weekStart: wk, completed: 0, xp: 0, days: 0 };
      byWeek[wk].completed += d.completed;
      byWeek[wk].xp += d.xp;
      byWeek[wk].days += 1;
    });
    return Object.values(byWeek).sort((a, b) => (a.weekStart < b.weekStart ? -1 : 1));
  }
  function groupByMonth(dailySeries) {
    const byMonth = {};
    dailySeries.forEach((d) => {
      const mk = d.date.slice(0, 7);
      if (!byMonth[mk]) byMonth[mk] = { month: mk, completed: 0, xp: 0, days: 0 };
      byMonth[mk].completed += d.completed;
      byMonth[mk].xp += d.xp;
      byMonth[mk].days += 1;
    });
    return Object.values(byMonth).sort((a, b) => (a.month < b.month ? -1 : 1));
  }

  // "Evolução da Disciplina": só usa dados reais (execução diária) — não
  // existe ainda um Disciplina Score consolidado (composto/ponderado), por
  // isso getDisciplineScore() abaixo devolve null explicitamente em vez de
  // fabricar um número. Quando esse módulo existir, só essa função precisa
  // mudar — o resto (UI, período, comparações) já está pronto pra consumir.
  function getDisciplineScore() { return null; }

  function computeDisciplineEvolution(range, filters) {
    const daily = computeDailySeries(range, filters);
    const weeks = groupByWeek(daily);
    const months = groupByMonth(daily);
    const daysWithActivity = daily.filter((d) => d.completed > 0);
    const bestDay = daysWithActivity.length ? daysWithActivity.slice().sort((a, b) => b.completed - a.completed)[0] : null;
    const worstDayCandidates = daily.filter((d) => d.completed === 0);
    return {
      daily,
      weeklyAvgCompletions: weeks.length ? average(weeks.map((w) => w.completed)) : null,
      monthlyAvgCompletions: months.length ? average(months.map((m) => m.completed)) : null,
      bestDay,
      worstDaysCount: worstDayCandidates.length,
      disciplineScore: getDisciplineScore(),
    };
  }

  // ---------------------------------------------------------------
  // HEATMAP — estilo GitHub. Intensidade é RELATIVA à própria distribuição
  // do usuário no ano (quartis dos dias com atividade), não um limiar fixo
  // tipo "5+ = excelente" — evitar incentivar excesso, só mostrar
  // consistência (pedido explícito da spec).
  // ---------------------------------------------------------------
  function computeHeatmapYear(year, filters) {
    const start = year + '-01-01';
    const end = year + '-12-31';
    const range = { start, end, days: daysBetween(start, end) + 1 };
    const daily = computeDailySeries(range, filters);
    const nonZero = daily.filter((d) => d.completed > 0).map((d) => d.completed).sort((a, b) => a - b);
    let q1 = 0, q2 = 0, q3 = 0;
    if (nonZero.length) {
      q1 = nonZero[Math.floor(nonZero.length * 0.25)];
      q2 = nonZero[Math.floor(nonZero.length * 0.5)];
      q3 = nonZero[Math.floor(nonZero.length * 0.75)];
    }
    function bucket(count) {
      if (count === 0) return 0;
      if (count <= q1 || count <= 1) return 1;
      if (count <= q2) return 2;
      if (count <= q3) return 3;
      return 4;
    }
    return {
      year,
      days: daily.map((d) => ({ date: d.date, count: d.completed, level: bucket(d.completed) })),
      activeDaysCount: nonZero.length,
      totalCompletions: nonZero.reduce((a, b) => a + b, 0),
    };
  }

  // ---------------------------------------------------------------
  // VISÃO GERAL
  // ---------------------------------------------------------------
  function computeOverviewRaw(range, filters) {
    const missions = missionsForRange(range, filters);
    const status = summarizeStatus(missions);
    const habitExecutions = missions.filter((m) => m.status === 'concluida' && m.origin === 'habit').length;
    const xpInfo = sumHistoryXp(range);
    const goals = window.PdmGoals.listGoals();
    const activeGoals = goals.filter((g) => g.status === 'em_andamento' || g.status === 'nao_iniciado').length;
    const activeSkills = window.PdmGamification.getActiveSkills();
    const skillsWithXp = activeSkills.filter((s) => window.PdmGamification.getSkillXp(s.key) > 0).length;
    return {
      missionsCompleted: status.completed,
      missionsPending: status.pending,
      missionsOverdue: status.overdue,
      executionRate: status.completionRate,
      habitsExecuted: habitExecutions,
      xpGained: xpInfo.xp,
      xpPossiblyTruncated: xpInfo.possiblyTruncated,
      activeGoals,
      skillsInDevelopment: skillsWithXp,
    };
  }

  function pctDelta(curr, prev) {
    if (curr == null || prev == null) return null;
    if (prev === 0) return curr === 0 ? 0 : null; // variação percentual não é definível saindo de zero
    return Math.round(((curr - prev) / prev) * 100);
  }
  function ppDelta(curr, prev) { // diferença em pontos percentuais (pra taxas)
    if (curr == null || prev == null) return null;
    return curr - prev;
  }

  function computeOverview(range, filters) {
    const curr = computeOverviewRaw(range, filters);
    const prevRange = getPreviousRange(range);
    const prev = computeOverviewRaw(prevRange, filters);
    const streak = window.PdmGamification.getStreak();
    return {
      range, previousRange: prevRange,
      current: curr, previous: prev,
      deltas: {
        missionsCompleted: pctDelta(curr.missionsCompleted, prev.missionsCompleted),
        executionRate: ppDelta(curr.executionRate, prev.executionRate),
        xpGained: pctDelta(curr.xpGained, prev.xpGained),
        habitsExecuted: pctDelta(curr.habitsExecuted, prev.habitsExecuted),
      },
      currentStreak: streak.count,
      bestStreak: streak.best,
    };
  }

  // ---------------------------------------------------------------
  // MISSÕES
  // ---------------------------------------------------------------
  function computeMissionStats(range, filters) {
    const missions = missionsForRange(range, filters);
    const status = summarizeStatus(missions);
    return Object.assign({ dailySeries: computeDailySeries(range, filters) }, status);
  }

  // ---------------------------------------------------------------
  // HÁBITOS
  // ---------------------------------------------------------------
  function computeHabitStatsSection(range, filters) {
    const habits = window.PdmHM.listHabits();
    const perHabit = habits.map((h) => {
      const hist = window.PdmHM.getHabitMissionHistory(h.id).filter((m) => inRange(m.scheduledDate, range));
      const s = summarizeStatus(hist);
      return {
        id: h.id, name: h.name, icon: h.icon, color: h.color, category: h.category,
        executions: s.completed, rate: s.completionRate,
        currentStreak: h.stats.currentStreak, bestStreak: h.stats.bestStreak,
      };
    });
    const withRate = perHabit.filter((h) => h.rate != null);
    const mostConsistent = withRate.slice().sort((a, b) => b.rate - a.rate).slice(0, 3);
    const leastConsistent = withRate.slice().sort((a, b) => a.rate - b.rate).slice(0, 3);
    const streak = window.PdmGamification.getStreak();
    return {
      totalActive: habits.length,
      totalExecutions: perHabit.reduce((a, h) => a + h.executions, 0),
      perHabit,
      mostConsistent,
      leastConsistent,
      currentStreak: streak.count,
      bestStreak: streak.best,
    };
  }

  // ---------------------------------------------------------------
  // OBJETIVOS
  // ---------------------------------------------------------------
  function computeGoalStatsSection(range, filters) {
    const goals = window.PdmGoals.listGoals();
    const byStatus = { nao_iniciado: 0, em_andamento: 0, concluido: 0, pausado: 0, cancelado: 0 };
    goals.forEach((g) => { byStatus[g.status] = (byStatus[g.status] || 0) + 1; });
    const completedInRange = goals.filter((g) => g.completedAt && inRange(g.completedAt.slice(0, 10), range));

    const perGoal = goals.map((g) => {
      const progress = window.PdmGoals.computeGoalProgress(g);
      const gStats = window.PdmGoals.computeGoalStats(g);
      const missions = applyMissionFilters(window.PdmHM.listMissionsByGoal(g.id).filter((m) => inRange(m.scheduledDate, range)), filters);
      const s = summarizeStatus(missions);
      return {
        id: g.id, name: g.name, category: g.category, status: g.status,
        progressPct: progress.pct, habitsCount: gStats.habitsCount,
        missionsInRange: missions.length, executionRate: s.completionRate,
      };
    });
    const activeWithProgress = perGoal.filter((g) => g.status === 'em_andamento' || g.status === 'nao_iniciado');
    const avgProgress = activeWithProgress.length ? Math.round(average(activeWithProgress.map((g) => g.progressPct))) : null;
    const sorted = activeWithProgress.slice().sort((a, b) => b.progressPct - a.progressPct);
    return {
      active: byStatus.em_andamento + byStatus.nao_iniciado,
      completed: byStatus.concluido,
      paused: byStatus.pausado,
      cancelled: byStatus.cancelado,
      completedInRangeCount: completedInRange.length,
      avgProgress,
      best: sorted[0] || null,
      worst: sorted.length > 1 ? sorted[sorted.length - 1] : null,
      perGoal,
    };
  }

  // ---------------------------------------------------------------
  // HABILIDADES — reaproveita PdmGamification integralmente, não recria
  // nada de XP/nível.
  // ---------------------------------------------------------------
  function computeSkillStatsSection(range, filters) {
    const skills = window.PdmGamification.getActiveSkills();
    const completedInRange = missionsForRange(range, filters).filter((m) => m.status === 'concluida');
    const missedInRange = missionsForRange(range, filters).filter((m) => m.status === 'perdida');
    const perSkill = skills.map((s) => {
      const info = window.PdmGamification.getSkillLevelInfo(s.key);
      const gained = completedInRange.filter((m) => m.category === s.key).reduce((a, m) => a + (m.xpAwarded || 0), 0);
      const lost = missedInRange.filter((m) => m.category === s.key).reduce((a, m) => a + (m.xpPenaltyApplied || 0), 0);
      const netInRange = gained - lost;
      const missionsCompletedInRange = completedInRange.filter((m) => m.category === s.key).length;
      const xpBeforeRange = info.xp - netInRange;
      const evolutionPct = xpBeforeRange > 0 ? Math.round((netInRange / xpBeforeRange) * 100) : null;
      return {
        key: s.key, name: s.name, icon: s.icon, color: s.color,
        level: info.level, xp: info.xp, progressPct: info.progressPct,
        xpGainedInRange: netInRange, missionsCompletedInRange, evolutionPct,
      };
    });
    const developing = perSkill.filter((s) => s.xpGainedInRange > 0);
    const mostEvolved = developing.length ? developing.slice().sort((a, b) => b.xpGainedInRange - a.xpGainedInRange)[0] : null;
    const leastEvolved = developing.length > 1 ? developing.slice().sort((a, b) => a.xpGainedInRange - b.xpGainedInRange)[0] : null;
    return { perSkill, developingCount: developing.length, mostEvolved, leastEvolved };
  }

  function getSkillDetail(key, range, filters) {
    const meta = window.PdmGamification.getSkillMeta(key);
    if (!meta) return null;
    const info = window.PdmGamification.getSkillLevelInfo(key);
    const missionsAllTime = window.PdmHM.listAllMissions().filter((m) => m.category === key && m.status === 'concluida');
    const habits = window.PdmHM.listHabits().filter((h) => h.category === key);
    const inRangeStats = computeSkillStatsSection(range, filters).perSkill.find((s) => s.key === key) || null;
    return {
      key, name: meta.name, icon: meta.icon, color: meta.color,
      level: info.level, xp: info.xp, progressPct: info.progressPct,
      missionsCompletedAllTime: missionsAllTime.length,
      habitsRelated: habits.length,
      evolutionInRangePct: inRangeStats ? inRangeStats.evolutionPct : null,
      xpGainedInRange: inRangeStats ? inRangeStats.xpGainedInRange : 0,
    };
  }

  // ---------------------------------------------------------------
  // GAMIFICAÇÃO
  // ---------------------------------------------------------------
  function computeGamificationSection(range) {
    const xpInfo = sumHistoryXp(range);
    const levelInfo = window.PdmGamification.getLevelInfo();
    const streak = window.PdmGamification.getStreak();
    const achievements = window.PdmGamification.getAchievements()
      .filter((a) => inRange(a.unlockedAt.slice(0, 10), range));
    const tiers = window.PdmGamification.getTiers();
    const tiersReached = tiers.filter((t) => levelInfo.xp >= t.xp).length;
    return {
      xpGained: xpInfo.xp, xpPossiblyTruncated: xpInfo.possiblyTruncated,
      level: levelInfo, streak,
      achievementsUnlockedInRange: achievements,
      tiersReached, totalTiers: tiers.length,
    };
  }

  // ---------------------------------------------------------------
  // RECORDES (vitalícios — não são escopados por período)
  // ---------------------------------------------------------------
  function computeRecords() {
    const allCompleted = window.PdmHM.listAllMissions().filter((m) => m.status === 'concluida' && m.completedAt);
    const byDay = {}, byWeek = {};
    allCompleted.forEach((m) => {
      const day = m.completedAt.slice(0, 10);
      const wk = weekStartOf(day);
      byDay[day] = (byDay[day] || 0) + 1;
      byWeek[wk] = (byWeek[wk] || 0) + 1;
    });
    const bestDayEntry = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
    const bestWeekEntry = Object.entries(byWeek).sort((a, b) => b[1] - a[1])[0];

    const byDayXp = {};
    allCompleted.forEach((m) => { const day = m.completedAt.slice(0, 10); byDayXp[day] = (byDayXp[day] || 0) + (m.xpAwarded || 0); });
    const bestXpDayEntry = Object.entries(byDayXp).sort((a, b) => b[1] - a[1])[0];

    const streak = window.PdmGamification.getStreak();

    const skills = window.PdmGamification.getSkills();
    const topSkillByXp = skills
      .map((s) => ({ key: s.key, name: s.name, xp: window.PdmGamification.getSkillXp(s.key) }))
      .sort((a, b) => b.xp - a.xp)[0] || null;

    const goals = window.PdmGoals.listGoals();
    const topGoalByProgress = goals
      .map((g) => ({ id: g.id, name: g.name, pct: window.PdmGoals.computeGoalProgress(g).pct }))
      .sort((a, b) => b.pct - a.pct)[0] || null;

    return {
      bestStreak: streak.best || null,
      bestDay: bestDayEntry ? { date: bestDayEntry[0], count: bestDayEntry[1] } : null,
      bestWeek: bestWeekEntry ? { weekStart: bestWeekEntry[0], count: bestWeekEntry[1] } : null,
      bestXpDay: bestXpDayEntry ? { date: bestXpDayEntry[0], xp: bestXpDayEntry[1] } : null,
      topSkill: topSkillByXp && topSkillByXp.xp > 0 ? topSkillByXp : null,
      topGoal: topGoalByProgress && topGoalByProgress.pct > 0 ? topGoalByProgress : null,
    };
  }

  // ---------------------------------------------------------------
  // COMPARAÇÕES — atalhos pra pares comuns pedidos na spec, todos
  // reaproveitando computeOverviewRaw/summarizeStatus.
  // ---------------------------------------------------------------
  function computeComparison(kind, filters) {
    const today = todayISO();
    let curr, prev, label;
    if (kind === 'today_vs_yesterday') {
      curr = { start: today, end: today, days: 1 };
      prev = { start: addDaysISO(today, -1), end: addDaysISO(today, -1), days: 1 };
      label = 'Hoje vs. ontem';
    } else if (kind === 'week_vs_last_week') {
      const wStart = weekStartOf(today);
      curr = { start: wStart, end: today, days: daysBetween(wStart, today) + 1 };
      prev = getPreviousRange(curr);
      label = 'Esta semana vs. semana anterior';
    } else { // month_vs_last_month
      const mStart = today.slice(0, 8) + '01';
      curr = { start: mStart, end: today, days: daysBetween(mStart, today) + 1 };
      prev = getPreviousRange(curr);
      label = 'Este mês vs. mês anterior';
    }
    const currStats = summarizeStatus(missionsForRange(curr, filters));
    const prevStats = summarizeStatus(missionsForRange(prev, filters));
    return {
      label, currentRange: curr, previousRange: prev,
      executionRate: { current: currStats.completionRate, previous: prevStats.completionRate, deltaPP: ppDelta(currStats.completionRate, prevStats.completionRate) },
      completed: { current: currStats.completed, previous: prevStats.completed, deltaPct: pctDelta(currStats.completed, prevStats.completed) },
    };
  }

  // ---------------------------------------------------------------
  // INSIGHTS — só regra + dado real, sem IA (ver spec: IA Coach é feature
  // futura que vai CONSUMIR essas estatísticas, não faz parte desta).
  // Cada insight só aparece se houver dado real o suficiente pra sustentá-lo.
  // ---------------------------------------------------------------
  function timeOfDayBucket(hhmm) {
    const h = Number(hhmm.slice(0, 2));
    if (h < 12) return 'manhã';
    if (h < 18) return 'tarde';
    return 'noite';
  }

  function computeInsights(range, filters) {
    const insights = [];
    const streak = window.PdmGamification.getStreak();
    if (streak.count >= 3) {
      insights.push({ key: 'streak', text: 'Você manteve uma sequência de ' + streak.count + (streak.count === 1 ? ' dia' : ' dias') + '.' });
    }

    // Consistência: compara taxa de conclusão do período atual com os 2
    // períodos completos anteriores de mesma duração — só fala "melhor
    // consistência" se realmente for a maior das três.
    const p0 = summarizeStatus(missionsForRange(range, filters));
    const r1 = getPreviousRange(range);
    const r2 = getPreviousRange(r1);
    const p1 = summarizeStatus(missionsForRange(r1, filters));
    const p2 = summarizeStatus(missionsForRange(r2, filters));
    if (p0.completionRate != null && p1.completionRate != null && p2.completionRate != null) {
      if (p0.completionRate >= p1.completionRate && p0.completionRate >= p2.completionRate && p0.completionRate > 0) {
        insights.push({ key: 'best_consistency', text: 'Você teve sua melhor consistência em ' + range.label.toLowerCase() + ', comparado aos dois períodos anteriores.' });
      }
    }

    // Missões por horário do dia — só considera missões com horário definido.
    const allWithTime = missionsForRange(range, filters).filter((m) => m.time && m.status === 'concluida');
    const allResolvedWithTime = missionsForRange(range, filters).filter((m) => m.time && ['concluida', 'perdida', 'cancelada'].includes(m.status));
    if (allResolvedWithTime.length >= 5) {
      const buckets = { manhã: { c: 0, r: 0 }, tarde: { c: 0, r: 0 }, noite: { c: 0, r: 0 } };
      allResolvedWithTime.forEach((m) => {
        const b = timeOfDayBucket(m.time);
        buckets[b].r++;
        if (m.status === 'concluida') buckets[b].c++;
      });
      let bestBucket = null, bestRate = -1;
      Object.keys(buckets).forEach((b) => {
        if (buckets[b].r >= 3) {
          const rate = buckets[b].c / buckets[b].r;
          if (rate > bestRate) { bestRate = rate; bestBucket = b; }
        }
      });
      if (bestBucket) {
        insights.push({ key: 'time_of_day', text: 'Suas missões têm maior taxa de conclusão pela ' + bestBucket + ' (' + Math.round(bestRate * 100) + '%).' });
      }
    }

    // Objetivo com mais execução na semana atual.
    const wStart = weekStartOf(todayISO());
    const weekRange = { start: wStart, end: todayISO(), days: daysBetween(wStart, todayISO()) + 1 };
    const goals = window.PdmGoals.listGoals();
    let topGoal = null, topGoalCount = 0;
    goals.forEach((g) => {
      const c = window.PdmHM.listMissionsByGoal(g.id).filter((m) => inRange(m.scheduledDate, weekRange) && m.status === 'concluida').length;
      if (c > topGoalCount) { topGoalCount = c; topGoal = g; }
    });
    if (topGoal && topGoalCount >= 2) {
      insights.push({ key: 'top_goal_week', text: 'Seu objetivo "' + topGoal.name + '" recebeu mais execução nesta semana (' + topGoalCount + (topGoalCount === 1 ? ' missão)' : ' missões)') + '.' });
    }

    return insights;
  }

  window.PdmStats = {
    getPeriodRange, getPreviousRange,
    groupByWeek, groupByMonth,
    computeOverview,
    computeDisciplineEvolution, getDisciplineScore,
    computeHeatmapYear,
    computeMissionStats,
    computeHabitStatsSection,
    computeGoalStatsSection,
    computeSkillStatsSection, getSkillDetail,
    computeGamificationSection,
    computeRecords,
    computeComparison,
    computeInsights,
  };
})();
