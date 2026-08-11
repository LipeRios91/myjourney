// UI do Onboarding Inicial — camada de ativação/orientação sobre os
// sistemas já existentes. Não duplica nenhuma regra de negócio: toda
// criação real de Objetivo/Habilidade/Hábito passa pelas mesmas funções
// que os formulários normais usam (window.PdmGoals.createGoal,
// window.PdmGamification.createSkill, window.PdmHM.createHabit) — este
// arquivo só monta o passo a passo e chama o que já existe. Depois de
// qualquer criação real, chama window.pdmRenderAll() (mesma convenção do
// resto do app) pra Home já refletir os dados assim que o overlay fechar.
//
// Overlay full-screen próprio (não é um modal — bloqueia toda a navegação
// enquanto ativo), com z-index abaixo de .pdm-modal-bg (999) de propósito:
// o passo de resumo abre os modais REAIS de edição de objetivo/hábito
// (pdmOpenGoalForm/pdmOpenHabitForm) por cima do onboarding, sem duplicar
// esses formulários.

(function () {
  // Estado só de composição do formulário atual — efêmero, não persistido
  // (mesmo padrão de habitFormDraft/goalFormDraft nos outros módulos de UI:
  // se o usuário recarregar no meio de digitar, o texto em progresso se
  // perde, mas o PASSO e os dados já criados de verdade continuam salvos
  // via window.PdmOnboarding).
  let wizardState = { step: 0, goal: null, skillPicks: null, habit: null };

  const TOTAL_STEPS = 7;

  // Serializa um valor pra um literal JS seguro dentro de um atributo HTML
  // delimitado por aspas duplas (onclick="..."): JSON.stringify sozinho
  // quebraria o atributo na primeira aspa dupla interna (ex: nome de
  // habilidade/hábito digitado pelo usuário) — escapa pra &quot; antes.
  function jsAttr(value) { return JSON.stringify(value).replace(/"/g, '&quot;'); }

  // ---------------------------------------------------------------
  // SHELL
  // ---------------------------------------------------------------
  function renderShell(step, bodyHtml) {
    const showProgress = step >= 1;
    const showSkip = step <= 5;
    return '<div class="pdm-onb-card">' +
        '<div class="pdm-onb-head">' +
          (showProgress ? '<span class="pdm-onb-progress-label">Passo ' + (step + 1) + ' de ' + TOTAL_STEPS + '</span>' : '<span></span>') +
          (showSkip ? '<button type="button" class="pdm-onb-skip" onclick="pdmOnbSkip()">Pular onboarding</button>' : '') +
        '</div>' +
        (showProgress ? '<div class="pdm-onb-progress-bar"><div style="width:' + Math.round((step / (TOTAL_STEPS - 1)) * 100) + '%"></div></div>' : '') +
        '<div class="pdm-onb-body">' + bodyHtml + '</div>' +
      '</div>';
  }

  // ---------------------------------------------------------------
  // PASSO 1 — BOAS-VINDAS
  // ---------------------------------------------------------------
  function renderStep0() {
    const body =
      '<div class="pdm-onb-hero-mark">◆</div>' +
      '<h1 class="pdm-onb-title">Transforme seus objetivos em evolução diária.</h1>' +
      '<ul class="pdm-onb-bullets">' +
        '<li>Defina onde quer chegar.</li>' +
        '<li>Desenvolva as habilidades necessárias.</li>' +
        '<li>Crie hábitos.</li>' +
        '<li>Execute suas missões.</li>' +
        '<li>Acompanhe sua evolução.</li>' +
      '</ul>' +
      '<div class="pdm-onb-actions">' +
        '<button type="button" class="pdm-btn" onclick="pdmOnbNext()">Começar</button>' +
        '<button type="button" class="pdm-btn-ghost" onclick="pdmOnbSkip()">Pular onboarding</button>' +
      '</div>';
    return renderShell(0, body);
  }

  // ---------------------------------------------------------------
  // PASSO 2 — COMO O SISTEMA FUNCIONA
  // ---------------------------------------------------------------
  function renderStep1() {
    const items = [
      ['Objetivo', 'É onde você quer chegar.', 'Conseguir minha certificação PMP'],
      ['Habilidade', 'É o que você precisa desenvolver para chegar lá.', 'Gestão de Projetos'],
      ['Hábito', 'É o comportamento que você repete para desenvolver essa habilidade.', 'Estudar 1 hora por dia'],
      ['Missão', 'É o que você precisa fazer hoje.', 'Estudar PMBOK das 20h às 21h'],
      ['Execução', 'Você executa a missão e registra o resultado.', ''],
      ['Evolução', 'O sistema transforma sua consistência em progresso, XP e evolução.', ''],
    ];
    const body =
      '<h2 class="pdm-onb-h2">Como o sistema funciona</h2>' +
      '<div class="pdm-onb-pipeline">' + items.map((it, i) =>
        '<div class="pdm-onb-pipe-step">' +
          '<div class="pdm-onb-pipe-label">' + it[0] + '</div>' +
          '<div class="pdm-onb-pipe-desc">' + it[1] + '</div>' +
          (it[2] ? '<div class="pdm-onb-pipe-example">Exemplo: ' + escapeHtml(it[2]) + '</div>' : '') +
        '</div>' + (i < items.length - 1 ? '<div class="pdm-onb-pipe-arrow">↓</div>' : '')
      ).join('') + '</div>' +
      '<div class="pdm-onb-actions"><button type="button" class="pdm-btn" onclick="pdmOnbNext()">Continuar</button></div>';
    return renderShell(1, body);
  }

  // ---------------------------------------------------------------
  // PASSO 3 — OBJETIVO
  // ---------------------------------------------------------------
  function ensureGoalDraft() {
    if (!wizardState.goal) {
      wizardState.goal = {
        suggestionLabel: null, category: null, name: '', description: '',
        startDate: todayISO(), targetDate: '', hasNumericGoal: false,
        unit: '', initialValue: '', targetValue: '', showForm: false,
      };
    }
    return wizardState.goal;
  }

  function renderStep2() {
    const existingGoalId = PdmOnboarding.getDraft().goalId;
    if (existingGoalId) {
      const g = PdmGoals.getGoal(existingGoalId);
      if (g) {
        const body =
          '<h2 class="pdm-onb-h2">O que você quer conquistar?</h2>' +
          '<p class="pdm-onb-p">Você já criou seu primeiro objetivo:</p>' +
          '<div class="pdm-onb-created-card"><b>' + escapeHtml(g.name) + '</b><span>' + escapeHtml(g.description || 'Sem descrição.') + '</span></div>' +
          '<div class="pdm-onb-actions"><button type="button" class="pdm-btn" onclick="pdmOnbNext()">Continuar</button></div>';
        return renderShell(2, body);
      }
    }
    const d = ensureGoalDraft();
    let body = '<h2 class="pdm-onb-h2">O que você quer conquistar?</h2>';
    body += '<div class="pdm-onb-chips">' + PdmOnboarding.GOAL_SUGGESTIONS.map((s) =>
      '<button type="button" class="pdm-onb-chip' + (d.suggestionLabel === s.label ? ' active' : '') + '" onclick="pdmOnbPickGoalSuggestion(\'' + s.category + '\',' + jsAttr(s.label) + ')">' + escapeHtml(s.label) + '</button>'
    ).join('') + '<button type="button" class="pdm-onb-chip' + (d.suggestionLabel === '__custom__' ? ' active' : '') + '" onclick="pdmOnbPickGoalCustom()">Outro</button></div>';

    if (d.showForm) {
      body += '<div class="pdm-onb-form">';
      body += field('Nome do objetivo', '<input class="pdm-input" id="onbGoalName" value="' + escapeHtml(d.name) + '" placeholder="Ex: Conseguir minha certificação PMP" oninput="pdmOnbGoalField(\'name\', this.value)">');
      body += field('Descrição (opcional)', '<textarea class="pdm-textarea" id="onbGoalDesc" oninput="pdmOnbGoalField(\'description\', this.value)">' + escapeHtml(d.description) + '</textarea>');
      body += '<div class="pdm-field-row">';
      body += field('Data de início', '<input class="pdm-input" type="date" value="' + d.startDate + '" oninput="pdmOnbGoalField(\'startDate\', this.value)">');
      body += field('Prazo (opcional)', '<input class="pdm-input" type="date" value="' + d.targetDate + '" oninput="pdmOnbGoalField(\'targetDate\', this.value)">');
      body += '</div>';
      body += '<label class="pdm-checkbox-row"><input type="checkbox"' + (d.hasNumericGoal ? ' checked' : '') + ' onchange="pdmOnbGoalField(\'hasNumericGoal\', this.checked)"><span>Tenho uma meta numérica pra esse objetivo (opcional)</span></label>';
      if (d.hasNumericGoal) {
        body += '<div class="pdm-field-row">';
        body += field('Valor inicial', '<input class="pdm-input" type="number" step="any" value="' + d.initialValue + '" oninput="pdmOnbGoalField(\'initialValue\', this.value)">');
        body += field('Valor alvo', '<input class="pdm-input" type="number" step="any" value="' + d.targetValue + '" oninput="pdmOnbGoalField(\'targetValue\', this.value)">');
        body += '</div>';
        body += field('Unidade (opcional)', '<input class="pdm-input" value="' + escapeHtml(d.unit) + '" placeholder="ex: kg, R$, livros" oninput="pdmOnbGoalField(\'unit\', this.value)">');
      }
      body += '</div>';
      body += '<div class="pdm-onb-actions"><button type="button" class="pdm-btn" onclick="pdmOnbCreateGoal()"' + (d.name.trim() ? '' : ' disabled') + '>Criar objetivo e continuar</button></div>';
    } else {
      body += '<p class="pdm-onb-hint">Escolha uma sugestão acima ou toque em "Outro" pra escrever o seu.</p>';
    }
    return renderShell(2, body);
  }

  function pdmOnbPickGoalSuggestion(category, label) {
    const d = ensureGoalDraft();
    d.category = category; d.name = label; d.suggestionLabel = label; d.showForm = true;
    renderOverlay();
  }
  function pdmOnbPickGoalCustom() {
    const d = ensureGoalDraft();
    d.category = 'outros'; d.name = ''; d.suggestionLabel = '__custom__'; d.showForm = true;
    renderOverlay();
    const el = document.getElementById('onbGoalName');
    if (el) el.focus();
  }
  function pdmOnbGoalField(key, value) {
    const d = ensureGoalDraft();
    d[key] = value;
    if (key === 'name') {
      // Não re-renderiza a cada tecla (perderia o foco) — só atualiza o
      // estado do botão "Continuar" diretamente no DOM.
      const btn = document.querySelector('.pdm-onb-actions .pdm-btn[onclick="pdmOnbCreateGoal()"]');
      if (btn) btn.disabled = !value.trim();
      return;
    }
    if (key === 'hasNumericGoal') renderOverlay();
  }
  function pdmOnbCreateGoal() {
    const d = ensureGoalDraft();
    const name = (document.getElementById('onbGoalName') || {}).value || d.name;
    if (!name.trim()) return;
    const appearance = PdmOnboarding.appearanceForCategory(d.category);
    const goal = PdmGoals.createGoal({
      name: name,
      description: d.description,
      category: d.category,
      icon: appearance.icon,
      color: appearance.color,
      status: 'em_andamento',
      startDate: d.startDate || todayISO(),
      targetDate: d.targetDate || null,
      hasNumericGoal: d.hasNumericGoal,
      goalUnit: d.unit,
      goalInitialValue: d.initialValue,
      goalTargetValue: d.targetValue,
    });
    PdmOnboarding.patchDraft({ goalId: goal.id });
    window.pdmRenderAll();
    pdmOnbGoto(3);
  }

  // ---------------------------------------------------------------
  // PASSO 4 — HABILIDADES
  // ---------------------------------------------------------------
  function ensureSkillPicks() {
    if (!wizardState.skillPicks) {
      const goalId = PdmOnboarding.getDraft().goalId;
      const goal = goalId ? PdmGoals.getGoal(goalId) : null;
      const category = goal ? goal.category : 'outros';
      wizardState.skillPicks = PdmOnboarding.suggestSkillsForCategory(category).map((s) => Object.assign({ selected: false }, s));
    }
    return wizardState.skillPicks;
  }

  function renderStep3() {
    const existingKeys = PdmOnboarding.getDraft().skillKeys || [];
    if (existingKeys.length) {
      const names = existingKeys.map((k) => { const m = PdmGamification.getSkillMeta(k); return m ? m.name : k; });
      const body =
        '<h2 class="pdm-onb-h2">Quais habilidades você precisa desenvolver?</h2>' +
        '<p class="pdm-onb-p">Habilidades escolhidas:</p>' +
        '<div class="pdm-onb-chips">' + names.map((n) => '<span class="pdm-onb-chip active" style="pointer-events:none;">' + escapeHtml(n) + '</span>').join('') + '</div>' +
        '<div class="pdm-onb-actions"><button type="button" class="pdm-btn" onclick="pdmOnbNext()">Continuar</button></div>';
      return renderShell(3, body);
    }
    const picks = ensureSkillPicks();
    const anySelected = picks.some((p) => p.selected);
    let body = '<h2 class="pdm-onb-h2">Quais habilidades você precisa desenvolver para alcançar esse objetivo?</h2>';
    body += '<p class="pdm-onb-hint">Toque pra selecionar uma ou mais — você pode editar isso depois.</p>';
    body += '<div class="pdm-onb-chips">' + picks.map((p, i) =>
      '<button type="button" class="pdm-onb-chip' + (p.selected ? ' active' : '') + '" onclick="pdmOnbToggleSkillPick(' + i + ')">' + escapeHtml(p.name) + (p.existing ? '' : ' <small>(nova)</small>') + '</button>'
    ).join('') + '</div>';
    body += '<div class="pdm-onb-inline-add">' +
      '<input class="pdm-input" id="onbNewSkillName" placeholder="Outra habilidade...">' +
      '<button type="button" class="pdm-btn-ghost" style="margin-top:0;white-space:nowrap;" onclick="pdmOnbAddCustomSkill()">+ Adicionar</button>' +
    '</div>';
    body += '<div class="pdm-onb-actions"><button type="button" class="pdm-btn" onclick="pdmOnbCreateSkills()"' + (anySelected ? '' : ' disabled') + '>Continuar</button></div>';
    return renderShell(3, body);
  }

  function pdmOnbToggleSkillPick(i) {
    const picks = ensureSkillPicks();
    picks[i].selected = !picks[i].selected;
    renderOverlay();
  }
  function pdmOnbAddCustomSkill() {
    const input = document.getElementById('onbNewSkillName');
    const name = input ? input.value.trim() : '';
    if (!name) return;
    const picks = ensureSkillPicks();
    const norm = name.toLowerCase();
    const already = picks.find((p) => p.name.toLowerCase() === norm);
    if (already) { already.selected = true; }
    else {
      const existing = PdmGamification.getActiveSkills().find((s) => s.name.toLowerCase() === norm);
      picks.push(existing
        ? { existing: true, key: existing.key, name: existing.name, icon: existing.icon, color: existing.color, selected: true }
        : { existing: false, name: name, selected: true });
    }
    renderOverlay();
  }
  function pdmOnbCreateSkills() {
    const picks = ensureSkillPicks().filter((p) => p.selected);
    if (!picks.length) return;
    const keys = picks.map((p) => {
      if (p.existing) return p.key;
      const created = PdmGamification.createSkill({ name: p.name });
      return created ? created.key : null;
    }).filter(Boolean);
    PdmOnboarding.patchDraft({ skillKeys: keys });
    window.pdmRenderAll();
    pdmOnbGoto(4);
  }

  // ---------------------------------------------------------------
  // PASSO 5 — HÁBITO(S)
  // ---------------------------------------------------------------
  function ensureHabitDraft() {
    if (!wizardState.habit) {
      const skillKeys = PdmOnboarding.getDraft().skillKeys || [];
      wizardState.habit = { name: '', skillKey: skillKeys[0] || null, freqType: 'daily', weekdays: [], startTime: '', duration: '' };
    }
    return wizardState.habit;
  }

  function renderStep4() {
    const draft = PdmOnboarding.getDraft();
    const skillKeys = draft.skillKeys || [];
    const habitIds = draft.habitIds || [];
    const d = ensureHabitDraft();
    const skillMeta = d.skillKey ? PdmGamification.getSkillMeta(d.skillKey) : null;
    const skillName = skillMeta ? skillMeta.name : 'sua habilidade';

    let body = '<h2 class="pdm-onb-h2">Agora vamos transformar suas habilidades em hábitos.</h2>';

    if (habitIds.length) {
      body += '<p class="pdm-onb-p">Hábitos criados:</p><div class="pdm-onb-created-list">' + habitIds.map((id) => {
        const h = PdmHM.getHabit(id);
        if (!h) return '';
        return '<div class="pdm-onb-created-card"><b>' + escapeHtml(h.name) + '</b><span>' + escapeHtml(window.pdmDescribeFrequency(h)) + '</span></div>';
      }).join('') + '</div>';
    }

    body += '<div class="pdm-onb-form">';
    if (skillKeys.length > 1) {
      body += field('Qual habilidade esse hábito desenvolve?', '<select class="pdm-select" onchange="pdmOnbHabitField(\'skillKey\', this.value)">' +
        skillKeys.map((k) => { const m = PdmGamification.getSkillMeta(k); return '<option value="' + k + '"' + (k === d.skillKey ? ' selected' : '') + '>' + escapeHtml(m ? m.name : k) + '</option>'; }).join('') + '</select>');
    }
    body += '<div class="pdm-onb-chips">' + PdmOnboarding.suggestHabitNames(skillName).map((s) =>
      '<button type="button" class="pdm-onb-chip' + (d.name === s ? ' active' : '') + '" onclick="pdmOnbPickHabitSuggestion(' + jsAttr(s) + ')">' + escapeHtml(s) + '</button>'
    ).join('') + '</div>';
    body += field('Nome do hábito', '<input class="pdm-input" id="onbHabitName" value="' + escapeHtml(d.name) + '" placeholder="Ex: Estudar 30 minutos por dia" oninput="pdmOnbHabitField(\'name\', this.value)">');
    body += field('Frequência', buildSegmented([['daily', 'Diário'], ['weekdays', 'Dias da semana']], d.freqType, 'pdmOnbHabitSetFreqType'));
    if (d.freqType === 'weekdays') {
      body += field('Quais dias', '<div class="pdm-weekday-picker">' + WEEKDAY_SHORT.map((lbl, i) =>
        '<button type="button" class="' + (d.weekdays.includes(i) ? 'active' : '') + '" onclick="pdmOnbToggleWeekday(' + i + ')">' + lbl + '</button>'
      ).join('') + '</div>');
    }
    body += '<div class="pdm-field-row">';
    body += field('Horário (opcional)', '<input class="pdm-input" type="time" value="' + d.startTime + '" oninput="pdmOnbHabitField(\'startTime\', this.value)">');
    body += field('Duração em minutos (opcional)', '<input class="pdm-input" type="number" min="0" value="' + d.duration + '" oninput="pdmOnbHabitField(\'duration\', this.value)">');
    body += '</div>';
    body += '</div>';

    if (!skillKeys.length) {
      body += '<p class="pdm-onb-hint">Volte e escolha ao menos uma habilidade antes de criar um hábito.</p>';
    } else {
      body += '<div class="pdm-onb-actions">' +
        '<button type="button" class="pdm-btn-ghost" onclick="pdmOnbCreateHabit()"' + (d.name.trim() ? '' : ' disabled') + '>Criar hábito</button>' +
        (habitIds.length ? '<button type="button" class="pdm-btn" onclick="pdmOnbNext()">Continuar</button>' : '') +
      '</div>';
      if (!habitIds.length) body += '<p class="pdm-onb-hint">Comece com poucos hábitos — é mais fácil manter a consistência. Você pode adicionar mais depois, a qualquer momento.</p>';
    }
    return renderShell(4, body);
  }

  function pdmOnbPickHabitSuggestion(name) { ensureHabitDraft().name = name; renderOverlay(); }
  // 'name'/'startTime'/'duration' são texto livre digitado tecla a tecla —
  // nunca re-renderizam a cada input (perderia o foco no meio da digitação),
  // só atualizam o draft. Só 'skillKey' (select, muda as sugestões de nome)
  // precisa de re-render completo — feito via onchange, não onintput.
  function pdmOnbHabitField(key, value) {
    const d = ensureHabitDraft();
    d[key] = value;
    if (key === 'name') {
      const btn = document.querySelector('.pdm-onb-actions .pdm-btn-ghost[onclick="pdmOnbCreateHabit()"]');
      if (btn) btn.disabled = !value.trim();
      return;
    }
    if (key === 'startTime' || key === 'duration') return;
    renderOverlay();
  }
  function pdmOnbHabitSetFreqType(t) { ensureHabitDraft().freqType = t; renderOverlay(); }
  function pdmOnbToggleWeekday(dow) {
    const d = ensureHabitDraft();
    const idx = d.weekdays.indexOf(dow);
    if (idx === -1) d.weekdays.push(dow); else d.weekdays.splice(idx, 1);
    renderOverlay();
  }
  function pdmOnbCreateHabit() {
    const d = ensureHabitDraft();
    const nameEl = document.getElementById('onbHabitName');
    const name = (nameEl ? nameEl.value : d.name).trim();
    if (!name || !d.skillKey) return;
    if (d.freqType === 'weekdays' && !d.weekdays.length) { pdmToast('Escolha pelo menos um dia da semana.'); return; }
    const skillMeta = PdmGamification.getSkillMeta(d.skillKey);
    const frequency = d.freqType === 'weekdays' ? { type: 'weekdays', weekdays: d.weekdays.slice() } : { type: 'daily' };
    const habit = PdmHM.createHabit({
      name: name,
      category: d.skillKey,
      color: skillMeta ? skillMeta.color : 'gold',
      icon: skillMeta ? skillMeta.icon : 'target',
      frequency: frequency,
      startDate: todayISO(),
      schedule: { startTime: d.startTime || null, endTime: null, durationMin: d.duration ? Number(d.duration) : null },
      priority: 'media',
      xp: 10,
      goalId: PdmOnboarding.getDraft().goalId || null,
    });
    PdmOnboarding.addHabitId(habit.id);
    wizardState.habit = null; // limpa o formulário pro próximo hábito
    window.pdmRenderAll();
    renderOverlay();
  }

  // ---------------------------------------------------------------
  // PASSO 6 — HOME, GAMIFICAÇÃO, HABILIDADES E ESTATÍSTICAS
  // ---------------------------------------------------------------
  function renderStep5() {
    const body =
      '<h2 class="pdm-onb-h2">Esta será sua central diária</h2>' +
      '<div class="pdm-onb-info-block">' +
        '<div class="pdm-onb-info-title">Home</div>' +
        '<p class="pdm-onb-p">Toda vez que abrir o app, é aqui que você vai voltar pra ver o que precisa executar: objetivos, missões do dia, hábitos programados, sua próxima atividade e seu progresso.</p>' +
      '</div>' +
      '<div class="pdm-onb-info-block">' +
        '<div class="pdm-onb-info-title">Gamificação</div>' +
        '<p class="pdm-onb-p">Cada vez que você executa suas atividades, sua evolução é registrada automaticamente:</p>' +
        '<div class="pdm-onb-pipeline pdm-onb-pipeline-compact">' + ['Missão concluída', 'XP', 'Nível', 'Battle Pass', 'Conquistas', 'Evolução das habilidades'].map((t, i, arr) =>
          '<span class="pdm-onb-pipe-chip">' + t + '</span>' + (i < arr.length - 1 ? '<span class="pdm-onb-pipe-arrow-inline">→</span>' : '')
        ).join('') + '</div>' +
      '</div>' +
      '<div class="pdm-onb-info-block">' +
        '<div class="pdm-onb-info-title">Habilidades</div>' +
        '<p class="pdm-onb-p">Seu progresso não é apenas sobre completar tarefas. Você está desenvolvendo habilidades.</p>' +
        '<div class="pdm-onb-skill-example">' +
          '<div class="pdm-onb-skill-example-head"><b>Gestão de Projetos</b><span>Nível 4</span></div>' +
          '<div class="pdm-skill-bar"><div class="pdm-skill-bar-fill" style="width:70%"></div></div>' +
          '<span class="pdm-onb-skill-example-tag">+120 XP nesta semana — exemplo</span>' +
        '</div>' +
      '</div>' +
      '<div class="pdm-onb-info-block">' +
        '<div class="pdm-onb-info-title">Estatísticas</div>' +
        '<p class="pdm-onb-p">O app também acompanha, ao longo do tempo:</p>' +
        '<ul class="pdm-onb-bullets pdm-onb-bullets-compact">' +
          '<li>Consistência e sequências</li><li>Missões concluídas</li><li>Hábitos executados</li>' +
          '<li>Evolução das habilidades</li><li>Progresso dos objetivos</li><li>XP ganho</li>' +
        '</ul>' +
      '</div>' +
      '<div class="pdm-onb-actions"><button type="button" class="pdm-btn" onclick="pdmOnbNext()">Continuar</button></div>';
    return renderShell(5, body);
  }

  // ---------------------------------------------------------------
  // PASSO 7 — RESUMO E FINALIZAÇÃO
  // ---------------------------------------------------------------
  function renderStep6() {
    const draft = PdmOnboarding.getDraft();
    const goal = draft.goalId ? PdmGoals.getGoal(draft.goalId) : null;
    const skillNames = (draft.skillKeys || []).map((k) => { const m = PdmGamification.getSkillMeta(k); return m ? m.name : k; });
    const habits = (draft.habitIds || []).map((id) => PdmHM.getHabit(id)).filter(Boolean);

    let firstMissionHtml = '';
    const todayMissions = habits.length ? PdmHM.listMissionsForDate(todayISO()).filter((m) => draft.habitIds.includes(m.habitId)) : [];
    if (todayMissions.length) {
      firstMissionHtml = '<div class="pdm-onb-info-title">Primeira missão</div>' + todayMissions.map((m) => window.pdmMissionRowHtml(m)).join('');
    } else if (habits.length) {
      firstMissionHtml = '<div class="pdm-onb-info-title">Primeira missão</div><p class="pdm-onb-p">Sua primeira missão será gerada automaticamente no próximo dia em que seu hábito acontecer, de acordo com a frequência escolhida.</p>';
    }

    const body =
      '<h2 class="pdm-onb-h2">Seu primeiro plano</h2>' +
      (goal ? '<div class="pdm-onb-summary-row"><div class="pdm-onb-info-title">Objetivo</div><div class="pdm-onb-created-card"><b>' + escapeHtml(goal.name) + '</b></div>' +
        '<button type="button" class="pdm-btn-ghost" onclick="pdmOpenGoalForm(' + jsAttr(goal.id) + ')">Editar objetivo</button></div>' : '') +
      (skillNames.length ? '<div class="pdm-onb-summary-row"><div class="pdm-onb-info-title">Habilidades</div><div class="pdm-onb-chips">' + skillNames.map((n) => '<span class="pdm-onb-chip active" style="pointer-events:none;">' + escapeHtml(n) + '</span>').join('') + '</div></div>' : '') +
      (habits.length ? '<div class="pdm-onb-summary-row"><div class="pdm-onb-info-title">Hábitos</div>' + habits.map((h) =>
        '<div class="pdm-onb-created-card"><b>' + escapeHtml(h.name) + '</b><span>' + escapeHtml(window.pdmDescribeFrequency(h)) + '</span>' +
        '<button type="button" class="pdm-btn-ghost" onclick="pdmOpenHabitForm(' + jsAttr(h.id) + ')">Editar</button></div>'
      ).join('') + '</div>' : '') +
      (firstMissionHtml ? '<div class="pdm-onb-summary-row">' + firstMissionHtml + '</div>' : '') +
      '<div class="pdm-onb-final-msg"><h2 class="pdm-onb-h2">Seu sistema está pronto.</h2><p class="pdm-onb-p">Agora é simples: escolha seu objetivo, execute suas missões e evolua todos os dias.</p></div>' +
      '<div class="pdm-onb-actions"><button type="button" class="pdm-btn" onclick="pdmOnbFinish()">Ir para minha Home</button></div>';
    return renderShell(6, body);
  }

  // ---------------------------------------------------------------
  // NAVEGAÇÃO / CICLO DE VIDA
  // ---------------------------------------------------------------
  const STEP_RENDERERS = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4, renderStep5, renderStep6];

  function renderOverlay() {
    const root = document.getElementById('pdmOnboardingOverlay');
    if (!root) return;
    root.innerHTML = (STEP_RENDERERS[wizardState.step] || renderStep0)();
  }

  function pdmOnbGoto(step) {
    wizardState.step = step;
    window.PdmOnboarding.setStep(step);
    renderOverlay();
  }
  function pdmOnbNext() { pdmOnbGoto(Math.min(TOTAL_STEPS - 1, wizardState.step + 1)); }

  function pdmOnbSkip() {
    window.PdmOnboarding.markSkipped();
    document.getElementById('pdmOnboardingOverlay').classList.remove('open');
  }
  function pdmOnbFinish() {
    window.PdmOnboarding.markCompleted();
    document.getElementById('pdmOnboardingOverlay').classList.remove('open');
    window.pdmRenderAll();
    window.pdmGoto('home');
  }

  function pdmStartOnboarding() {
    if (!window.PdmOnboarding) return;
    wizardState = { step: window.PdmOnboarding.getState().currentStep || 0, goal: null, skillPicks: null, habit: null };
    renderOverlay();
    document.getElementById('pdmOnboardingOverlay').classList.add('open');
  }

  // Reabre a partir de Configurações -> Ajuda. Se já tinha sido concluído
  // ou pulado, reinicia só o estado do WIZARD (nunca apaga objetivo/
  // habilidades/hábitos já criados) — permite tanto retomar quanto guiar a
  // criação de um novo objetivo do zero.
  function pdmOnbReopenFromSettings() {
    const st = window.PdmOnboarding.getState();
    if (st.completed || st.skipped) window.PdmOnboarding.restart();
    pdmStartOnboarding();
  }

  Object.assign(window, {
    pdmStartOnboarding, pdmOnbReopenFromSettings,
    pdmOnbNext, pdmOnbSkip, pdmOnbFinish, pdmOnbGoto,
    pdmOnbPickGoalSuggestion, pdmOnbPickGoalCustom, pdmOnbGoalField, pdmOnbCreateGoal,
    pdmOnbToggleSkillPick, pdmOnbAddCustomSkill, pdmOnbCreateSkills,
    pdmOnbPickHabitSuggestion, pdmOnbHabitField, pdmOnbHabitSetFreqType, pdmOnbToggleWeekday, pdmOnbCreateHabit,
  });
})();
