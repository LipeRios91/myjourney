// UI da camada de Gamificação: feedback visual (toasts em fila + animação
// de subida de nível) e o painel de Conquistas + resumo de perfil na view
// Passe. Depende de window.PdmGamification (dados) e de pdmToast/statTile,
// expostos pelo script legado e por js/utils.js.

(function () {
  // ---------------------------------------------------------------
  // FILA DE FEEDBACK — toasts sequenciais, sem se sobrepor, pra dar
  // conta de vários eventos disparados pela mesma ação (XP + conquista +
  // evolução de habilidade, por exemplo) sem interromper a experiência.
  // ---------------------------------------------------------------
  let feedbackQueue = [];
  let feedbackRunning = false;

  function queueFeedback(msg, actionLabel, onAction) {
    feedbackQueue.push({ msg, actionLabel, onAction });
    runFeedbackQueue();
  }
  function runFeedbackQueue() {
    if (feedbackRunning || !feedbackQueue.length) return;
    feedbackRunning = true;
    const item = feedbackQueue.shift();
    pdmToast(item.msg, item.actionLabel, item.onAction);
    setTimeout(() => { feedbackRunning = false; runFeedbackQueue(); }, item.actionLabel ? 4000 : 2000);
  }

  function showLevelUpOverlay(levelTo) {
    const el = document.getElementById('pdmLevelUpOverlay');
    if (!el) return;
    document.getElementById('pdmLevelUpName').textContent = levelTo.name;
    el.classList.add('show');
    clearTimeout(showLevelUpOverlay._t);
    showLevelUpOverlay._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // Ponto único de entrada: qualquer módulo que chame uma ação de
  // gamificação (completar missão, concluir objetivo...) repassa o
  // resultado devolvido pra cá, que decide o feedback visual adequado —
  // sem o módulo de origem precisar saber o que é XP, nível, conquista etc.
  function pdmShowGamificationFeedback(result, opts) {
    if (!result) return;
    opts = opts || {};

    if (result.xpGained) {
      queueFeedback('+' + result.xpGained + ' XP', opts.undoLabel, opts.onUndo);
    }
    if (result.dailyPlanBonus) {
      queueFeedback('Planejamento do dia cumprido! +' + result.dailyPlanBonus + ' XP');
    }
    if (result.skillLeveledUp) {
      queueFeedback('Habilidade evoluiu pra nível ' + result.skillLevelTo + '! +' + (result.skillLevelUpBonus || 0) + ' XP');
    }
    if (result.leveledUp) {
      showLevelUpOverlay(result.levelTo);
      queueFeedback('Novo nível: ' + result.levelTo.name + '!');
    } else if (result.newTiersUnlocked && result.newTiersUnlocked.length) {
      queueFeedback('Novos prêmios do Battle Pass desbloqueados!');
    }
    if (result.achievementsUnlocked && result.achievementsUnlocked.length) {
      result.achievementsUnlocked.forEach((a) => queueFeedback('🏆 Conquista desbloqueada: ' + a.name));
    }
    if (window.pdmRenderGamificationProfile) window.pdmRenderGamificationProfile();
  }

  // ---------------------------------------------------------------
  // PAINEL DE PERFIL — resumo + conquistas, na view Passe
  // ---------------------------------------------------------------
  function pdmRenderGamificationProfile() {
    const statsEl = document.getElementById('pdmProfileStats');
    const gridEl = document.getElementById('pdmAchievementsGrid');
    if (!statsEl || !gridEl || !window.PdmGamification) return;

    const info = PdmGamification.getLevelInfo();
    const streak = PdmGamification.getStreak();
    const unlocked = PdmGamification.getAchievements();

    statsEl.innerHTML =
      statTile(info.current.name, 'Título atual') +
      statTile(PdmGamification.getTotalXP().toLocaleString('pt-BR'), 'XP total') +
      statTile(streak.count || 0, 'Sequência atual') +
      statTile(streak.best || 0, 'Melhor sequência') +
      statTile(streak.totalActiveDays || 0, 'Dias ativos (total)') +
      statTile(PdmGamification.getCurrentMultiplier().toFixed(1) + 'x', 'Multiplicador de XP');

    const defs = PdmGamification.getAchievementDefs();
    gridEl.innerHTML = defs.map((def) => {
      const entry = unlocked.find((a) => a.key === def.key);
      const done = !!entry;
      const dateLabel = done ? formatDateLabel(entry.unlockedAt.slice(0, 10)) : 'Bloqueada';
      return (
        '<div class="pdm-achievement' + (done ? ' unlocked' : '') + '">' +
          '<div class="pdm-achievement-icon">' + def.icon + '</div>' +
          '<div class="pdm-achievement-body">' +
            '<div class="pdm-achievement-name">' + escapeHtml(def.name) + '</div>' +
            '<div class="pdm-achievement-desc">' + escapeHtml(def.description) + '</div>' +
            '<div class="pdm-achievement-date">' + escapeHtml(dateLabel) + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  Object.assign(window, { pdmShowGamificationFeedback, pdmRenderGamificationProfile });
})();
