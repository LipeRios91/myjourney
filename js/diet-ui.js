// UI da Dieta: resumo diário (calorias/macros), lista de refeições, modal
// de registro (Buscar / Câmera / Manual) e modal de metas. Depende de
// window.PdmDiet (dados), window.PdmFoodSearch (busca por nome) e
// window.PdmDietAI (reconhecimento por foto via Gemini), além dos helpers
// globais (pdmToast, pdmCloseModal, pdmConfirmGeneric, field, buildSegmented,
// statTile, escapeHtml, clampPct).

(function () {
  let dietDate = null;
  let dietAdd = null;

  // ---------------------------------------------------------------
  // VIEW PRINCIPAL
  // ---------------------------------------------------------------
  function pdmRenderDiet() {
    if (!window.PdmDiet) return;
    if (!dietDate) dietDate = todayISO();
    const dateEl = document.getElementById('pdmDietDate');
    if (!dateEl) return;
    const isToday = dietDate === todayISO();
    dateEl.className = 'pdm-agenda-date' + (isToday ? ' is-today' : '');
    const fullDate = isoToDate(dietDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    dateEl.innerHTML = escapeHtml(formatDateLabel(dietDate)) + '<span>' + escapeHtml(fullDate) + (isToday ? '' : ' · toque para voltar a hoje') + '</span>';

    const totals = PdmDiet.computeDayTotals(dietDate);
    const goals = PdmDiet.getGoals();
    document.getElementById('pdmDietSummary').innerHTML = renderDietSummary(totals, goals);

    const entries = PdmDiet.listEntriesForDate(dietDate);
    const listEl = document.getElementById('pdmDietMealList');
    if (!entries.length) {
      listEl.innerHTML = '<div class="pdm-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg><div>Nenhum alimento registrado nesse dia. Toque no + pra adicionar.</div></div>';
    } else {
      listEl.innerHTML = PdmDiet.listMealTypes().map((mt) => {
        const mtEntries = entries.filter((e) => e.mealType === mt.key);
        if (!mtEntries.length) return '';
        return '<div class="pdm-eyebrow" style="margin-top:18px;">' + escapeHtml(mt.name) + '</div>' + mtEntries.map(dietEntryRowHtml).join('');
      }).join('');
    }
  }

  function pdmDietShift(delta) { dietDate = addDaysISO(dietDate || todayISO(), delta); pdmRenderDiet(); }
  function pdmDietGoToday() { dietDate = todayISO(); pdmRenderDiet(); }

  function macroBarHtml(label, value, goal) {
    const pct = goal ? clampPct((value / goal) * 100) : 0;
    const goalText = goal ? ' / ' + Math.round(goal) + 'g' : '';
    return '<div class="pdm-diet-macro">' +
        '<div class="pdm-diet-macro-row"><span>' + label + '</span><b>' + value.toFixed(1) + 'g' + goalText + '</b></div>' +
        '<div class="pdm-skill-bar"><div class="pdm-skill-bar-fill" style="width:' + pct + '%"></div></div>' +
      '</div>';
  }

  function renderDietSummary(totals, goals) {
    const kcalPct = goals.kcal ? clampPct((totals.kcal / goals.kcal) * 100) : 0;
    return '<div class="pdm-diet-kcal-row">' +
        '<div class="pdm-diet-kcal-value"><b>' + Math.round(totals.kcal) + '</b> kcal' + (goals.kcal ? ' <span>/ ' + Math.round(goals.kcal) + '</span>' : '') + '</div>' +
        '<button class="pdm-head-btn" onclick="pdmOpenDietGoalsModal()">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>' +
          'Metas' +
        '</button>' +
      '</div>' +
      (goals.kcal ? '<div class="pdm-xpbar"><div class="pdm-xpbar-fill" style="width:' + kcalPct + '%"></div></div>' : '') +
      '<div class="pdm-diet-macros-grid">' +
        macroBarHtml('Proteína', totals.protein, goals.protein) +
        macroBarHtml('Carboidratos', totals.carbs, goals.carbs) +
        macroBarHtml('Gordura', totals.fat, goals.fat) +
      '</div>';
  }

  function dietEntryRowHtml(e) {
    return '<div class="pdm-diet-entry">' +
        '<div class="pdm-diet-entry-body">' +
          '<div class="pdm-diet-entry-name">' + escapeHtml(e.name) + '</div>' +
          '<div class="pdm-diet-entry-meta">' + (e.grams ? e.grams + 'g · ' : '') + 'P ' + e.protein.toFixed(1) + 'g · C ' + e.carbs.toFixed(1) + 'g · G ' + e.fat.toFixed(1) + 'g</div>' +
        '</div>' +
        '<div class="pdm-diet-entry-kcal">' + Math.round(e.kcal) + ' kcal</div>' +
        '<button class="pdm-diet-entry-del" onclick="pdmDietConfirmDelete(\'' + e.id + '\')" aria-label="Excluir registro">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg>' +
        '</button>' +
      '</div>';
  }

  function pdmDietConfirmDelete(id) {
    pdmConfirmGeneric('Excluir registro', 'Remove esse alimento do seu registro do dia.', () => {
      PdmDiet.deleteEntry(id);
      window.pdmRenderAll();
      pdmToast('Registro removido.');
    });
  }

  // ---------------------------------------------------------------
  // METAS DIÁRIAS
  // ---------------------------------------------------------------
  function pdmOpenDietGoalsModal() {
    const g = PdmDiet.getGoals();
    document.getElementById('dietGoalKcal').value = g.kcal != null ? g.kcal : '';
    document.getElementById('dietGoalProtein').value = g.protein != null ? g.protein : '';
    document.getElementById('dietGoalCarbs').value = g.carbs != null ? g.carbs : '';
    document.getElementById('dietGoalFat').value = g.fat != null ? g.fat : '';
    document.getElementById('pdmDietGoalsModal').classList.add('open');
  }
  function pdmSubmitDietGoals() {
    PdmDiet.setGoals({
      kcal: document.getElementById('dietGoalKcal').value,
      protein: document.getElementById('dietGoalProtein').value,
      carbs: document.getElementById('dietGoalCarbs').value,
      fat: document.getElementById('dietGoalFat').value,
    });
    pdmCloseModal('pdmDietGoalsModal');
    window.pdmRenderAll();
    pdmToast('Metas atualizadas.');
  }

  // ---------------------------------------------------------------
  // MODAL DE REGISTRO — Buscar / Câmera / Manual
  // ---------------------------------------------------------------
  function freshDietAddState() {
    return {
      date: dietDate || todayISO(),
      mealType: 'outro',
      mode: 'search',
      query: '', results: [], searching: false, searched: false, searchError: false,
      picked: null, grams: 100,
      cameraPreview: null, cameraLoading: false, cameraError: false,
    };
  }

  function pdmOpenDietAddModal() {
    dietAdd = freshDietAddState();
    renderDietAddBody();
    document.getElementById('pdmDietAddModal').classList.add('open');
  }

  function computePortionTotals(picked, grams) {
    const factor = (Number(grams) || 0) / 100;
    return {
      kcal: Math.round(picked.kcal100 * factor * 10) / 10,
      protein: Math.round(picked.protein100 * factor * 10) / 10,
      carbs: Math.round(picked.carbs100 * factor * 10) / 10,
      fat: Math.round(picked.fat100 * factor * 10) / 10,
    };
  }
  function portionStatTiles(t) {
    return statTile(Math.round(t.kcal) + ' kcal', 'Calorias') +
      statTile(t.protein.toFixed(1) + 'g', 'Proteína') +
      statTile(t.carbs.toFixed(1) + 'g', 'Carboidratos') +
      statTile(t.fat.toFixed(1) + 'g', 'Gordura');
  }

  function renderPortionStep() {
    const p = dietAdd.picked;
    const totals = computePortionTotals(p, dietAdd.grams);
    return '<button type="button" class="pdm-modal-back" onclick="pdmDietBackToPick()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>Voltar</button>' +
      field('Alimento', '<div class="pdm-diet-picked-name">' + escapeHtml(p.name) + (p.brand ? ' <span>' + escapeHtml(p.brand) + '</span>' : '') + '</div>') +
      field('Porção (gramas)', '<input class="pdm-input" type="number" min="1" id="pdmDietGramsInput" value="' + dietAdd.grams + '" oninput="pdmDietRecalcPortion()">') +
      '<div class="pdm-stat-grid" id="pdmDietPortionTotals">' + portionStatTiles(totals) + '</div>';
  }
  function pdmDietRecalcPortion() {
    const input = document.getElementById('pdmDietGramsInput');
    if (!input || !dietAdd || !dietAdd.picked) return;
    dietAdd.grams = Number(input.value) || 0;
    const totals = computePortionTotals(dietAdd.picked, dietAdd.grams);
    const totalsEl = document.getElementById('pdmDietPortionTotals');
    if (totalsEl) totalsEl.innerHTML = portionStatTiles(totals);
  }
  function pdmDietBackToPick() { dietAdd.picked = null; renderDietAddBody(); }
  function pdmDietConfirmPortion() {
    const totals = computePortionTotals(dietAdd.picked, dietAdd.grams);
    PdmDiet.addEntry({
      date: dietAdd.date, mealType: dietAdd.mealType, name: dietAdd.picked.name, grams: dietAdd.grams,
      kcal: totals.kcal, protein: totals.protein, carbs: totals.carbs, fat: totals.fat,
      source: dietAdd.mode === 'camera' ? 'photo' : 'search',
    });
    pdmCloseModal('pdmDietAddModal');
    window.pdmRenderAll();
    pdmToast('Alimento registrado.');
  }

  function renderSearchStep() {
    let html = field('Buscar alimento',
      '<div style="display:flex;gap:8px;">' +
        '<input class="pdm-input" id="pdmDietSearchInput" placeholder="Ex: arroz branco cozido" value="' + escapeHtml(dietAdd.query) + '" onkeydown="if(event.key===\'Enter\'){event.preventDefault();pdmDietSearchSubmit();}">' +
        '<button type="button" id="pdmDietSearchSubmitBtn" class="pdm-btn-ghost" style="margin-top:0;white-space:nowrap;" onclick="pdmDietSearchSubmit()">Buscar</button>' +
      '</div>');
    if (dietAdd.searching) {
      html += '<p style="font-size:12.5px;color:var(--dim);">Buscando...</p>';
    } else if (dietAdd.searchError) {
      html += '<p style="font-size:12.5px;color:var(--rose-pale);">Não deu pra buscar agora. Tente de novo ou use o modo Manual.</p>';
    } else if (dietAdd.results.length) {
      html += '<div class="pdm-diet-results">' + dietAdd.results.map((r, i) =>
        '<div class="pdm-diet-result" onclick="pdmDietPickResult(' + i + ')">' +
          '<div class="pdm-diet-result-name">' + escapeHtml(r.name) + (r.brand ? ' <span>' + escapeHtml(r.brand) + '</span>' : '') + '</div>' +
          '<div class="pdm-diet-result-meta">' + Math.round(r.kcal100) + ' kcal/100g · P ' + r.protein100 + 'g · C ' + r.carbs100 + 'g · G ' + r.fat100 + 'g</div>' +
        '</div>'
      ).join('') + '</div>';
    } else if (dietAdd.searched) {
      html += '<p style="font-size:12.5px;color:var(--dim);">Nenhum resultado. Tente outro nome ou use o modo Manual.</p>';
    }
    return html;
  }
  async function pdmDietSearchSubmit() {
    const input = document.getElementById('pdmDietSearchInput');
    const q = input ? input.value.trim() : '';
    if (!q) { pdmToast('Digite o nome de um alimento.'); return; }
    dietAdd.query = q; dietAdd.searching = true; dietAdd.searchError = false; dietAdd.searched = false;
    renderDietAddBody();
    try {
      dietAdd.results = await PdmFoodSearch.searchByName(q);
      dietAdd.searched = true;
    } catch (e) {
      dietAdd.results = []; dietAdd.searchError = true;
    }
    dietAdd.searching = false;
    renderDietAddBody();
  }
  function pdmDietPickResult(i) {
    const r = dietAdd.results[i];
    if (!r) return;
    dietAdd.picked = r;
    dietAdd.grams = 100;
    renderDietAddBody();
  }

  function renderCameraStep() {
    if (!window.PdmDietAI || !PdmDietAI.isConfigured()) {
      return '<p style="font-size:12.5px;color:var(--dim);margin-bottom:12px;">Reconhecimento por foto usa uma IA (Gemini) — você ainda não configurou sua chave.</p>' +
        '<button type="button" class="pdm-btn-ghost" onclick="pdmOpenGeminiConfigModal()">Configurar IA de fotos</button>';
    }
    let html = '<input type="file" accept="image/*" capture="environment" class="pdm-file-input" id="pdmDietCameraInput" onchange="pdmDietCameraCapture(event)">';
    if (dietAdd.cameraPreview) html += '<img src="' + dietAdd.cameraPreview + '" style="width:100%;max-height:220px;object-fit:cover;margin-bottom:12px;background:var(--void);">';
    if (dietAdd.cameraLoading) html += '<p style="font-size:12.5px;color:var(--dim);">Analisando a foto...</p>';
    else if (dietAdd.cameraError) html += '<p style="font-size:12.5px;color:var(--rose-pale);">Não consegui analisar essa foto. Tente outra ou use o modo Manual.</p>';
    html += '<button type="button" class="pdm-btn-ghost" onclick="document.getElementById(\'pdmDietCameraInput\').click()">' + (dietAdd.cameraPreview ? 'Tirar outra foto' : 'Tirar foto') + '</button>';
    return html;
  }
  function pdmDietCameraCapture(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      dietAdd.cameraPreview = reader.result;
      dietAdd.cameraLoading = true;
      dietAdd.cameraError = false;
      renderDietAddBody();
      try {
        const result = await PdmDietAI.recognizeFood(reader.result);
        dietAdd.picked = result;
        dietAdd.grams = result.estimatedGrams || 100;
      } catch (e) {
        dietAdd.cameraError = true;
      }
      dietAdd.cameraLoading = false;
      renderDietAddBody();
    };
    reader.readAsDataURL(file);
  }

  function renderManualStep() {
    return field('Nome do alimento', '<input class="pdm-input" id="pdmDietManualName" placeholder="Ex: Arroz com feijão">') +
      field('Porção (gramas, opcional)', '<input class="pdm-input" type="number" id="pdmDietManualGrams" placeholder="Ex: 250">') +
      '<div class="pdm-stat-grid" style="grid-template-columns:repeat(2,1fr);gap:10px;">' +
        field('Calorias (kcal)', '<input class="pdm-input" type="number" id="pdmDietManualKcal" placeholder="0">') +
        field('Proteína (g)', '<input class="pdm-input" type="number" id="pdmDietManualProtein" placeholder="0">') +
        field('Carboidratos (g)', '<input class="pdm-input" type="number" id="pdmDietManualCarbs" placeholder="0">') +
        field('Gordura (g)', '<input class="pdm-input" type="number" id="pdmDietManualFat" placeholder="0">') +
      '</div>';
  }
  function pdmDietSubmitManual() {
    const name = document.getElementById('pdmDietManualName').value.trim();
    if (!name) { pdmToast('Digite o nome do alimento.'); return; }
    const grams = Number(document.getElementById('pdmDietManualGrams').value) || 0;
    const kcal = Number(document.getElementById('pdmDietManualKcal').value) || 0;
    const protein = Number(document.getElementById('pdmDietManualProtein').value) || 0;
    const carbs = Number(document.getElementById('pdmDietManualCarbs').value) || 0;
    const fat = Number(document.getElementById('pdmDietManualFat').value) || 0;
    PdmDiet.addEntry({ date: dietAdd.date, mealType: dietAdd.mealType, name, grams, kcal, protein, carbs, fat, source: 'manual' });
    pdmCloseModal('pdmDietAddModal');
    window.pdmRenderAll();
    pdmToast('Alimento registrado.');
  }

  function pdmDietSetMode(mode) { dietAdd.mode = mode; dietAdd.picked = null; renderDietAddBody(); }
  function pdmDietSetMealType(key) { dietAdd.mealType = key; renderDietAddBody(); }

  function renderDietAddBody() {
    const el = document.getElementById('pdmDietAddBody');
    if (!el || !dietAdd) return;
    let html = field('Refeição', buildSegmented(PdmDiet.listMealTypes().map((m) => [m.key, m.name]), dietAdd.mealType, 'pdmDietSetMealType'));
    if (dietAdd.picked) {
      html += renderPortionStep();
    } else {
      html += buildSegmented([['search', 'Buscar'], ['camera', 'Câmera'], ['manual', 'Manual']], dietAdd.mode, 'pdmDietSetMode');
      if (dietAdd.mode === 'search') html += renderSearchStep();
      else if (dietAdd.mode === 'camera') html += renderCameraStep();
      else html += renderManualStep();
    }
    el.innerHTML = html;
    renderDietAddFooter();
  }
  function renderDietAddFooter() {
    const el = document.getElementById('pdmDietAddFooter');
    if (!el || !dietAdd) return;
    if (dietAdd.picked) {
      el.innerHTML = '<button class="pdm-btn-ghost" onclick="pdmCloseModal(\'pdmDietAddModal\')">Cancelar</button><button class="pdm-btn" onclick="pdmDietConfirmPortion()">Adicionar</button>';
    } else if (dietAdd.mode === 'manual') {
      el.innerHTML = '<button class="pdm-btn-ghost" onclick="pdmCloseModal(\'pdmDietAddModal\')">Cancelar</button><button class="pdm-btn" onclick="pdmDietSubmitManual()">Adicionar</button>';
    } else {
      el.innerHTML = '<button class="pdm-btn-ghost" onclick="pdmCloseModal(\'pdmDietAddModal\')">Cancelar</button>';
    }
  }

  // ---------------------------------------------------------------
  // CONFIG DA IA DE FOTOS (Gemini)
  // ---------------------------------------------------------------
  function pdmOpenGeminiConfigModal() {
    document.getElementById('geminiApiKeyInput').value = window.PdmDietAI ? PdmDietAI.getApiKey() : '';
    document.getElementById('pdmGeminiConfigModal').classList.add('open');
  }
  function pdmSubmitGeminiConfig() {
    const key = document.getElementById('geminiApiKeyInput').value.trim();
    if (!key) { pdmToast('Cole sua chave da API do Gemini.'); return; }
    PdmDietAI.setApiKey(key);
    pdmCloseModal('pdmGeminiConfigModal');
    pdmToast('IA de fotos configurada.');
    const addModal = document.getElementById('pdmDietAddModal');
    if (addModal && addModal.classList.contains('open') && dietAdd) { dietAdd.mode = 'camera'; renderDietAddBody(); }
  }
  function pdmGeminiDisconnect() {
    PdmDietAI.clearApiKey();
    document.getElementById('geminiApiKeyInput').value = '';
    pdmToast('Chave da IA removida.');
  }

  Object.assign(window, {
    pdmRenderDiet, pdmDietShift, pdmDietGoToday, pdmDietConfirmDelete,
    pdmOpenDietGoalsModal, pdmSubmitDietGoals,
    pdmOpenDietAddModal, pdmDietSetMode, pdmDietSetMealType,
    pdmDietSearchSubmit, pdmDietPickResult, pdmDietCameraCapture,
    pdmDietRecalcPortion, pdmDietBackToPick, pdmDietConfirmPortion, pdmDietSubmitManual,
    pdmOpenGeminiConfigModal, pdmSubmitGeminiConfig, pdmGeminiDisconnect,
  });
})();
