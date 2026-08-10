// UI de Estatísticas e Evolução — consome só window.PdmStats (camada de
// leitura/agregação, nunca dono de regra nenhuma) pra montar a view
// "estatisticas". Recalcula tudo do zero a cada render (pdmRenderStats),
// de propósito: só roda quando a view está aberta (pdmGoto/pdmStats* — ver
// index.html), nunca dentro do renderAll() global, porque agregações sobre
// hábitos/missões/objetivos/habilidades não precisam ficar frescas o tempo
// todo, só quando o usuário está de fato olhando pra elas (evita
// recalcular à toa em toda mutação do app, ver CLAUDE.md "Performance").

(function () {
  let statsState = {
    periodKey: '7d',
    customStart: null,
    customEnd: null,
    filters: { goalId: '', skillKey: '', habitId: '', origin: '' },
    heatmapYear: new Date().getFullYear(),
  };

  function currentRange() {
    return PdmStats.getPeriodRange(statsState.periodKey, statsState.customStart, statsState.customEnd);
  }
  function currentFilters() {
    const f = {};
    if (statsState.filters.goalId) f.goalId = statsState.filters.goalId;
    if (statsState.filters.skillKey) f.skillKey = statsState.filters.skillKey;
    if (statsState.filters.habitId) f.habitId = statsState.filters.habitId;
    if (statsState.filters.origin) f.origin = statsState.filters.origin;
    return f;
  }

  function hasAnyData() {
    return window.PdmHM.listAllMissions().length > 0 || window.PdmHM.listHabits().length > 0;
  }

  // ---------------------------------------------------------------
  // HELPERS DE MARKUP
  // ---------------------------------------------------------------
  function fmtDate(iso) { return iso ? isoToDate(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'; }
  function fmtDateFull(iso) { return iso ? isoToDate(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'; }

  function deltaBadge(delta, unit) {
    if (delta == null) return '';
    const sign = delta > 0 ? '+' : '';
    const cls = delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'zero';
    return '<span class="pdm-stats-delta ' + cls + '">' + sign + delta + (unit || '') + '</span>';
  }

  function overviewTile(value, label, delta, deltaUnit, insufficientMsg) {
    const shown = value == null ? '—' : value;
    return '<div class="pdm-stat-tile">' +
        '<b>' + shown + '</b>' +
        '<span>' + label + '</span>' +
        (value == null ? '<div class="pdm-stats-insufficient">' + (insufficientMsg || 'Sem dados suficientes') + '</div>' : deltaBadge(delta, deltaUnit)) +
      '</div>';
  }

  function progressBarHtml(pct) {
    const p = clampPct(pct || 0);
    return '<div class="pdm-skill-bar"><div class="pdm-skill-bar-fill" style="width:' + p + '%"></div></div>';
  }

  function section(id, title, bodyHtml, openByDefault) {
    return '<details class="pdm-stats-section"' + (openByDefault ? ' open' : '') + ' id="' + id + '">' +
      '<summary>' + title + '</summary>' +
      '<div class="pdm-stats-section-body">' + bodyHtml + '</div>' +
      '</details>';
  }

  function emptyNote(text) { return '<p class="pdm-stats-empty-note">' + text + '</p>'; }

  // ---------------------------------------------------------------
  // GRÁFICO DE BARRAS SIMPLES (execução diária/semanal) — sem lib externa,
  // mesma filosofia do resto do app (CSS puro).
  // ---------------------------------------------------------------
  function barsHtml(series, valueKey, labelFn) {
    if (!series.length) return emptyNote('Sem dados nesse período ainda.');
    const max = Math.max(1, ...series.map((s) => s[valueKey]));
    return '<div class="pdm-stats-bars">' + series.map((s) => {
      const v = s[valueKey];
      const h = Math.round((v / max) * 100);
      return '<div class="pdm-stats-bar-col" title="' + labelFn(s) + ': ' + v + '">' +
        '<div class="pdm-stats-bar' + (v === 0 ? ' zero' : '') + '" style="height:' + Math.max(h, v > 0 ? 6 : 2) + '%"></div>' +
      '</div>';
    }).join('') + '</div>';
  }

  // Se o período tem mais de 60 dias, agrupa por semana pra não desenhar
  // 90+ barras minúsculas ilegíveis no mobile.
  function chartSeriesForRange(daily, range) {
    if (range.days <= 60) return { series: daily, key: 'completed', labelFn: (s) => fmtDate(s.date), granularity: 'day' };
    const weekly = PdmStats.groupByWeek ? PdmStats.groupByWeek(daily) : null;
    return { series: weekly || daily, key: 'completed', labelFn: (s) => 'Semana de ' + fmtDate(s.weekStart || s.date), granularity: 'week' };
  }

  // ---------------------------------------------------------------
  // CONTROLES — período + filtros
  // ---------------------------------------------------------------
  function renderControls(range) {
    const goals = window.PdmGoals.listGoals();
    const skills = window.PdmGamification.getActiveSkills();
    const habits = window.PdmHM.listHabits();
    const customFields = statsState.periodKey === 'custom'
      ? '<div class="pdm-field-row">' +
          field('De', '<input class="pdm-input" type="date" id="pdmStatsCustomStart" value="' + (statsState.customStart || range.start) + '" onchange="pdmStatsSetCustomRange()">') +
          field('Até', '<input class="pdm-input" type="date" id="pdmStatsCustomEnd" value="' + (statsState.customEnd || range.end) + '" onchange="pdmStatsSetCustomRange()">') +
        '</div>'
      : '';
    return '<div class="pdm-panel">' +
        '<div class="pdm-eyebrow">Estatísticas</div>' +
        field('Período', '<select class="pdm-select" onchange="pdmStatsSetPeriod(this.value)">' +
          ['today', '7d', '30d', '90d', 'year', 'custom'].map((k) =>
            '<option value="' + k + '"' + (k === statsState.periodKey ? ' selected' : '') + '>' + PdmStats.getPeriodRange(k).label + '</option>'
          ).join('') + '</select>') +
        customFields +
        '<p class="pdm-stats-range-label">Analisando: <b>' + fmtDateFull(range.start) + '</b> até <b>' + fmtDateFull(range.end) + '</b></p>' +
        '<details class="pdm-stats-filters">' +
          '<summary>Filtros' + (Object.keys(currentFilters()).length ? ' (ativos)' : '') + '</summary>' +
          '<div class="pdm-field-row">' +
            field('Objetivo', '<select class="pdm-select" onchange="pdmStatsSetFilter(\'goalId\', this.value)"><option value="">Todos</option>' +
              goals.map((g) => '<option value="' + g.id + '"' + (statsState.filters.goalId === g.id ? ' selected' : '') + '>' + escapeHtml(g.name) + '</option>').join('') + '</select>') +
            field('Habilidade', '<select class="pdm-select" onchange="pdmStatsSetFilter(\'skillKey\', this.value)"><option value="">Todas</option>' +
              skills.map((s) => '<option value="' + s.key + '"' + (statsState.filters.skillKey === s.key ? ' selected' : '') + '>' + escapeHtml(s.name) + '</option>').join('') + '</select>') +
          '</div>' +
          '<div class="pdm-field-row">' +
            field('Hábito', '<select class="pdm-select" onchange="pdmStatsSetFilter(\'habitId\', this.value)"><option value="">Todos</option>' +
              habits.map((h) => '<option value="' + h.id + '"' + (statsState.filters.habitId === h.id ? ' selected' : '') + '>' + escapeHtml(h.name) + '</option>').join('') + '</select>') +
            field('Tipo de missão', '<select class="pdm-select" onchange="pdmStatsSetFilter(\'origin\', this.value)">' +
              [['', 'Todos'], ['habit', 'De hábito'], ['manual', 'Manual']].map(([v, l]) =>
                '<option value="' + v + '"' + (statsState.filters.origin === v ? ' selected' : '') + '>' + l + '</option>'
              ).join('') + '</select>') +
          '</div>' +
          (Object.keys(currentFilters()).length ? '<button type="button" class="pdm-btn-ghost" onclick="pdmStatsClearFilters()">Limpar filtros</button>' : '') +
        '</details>' +
      '</div>';
  }

  // ---------------------------------------------------------------
  // RESUMO
  // ---------------------------------------------------------------
  function renderOverviewSection(range, filters) {
    const ov = PdmStats.computeOverview(range, filters);
    const c = ov.current, d = ov.deltas;
    const body = '<div class="pdm-stat-grid">' +
        overviewTile(c.missionsCompleted, 'Missões concluídas', d.missionsCompleted, '%') +
        overviewTile(c.missionsPending, 'Missões pendentes') +
        overviewTile(c.missionsOverdue, 'Missões atrasadas') +
        overviewTile(c.executionRate != null ? c.executionRate + '%' : null, 'Taxa de execução', d.executionRate, 'pp') +
        overviewTile(c.habitsExecuted, 'Hábitos executados', d.habitsExecuted, '%') +
        overviewTile(ov.currentStreak, 'Sequência atual') +
        overviewTile(ov.bestStreak, 'Melhor sequência') +
        overviewTile(c.xpGained, 'XP obtido', d.xpGained, '%') +
        overviewTile(c.activeGoals, 'Objetivos ativos') +
        overviewTile(c.skillsInDevelopment, 'Habilidades em desenvolvimento') +
      '</div>' +
      (c.xpPossiblyTruncated ? emptyNote('O XP do período pode estar subestimado — o histórico de eventos guarda só os últimos 200 registros.') : '');
    return section('pdmStatsOverview', 'Resumo', body, true);
  }

  // ---------------------------------------------------------------
  // CONSISTÊNCIA / EVOLUÇÃO DA DISCIPLINA
  // ---------------------------------------------------------------
  function renderDisciplineSection(range, filters) {
    const evo = PdmStats.computeDisciplineEvolution(range, filters);
    const chart = chartSeriesForRange(evo.daily, range);
    let body = '<div class="pdm-stat-grid">' +
        overviewTile(evo.weeklyAvgCompletions != null ? evo.weeklyAvgCompletions.toFixed(1) : null, 'Média semanal (missões)') +
        overviewTile(evo.monthlyAvgCompletions != null ? evo.monthlyAvgCompletions.toFixed(1) : null, 'Média mensal (missões)') +
        overviewTile(evo.bestDay ? evo.bestDay.completed : null, 'Melhor dia' + (evo.bestDay ? ' (' + fmtDate(evo.bestDay.date) + ')' : '')) +
        overviewTile(evo.worstDaysCount, 'Dias sem execução') +
      '</div>' +
      '<p class="pdm-stats-chart-title">Evolução diária' + (chart.granularity === 'week' ? ' (agrupada por semana)' : '') + '</p>' +
      barsHtml(chart.series, chart.key, chart.labelFn);
    if (PdmStats.getDisciplineScore() == null) {
      body += emptyNote('O Disciplina Score (indicador único combinando consistência, execução e evolução) ainda não foi implementado — essas métricas já usam só dados reais, mas de forma separada.');
    }
    return section('pdmStatsDiscipline', 'Evolução da Disciplina', body, false);
  }

  // ---------------------------------------------------------------
  // HEATMAP
  // ---------------------------------------------------------------
  function buildHeatmapGrid(heatmap) {
    const days = heatmap.days;
    if (!days.length) return emptyNote('Sem dados nesse ano ainda.');
    const firstDow = weekdayOf(days[0].date);
    const padded = [];
    for (let i = 0; i < firstDow; i++) padded.push(null);
    days.forEach((d) => padded.push(d));
    while (padded.length % 7 !== 0) padded.push(null);
    let html = '<div class="pdm-heatmap-scroll"><div class="pdm-heatmap-grid">';
    for (let i = 0; i < padded.length; i += 7) {
      html += '<div class="pdm-heatmap-col">';
      padded.slice(i, i + 7).forEach((cell) => {
        if (!cell) html += '<div class="pdm-heatmap-cell empty"></div>';
        else html += '<div class="pdm-heatmap-cell level-' + cell.level + '" title="' + fmtDateFull(cell.date) + ': ' + cell.count + (cell.count === 1 ? ' missão concluída' : ' missões concluídas') + '"></div>';
      });
      html += '</div>';
    }
    html += '</div></div>';
    return html;
  }

  function renderHeatmapSubsection(filters) {
    const heatmap = PdmStats.computeHeatmapYear(String(statsState.heatmapYear), filters);
    return '<div class="pdm-stats-heatmap-head">' +
        '<button type="button" class="pdm-agenda-nav-btn" onclick="pdmStatsHeatmapYear(-1)" aria-label="Ano anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 18l-6-6 6-6"/></svg></button>' +
        '<b>' + statsState.heatmapYear + '</b>' +
        '<button type="button" class="pdm-agenda-nav-btn" onclick="pdmStatsHeatmapYear(1)" aria-label="Próximo ano"' + (statsState.heatmapYear >= new Date().getFullYear() ? ' disabled' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 18l6-6-6-6"/></svg></button>' +
      '</div>' +
      buildHeatmapGrid(heatmap) +
      '<div class="pdm-stats-heatmap-legend">Menos <span class="pdm-heatmap-cell level-0"></span><span class="pdm-heatmap-cell level-1"></span><span class="pdm-heatmap-cell level-2"></span><span class="pdm-heatmap-cell level-3"></span><span class="pdm-heatmap-cell level-4"></span> Mais</div>' +
      '<p class="pdm-stats-chart-title">' + heatmap.activeDaysCount + ' dias ativos em ' + statsState.heatmapYear + ' · ' + heatmap.totalCompletions + ' missões concluídas</p>' +
      emptyNote('A intensidade das cores é relativa aos seus próprios dias mais ativos do ano — o objetivo é mostrar consistência, não incentivar excesso.');
  }

  function renderConsistencySection(range, filters) {
    const streak = window.PdmGamification.getStreak();
    const body = '<div class="pdm-stat-grid">' +
        overviewTile(streak.count, 'Sequência atual') +
        overviewTile(streak.best, 'Melhor sequência') +
        overviewTile(streak.totalActiveDays, 'Dias ativos (total)') +
      '</div>' +
      renderHeatmapSubsection(filters);
    return section('pdmStatsConsistency', 'Consistência', body, false);
  }

  // ---------------------------------------------------------------
  // MISSÕES
  // ---------------------------------------------------------------
  function renderMissionsSection(range, filters) {
    const m = PdmStats.computeMissionStats(range, filters);
    const chart = chartSeriesForRange(m.dailySeries, range);
    const body = '<div class="pdm-stat-grid">' +
        overviewTile(m.total, 'Total de missões') +
        overviewTile(m.completed, 'Concluídas') +
        overviewTile(m.pending, 'Pendentes') +
        overviewTile(m.overdue, 'Atrasadas') +
        overviewTile(m.cancelled, 'Canceladas') +
        overviewTile(m.rescheduled, 'Reagendadas') +
        overviewTile(m.completionRate != null ? m.completionRate + '%' : null, 'Taxa de conclusão') +
        overviewTile(m.onTimeRate != null ? m.onTimeRate + '%' : null, 'Conclusão no prazo') +
      '</div>' +
      '<p class="pdm-stats-chart-title">Execução ao longo do tempo</p>' +
      barsHtml(chart.series, chart.key, chart.labelFn);
    return section('pdmStatsMissions', 'Missões', body, false);
  }

  // ---------------------------------------------------------------
  // HÁBITOS
  // ---------------------------------------------------------------
  function habitListRow(h) {
    return '<div class="pdm-stats-list-row">' +
        '<div class="pdm-stats-list-row-head"><span>' + escapeHtml(h.name) + '</span><b>' + (h.rate != null ? h.rate + '%' : '—') + '</b></div>' +
        progressBarHtml(h.rate) +
        '<div class="pdm-stats-list-row-meta">' + h.executions + ' execuções · sequência atual ' + h.currentStreak + ' · melhor ' + h.bestStreak + '</div>' +
      '</div>';
  }
  function renderHabitsSection(range, filters) {
    const h = PdmStats.computeHabitStatsSection(range, filters);
    let body = '<div class="pdm-stat-grid">' +
        overviewTile(h.totalActive, 'Hábitos ativos') +
        overviewTile(h.totalExecutions, 'Execuções no período') +
        overviewTile(h.currentStreak, 'Sequência atual') +
        overviewTile(h.bestStreak, 'Melhor sequência') +
      '</div>';
    if (!h.perHabit.length) {
      body += emptyNote('Nenhum hábito ativo ainda.');
    } else {
      body += '<p class="pdm-stats-chart-title">Mais consistentes</p>' +
        (h.mostConsistent.length ? h.mostConsistent.map(habitListRow).join('') : emptyNote('Continue executando seus hábitos pra gerar esse ranking.')) +
        '<p class="pdm-stats-chart-title">Menos consistentes</p>' +
        (h.leastConsistent.length ? h.leastConsistent.map(habitListRow).join('') : emptyNote('Continue executando seus hábitos pra gerar esse ranking.'));
    }
    return section('pdmStatsHabits', 'Hábitos', body, false);
  }

  // ---------------------------------------------------------------
  // OBJETIVOS
  // ---------------------------------------------------------------
  function goalListRow(g) {
    return '<div class="pdm-stats-list-row">' +
        '<div class="pdm-stats-list-row-head"><span>' + escapeHtml(g.name) + '</span><b>' + Math.round(g.progressPct) + '%</b></div>' +
        progressBarHtml(g.progressPct) +
        '<div class="pdm-stats-list-row-meta">' + g.habitsCount + ' hábito(s) · ' + g.missionsInRange + ' missão(ões) no período' + (g.executionRate != null ? ' · ' + g.executionRate + '% de execução' : '') + '</div>' +
      '</div>';
  }
  function renderGoalsSection(range, filters) {
    const g = PdmStats.computeGoalStatsSection(range, filters);
    let body = '<div class="pdm-stat-grid">' +
        overviewTile(g.active, 'Objetivos ativos') +
        overviewTile(g.completed, 'Concluídos') +
        overviewTile(g.paused, 'Pausados') +
        overviewTile(g.cancelled, 'Cancelados') +
        overviewTile(g.avgProgress != null ? g.avgProgress + '%' : null, 'Progresso médio') +
        overviewTile(g.completedInRangeCount, 'Concluídos no período') +
      '</div>';
    if (g.best) body += '<p class="pdm-stats-chart-title">Maior evolução</p>' + goalListRow(g.best);
    if (g.worst) body += '<p class="pdm-stats-chart-title">Menor evolução</p>' + goalListRow(g.worst);
    if (!g.perGoal.length) body += emptyNote('Nenhum objetivo cadastrado ainda.');
    return section('pdmStatsGoals', 'Objetivos', body, false);
  }

  // ---------------------------------------------------------------
  // HABILIDADES
  // ---------------------------------------------------------------
  function skillCardHtml(s) {
    return '<div class="pdm-stats-list-row pdm-stats-skill-row" onclick="pdmStatsOpenSkillDetail(\'' + s.key + '\')">' +
        '<div class="pdm-stats-list-row-head"><span>' + escapeHtml(s.name) + ' <span class="pdm-stats-dim">nível ' + s.level + '</span></span><b>' + (s.evolutionPct != null ? (s.evolutionPct > 0 ? '+' : '') + s.evolutionPct + '%' : '—') + '</b></div>' +
        progressBarHtml(s.progressPct) +
        '<div class="pdm-stats-list-row-meta">' + s.xp + ' XP total · ' + s.missionsCompletedInRange + ' missão(ões) no período</div>' +
      '</div>';
  }
  function renderSkillsSection(range, filters) {
    const s = PdmStats.computeSkillStatsSection(range, filters);
    let body = '<div class="pdm-stat-grid">' +
        overviewTile(s.developingCount, 'Habilidades em desenvolvimento') +
        overviewTile(s.mostEvolved ? s.mostEvolved.name : null, 'Maior evolução') +
        overviewTile(s.leastEvolved ? s.leastEvolved.name : null, 'Menor evolução') +
      '</div>' +
      s.perSkill.map(skillCardHtml).join('');
    return section('pdmStatsSkills', 'Habilidades', body, false);
  }

  function pdmStatsOpenSkillDetail(key) {
    const d = PdmStats.getSkillDetail(key, currentRange(), currentFilters());
    if (!d) return;
    document.getElementById('pdmSkillDetailModal').innerHTML =
      '<div class="pdm-modal">' +
        '<h3>' + escapeHtml(d.name) + '</h3>' +
        '<div class="pdm-stat-grid">' +
          overviewTile(d.level, 'Nível atual') +
          overviewTile(d.xp, 'XP acumulado') +
          overviewTile(d.missionsCompletedAllTime, 'Missões concluídas (total)') +
          overviewTile(d.habitsRelated, 'Hábitos relacionados') +
          overviewTile(d.evolutionInRangePct != null ? (d.evolutionInRangePct > 0 ? '+' : '') + d.evolutionInRangePct + '%' : null, 'Evolução no período') +
          overviewTile(d.xpGainedInRange, 'XP no período') +
        '</div>' +
        progressBarHtml(d.progressPct) +
        '<div class="pdm-modal-row"><button class="pdm-btn-ghost" onclick="pdmCloseModal(\'pdmSkillDetailModal\')">Fechar</button></div>' +
      '</div>';
    document.getElementById('pdmSkillDetailModal').classList.add('open');
  }

  // ---------------------------------------------------------------
  // GAMIFICAÇÃO
  // ---------------------------------------------------------------
  function renderGamificationSection(range) {
    const g = PdmStats.computeGamificationSection(range);
    const body = '<div class="pdm-stat-grid">' +
        overviewTile(g.xpGained, 'XP no período') +
        overviewTile(g.level.current.name || ('Tier ' + (g.level.stage + 1)), 'Nível/tier atual') +
        overviewTile(g.streak.count, 'Sequência atual') +
        overviewTile(g.streak.best, 'Melhor sequência') +
        overviewTile(g.tiersReached + '/' + g.totalTiers, 'Progresso do Battle Pass') +
        overviewTile(g.achievementsUnlockedInRange.length, 'Conquistas no período') +
      '</div>' +
      (g.xpPossiblyTruncated ? emptyNote('XP do período pode estar subestimado (histórico limitado aos últimos 200 eventos).') : '') +
      (g.achievementsUnlockedInRange.length
        ? '<p class="pdm-stats-chart-title">Desbloqueadas no período</p>' + g.achievementsUnlockedInRange.map((a) => {
            const def = window.PdmGamification.getAchievementDefs().find((x) => x.key === a.key);
            return '<div class="pdm-stats-list-row"><div class="pdm-stats-list-row-head"><span>' + (def ? def.icon + ' ' + def.name : a.key) + '</span><b>' + fmtDate(a.unlockedAt.slice(0, 10)) + '</b></div></div>';
          }).join('')
        : '');
    return section('pdmStatsGamification', 'Gamificação', body, false);
  }

  // ---------------------------------------------------------------
  // RECORDES
  // ---------------------------------------------------------------
  function renderRecordsSection() {
    const r = PdmStats.computeRecords();
    const body = '<div class="pdm-stat-grid">' +
        overviewTile(r.bestStreak, 'Maior sequência') +
        overviewTile(r.bestDay ? r.bestDay.count : null, 'Mais missões num dia' + (r.bestDay ? ' (' + fmtDate(r.bestDay.date) + ')' : '')) +
        overviewTile(r.bestWeek ? r.bestWeek.count : null, 'Mais missões numa semana') +
        overviewTile(r.bestXpDay ? r.bestXpDay.xp : null, 'Maior XP num dia' + (r.bestXpDay ? ' (' + fmtDate(r.bestXpDay.date) + ')' : '')) +
        overviewTile(r.topSkill ? r.topSkill.name : null, 'Habilidade com mais XP') +
        overviewTile(r.topGoal ? r.topGoal.name : null, 'Objetivo com maior progresso') +
      '</div>';
    return section('pdmStatsRecords', 'Recordes', body, false);
  }

  // ---------------------------------------------------------------
  // INSIGHTS
  // ---------------------------------------------------------------
  function renderInsightsSection(range, filters) {
    const insights = PdmStats.computeInsights(range, filters);
    const body = insights.length
      ? insights.map((i) => '<div class="pdm-stats-insight"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2a7 7 0 00-4 12.7V17a1 1 0 001 1h6a1 1 0 001-1v-2.3A7 7 0 0012 2z"/><path d="M9 21h6"/></svg><span>' + escapeHtml(i.text) + '</span></div>').join('')
      : emptyNote('Continue utilizando o aplicativo para gerar insights sobre o seu comportamento.');
    return section('pdmStatsInsights', 'Insights', body, false);
  }

  // ---------------------------------------------------------------
  // RENDER PRINCIPAL
  // ---------------------------------------------------------------
  function pdmRenderStats() {
    const root = document.getElementById('pdmStatsRoot');
    if (!root || !window.PdmStats) return;

    if (!hasAnyData()) {
      root.innerHTML = '<div class="pdm-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></svg><div>Ainda não há dados suficientes. Continue usando o app pra gerar suas estatísticas.</div></div>';
      return;
    }

    try {
      const range = currentRange();
      const filters = currentFilters();
      root.innerHTML =
        renderControls(range) +
        renderOverviewSection(range, filters) +
        renderConsistencySection(range, filters) +
        renderDisciplineSection(range, filters) +
        renderMissionsSection(range, filters) +
        renderHabitsSection(range, filters) +
        renderGoalsSection(range, filters) +
        renderSkillsSection(range, filters) +
        renderGamificationSection(range) +
        renderRecordsSection() +
        renderInsightsSection(range, filters);
    } catch (e) {
      root.innerHTML = '<div class="pdm-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16h.01"/></svg><div>Não deu pra calcular as estatísticas agora. Tente de novo em instantes.</div></div>';
      if (window.pdmToast) window.pdmToast('Erro ao calcular estatísticas.');
    }
  }

  // ---------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------
  function pdmStatsSetPeriod(key) {
    statsState.periodKey = key;
    if (key === 'custom' && !statsState.customStart) {
      statsState.customStart = addDaysISO(todayISO(), -6);
      statsState.customEnd = todayISO();
    }
    pdmRenderStats();
  }
  function pdmStatsSetCustomRange() {
    const s = document.getElementById('pdmStatsCustomStart');
    const e = document.getElementById('pdmStatsCustomEnd');
    if (s) statsState.customStart = s.value;
    if (e) statsState.customEnd = e.value;
    pdmRenderStats();
  }
  function pdmStatsSetFilter(key, value) {
    statsState.filters[key] = value;
    pdmRenderStats();
  }
  function pdmStatsClearFilters() {
    statsState.filters = { goalId: '', skillKey: '', habitId: '', origin: '' };
    pdmRenderStats();
  }
  function pdmStatsHeatmapYear(delta) {
    const next = statsState.heatmapYear + delta;
    if (next > new Date().getFullYear()) return;
    statsState.heatmapYear = next;
    pdmRenderStats();
  }

  Object.assign(window, {
    pdmRenderStats, pdmStatsSetPeriod, pdmStatsSetCustomRange, pdmStatsSetFilter,
    pdmStatsClearFilters, pdmStatsHeatmapYear, pdmStatsOpenSkillDetail,
  });
})();
