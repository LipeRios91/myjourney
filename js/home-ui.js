// Home — tela principal, ponto de entrada diário.
//
// Propositalmente sem regras de negócio: só lê dos módulos existentes
// (window.PdmHM, window.PdmGoals) via suas funções de consulta já expostas
// e monta a apresentação. Nenhuma mutação de dados acontece aqui — toda
// ação (concluir, reagendar, criar...) delega pros handlers já existentes
// dos outros módulos (pdmOpenMissionForm, pdmQuickToggleMission, etc.).
//
// Atualização automática: qualquer mutação no app já chama window.pdmRenderAll(),
// que inclui pdmRenderHome() — não existe listener/estado próprio aqui.

(function () {
  function greetingText() {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function renderHomeGreeting() {
    const greetingEl = document.getElementById('pdmHomeGreeting');
    const dateEl = document.getElementById('pdmHomeDate');
    if (!greetingEl || !dateEl) return;
    greetingEl.textContent = greetingText();
    const dateStr = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    dateEl.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  }

  function renderHomeSummary(missions) {
    const grid = document.getElementById('pdmHomeSummary');
    if (!grid) return;
    const nowHM = new Date().toTimeString().slice(0, 5);
    const completed = missions.filter((m) => m.status === 'concluida').length;
    const pendingList = missions.filter((m) => !['concluida', 'cancelada'].includes(m.status));
    const late = pendingList.filter((m) => m.time && m.time < nowHM).length;
    const consideredTotal = missions.filter((m) => m.status !== 'cancelada').length;
    const pct = consideredTotal ? Math.round((completed / consideredTotal) * 100) : 0;
    grid.innerHTML = statTile(completed, 'Concluídas') + statTile(pendingList.length, 'Pendentes') +
      statTile(late, 'Atrasadas') + statTile(pct + '%', 'Do dia');
  }

  function nextMissionId(missions) {
    const nowHM = new Date().toTimeString().slice(0, 5);
    const open = missions.filter((m) => !['concluida', 'cancelada'].includes(m.status));
    if (!open.length) return null;
    const upcoming = open.find((m) => !m.time || m.time >= nowHM);
    return (upcoming || open[0]).id;
  }

  function renderHomeMissions(missions) {
    const wrap = document.getElementById('pdmHomeMissions');
    if (!wrap) return;
    if (!missions.length) {
      wrap.innerHTML = '<div class="pdm-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg><div>Nenhuma missão pra hoje. Toque em "Missão" nas ações rápidas pra criar uma.</div></div>';
      return;
    }
    const nextId = nextMissionId(missions);
    wrap.innerHTML = missions.map((m) => window.pdmMissionRowHtml(m, { highlight: m.id === nextId })).join('');
  }

  function renderHomeGoals(goals) {
    const wrap = document.getElementById('pdmHomeGoals');
    const seeAllBtn = document.getElementById('pdmHomeGoalsSeeAll');
    if (!wrap) return;
    if (!goals.length) {
      wrap.innerHTML = '<div class="pdm-empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M5 21V4"/><path d="M5 4h13l-3 4.5L18 13H5"/></svg><div>Nenhum objetivo ativo ainda.</div></div>';
      if (seeAllBtn) seeAllBtn.style.display = 'none';
      return;
    }
    const shown = goals.slice(0, 3);
    wrap.innerHTML = shown.map((g) => window.pdmGoalRowHtml(g)).join('');
    if (seeAllBtn) seeAllBtn.style.display = goals.length > 3 ? 'flex' : 'none';
  }

  function renderHomeHabits(habits, today) {
    const wrap = document.getElementById('pdmHomeHabits');
    if (!wrap) return;
    if (!habits.length) {
      wrap.innerHTML = '<p class="pdm-field-hint">Nenhum hábito previsto pra hoje.</p>';
      return;
    }
    const labels = window.pdmMissionStatusLabels || {};
    wrap.innerHTML = habits.map((h) => {
      const history = PdmHM.getHabitMissionHistory(h.id);
      const todayMission = history.find((m) => m.scheduledDate === today);
      const statusText = todayMission ? (labels[todayMission.status] || todayMission.status) : 'Missão ainda não gerada';
      return (
        '<div class="pdm-habit" style="--habit-color:' + habitColorHex(h.color) + '; cursor:pointer;" onclick="pdmOpenHabitDetail(\'' + h.id + '\')">' +
          '<div class="pdm-habit-icon">' + habitIconSvg(h.icon) + '</div>' +
          '<div class="pdm-habit-body">' +
            '<div class="pdm-habit-name">' + escapeHtml(h.name) + '</div>' +
            '<div class="pdm-habit-meta">' + escapeHtml(statusText) + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function renderHomeStreak() {
    const grid = document.getElementById('pdmHomeStreak');
    if (!grid || !window.PdmGamification) return;
    const s = window.PdmGamification.getStreak();
    grid.innerHTML = statTile(s.count || 0, 'Sequência atual') + statTile(s.best || 0, 'Melhor sequência');
  }

  function renderHomeEmptyState() {
    const el = document.getElementById('pdmHomeEmptyState');
    if (!el) return;
    el.innerHTML =
      '<div class="pdm-panel" style="text-align:center;padding:40px 20px;">' +
        '<div class="pdm-eyebrow" style="justify-content:center;">Comece por aqui</div>' +
        '<p style="font-size:13px;color:var(--dim);margin:0 0 20px;">Ainda não há nada cadastrado. O Passe do Mestre funciona assim: um Objetivo dá propósito aos seus Hábitos, que geram Missões — as ações do dia a dia.</p>' +
        '<div style="display:flex;flex-direction:column;gap:10px;max-width:280px;margin:0 auto;">' +
          '<button class="pdm-btn" onclick="pdmOpenGoalForm()">Criar meu primeiro objetivo</button>' +
          '<button class="pdm-btn-ghost" onclick="pdmOpenHabitForm()">Criar meu primeiro hábito</button>' +
          '<button class="pdm-btn-ghost" onclick="pdmOpenMissionForm()">Criar minha primeira missão</button>' +
        '</div>' +
      '</div>';
  }

  function pdmRenderHome() {
    const emptyEl = document.getElementById('pdmHomeEmptyState');
    const contentEl = document.getElementById('pdmHomeContent');
    if (!emptyEl || !contentEl) return;
    if (!window.PdmHM || !window.PdmGoals) return; // ainda carregando — init() vai rechamar renderAll() ao terminar

    try {
      const today = todayISO();
      const missions = PdmHM.listMissionsForDate(today);
      const allHabits = PdmHM.listHabits();
      const todaysHabits = allHabits.filter((h) => PdmHM.habitOccursOnDate(h, today));
      const activeGoals = PdmGoals.listGoals();

      const hasNothing = activeGoals.length === 0 && allHabits.length === 0 && missions.length === 0;
      emptyEl.style.display = hasNothing ? 'block' : 'none';
      contentEl.style.display = hasNothing ? 'none' : 'block';
      if (hasNothing) { renderHomeEmptyState(); return; }

      renderHomeGreeting();
      renderHomeSummary(missions);
      renderHomeMissions(missions);
      renderHomeGoals(activeGoals);
      renderHomeHabits(todaysHabits, today);
      renderHomeStreak();
    } catch (e) {
      contentEl.style.display = 'block';
      emptyEl.style.display = 'none';
      contentEl.innerHTML = '<div class="pdm-panel"><p style="color:var(--rose-pale);font-size:13px;margin:0;">Não foi possível carregar a Home agora. Tente novamente em instantes.</p></div>';
    }
  }

  window.pdmRenderHome = pdmRenderHome;
})();
