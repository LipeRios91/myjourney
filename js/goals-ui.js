// Camada de UI de Objetivos: lista, formulário, detalhe e histórico de evolução.
//
// Depende de window.PdmGoals (dados), window.PdmHM (pra listar hábitos/missões
// vinculados e abrir os detalhes deles), dos helpers globais de formulário
// (js/utils.js) e de pdmToast/pdmCloseModal/pdmConfirmGeneric/pdmRenderAll,
// expostos pelo script legado e por js/habits-missions-ui.js.

(function () {
  const GOAL_STATUS_LABELS = {
    nao_iniciado: 'Não iniciado',
    em_andamento: 'Em andamento',
    concluido: 'Concluído',
    pausado: 'Pausado',
    cancelado: 'Cancelado',
  };
  const GOAL_STATUS_OPTIONS = [
    ['nao_iniciado', 'Não iniciado'], ['em_andamento', 'Em andamento'], ['concluido', 'Concluído'],
    ['pausado', 'Pausado'], ['cancelado', 'Cancelado'],
  ];

  function categoryName(key) {
    const c = PdmGoals.listGoalCategories().find((x) => x.key === key);
    return c ? c.name : '—';
  }

  // ---------------------------------------------------------------
  // LISTA DE OBJETIVOS
  // ---------------------------------------------------------------
  function goalRowHtml(g) {
    const progress = PdmGoals.computeGoalProgress(g);
    return (
      '<div class="pdm-habit' + (g.archivedAt ? ' archived' : '') + '" style="--habit-color:' + habitColorHex(g.color) + '" onclick="pdmOpenGoalDetail(\'' + g.id + '\')">' +
        '<div class="pdm-habit-icon">' + habitIconSvg(g.icon) + '</div>' +
        '<div class="pdm-habit-body">' +
          '<div class="pdm-habit-name">' + escapeHtml(g.name) + '</div>' +
          '<div class="pdm-habit-meta">' + escapeHtml(categoryName(g.category)) + ' · ' + GOAL_STATUS_LABELS[g.status] + '</div>' +
          '<div class="pdm-xpbar" style="margin-top:8px;max-width:220px;"><div class="pdm-xpbar-fill" style="width:' + progress.pct + '%"></div></div>' +
        '</div>' +
        '<div class="pdm-habit-streak"><b>' + Math.round(progress.pct) + '%</b><span>progresso</span></div>' +
        '<svg class="pdm-habit-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>' +
      '</div>'
    );
  }

  function pdmRenderGoalsList() {
    const listEl = document.getElementById('pdmGoalsList');
    if (!listEl) return;
    const active = PdmGoals.listGoals();
    const archived = PdmGoals.listGoals({ includeArchived: true }).filter((g) => g.archivedAt);
    if (!active.length) {
      listEl.innerHTML = '<div class="pdm-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M5 21V4"/><path d="M5 4h13l-3 4.5L18 13H5"/></svg><div>Nenhum objetivo ainda. Todo hábito existe pra contribuir com um — comece criando um objetivo.</div></div>';
    } else {
      listEl.innerHTML = active.map(goalRowHtml).join('');
    }
    const wrap = document.getElementById('pdmGoalsArchivedWrap');
    if (wrap) wrap.style.display = archived.length ? 'block' : 'none';
    const archivedListEl = document.getElementById('pdmGoalsArchivedList');
    if (archivedListEl) archivedListEl.innerHTML = archived.map(goalRowHtml).join('');
  }

  function pdmToggleArchivedGoals() {
    const el = document.getElementById('pdmGoalsArchivedList');
    const toggle = document.getElementById('pdmGoalsArchivedToggle');
    const show = el.style.display === 'none';
    el.style.display = show ? 'block' : 'none';
    toggle.textContent = show ? 'Ocultar arquivados' : 'Mostrar arquivados';
  }

  // ---------------------------------------------------------------
  // FORMULÁRIO DE OBJETIVO (criar/editar)
  // ---------------------------------------------------------------
  let goalFormDraft = null;
  const GOAL_FORM_FIELD_IDS = ['gfName', 'gfDesc', 'gfStartDate', 'gfTargetDate', 'gfInitialValue', 'gfTargetValue', 'gfUnit', 'gfNewCategoryName'];

  function pdmOpenGoalForm(goalId) {
    const g = goalId ? PdmGoals.getGoal(goalId) : null;
    const categories = PdmGoals.listGoalCategories();
    goalFormDraft = g ? {
      editingId: g.id, category: g.category, color: g.color, icon: g.icon, status: g.status,
      hasNumericGoal: g.hasNumericGoal, showNewCategory: false,
    } : {
      editingId: null, category: categories.length ? categories[0].key : 'outros', color: 'gold', icon: 'flag',
      status: 'nao_iniciado', hasNumericGoal: false, showNewCategory: false,
    };
    document.getElementById('pdmGoalFormTitle').textContent = g ? 'Editar objetivo' : 'Novo objetivo';
    document.getElementById('pdmGoalFormBody').innerHTML = buildGoalFormHtml(g);
    document.getElementById('pdmGoalFormModal').classList.add('open');
  }

  function buildGoalFormHtml(g) {
    const d = goalFormDraft;
    const name = g ? g.name : '';
    const desc = g ? g.description : '';
    const startDate = g ? (g.startDate || '') : todayISO();
    const targetDate = g ? (g.targetDate || '') : '';
    const unit = g ? (g.goalUnit || '') : '';
    const initialVal = g && g.goalInitialValue != null ? g.goalInitialValue : '';
    const targetVal = g && g.goalTargetValue != null ? g.goalTargetValue : '';

    let html = '<div id="pdmGoalFormError" class="pdm-field-error" style="display:none;"></div>';
    html += field('Nome', '<input class="pdm-input" id="gfName" value="' + escapeHtml(name) + '" placeholder="Ex: Perder 15 kg">');
    html += field('Descrição', '<textarea class="pdm-textarea" id="gfDesc" placeholder="Por que esse objetivo importa?">' + escapeHtml(desc) + '</textarea>');

    const categories = PdmGoals.listGoalCategories();
    let catOptions = categories.map((c) => '<option value="' + c.key + '"' + (c.key === d.category ? ' selected' : '') + '>' + escapeHtml(c.name) + '</option>').join('');
    catOptions += '<option value="__new__">+ Nova categoria</option>';
    html += field('Categoria', '<select class="pdm-select" id="gfCategory" onchange="pdmGoalFormCategoryChange(this.value)">' + catOptions + '</select>');
    if (d.showNewCategory) {
      html += field('Nome da nova categoria', '<div style="display:flex;gap:8px;"><input class="pdm-input" id="gfNewCategoryName" placeholder="Ex: Viagens"><button type="button" class="pdm-btn-ghost" style="margin-top:0;white-space:nowrap;" onclick="pdmGoalFormAddCategory()">Adicionar</button></div>');
    }

    html += field('Cor', '<div class="pdm-color-picker">' + HABIT_COLORS.map((c) =>
      '<div class="pdm-color-swatch' + (c.key === d.color ? ' active' : '') + '" style="background:' + c.hex + '" onclick="pdmGoalFormPick(\'color\',\'' + c.key + '\')"></div>'
    ).join('') + '</div>');
    html += field('Ícone', '<div class="pdm-icon-picker">' + HABIT_ICON_KEYS.map((k) =>
      '<div class="pdm-icon-swatch' + (k === d.icon ? ' active' : '') + '" onclick="pdmGoalFormPick(\'icon\',\'' + k + '\')">' + HABIT_ICONS[k] + '</div>'
    ).join('') + '</div>');

    html += field('Status', buildSegmented(GOAL_STATUS_OPTIONS, d.status, 'pdmGoalFormSetStatus'));

    html += '<div class="pdm-field-row">';
    html += field('Data de início (opcional)', '<input class="pdm-input" type="date" id="gfStartDate" value="' + startDate + '">');
    html += field('Prazo previsto (opcional)', '<input class="pdm-input" type="date" id="gfTargetDate" value="' + targetDate + '">');
    html += '</div>';

    html += '<div class="pdm-field"><label class="pdm-checkbox-row"><input type="checkbox" id="gfHasNumeric"' + (d.hasNumericGoal ? ' checked' : '') + ' onchange="pdmGoalFormToggleNumeric(this.checked)"><span>Esse objetivo tem uma meta numérica (peso, valor, quantidade...)</span></label></div>';
    if (d.hasNumericGoal) {
      html += '<div class="pdm-field-row">';
      html += field('Valor inicial', '<input class="pdm-input" type="number" step="any" id="gfInitialValue" value="' + initialVal + '">');
      html += field('Valor alvo', '<input class="pdm-input" type="number" step="any" id="gfTargetValue" value="' + targetVal + '">');
      html += '</div>';
      html += field('Unidade (opcional)', '<input class="pdm-input" id="gfUnit" value="' + escapeHtml(unit) + '" placeholder="ex: kg, R$, livros, km">');
    }
    return html;
  }

  function rerenderGoalForm() {
    const existing = goalFormDraft.editingId ? PdmGoals.getGoal(goalFormDraft.editingId) : null;
    const vals = captureFormValues(GOAL_FORM_FIELD_IDS);
    document.getElementById('pdmGoalFormBody').innerHTML = buildGoalFormHtml(existing);
    restoreFormValues(GOAL_FORM_FIELD_IDS, vals);
  }

  function pdmGoalFormPick(kind, value) { goalFormDraft[kind] = value; rerenderGoalForm(); }
  function pdmGoalFormSetStatus(s) { goalFormDraft.status = s; rerenderGoalForm(); }
  function pdmGoalFormToggleNumeric(checked) { goalFormDraft.hasNumericGoal = checked; rerenderGoalForm(); }
  function pdmGoalFormCategoryChange(value) {
    if (value === '__new__') { goalFormDraft.showNewCategory = true; }
    else { goalFormDraft.category = value; goalFormDraft.showNewCategory = false; }
    rerenderGoalForm();
  }
  function pdmGoalFormAddCategory() {
    const input = document.getElementById('gfNewCategoryName');
    const name = input ? input.value.trim() : '';
    if (!name) return;
    const cat = PdmGoals.createGoalCategory(name);
    goalFormDraft.category = cat.key;
    goalFormDraft.showNewCategory = false;
    rerenderGoalForm();
  }

  function pdmSubmitGoalForm() {
    const d = goalFormDraft;
    const errBox = document.getElementById('pdmGoalFormError');
    const name = document.getElementById('gfName').value.trim();
    const desc = document.getElementById('gfDesc').value.trim();
    const errors = [];
    if (!name) errors.push('Dê um nome pro objetivo.');
    if (!desc) errors.push('Escreva uma descrição.');
    if (d.showNewCategory) errors.push('Adicione a categoria nova (ou escolha uma existente) antes de salvar.');
    const startDate = document.getElementById('gfStartDate').value;
    const targetDate = document.getElementById('gfTargetDate').value;
    if (startDate && targetDate && targetDate < startDate) errors.push('O prazo não pode ser antes da data de início.');
    let initialValue = '', targetValue = '';
    if (d.hasNumericGoal) {
      initialValue = document.getElementById('gfInitialValue').value;
      targetValue = document.getElementById('gfTargetValue').value;
      if (initialValue === '' || targetValue === '') errors.push('Preencha o valor inicial e o valor alvo da meta.');
      else if (Number(initialValue) === Number(targetValue)) errors.push('Valor inicial e valor alvo não podem ser iguais.');
    }
    if (errors.length) { errBox.style.display = 'block'; errBox.textContent = errors.join(' '); return; }
    errBox.style.display = 'none';

    const unitEl = document.getElementById('gfUnit');
    const data = {
      name, description: desc, category: d.category, color: d.color, icon: d.icon, status: d.status,
      startDate: startDate || null, targetDate: targetDate || null,
      hasNumericGoal: d.hasNumericGoal,
      goalUnit: unitEl ? unitEl.value.trim() : '',
      goalInitialValue: d.hasNumericGoal ? Number(initialValue) : null,
      goalTargetValue: d.hasNumericGoal ? Number(targetValue) : null,
    };

    if (d.editingId) { PdmGoals.updateGoal(d.editingId, data); pdmToast('Objetivo atualizado.'); }
    else { PdmGoals.createGoal(data); pdmToast('Objetivo criado.'); }
    pdmCloseModal('pdmGoalFormModal');
    window.pdmRenderAll();
  }

  // ---------------------------------------------------------------
  // DETALHE DO OBJETIVO
  // ---------------------------------------------------------------
  function pdmOpenGoalDetail(id) {
    const g = PdmGoals.getGoal(id);
    if (!g) return;
    document.getElementById('pdmGoalDetailTitle').textContent = g.name;
    document.getElementById('pdmGoalDetailBody').innerHTML = buildGoalDetailHtml(g);
    document.getElementById('pdmGoalDetailModal').classList.add('open');
  }

  function buildGoalDetailHtml(g) {
    const progress = PdmGoals.computeGoalProgress(g);
    const stats = PdmGoals.computeGoalStats(g);
    const habits = window.PdmHM.listHabitsByGoal(g.id);
    const missions = window.PdmHM.listMissionsByGoal(g.id).slice(0, 10);

    let html = '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">';
    html += '<div class="pdm-habit-icon" style="color:' + habitColorHex(g.color) + ';">' + habitIconSvg(g.icon) + '</div>';
    html += '<div><div style="font-size:12px;color:var(--dim);">' + escapeHtml(categoryName(g.category)) + '</div>';
    html += '<span class="pdm-mission-badge" style="margin-top:4px;display:inline-block;">' + GOAL_STATUS_LABELS[g.status] + '</span></div></div>';
    if (g.description) html += '<p style="font-size:13px;color:var(--dim);margin:8px 0;">' + escapeHtml(g.description) + '</p>';
    if (g.archivedAt) html += '<span class="pdm-mission-badge" style="display:inline-block;margin-bottom:8px;">Arquivado</span>';

    html += '<div class="pdm-field"><label>Progresso</label>';
    html += '<div class="pdm-xpbar"><div class="pdm-xpbar-fill" style="width:' + progress.pct + '%"></div></div>';
    if (progress.type === 'numeric') {
      html += '<div class="pdm-field-hint">' + Math.round(progress.pct) + '% · ' + progress.current + ' de ' + progress.target + ' ' + escapeHtml(progress.unit || '') + ' (partiu de ' + progress.initial + ')</div>';
    } else {
      html += '<div class="pdm-field-hint">' + Math.round(progress.pct) + '% com base nas missões vinculadas · ' + progress.completed + ' de ' + progress.resolved + ' concluídas</div>';
    }
    html += '</div>';

    html += '<div class="pdm-stat-grid">';
    html += statTile(stats.elapsedDays, 'Dias decorridos');
    html += statTile(stats.remainingDays == null ? '—' : (stats.remainingDays < 0 ? Math.abs(stats.remainingDays) + ' atrasado' : stats.remainingDays), 'Dias restantes');
    html += statTile(stats.habitsCount, 'Hábitos vinculados');
    html += statTile(stats.completedMissions, 'Missões concluídas');
    html += statTile(stats.pendingMissions, 'Missões pendentes');
    html += '</div>';

    html += '<div class="pdm-field"><label>Histórico de evolução</label>';
    html += '<button type="button" class="pdm-btn-ghost" style="margin-top:0;" onclick="pdmToggleGoalHistoryBox(true)">+ Registrar progresso</button>';
    html += '<div id="pdmGoalHistoryBox" style="display:none;margin-top:10px;">' +
      '<div class="pdm-field-row">' +
        field('Valor' + (g.goalUnit ? ' (' + escapeHtml(g.goalUnit) + ')' : ''), '<input class="pdm-input" type="number" step="any" id="ghValue">') +
        field('Data', '<input class="pdm-input" type="date" id="ghDate" value="' + todayISO() + '">') +
      '</div>' +
      field('Observação (opcional)', '<textarea class="pdm-textarea" id="ghNote"></textarea>') +
      '<div class="pdm-modal-row"><button type="button" class="pdm-btn-ghost" onclick="pdmToggleGoalHistoryBox(false)">Cancelar</button><button type="button" class="pdm-btn" onclick="pdmSubmitGoalHistory(\'' + g.id + '\')">Salvar</button></div>' +
    '</div>';
    const history = PdmGoals.sortedHistory(g);
    if (!history.length) {
      html += '<p class="pdm-field-hint">Nenhum registro ainda.</p>';
    } else {
      history.forEach((e) => {
        html += '<div class="pdm-history-row"><span class="pdm-history-date">' + escapeHtml(formatDateLabel(e.date)) + '</span>' +
          '<span style="flex:1;text-align:right;">' + e.value + (g.goalUnit ? ' ' + escapeHtml(g.goalUnit) : '') + (e.note ? ' — ' + escapeHtml(e.note) : '') + '</span>' +
          '<button type="button" onclick="pdmDeleteGoalHistory(\'' + g.id + '\',\'' + e.id + '\')" style="background:none;border:none;color:var(--dim);cursor:pointer;padding:0 0 0 8px;" aria-label="Excluir registro">✕</button></div>';
      });
    }
    html += '</div>';

    html += '<div class="pdm-field"><label>Hábitos vinculados</label>';
    if (!habits.length) html += '<p class="pdm-field-hint">Nenhum hábito vinculado ainda.</p>';
    else habits.forEach((h) => {
      html += '<div class="pdm-history-row" style="cursor:pointer;" onclick="pdmCloseModal(\'pdmGoalDetailModal\'); pdmOpenHabitDetail(\'' + h.id + '\')"><span>' + escapeHtml(h.name) + '</span><span class="pdm-history-date">' + escapeHtml(pdmDescribeFrequency(h)) + '</span></div>';
    });
    html += '</div>';

    html += '<div class="pdm-field"><label>Últimas atividades</label>';
    if (!missions.length) html += '<p class="pdm-field-hint">Nenhuma missão vinculada ainda.</p>';
    else missions.forEach((m) => {
      html += '<div class="pdm-history-row" style="cursor:pointer;" onclick="pdmCloseModal(\'pdmGoalDetailModal\'); pdmOpenMissionDetail(\'' + m.id + '\')"><span class="pdm-history-date">' + escapeHtml(formatDateLabel(m.date)) + '</span><span class="pdm-history-status ' + m.status + '">' + escapeHtml(m.name) + '</span></div>';
    });
    html += '</div>';

    html += '<div class="pdm-detail-actions">';
    html += '<button class="pdm-btn" onclick="pdmCloseModal(\'pdmGoalDetailModal\'); pdmOpenGoalForm(\'' + g.id + '\')">Editar objetivo</button>';
    if (g.archivedAt) html += '<button class="pdm-btn-ghost" onclick="pdmUIRestoreGoal(\'' + g.id + '\')">Restaurar</button>';
    else html += '<button class="pdm-btn-ghost" onclick="pdmUIArchiveGoal(\'' + g.id + '\')" style="border-color:var(--rose);color:var(--rose-pale);">Excluir objetivo</button>';
    html += '</div>';

    return html;
  }

  function pdmToggleGoalHistoryBox(show) {
    const box = document.getElementById('pdmGoalHistoryBox');
    if (box) box.style.display = show ? 'block' : 'none';
  }
  function pdmSubmitGoalHistory(goalId) {
    const valueEl = document.getElementById('ghValue');
    const value = valueEl.value;
    if (value === '') { pdmToast('Informe um valor.'); return; }
    const date = document.getElementById('ghDate').value || todayISO();
    const note = document.getElementById('ghNote').value;
    PdmGoals.addHistoryEntry(goalId, { value, date, note });
    pdmToast('Progresso registrado.');
    pdmOpenGoalDetail(goalId);
    pdmRenderGoalsList();
  }
  function pdmDeleteGoalHistory(goalId, entryId) {
    PdmGoals.deleteHistoryEntry(goalId, entryId);
    pdmOpenGoalDetail(goalId);
    pdmRenderGoalsList();
  }

  function pdmUIArchiveGoal(id) {
    pdmConfirmGeneric('Excluir objetivo', 'O objetivo e seu histórico de evolução ficam guardados (arquivados), mas os hábitos e missões vinculados perdem essa associação — eles não são apagados.', () => {
      PdmGoals.archiveGoal(id);
      pdmCloseModal('pdmGoalDetailModal');
      window.pdmRenderAll();
      pdmToast('Objetivo excluído.');
    });
  }
  function pdmUIRestoreGoal(id) {
    PdmGoals.restoreGoal(id);
    pdmCloseModal('pdmGoalDetailModal');
    window.pdmRenderAll();
    pdmToast('Objetivo restaurado.');
  }

  Object.assign(window, {
    pdmRenderGoalsList, pdmToggleArchivedGoals,
    pdmOpenGoalForm, pdmSubmitGoalForm, pdmGoalFormPick, pdmGoalFormSetStatus, pdmGoalFormToggleNumeric,
    pdmGoalFormCategoryChange, pdmGoalFormAddCategory,
    pdmOpenGoalDetail, pdmToggleGoalHistoryBox, pdmSubmitGoalHistory, pdmDeleteGoalHistory,
    pdmUIArchiveGoal, pdmUIRestoreGoal,
    pdmGoalRowHtml: goalRowHtml,
  });
})();
