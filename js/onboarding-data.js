// Camada de dados do Onboarding Inicial — só orientação/ativação sobre os
// sistemas já existentes (Objetivos/Habilidades/Hábitos/Missões), nunca um
// sistema paralelo. Não duplica nenhuma regra: toda criação real acontece
// via window.PdmGoals/window.PdmGamification/window.PdmHM (as mesmas
// funções que os formulários normais usam) — este arquivo só guarda em que
// passo o usuário está e sugere conteúdo (nome de objetivo/habilidade/
// hábito), nunca decide XP/progresso/o que quer que seja desses módulos.
//
// Depende de: window.storage (persistência), window.PdmGamification (só
// pra consultar habilidades já ativas, na hora de sugerir sem duplicar
// nome), window.PdmGoals (só pra listar categorias existentes).

(function () {
  const DEFAULT_STATE = { completed: false, skipped: false, currentStep: 0, draft: { goalId: null, skillKeys: [], habitIds: [] } };
  let STATE = Object.assign({}, DEFAULT_STATE, { draft: Object.assign({}, DEFAULT_STATE.draft) });

  // ---------------------------------------------------------------
  // PERSISTÊNCIA
  // ---------------------------------------------------------------
  async function saveState() {
    try { await window.storage.set('mestre-onboarding', JSON.stringify(STATE)); }
    catch (e) { /* melhor esforço — não bloqueia o onboarding se falhar */ }
  }

  // Detecta usuário que já usava o app antes desta feature existir, olhando
  // localStorage direto (não os módulos, que ainda não rodaram init() nesse
  // ponto do boot — ver index.html) — evita mostrar onboarding pra quem já
  // tem progresso real. Migração silenciosa, uma vez só: marca completed
  // sem nunca exibir nada.
  async function looksPreExisting() {
    const [h, g, gam] = await Promise.all([
      window.storage.get('mestre-habits'),
      window.storage.get('mestre-goals'),
      window.storage.get('mestre-gamification'),
    ]);
    try { if (h && JSON.parse(h.value).length) return true; } catch (e) { /* ignore */ }
    try { if (g && JSON.parse(g.value).length) return true; } catch (e) { /* ignore */ }
    if (gam) return true; // qualquer estado de gamificação salvo = já usou o app antes
    return false;
  }

  async function init() {
    const raw = await window.storage.get('mestre-onboarding');
    if (raw) {
      // Já existe estado salvo (em andamento, concluído ou pulado) — nunca
      // roda a detecção de "usuário pré-existente" de novo. Crítico: sem
      // isso, um onboarding em andamento que já criou um objetivo/hábito de
      // verdade seria confundido com "usuário antigo" no próximo boot (o
      // objetivo criado PELO PRÓPRIO onboarding faria looksPreExisting()
      // devolver true) e marcaria completed à força, perdendo o progresso
      // do wizard.
      try { STATE = Object.assign({}, DEFAULT_STATE, JSON.parse(raw.value)); }
      catch (e) { STATE = Object.assign({}, DEFAULT_STATE, { draft: Object.assign({}, DEFAULT_STATE.draft) }); }
      return;
    }
    // Nenhum estado salvo ainda: ou é o primeiro boot de verdade desta
    // instalação, ou é alguém que já usava o app antes desta feature
    // existir — a única vez que looksPreExisting() precisa rodar.
    STATE = Object.assign({}, DEFAULT_STATE, { draft: Object.assign({}, DEFAULT_STATE.draft) });
    if (await looksPreExisting()) STATE.completed = true;
    await saveState();
  }

  // ---------------------------------------------------------------
  // ESTADO
  // ---------------------------------------------------------------
  function isResolved() { return STATE.completed || STATE.skipped; }
  function getState() { return JSON.parse(JSON.stringify(STATE)); }
  function getDraft() { return STATE.draft; }

  function setStep(step) { STATE.currentStep = step; saveState(); }
  function patchDraft(patch) { STATE.draft = Object.assign({}, STATE.draft, patch); saveState(); }
  function addHabitId(id) { STATE.draft.habitIds = (STATE.draft.habitIds || []).concat(id); saveState(); }
  function toggleSkillKey(key, on) {
    const set = new Set(STATE.draft.skillKeys || []);
    if (on) set.add(key); else set.delete(key);
    STATE.draft.skillKeys = Array.from(set);
    saveState();
  }

  function markCompleted() { STATE.completed = true; saveState(); }
  function markSkipped() { STATE.skipped = true; saveState(); }

  // Reabre o onboarding depois de já concluído (painel Ajuda em
  // Configurações) — só reseta o estado do wizard em si, NUNCA apaga o
  // objetivo/habilidades/hábitos já criados de verdade.
  function restart() {
    STATE = { completed: false, skipped: false, currentStep: 0, draft: { goalId: null, skillKeys: [], habitIds: [] } };
    saveState();
  }

  // ---------------------------------------------------------------
  // SUGESTÕES — conteúdo só, nunca decide XP/progresso. Mapeiam pras
  // mesmas categorias de Objetivo (js/goals-data.js) e habilidades
  // (js/gamification-data.js) já existentes, nunca criam taxonomia nova.
  // ---------------------------------------------------------------
  const GOAL_SUGGESTIONS = [
    { label: 'Melhorar minha saúde', category: 'saude' },
    { label: 'Aprender uma nova habilidade', category: 'estudos' },
    { label: 'Evoluir na carreira', category: 'carreira' },
    { label: 'Organizar minhas finanças', category: 'financas' },
    { label: 'Desenvolver minha vida espiritual', category: 'espiritualidade' },
    { label: 'Criar uma rotina melhor', category: 'dev_pessoal' },
  ];

  const GOAL_CATEGORY_APPEARANCE = {
    saude: { icon: 'dumbbell', color: 'rose' },
    carreira: { icon: 'flag', color: 'gold' },
    estudos: { icon: 'book', color: 'blue' },
    financas: { icon: 'target', color: 'teal' },
    relacionamentos: { icon: 'heart', color: 'rose' },
    espiritualidade: { icon: 'moon', color: 'purple' },
    dev_pessoal: { icon: 'sun', color: 'orange' },
    outros: { icon: 'target', color: 'gold' },
  };
  function appearanceForCategory(category) { return GOAL_CATEGORY_APPEARANCE[category] || GOAL_CATEGORY_APPEARANCE.outros; }

  // Nome de habilidade sugerido -> se já existe uma habilidade ativa com
  // esse nome (padrão ou criada pelo usuário), a sugestão aponta pra ela em
  // vez de criar duplicada.
  const SKILL_NAME_SUGGESTIONS = {
    saude: ['Saúde e Força', 'Nutrição', 'Sono'],
    carreira: ['Trabalho', 'Liderança', 'Comunicação', 'Gestão de Projetos', 'Negociação'],
    estudos: ['Aprendizado', 'Foco', 'Leitura'],
    financas: ['Educação Financeira', 'Disciplina Financeira'],
    relacionamentos: ['Comunicação', 'Empatia'],
    espiritualidade: ['Mindfulness', 'Meditação'],
    dev_pessoal: ['Hobbies', 'Produtividade', 'Disciplina'],
    outros: ['Hobbies', 'Foco'],
  };

  function suggestSkillsForCategory(category) {
    const names = SKILL_NAME_SUGGESTIONS[category] || SKILL_NAME_SUGGESTIONS.outros;
    const active = window.PdmGamification ? window.PdmGamification.getActiveSkills() : [];
    const seen = new Set();
    const out = [];
    names.forEach((name) => {
      const norm = name.trim().toLowerCase();
      if (seen.has(norm)) return;
      seen.add(norm);
      const existing = active.find((s) => s.name.trim().toLowerCase() === norm);
      out.push(existing ? { existing: true, key: existing.key, name: existing.name, icon: existing.icon, color: existing.color } : { existing: false, name });
    });
    return out;
  }

  // Frases de hábito sugeridas pra uma habilidade escolhida — só um ponto
  // de partida editável (spec: "as sugestões devem ser editáveis").
  function suggestHabitNames(skillName) {
    return [
      'Praticar ' + skillName + ' por 20 minutos',
      'Estudar ' + skillName + ' por 30 minutos',
      'Dedicar 1 hora a ' + skillName,
    ];
  }

  window.PdmOnboarding = {
    init, isResolved, getState, getDraft,
    setStep, patchDraft, addHabitId, toggleSkillKey,
    markCompleted, markSkipped, restart,
    GOAL_SUGGESTIONS, appearanceForCategory, suggestSkillsForCategory, suggestHabitNames,
  };
})();
