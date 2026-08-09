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
    if (window.pdmRenderPerfil) window.pdmRenderPerfil();
  }

  // ---------------------------------------------------------------
  // HABILIDADES — grid editável (padrão + personalizadas)
  // ---------------------------------------------------------------
  function skillCardHtml(skill) {
    const info = PdmGamification.getSkillLevelInfo(skill.key);
    return (
      '<div class="pdm-skill-card" style="--habit-color:' + habitColorHex(skill.color) + ';" onclick="pdmOpenSkillForm(\'' + skill.key + '\')">' +
        '<div class="pdm-skill-head">' +
          '<div class="pdm-skill-icon">' + habitIconSvg(skill.icon) + '</div>' +
          '<div class="pdm-skill-name">' + escapeHtml(skill.name) + '</div>' +
          '<div class="pdm-skill-lvl">LV ' + info.level + '</div>' +
        '</div>' +
        '<div class="pdm-skill-bar"><div class="pdm-skill-bar-fill" style="width:' + info.progressPct + '%"></div></div>' +
        '<div class="pdm-skill-xp">' + info.xp + ' XP</div>' +
      '</div>'
    );
  }

  function pdmRenderSkills() {
    const grid = document.getElementById('pdmSkillsGrid');
    if (!grid || !window.PdmGamification) return;
    const skills = PdmGamification.getActiveSkills();
    grid.innerHTML = skills.map(skillCardHtml).join('') +
      '<div class="pdm-skill-card pdm-skill-card-add" onclick="pdmOpenSkillForm()">' +
        '<div class="pdm-skill-add-icon">+</div><div class="pdm-skill-add-label">Nova habilidade</div>' +
      '</div>';
  }

  let skillFormDraft = null;

  function pdmOpenSkillForm(key) {
    const s = key ? PdmGamification.getSkillMeta(key) : null;
    skillFormDraft = s
      ? { editingKey: s.key, icon: s.icon, color: s.color, isDefault: s.isDefault }
      : { editingKey: null, icon: 'target', color: 'gold', isDefault: false };
    document.getElementById('pdmSkillFormTitle').textContent = s ? 'Editar habilidade' : 'Nova habilidade';
    document.getElementById('pdmSkillFormBody').innerHTML = buildSkillFormHtml(s);
    document.getElementById('pdmSkillFormModal').classList.add('open');
  }

  function buildSkillFormHtml(s) {
    const d = skillFormDraft;
    const name = s ? s.name : '';
    let html = '<div id="pdmSkillFormError" class="pdm-field-error" style="display:none;"></div>';
    html += field('Nome', '<input class="pdm-input" id="skName" value="' + escapeHtml(name) + '" placeholder="Ex: Liderança">');
    html += field('Ícone', '<div class="pdm-icon-picker">' + HABIT_ICON_KEYS.map((k) =>
      '<div class="pdm-icon-swatch' + (k === d.icon ? ' active' : '') + '" onclick="pdmSkillFormPick(\'icon\',\'' + k + '\')">' + HABIT_ICONS[k] + '</div>'
    ).join('') + '</div>');
    html += field('Cor', '<div class="pdm-color-picker">' + HABIT_COLORS.map((c) =>
      '<div class="pdm-color-swatch' + (c.key === d.color ? ' active' : '') + '" style="background:' + c.hex + '" onclick="pdmSkillFormPick(\'color\',\'' + c.key + '\')"></div>'
    ).join('') + '</div>');
    if (d.editingKey && !d.isDefault) {
      html += '<button type="button" class="pdm-btn-ghost" style="border-color:var(--rose);color:var(--rose-pale);" onclick="pdmUIArchiveSkill(\'' + d.editingKey + '\')">Excluir habilidade</button>';
    }
    return html;
  }

  function rerenderSkillForm() {
    const existing = skillFormDraft.editingKey ? PdmGamification.getSkillMeta(skillFormDraft.editingKey) : null;
    const vals = captureFormValues(['skName']);
    document.getElementById('pdmSkillFormBody').innerHTML = buildSkillFormHtml(existing);
    restoreFormValues(['skName'], vals);
  }

  function pdmSkillFormPick(kind, value) { skillFormDraft[kind] = value; rerenderSkillForm(); }

  function pdmSubmitSkillForm() {
    const errBox = document.getElementById('pdmSkillFormError');
    const name = document.getElementById('skName').value.trim();
    if (!name) { errBox.style.display = 'block'; errBox.textContent = 'Dê um nome pra habilidade.'; return; }
    errBox.style.display = 'none';
    const data = { name, icon: skillFormDraft.icon, color: skillFormDraft.color };
    if (skillFormDraft.editingKey) { PdmGamification.updateSkill(skillFormDraft.editingKey, data); pdmToast('Habilidade atualizada.'); }
    else { PdmGamification.createSkill(data); pdmToast('Habilidade criada.'); }
    pdmCloseModal('pdmSkillFormModal');
    window.pdmRenderAll();
  }

  function pdmUIArchiveSkill(key) {
    pdmConfirmGeneric('Excluir habilidade', 'O XP já acumulado nela fica guardado, mas ela some da lista pra novos hábitos e missões.', () => {
      PdmGamification.archiveSkill(key);
      pdmCloseModal('pdmSkillFormModal');
      window.pdmRenderAll();
      pdmToast('Habilidade excluída.');
    });
  }

  // ---------------------------------------------------------------
  // VIEW PERFIL — stats + habilidades + conquistas, tudo num lugar só
  // ---------------------------------------------------------------
  function pdmRenderPerfil() {
    pdmRenderGamificationProfile();
  }

  // ---------------------------------------------------------------
  // PAINEL DE PERFIL — resumo + conquistas
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

  Object.assign(window, {
    pdmShowGamificationFeedback, pdmRenderGamificationProfile, pdmRenderPerfil, pdmRenderSkills,
    pdmOpenSkillForm, pdmSkillFormPick, pdmSubmitSkillForm, pdmUIArchiveSkill,
  });
})();
