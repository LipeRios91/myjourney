// Camada de UI de Hábitos e Missões: agenda diária, lista de hábitos,
// formulários (criação/edição) e modais de detalhe/ações.
//
// Depende de window.PdmHM (dados), das funções utilitárias globais
// (js/utils.js, js/icons.js) e de pdmToast/pdmCloseModal/pdmRenderAll,
// expostas pelo script legado no fim do <body>.

(function () {
  const MISSION_STATUS_LABELS = {
    nao_iniciada: 'Não iniciada',
    em_andamento: 'Em andamento',
    concluida: 'Concluída',
    adiada: 'Adiada',
    cancelada: 'Cancelada',
  };
  const PRIORITY_LABELS = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
  const REMINDER_LABELS = { none: 'Sem lembrete', '10min': '10 min antes', '30min': '30 min antes', '1h': '1h antes', custom: 'Personalizado' };

  // ---------------------------------------------------------------
  // HELPERS DE MARKUP
  // ---------------------------------------------------------------
  function field(label, inner) { return '<div class="pdm-field"><label>' + label + '</label>' + inner + '</div>'; }
  function buildSegmented(options, activeVal, handlerName) {
    return '<div class="pdm-segmented">' + options.map(([val, label]) =>
      '<button type="button" class="' + (val === activeVal ? 'active' : '') + '" onclick="' + handlerName + '(\'' + val + '\')">' + label + '</button>'
    ).join('') + '</div>';
  }
  function statTile(value, label) { return '<div class="pdm-stat-tile"><b>' + value + '</b><span>' + label + '</span></div>'; }
  function captureFormValues(ids) {
    const vals = {};
    ids.forEach((id) => { const el = document.getElementById(id); if (el) vals[id] = el.value; });
    return vals;
  }
  function restoreFormValues(ids, vals) {
    ids.forEach((id) => { const el = document.getElementById(id); if (el && vals[id] !== undefined) el.value = vals[id]; });
  }

  function describeFrequency(habit) {
    const f = habit.frequency || {};
    switch (f.type) {
      case 'daily': return 'Todo dia';
      case 'weekdays':
        return (f.weekdays || []).length ? f.weekdays.slice().sort().map((d) => WEEKDAY_LABELS[d]).join(', ') : 'Nenhum dia escolhido';
      case 'weekly': return 'Toda ' + WEEKDAY_LABELS[f.weeklyDay != null ? f.weeklyDay : 0];
      case 'monthly':
        if (f.monthlyMode === 'weekday_position' && f.weekdayPosition) {
          const ord = { 1: 'primeiro', 2: 'segundo', 3: 'terceiro', 4: 'quarto', '-1': 'último' }[f.weekdayPosition.ordinal] || '';
          return 'Todo ' + ord + ' ' + WEEKDAY_LABELS[f.weekdayPosition.weekday] + ' do mês';
        }
        return 'Todo dia ' + (f.dayOfMonth || 1) + ' do mês';
      case 'custom': return 'A cada ' + (f.intervalDays || 1) + ' dias';
      default: return '—';
    }
  }

  // ---------------------------------------------------------------
  // AGENDA DE MISSÕES
  // ---------------------------------------------------------------
  let agendaDate = null;

  function missionRowHtml(m) {
    const colorHex = habitColorHex(m.color);
    const badges = [];
    if (m.priority === 'alta') badges.push('<span class="pdm-mission-badge prioridade-alta">Alta</span>');
    if (m.status === 'adiada') badges.push('<span class="pdm-mission-badge status-adiada">Adiada</span>');
    if (m.status === 'cancelada') badges.push('<span class="pdm-mission-badge">Cancelada</span>');
    if (m.status === 'em_andamento') badges.push('<span class="pdm-mission-badge">Em andamento</span>');
    const metaParts = [];
    if (m.time) metaParts.push(m.time);
    if (m.durationMin) metaParts.push(m.durationMin + ' min');
    const meta = (metaParts.length ? '<span>' + escapeHtml(metaParts.join(' · ')) + '</span>' : '') + badges.join('');
    return (
      '<div class="pdm-mission status-' + m.status + '" style="--habit-color:' + colorHex + '" onclick="pdmOpenMissionDetail(\'' + m.id + '\')">' +
        '<div class="pdm-mission-icon">' + habitIconSvg(m.icon) + '</div>' +
        '<div class="pdm-mission-body">' +
          '<div class="pdm-mission-name">' + escapeHtml(m.name) + '</div>' +
          '<div class="pdm-mission-meta">' + meta + '</div>' +
        '</div>' +
        '<div class="pdm-mission-xp">+' + m.xp + ' XP</div>' +
        '<div class="pdm-mission-check" onclick="event.stopPropagation(); pdmQuickCompleteMission(\'' + m.id + '\')">✓</div>' +
      '</div>'
    );
  }

  function pdmRenderAgenda() {
    if (!agendaDate) agendaDate = todayISO();
    PdmHM.ensureMissionsForDate(agendaDate);
    const dateEl = document.getElementById('pdmAgendaDate');
    if (!dateEl) return;
    const isToday = agendaDate === todayISO();
    dateEl.className = 'pdm-agenda-date' + (isToday ? ' is-today' : '');
    const fullDate = isoToDate(agendaDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    dateEl.innerHTML = escapeHtml(formatDateLabel(agendaDate)) + '<span>' + escapeHtml(fullDate) + (isToday ? '' : ' · toque para voltar a hoje') + '</span>';

    const missions = PdmHM.listMissionsForDate(agendaDate);
    const list = document.getElementById('pdmQuestList');
    if (!missions.length) {
      list.innerHTML = '<div class="pdm-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg><div>Nenhuma missão pra esse dia. Toque no + pra criar uma.</div></div>';
    } else {
      list.innerHTML = missions.map(missionRowHtml).join('');
    }
    const done = missions.filter((m) => m.status === 'concluida').length;
    document.getElementById('pdmQuestProgress').innerHTML = '<b>' + done + '/' + missions.length + '</b> missões concluídas';
  }
  function pdmAgendaShift(delta) { agendaDate = addDaysISO(agendaDate || todayISO(), delta); pdmRenderAgenda(); }
  function pdmAgendaGoToday() { agendaDate = todayISO(); pdmRenderAgenda(); }

  function pdmQuickCompleteMission(id) {
    const m = PdmHM.getMission(id);
    if (!m || m.status === 'concluida') return;
    const gained = PdmHM.completeMission(id);
    if (gained == null) return;
    window.pdmRenderAll();
    pdmToast('+' + gained + ' XP', 'Desfazer', () => { PdmHM.reopenMission(id); window.pdmRenderAll(); });
  }

  // ---------------------------------------------------------------
  // LISTA DE HÁBITOS
  // ---------------------------------------------------------------
  function habitRowHtml(h) {
    const s = h.stats || {};
    return (
      '<div class="pdm-habit' + (h.archivedAt ? ' archived' : '') + '" style="--habit-color:' + habitColorHex(h.color) + '" onclick="pdmOpenHabitDetail(\'' + h.id + '\')">' +
        '<div class="pdm-habit-icon">' + habitIconSvg(h.icon) + '</div>' +
        '<div class="pdm-habit-body">' +
          '<div class="pdm-habit-name">' + escapeHtml(h.name) + '</div>' +
          '<div class="pdm-habit-meta">' + escapeHtml(describeFrequency(h)) + (h.schedule && h.schedule.startTime ? ' · ' + h.schedule.startTime : '') + '</div>' +
        '</div>' +
        '<div class="pdm-habit-streak"><b>' + (s.currentStreak || 0) + '</b><span>streak</span></div>' +
        '<svg class="pdm-habit-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>' +
      '</div>'
    );
  }

  function pdmRenderHabitsList() {
    const listEl = document.getElementById('pdmHabitsList');
    if (!listEl) return;
    const active = PdmHM.listHabits();
    const archived = PdmHM.listHabits({ includeArchived: true }).filter((h) => h.archivedAt);
    if (!active.length) {
      listEl.innerHTML = '<div class="pdm-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg><div>Nenhum hábito ainda. Crie o primeiro pra ele gerar missões sozinho, todo dia.</div></div>';
    } else {
      listEl.innerHTML = active.map(habitRowHtml).join('');
    }
    const wrap = document.getElementById('pdmHabitsArchivedWrap');
    if (wrap) wrap.style.display = archived.length ? 'block' : 'none';
    const archivedListEl = document.getElementById('pdmHabitsArchivedList');
    if (archivedListEl) archivedListEl.innerHTML = archived.map(habitRowHtml).join('');
  }

  function pdmToggleArchivedHabits() {
    const el = document.getElementById('pdmHabitsArchivedList');
    const toggle = document.getElementById('pdmHabitsArchivedToggle');
    const show = el.style.display === 'none';
    el.style.display = show ? 'block' : 'none';
    toggle.textContent = show ? 'Ocultar arquivados' : 'Mostrar arquivados';
  }

  // ---------------------------------------------------------------
  // FORMULÁRIO DE HÁBITO (criar/editar)
  // ---------------------------------------------------------------
  let habitFormDraft = null;
  const HABIT_FORM_FIELD_IDS = ['hfName', 'hfDesc', 'hfCategory', 'hfXp', 'hfDayOfMonth', 'hfIntervalDays', 'hfStartDate', 'hfEndDate', 'hfStartTime', 'hfEndTime', 'hfDuration', 'hfGoalTarget', 'hfGoalPeriod', 'hfGoalUnit', 'hfReminderCustom'];

  function pdmOpenHabitForm(habitId) {
    const h = habitId ? PdmHM.getHabit(habitId) : null;
    habitFormDraft = h ? {
      editingId: h.id,
      color: h.color,
      icon: h.icon,
      freqType: h.frequency.type,
      weekdays: (h.frequency.weekdays || []).slice(),
      weeklyDay: h.frequency.weeklyDay != null ? h.frequency.weeklyDay : 0,
      monthlyMode: h.frequency.monthlyMode || 'day_of_month',
      weekdayPosOrdinal: h.frequency.weekdayPosition ? h.frequency.weekdayPosition.ordinal : 1,
      weekdayPosWeekday: h.frequency.weekdayPosition ? h.frequency.weekdayPosition.weekday : 0,
      goalType: h.goal ? h.goal.type : 'none',
      reminderType: h.reminder ? h.reminder.type : 'none',
      priority: h.priority || 'media',
    } : {
      editingId: null, color: 'gold', icon: 'target', freqType: 'daily', weekdays: [], weeklyDay: 0,
      monthlyMode: 'day_of_month', weekdayPosOrdinal: 1, weekdayPosWeekday: 0,
      goalType: 'none', reminderType: 'none', priority: 'media',
    };
    document.getElementById('pdmHabitFormTitle').textContent = h ? 'Editar hábito' : 'Novo hábito';
    document.getElementById('pdmHabitFormBody').innerHTML = buildHabitFormHtml(h);
    document.getElementById('pdmHabitFormModal').classList.add('open');
  }

  function buildHabitFormHtml(h) {
    const d = habitFormDraft;
    const name = h ? h.name : '';
    const desc = h ? h.description : '';
    const category = h ? h.category : 'saude';
    const xp = h ? h.xp : 10;
    const startDate = h ? h.startDate : todayISO();
    const endDate = h ? (h.endDate || '') : '';
    const startTime = h && h.schedule ? (h.schedule.startTime || '') : '';
    const endTime = h && h.schedule ? (h.schedule.endTime || '') : '';
    const duration = h && h.schedule ? (h.schedule.durationMin || '') : '';
    const goalTarget = h && h.goal ? (h.goal.target || '') : '';
    const goalUnit = h && h.goal ? (h.goal.unit || '') : '';
    const goalPeriod = h && h.goal ? (h.goal.period || 'week') : 'week';
    const reminderCustom = h && h.reminder ? (h.reminder.customMinutes || '') : '';
    const dayOfMonth = h && h.frequency ? (h.frequency.dayOfMonth || 1) : 1;
    const intervalDays = h && h.frequency ? (h.frequency.intervalDays || 2) : 2;

    let html = '<div id="pdmHabitFormError" class="pdm-field-error" style="display:none;"></div>';
    html += field('Nome', '<input class="pdm-input" id="hfName" value="' + escapeHtml(name) + '" placeholder="Ex: Academia">');
    html += field('Descrição (opcional)', '<textarea class="pdm-textarea" id="hfDesc">' + escapeHtml(desc) + '</textarea>');
    html += '<div class="pdm-field-row">';
    html += field('Categoria', '<select class="pdm-select" id="hfCategory">' + HM_CATEGORIES.map((c) => '<option value="' + c.key + '"' + (c.key === category ? ' selected' : '') + '>' + c.name + '</option>').join('') + '</select>');
    html += field('XP por execução', '<input class="pdm-input" type="number" min="0" id="hfXp" value="' + xp + '">');
    html += '</div>';

    html += field('Cor', '<div class="pdm-color-picker">' + HABIT_COLORS.map((c) =>
      '<div class="pdm-color-swatch' + (c.key === d.color ? ' active' : '') + '" style="background:' + c.hex + '" onclick="pdmHabitFormPick(\'color\',\'' + c.key + '\')"></div>'
    ).join('') + '</div>');

    html += field('Ícone', '<div class="pdm-icon-picker">' + HABIT_ICON_KEYS.map((k) =>
      '<div class="pdm-icon-swatch' + (k === d.icon ? ' active' : '') + '" onclick="pdmHabitFormPick(\'icon\',\'' + k + '\')">' + HABIT_ICONS[k] + '</div>'
    ).join('') + '</div>');

    html += field('Frequência', buildSegmented([
      ['daily', 'Diário'], ['weekdays', 'Dias da semana'], ['weekly', 'Semanal'], ['monthly', 'Mensal'], ['custom', 'Personalizado'],
    ], d.freqType, 'pdmHabitFormSetFreqType'));

    if (d.freqType === 'weekdays') {
      html += field('Quais dias', '<div class="pdm-weekday-picker">' + WEEKDAY_SHORT.map((lbl, i) =>
        '<button type="button" class="' + (d.weekdays.includes(i) ? 'active' : '') + '" onclick="pdmHabitFormToggleWeekday(' + i + ')">' + lbl + '</button>'
      ).join('') + '</div>');
    } else if (d.freqType === 'weekly') {
      html += field('Que dia da semana', '<div class="pdm-weekday-picker">' + WEEKDAY_SHORT.map((lbl, i) =>
        '<button type="button" class="' + (d.weeklyDay === i ? 'active' : '') + '" onclick="pdmHabitFormSetWeeklyDay(' + i + ')">' + lbl + '</button>'
      ).join('') + '</div>');
    } else if (d.freqType === 'monthly') {
      html += field('Como', buildSegmented([['day_of_month', 'Dia fixo'], ['weekday_position', 'Posição (ex: 1º domingo)']], d.monthlyMode, 'pdmHabitFormSetMonthlyMode'));
      if (d.monthlyMode === 'day_of_month') {
        html += field('Dia do mês', '<input class="pdm-input" type="number" min="1" max="31" id="hfDayOfMonth" value="' + dayOfMonth + '">');
      } else {
        html += '<div class="pdm-field-row">';
        html += field('Posição', '<select class="pdm-select" onchange="pdmHabitFormSetWeekdayPosOrdinal(this.value)">' +
          [[1, 'Primeiro'], [2, 'Segundo'], [3, 'Terceiro'], [4, 'Quarto'], [-1, 'Último']].map(([v, l]) =>
            '<option value="' + v + '"' + (Number(d.weekdayPosOrdinal) === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>');
        html += field('Dia da semana', '<select class="pdm-select" onchange="pdmHabitFormSetWeekdayPosWeekday(this.value)">' +
          WEEKDAY_LABELS.map((l, i) => '<option value="' + i + '"' + (d.weekdayPosWeekday === i ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>');
        html += '</div>';
      }
    } else if (d.freqType === 'custom') {
      html += field('A cada quantos dias', '<input class="pdm-input" type="number" min="1" id="hfIntervalDays" value="' + intervalDays + '">');
    }

    html += '<div class="pdm-field-row">';
    html += field('Data de início', '<input class="pdm-input" type="date" id="hfStartDate" value="' + startDate + '">');
    html += field('Data de término (opcional)', '<input class="pdm-input" type="date" id="hfEndDate" value="' + endDate + '">');
    html += '</div>';

    html += '<div class="pdm-field-row">';
    html += field('Horário de início (opcional)', '<input class="pdm-input" type="time" id="hfStartTime" value="' + startTime + '">');
    html += field('Horário de término (opcional)', '<input class="pdm-input" type="time" id="hfEndTime" value="' + endTime + '">');
    html += '</div>';
    html += field('Duração estimada em minutos (opcional)', '<input class="pdm-input" type="number" min="0" id="hfDuration" value="' + duration + '">');

    html += field('Meta', buildSegmented([['none', 'Sem meta'], ['count_per_period', 'Nº de vezes'], ['quantity', 'Quantidade'], ['duration', 'Duração']], d.goalType, 'pdmHabitFormSetGoalType'));
    if (d.goalType === 'count_per_period') {
      html += '<div class="pdm-field-row">';
      html += field('Quantas vezes', '<input class="pdm-input" type="number" min="1" id="hfGoalTarget" value="' + goalTarget + '">');
      html += field('Por', '<select class="pdm-select" id="hfGoalPeriod"><option value="week"' + (goalPeriod === 'week' ? ' selected' : '') + '>Semana</option><option value="month"' + (goalPeriod === 'month' ? ' selected' : '') + '>Mês</option></select>');
      html += '</div>';
    } else if (d.goalType === 'quantity') {
      html += '<div class="pdm-field-row">';
      html += field('Quantidade', '<input class="pdm-input" type="number" min="0" id="hfGoalTarget" value="' + goalTarget + '">');
      html += field('Unidade', '<input class="pdm-input" id="hfGoalUnit" value="' + escapeHtml(goalUnit) + '" placeholder="ex: litros, páginas">');
      html += '</div>';
    } else if (d.goalType === 'duration') {
      html += field('Minutos', '<input class="pdm-input" type="number" min="0" id="hfGoalTarget" value="' + goalTarget + '">');
    }

    html += field('Lembrete', buildSegmented([['none', 'Sem lembrete'], ['10min', '10 min antes'], ['30min', '30 min antes'], ['1h', '1h antes'], ['custom', 'Personalizado']], d.reminderType, 'pdmHabitFormSetReminderType'));
    if (d.reminderType === 'custom') {
      html += field('Minutos antes', '<input class="pdm-input" type="number" min="1" id="hfReminderCustom" value="' + reminderCustom + '">');
    }
    if (d.reminderType !== 'none' && !startTime) {
      html += '<p class="pdm-field-hint">Defina um horário de início pra o lembrete funcionar.</p>';
    }

    html += field('Prioridade das missões geradas', buildSegmented([['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta']], d.priority, 'pdmHabitFormSetPriority'));
    return html;
  }

  function rerenderHabitForm() {
    const existing = habitFormDraft.editingId ? PdmHM.getHabit(habitFormDraft.editingId) : null;
    const vals = captureFormValues(HABIT_FORM_FIELD_IDS);
    document.getElementById('pdmHabitFormBody').innerHTML = buildHabitFormHtml(existing);
    restoreFormValues(HABIT_FORM_FIELD_IDS, vals);
  }

  function pdmHabitFormPick(kind, value) { habitFormDraft[kind] = value; rerenderHabitForm(); }
  function pdmHabitFormSetFreqType(t) { habitFormDraft.freqType = t; rerenderHabitForm(); }
  function pdmHabitFormToggleWeekday(dow) {
    const idx = habitFormDraft.weekdays.indexOf(dow);
    if (idx === -1) habitFormDraft.weekdays.push(dow); else habitFormDraft.weekdays.splice(idx, 1);
    rerenderHabitForm();
  }
  function pdmHabitFormSetWeeklyDay(dow) { habitFormDraft.weeklyDay = dow; rerenderHabitForm(); }
  function pdmHabitFormSetMonthlyMode(mode) { habitFormDraft.monthlyMode = mode; rerenderHabitForm(); }
  function pdmHabitFormSetWeekdayPosOrdinal(v) { habitFormDraft.weekdayPosOrdinal = Number(v); }
  function pdmHabitFormSetWeekdayPosWeekday(v) { habitFormDraft.weekdayPosWeekday = Number(v); }
  function pdmHabitFormSetGoalType(t) { habitFormDraft.goalType = t; rerenderHabitForm(); }
  function pdmHabitFormSetReminderType(t) { habitFormDraft.reminderType = t; rerenderHabitForm(); }
  function pdmHabitFormSetPriority(p) { habitFormDraft.priority = p; rerenderHabitForm(); }

  function pdmSubmitHabitForm() {
    const d = habitFormDraft;
    const errBox = document.getElementById('pdmHabitFormError');
    const name = document.getElementById('hfName').value.trim();
    const errors = [];
    if (!name) errors.push('Dê um nome pro hábito.');
    if (d.freqType === 'weekdays' && d.weekdays.length === 0) errors.push('Escolha pelo menos um dia da semana.');
    if (d.freqType === 'custom') {
      const iv = Number(document.getElementById('hfIntervalDays').value);
      if (!iv || iv < 1) errors.push('Defina de quantos em quantos dias.');
    }
    if (d.freqType === 'monthly' && d.monthlyMode === 'day_of_month') {
      const dm = Number(document.getElementById('hfDayOfMonth').value);
      if (!dm || dm < 1 || dm > 31) errors.push('Dia do mês precisa ser entre 1 e 31.');
    }
    const startDate = document.getElementById('hfStartDate').value;
    const endDate = document.getElementById('hfEndDate').value;
    if (startDate && endDate && endDate < startDate) errors.push('Data de término não pode ser antes da data de início.');
    if (errors.length) { errBox.style.display = 'block'; errBox.textContent = errors.join(' '); return; }
    errBox.style.display = 'none';

    const frequency = { type: d.freqType };
    if (d.freqType === 'weekdays') frequency.weekdays = d.weekdays.slice();
    if (d.freqType === 'weekly') frequency.weeklyDay = d.weeklyDay;
    if (d.freqType === 'monthly') {
      frequency.monthlyMode = d.monthlyMode;
      if (d.monthlyMode === 'day_of_month') frequency.dayOfMonth = Number(document.getElementById('hfDayOfMonth').value);
      else frequency.weekdayPosition = { ordinal: Number(d.weekdayPosOrdinal), weekday: Number(d.weekdayPosWeekday) };
    }
    if (d.freqType === 'custom') frequency.intervalDays = Number(document.getElementById('hfIntervalDays').value);

    const goal = { type: d.goalType };
    if (d.goalType === 'count_per_period') {
      goal.target = Number(document.getElementById('hfGoalTarget').value) || 0;
      goal.period = document.getElementById('hfGoalPeriod').value;
    } else if (d.goalType === 'quantity') {
      goal.target = Number(document.getElementById('hfGoalTarget').value) || 0;
      goal.unit = document.getElementById('hfGoalUnit').value.trim();
    } else if (d.goalType === 'duration') {
      goal.target = Number(document.getElementById('hfGoalTarget').value) || 0;
    }

    const reminder = { type: d.reminderType };
    if (d.reminderType === 'custom') reminder.customMinutes = Number(document.getElementById('hfReminderCustom').value) || 10;

    const data = {
      name,
      description: document.getElementById('hfDesc').value.trim(),
      category: document.getElementById('hfCategory').value,
      color: d.color,
      icon: d.icon,
      frequency,
      startDate: startDate || todayISO(),
      endDate: endDate || null,
      schedule: {
        startTime: document.getElementById('hfStartTime').value || null,
        endTime: document.getElementById('hfEndTime').value || null,
        durationMin: Number(document.getElementById('hfDuration').value) || null,
      },
      goal,
      reminder,
      xp: Math.max(0, Number(document.getElementById('hfXp').value) || 0),
      priority: d.priority,
    };

    if (d.editingId) { PdmHM.updateHabit(d.editingId, data); pdmToast('Hábito atualizado.'); }
    else { PdmHM.createHabit(data); pdmToast('Hábito criado.'); }
    pdmCloseModal('pdmHabitFormModal');
    window.pdmRenderAll();
    if (window.PdmReminders) window.PdmReminders.scheduleTodayReminders();
  }

  // ---------------------------------------------------------------
  // DETALHE DO HÁBITO (estatísticas + histórico + ações)
  // ---------------------------------------------------------------
  function pdmOpenHabitDetail(id) {
    const h = PdmHM.getHabit(id);
    if (!h) return;
    document.getElementById('pdmHabitDetailTitle').textContent = h.name;
    document.getElementById('pdmHabitDetailBody').innerHTML = buildHabitDetailHtml(h);
    document.getElementById('pdmHabitDetailModal').classList.add('open');
  }

  function buildHabitDetailHtml(h) {
    const s = h.stats || {};
    const goalProgress = PdmHM.computeGoalProgress(h);
    const catName = (HM_CATEGORIES.find((c) => c.key === h.category) || {}).name || '—';

    let html = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">';
    html += '<div class="pdm-habit-icon" style="color:' + habitColorHex(h.color) + ';">' + habitIconSvg(h.icon) + '</div>';
    html += '<div><div style="font-size:12px;color:var(--dim);">' + escapeHtml(catName) + '</div>';
    html += '<div style="font-family:\'Space Mono\',monospace;font-size:11px;color:var(--gold-pale);">' + escapeHtml(describeFrequency(h)) + (h.schedule && h.schedule.startTime ? ' · ' + h.schedule.startTime : '') + '</div></div></div>';
    if (h.description) html += '<p style="font-size:13px;color:var(--dim);margin:8px 0;">' + escapeHtml(h.description) + '</p>';
    if (h.archivedAt) html += '<span class="pdm-mission-badge" style="display:inline-block;margin-bottom:8px;">Arquivado</span>';
    if (h.reminder && h.reminder.type !== 'none') html += '<span class="pdm-mission-badge" style="display:inline-block;margin-bottom:8px;margin-left:6px;">🔔 ' + REMINDER_LABELS[h.reminder.type] + '</span>';

    html += '<div class="pdm-stat-grid">';
    html += statTile(s.currentStreak || 0, 'Sequência atual');
    html += statTile(s.bestStreak || 0, 'Melhor sequência');
    html += statTile(s.totalCompletions || 0, 'Execuções');
    html += statTile((s.successRate || 0) + '%', 'Taxa de sucesso');
    html += statTile(s.missedCount || 0, 'Dias perdidos');
    html += statTile(s.lastCompletedAt ? formatDateLabel(s.lastCompletedAt.slice(0, 10)) : '—', 'Última execução');
    html += '</div>';

    if (goalProgress) {
      const pct = clampPct(goalProgress.target ? (goalProgress.count / goalProgress.target) * 100 : 0);
      html += '<div class="pdm-field"><label>Meta (' + (goalProgress.period === 'week' ? 'esta semana' : 'este mês') + ')</label>';
      html += '<div class="pdm-xpbar"><div class="pdm-xpbar-fill" style="width:' + pct + '%"></div></div>';
      html += '<div class="pdm-field-hint">' + goalProgress.count + ' de ' + goalProgress.target + '</div></div>';
    } else if (h.goal && h.goal.type === 'quantity') {
      html += '<div class="pdm-field-hint">Meta por execução: ' + escapeHtml(String(h.goal.target || 0)) + ' ' + escapeHtml(h.goal.unit || '') + '</div>';
    } else if (h.goal && h.goal.type === 'duration') {
      html += '<div class="pdm-field-hint">Meta por execução: ' + escapeHtml(String(h.goal.target || 0)) + ' min</div>';
    }

    const history = PdmHM.getHabitMissionHistory(h.id).slice(0, 14);
    html += '<div class="pdm-field"><label>Histórico recente</label>';
    if (!history.length) {
      html += '<p class="pdm-field-hint">Nenhuma execução registrada ainda.</p>';
    } else {
      history.forEach((m) => {
        html += '<div class="pdm-history-row"><span class="pdm-history-date">' + escapeHtml(formatDateLabel(m.date)) + '</span><span class="pdm-history-status ' + m.status + '">' + MISSION_STATUS_LABELS[m.status] + '</span></div>';
      });
    }
    html += '</div>';

    html += '<div class="pdm-detail-actions">';
    html += '<button class="pdm-btn" onclick="pdmCloseModal(\'pdmHabitDetailModal\'); pdmOpenHabitForm(\'' + h.id + '\')">Editar hábito</button>';
    if (h.archivedAt) html += '<button class="pdm-btn-ghost" onclick="pdmUIRestoreHabit(\'' + h.id + '\')">Restaurar</button>';
    else html += '<button class="pdm-btn-ghost" onclick="pdmUIArchiveHabit(\'' + h.id + '\')" style="border-color:var(--rose);color:var(--rose-pale);">Excluir hábito</button>';
    html += '</div>';
    return html;
  }

  function pdmUIArchiveHabit(id) {
    pdmConfirmGeneric('Excluir hábito', 'O hábito para de gerar novas missões a partir de hoje. O histórico de execuções já feitas continua salvo.', () => {
      PdmHM.archiveHabit(id);
      pdmCloseModal('pdmHabitDetailModal');
      window.pdmRenderAll();
      pdmToast('Hábito excluído.');
    });
  }
  function pdmUIRestoreHabit(id) {
    PdmHM.restoreHabit(id);
    pdmCloseModal('pdmHabitDetailModal');
    window.pdmRenderAll();
    pdmToast('Hábito restaurado.');
  }

  function pdmConfirmGeneric(title, text, onConfirm) {
    document.getElementById('pdmConfirmTitle').textContent = title;
    document.getElementById('pdmConfirmText').textContent = text;
    const btn = document.getElementById('pdmConfirmBtn');
    btn.onclick = () => { onConfirm(); pdmCloseModal('pdmConfirmModal'); };
    document.getElementById('pdmConfirmModal').classList.add('open');
  }

  // ---------------------------------------------------------------
  // MODAL DE MISSÃO (criar / ver / editar / ações)
  // ---------------------------------------------------------------
  let missionModalMode = 'view'; // 'view' | 'form'
  let missionModalId = null;
  let missionFormDraft = { priority: 'media' };
  const MISSION_FORM_FIELD_IDS = ['mfName', 'mfDesc', 'mfCategory', 'mfXp', 'mfDate', 'mfTime', 'mfDuration', 'mfNotes'];

  function pdmOpenMissionForm(id) {
    missionModalId = id || null;
    const existing = missionModalId ? PdmHM.getMission(missionModalId) : null;
    missionFormDraft = { priority: existing ? existing.priority : 'media' };
    missionModalMode = 'form';
    renderMissionModal();
    document.getElementById('pdmMissionModal').classList.add('open');
  }
  function pdmSwitchMissionModalToEdit(id) {
    missionModalId = id;
    const existing = PdmHM.getMission(id);
    missionFormDraft = { priority: existing.priority };
    missionModalMode = 'form';
    renderMissionModal();
  }
  function pdmOpenMissionDetail(id) {
    missionModalId = id;
    missionModalMode = 'view';
    renderMissionModal();
    document.getElementById('pdmMissionModal').classList.add('open');
  }

  function renderMissionModal() {
    const title = document.getElementById('pdmMissionModalTitle');
    const body = document.getElementById('pdmMissionModalBody');
    const footer = document.getElementById('pdmMissionModalFooter');
    if (missionModalMode === 'view') {
      const m = PdmHM.getMission(missionModalId);
      if (!m) { pdmCloseModal('pdmMissionModal'); return; }
      title.textContent = 'Missão';
      body.innerHTML = buildMissionViewHtml(m) + buildMissionActionsHtml(m);
      footer.innerHTML = '<button class="pdm-btn-ghost" onclick="pdmCloseModal(\'pdmMissionModal\')">Fechar</button>';
    } else {
      const existing = missionModalId ? PdmHM.getMission(missionModalId) : null;
      title.textContent = existing ? 'Editar missão' : 'Nova missão';
      body.innerHTML = buildMissionFormHtml(existing);
      const cancelAction = existing ? ('pdmOpenMissionDetail(\'' + existing.id + '\')') : ('pdmCloseModal(\'pdmMissionModal\')');
      footer.innerHTML =
        '<button class="pdm-btn-ghost" onclick="' + cancelAction + '">Cancelar</button>' +
        '<button class="pdm-btn" onclick="pdmSubmitMissionForm()">Salvar</button>';
    }
  }

  function buildMissionViewHtml(m) {
    const habit = m.habitId ? PdmHM.getHabit(m.habitId) : null;
    const catName = (HM_CATEGORIES.find((c) => c.key === m.category) || {}).name || '—';
    const metaParts = [formatDateFull(m.date)];
    if (m.time) metaParts.push(m.time + (m.endTime ? '–' + m.endTime : ''));
    if (m.durationMin) metaParts.push(m.durationMin + ' min');

    let html = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">';
    html += '<div class="pdm-habit-icon" style="color:' + habitColorHex(m.color) + ';">' + habitIconSvg(m.icon) + '</div>';
    html += '<div><div style="font-family:\'Oswald\',sans-serif;font-weight:600;font-size:15px;color:var(--fog);text-transform:uppercase;">' + escapeHtml(m.name) + '</div>';
    html += '<div style="font-size:11px;color:var(--dim);margin-top:2px;">' + escapeHtml(metaParts.join(' · ')) + '</div></div></div>';

    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">';
    html += '<span class="pdm-mission-badge">' + MISSION_STATUS_LABELS[m.status] + '</span>';
    html += '<span class="pdm-mission-badge">Prioridade ' + PRIORITY_LABELS[m.priority] + '</span>';
    html += '<span class="pdm-mission-badge">+' + m.xp + ' XP</span>';
    html += '<span class="pdm-mission-badge">' + escapeHtml(catName) + '</span>';
    html += habit ? '<span class="pdm-mission-badge">Do hábito: ' + escapeHtml(habit.name) + '</span>' : '<span class="pdm-mission-badge">Missão manual</span>';
    html += '</div>';

    if (m.description) html += '<p style="font-size:13px;color:var(--dim);margin-bottom:10px;">' + escapeHtml(m.description) + '</p>';
    if (m.notes) html += '<div class="pdm-field"><label>Observações</label><p style="font-size:13px;color:var(--fog);margin:0;">' + escapeHtml(m.notes) + '</p></div>';
    if (m.rescheduleHistory && m.rescheduleHistory.length) {
      html += '<div class="pdm-field"><label>Reagendamentos</label>';
      m.rescheduleHistory.forEach((h) => {
        html += '<div class="pdm-history-row"><span class="pdm-history-date">' + escapeHtml(formatDateLabel(h.from)) + ' → ' + escapeHtml(formatDateLabel(h.to)) + '</span></div>';
      });
      html += '</div>';
    }
    if (habit) html += '<p class="pdm-field-hint">Reagendar ou editar aqui muda só esta execução — o hábito continua configurado normalmente.</p>';

    html += '<div id="pdmMissionRescheduleBox" style="display:none;margin-top:10px;">' +
      field('Nova data', '<input type="date" class="pdm-input" id="mfNewDate" value="' + m.date + '">') +
      '<div class="pdm-modal-row"><button class="pdm-btn-ghost" onclick="pdmToggleRescheduleBox(false)">Cancelar</button><button class="pdm-btn" onclick="pdmConfirmReschedule(\'' + m.id + '\')">Confirmar</button></div>' +
    '</div>';
    return html;
  }

  function buildMissionActionsHtml(m) {
    const btns = [];
    if (m.status === 'concluida') {
      btns.push('<button class="pdm-btn-ghost" onclick="pdmUIReopenMission(\'' + m.id + '\')">Desfazer conclusão</button>');
    } else if (m.status === 'cancelada') {
      btns.push('<button class="pdm-btn-ghost" onclick="pdmUIReopenMission(\'' + m.id + '\')">Reabrir</button>');
    } else {
      if (m.status !== 'em_andamento') btns.push('<button class="pdm-btn-ghost" onclick="pdmUIStartMission(\'' + m.id + '\')">Iniciar</button>');
      btns.push('<button class="pdm-btn" onclick="pdmUICompleteMission(\'' + m.id + '\')">Concluir</button>');
      btns.push('<button class="pdm-btn-ghost" onclick="pdmToggleRescheduleBox(true)">Reagendar</button>');
      btns.push('<button class="pdm-btn-ghost" onclick="pdmUICancelMission(\'' + m.id + '\')">Cancelar</button>');
    }
    btns.push('<button class="pdm-btn-ghost" onclick="pdmSwitchMissionModalToEdit(\'' + m.id + '\')">Editar</button>');
    btns.push('<button class="pdm-btn-ghost" onclick="pdmUIDeleteMission(\'' + m.id + '\')" style="border-color:var(--rose);color:var(--rose-pale);">Excluir</button>');
    return '<div class="pdm-detail-actions">' + btns.join('') + '</div>';
  }

  function buildMissionFormHtml(existing) {
    const m = existing || { name: '', description: '', category: 'trabalho', color: 'gold', icon: 'flag', date: agendaDate || todayISO(), time: '', durationMin: '', xp: 10, notes: '' };
    let html = '<div id="pdmMissionFormError" class="pdm-field-error" style="display:none;"></div>';
    html += field('Nome', '<input class="pdm-input" id="mfName" value="' + escapeHtml(m.name) + '" placeholder="Ex: Consulta médica">');
    html += field('Descrição (opcional)', '<textarea class="pdm-textarea" id="mfDesc">' + escapeHtml(m.description || '') + '</textarea>');
    html += '<div class="pdm-field-row">';
    html += field('Categoria', '<select class="pdm-select" id="mfCategory">' + HM_CATEGORIES.map((c) => '<option value="' + c.key + '"' + (c.key === m.category ? ' selected' : '') + '>' + c.name + '</option>').join('') + '</select>');
    html += field('XP', '<input class="pdm-input" type="number" min="0" id="mfXp" value="' + m.xp + '">');
    html += '</div>';
    html += '<div class="pdm-field-row">';
    html += field('Data', '<input class="pdm-input" type="date" id="mfDate" value="' + m.date + '">');
    html += field('Horário (opcional)', '<input class="pdm-input" type="time" id="mfTime" value="' + (m.time || '') + '">');
    html += '</div>';
    html += field('Tempo estimado em minutos (opcional)', '<input class="pdm-input" type="number" min="0" id="mfDuration" value="' + (m.durationMin || '') + '">');
    html += field('Prioridade', buildSegmented([['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta']], missionFormDraft.priority, 'pdmMissionFormSetPriority'));
    html += field('Observações (opcional)', '<textarea class="pdm-textarea" id="mfNotes">' + escapeHtml(m.notes || '') + '</textarea>');
    if (existing && existing.habitId) {
      html += '<p class="pdm-field-hint">Essa missão veio de um hábito. Editar aqui muda só esta execução — o hábito continua igual.</p>';
    }
    return html;
  }

  function pdmMissionFormSetPriority(p) {
    missionFormDraft.priority = p;
    const existing = missionModalId ? PdmHM.getMission(missionModalId) : null;
    const vals = captureFormValues(MISSION_FORM_FIELD_IDS);
    document.getElementById('pdmMissionModalBody').innerHTML = buildMissionFormHtml(existing);
    restoreFormValues(MISSION_FORM_FIELD_IDS, vals);
  }

  function pdmSubmitMissionForm() {
    const errBox = document.getElementById('pdmMissionFormError');
    const name = document.getElementById('mfName').value.trim();
    if (!name) { errBox.style.display = 'block'; errBox.textContent = 'Dê um nome pra missão.'; return; }
    const date = document.getElementById('mfDate').value;
    if (!date) { errBox.style.display = 'block'; errBox.textContent = 'Escolha uma data.'; return; }
    errBox.style.display = 'none';

    const data = {
      name,
      description: document.getElementById('mfDesc').value.trim(),
      category: document.getElementById('mfCategory').value,
      date,
      time: document.getElementById('mfTime').value || null,
      durationMin: Number(document.getElementById('mfDuration').value) || null,
      priority: missionFormDraft.priority,
      xp: Math.max(0, Number(document.getElementById('mfXp').value) || 0),
      notes: document.getElementById('mfNotes').value.trim(),
    };

    if (missionModalId) { PdmHM.updateMission(missionModalId, data); pdmToast('Missão atualizada.'); }
    else { PdmHM.createManualMission(data); pdmToast('Missão criada.'); }
    pdmCloseModal('pdmMissionModal');
    window.pdmRenderAll();
  }

  function pdmUIStartMission(id) { PdmHM.startMission(id); window.pdmRenderAll(); pdmOpenMissionDetail(id); }
  function pdmUICompleteMission(id) {
    const gained = PdmHM.completeMission(id);
    pdmCloseModal('pdmMissionModal');
    window.pdmRenderAll();
    if (gained != null) pdmToast('+' + gained + ' XP', 'Desfazer', () => { PdmHM.reopenMission(id); window.pdmRenderAll(); });
  }
  function pdmUICancelMission(id) {
    pdmConfirmGeneric('Cancelar missão', 'A missão fica marcada como cancelada, sem XP. Isso não afeta o hábito.', () => {
      PdmHM.cancelMission(id);
      pdmCloseModal('pdmMissionModal');
      window.pdmRenderAll();
      pdmToast('Missão cancelada.');
    });
  }
  function pdmUIReopenMission(id) { PdmHM.reopenMission(id); window.pdmRenderAll(); pdmOpenMissionDetail(id); }
  function pdmUIDeleteMission(id) {
    pdmConfirmGeneric('Excluir missão', 'Isso remove só esta missão. O hábito (se houver) continua normalmente.', () => {
      PdmHM.deleteMission(id);
      pdmCloseModal('pdmMissionModal');
      window.pdmRenderAll();
      pdmToast('Missão excluída.');
    });
  }
  function pdmToggleRescheduleBox(show) {
    const box = document.getElementById('pdmMissionRescheduleBox');
    if (box) box.style.display = show ? 'block' : 'none';
  }
  function pdmConfirmReschedule(id) {
    const val = document.getElementById('mfNewDate').value;
    if (!val) return;
    PdmHM.rescheduleMission(id, val);
    window.pdmRenderAll();
    pdmOpenMissionDetail(id);
    pdmToast('Missão reagendada para ' + formatDateLabel(val) + '.');
  }

  // ---------------------------------------------------------------
  // EXPORTS
  // ---------------------------------------------------------------
  Object.assign(window, {
    pdmRenderAgenda, pdmAgendaShift, pdmAgendaGoToday, pdmQuickCompleteMission,
    pdmRenderHabitsList, pdmToggleArchivedHabits,
    pdmOpenHabitForm, pdmSubmitHabitForm,
    pdmHabitFormPick, pdmHabitFormSetFreqType, pdmHabitFormToggleWeekday, pdmHabitFormSetWeeklyDay,
    pdmHabitFormSetMonthlyMode, pdmHabitFormSetWeekdayPosOrdinal, pdmHabitFormSetWeekdayPosWeekday,
    pdmHabitFormSetGoalType, pdmHabitFormSetReminderType, pdmHabitFormSetPriority,
    pdmOpenHabitDetail, pdmUIArchiveHabit, pdmUIRestoreHabit,
    pdmOpenMissionForm, pdmOpenMissionDetail, pdmSwitchMissionModalToEdit, pdmSubmitMissionForm, pdmMissionFormSetPriority,
    pdmUIStartMission, pdmUICompleteMission, pdmUICancelMission, pdmUIReopenMission, pdmUIDeleteMission,
    pdmToggleRescheduleBox, pdmConfirmReschedule,
  });
})();
