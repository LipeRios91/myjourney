// Camada de Gamificação — completamente desacoplada dos módulos de
// Objetivos, Hábitos e Missões: eles só INFORMAM que uma ação aconteceu
// (via os métodos abaixo); esta camada decide XP, nível, evolução de
// habilidades, Battle Pass, conquistas e sequência, e é a fonte da verdade
// pra tudo isso. Nenhum desses módulos lê ou grava XP/streak diretamente.
//
// Persistência própria (mestre-gamification), migrada uma única vez do
// antigo STATE do script legado (totalXP/skills/streak), pra não perder
// progresso de quem já usava o app antes desta camada existir.
//
// Depende só de window.storage e das funções utilitárias globais de
// js/utils.js — não depende de PdmHM/PdmGoals (evita dependência circular:
// eles dependem desta camada, nunca o contrário).

(function () {
  // ---------------------------------------------------------------
  // BATTLE PASS — tiers (fonte única; era duplicado dentro do script
  // legado, agora moveu pra cá porque "nível" e "Battle Pass" são a
  // mesma progressão, e essa camada é quem calcula nível).
  // ---------------------------------------------------------------
  const TIERS = [
    {t:1, xp:0, name:'Fracassado', rewards:[]},
    {t:2, xp:100, name:null, rewards:['🎸 Palhetas e cordas novas de guitarra','💪 Whey/barra de proteína (dose pequena)','👕 Camiseta de treino simples','☕ Café especial + algo doce','🥋 Acessório pequeno de treino']},
    {t:3, xp:150, name:'Aprendiz', rewards:['👕 Camiseta fitness de marca boa','💊 Suplemento (whey ou creatina)','🎮 Jogo indie ou em promoção','🍕 Rolê casual','🎸 Kit de cordas premium']},
    {t:4, xp:300, name:null, rewards:['🥋 Kimono inicial para começar a praticar','💊 Combo de suplementos (tamanho grande)','🎮 Jogo de médio orçamento','🍽️ Rolê em restaurante novo','🎸 Afinador ou capotraste']},
    {t:5, xp:500, name:'Disciplinado', rewards:['💊 Combo de suplementos — 1 mês','🎬 Rolê cinema + jantar','🎮 Jogo AAA (promoção)','👕 Peça de roupa de treino premium','🥋 Rash guard ou protetor bucal']},
    {t:6, xp:750, name:null, rewards:['🎭 Rolê teatro','💆 Massagem relaxante avulsa','🎮 Jogo recém-lançado','🎸 Pedal de efeito básico','👖 Peça de roupa nova']},
    {t:7, xp:1200, name:'Consistente', rewards:['🎮 Jogo AAA novo, dia de lançamento','💆 Dia de spa','🥋 Upgrade de kimono','🍽️ Rolê premium (jantar chique)','🎧 Headset gamer básico']},
    {t:8, xp:1700, name:null, rewards:['💊 Suplementos — combo mensal completo','✂️ Corte de cabelo + barba','🕶️ Experiência VR avulsa','🏛️ Rolê cultural + jantar','🎸 Acessório premium de guitarra']},
    {t:9, xp:2100, name:null, rewards:['🎸 Pedal de efeito avançado','👖 Peça de roupa nova','💆 Spa day completo','🎮 Edição especial de um jogo','🥋 Aula experimental extra']},
    {t:10, xp:2500, name:'Guerreiro', rewards:['🎭 Rolê premium (teatro + jantar)','🎧 Headset gamer de qualidade','✂️ Tratamento estético de cabelo completo','💊 Suplementos linha premium','🕶️ Jogo em VR completo']},
    {t:11, xp:3200, name:null, rewards:['👖 Mini guarda-roupa (2-3 peças)','💆 Combo massagem + spa','🎮 Jogo grande + DLC','⌨️ Periférico PC','🥋 Acessórios para nova graduação']},
    {t:12, xp:3900, name:null, rewards:['👕 Guarda-roupa parcial (marco físico)','🖥️ Periférico PC (monitor entrada)','✈️ Bate-volta / viagem curta','💊 Suplementos — estoque trimestral','🎸 Upgrade de equipamento']},
    {t:13, xp:4500, name:null, rewards:['🥋 Inscrição/exame de primeira graduação','✂️ Tratamento estético premium','🎮 Jogo + acessórios temáticos','🎤 Rolê especial (show/festival)','🎸 Upgrade de instrumento']},
    {t:14, xp:5000, name:'Mestre da Rotina', rewards:['🕶️ Óculos VR','🎮 Jogo VR AAA','👔 Guarda-roupa completo','💆 Assinatura mensal de massagem','🥋 Kimono profissional']},
    {t:15, xp:6200, name:null, rewards:['💆 Spa day completo','🖥️ Peça de PC (GPU/monitor)','🎮 Franquia completa (coleção)','✈️ Viagem de fim de semana','🎸 Guitarra nova ou upgrade grande']},
    {t:16, xp:7500, name:null, rewards:['🎧 Headset/controle gamer topo','✂️ Pacote de tratamento estético contínuo','💊 Suplementos — estoque anual','👔 Roupas de marca','🥋 Seminário de artes marciais']},
    {t:17, xp:8200, name:null, rewards:['👔 Guarda-roupa completo (marco físico grande)','🖥️ Monitor gamer de alta qualidade','🎮 Edição colecionador','✈️ Viagem maior','🔊 Amplificador ou acessório topo']},
    {t:18, xp:9000, name:'Referência', rewards:['🕶️ Setup VR completo','🖥️ GPU de alta performance','💆 Spa retreat de fim de semana','🥋 Kimono de competição oficial','✈️ Viagem nacional ou internacional']},
    {t:19, xp:11000, name:null, rewards:['🖥️ Peça de PC topo (GPU/processador)','🎮 Jogo colecionador + merch','👔 Guarda-roupa grife completo','💆 Assinatura anual de massagem','🥋 Exame de faixa avançada']},
    {t:20, xp:13000, name:null, rewards:['🎮 Persona 4 Revival — dia 1 (18/fev/2027)','🎁 Merchandise Persona','🎉 Rolê especial de lançamento','🖥️ Peça final de PC','🎮 Jogo bônus da wishlist']},
    {t:21, xp:15000, name:'Inacreditável', rewards:['🖥️ PC gamer completo','✈️ Viagem grande de celebração','🥋 Exame de faixa avançada + evento','🎉 Festa de celebração do ano','👔 Renovação completa de guarda-roupa']},
    {t:22, xp:17000, name:null, rewards:['🎸 Guitarra ou equipamento de estúdio novo','🥋 Aula com instrutor renomado','🎮 Novo hardware de jogo','✈️ Viagem internacional curta','💆 Assinatura semestral de bem-estar']},
    {t:23, xp:19500, name:null, rewards:['👔 Guarda-roupa de grife renovado','🖥️ Upgrade de PC (peça topo adicional)','🎮 Coleção completa + colecionáveis','✈️ Viagem maior (etapa 1)','🥋 Equipamento de competição completo']},
    {t:24, xp:22000, name:null, rewards:['💊 Ano inteiro de suplementação premium','🎸 Setup de estúdio caseiro','🕶️ Upgrade completo de VR','🍽️ Rolê gastronômico de alto nível','✂️ Pacote anual de tratamentos estéticos']},
    {t:25, xp:25000, name:null, rewards:['🥋 Exame de graduação avançada','✈️ Viagem internacional maior (completa)','🖥️ PC gamer topo absoluto','🎉 Evento grande (festival/show)','👔 Renovação total de guarda-roupa']},
    {t:26, xp:28000, name:null, rewards:['🎁 Presente grande à sua escolha','🥋 Patrocínio de campeonato/evento de nicho','🎸 Instrumento de nível profissional','✈️ Viagem longa, imersão total','💆 Retiro de bem-estar completo']},
    {t:27, xp:30000, name:'Lendário', rewards:['🚗 Carro novo','🥋 Título/graduação de referência','🎸 Estúdio pessoal completo','🖥️ Setup definitivo (PC + VR + periféricos)','🎉 Celebração de dois anos de disciplina']},
  ];
  const NAMED_TIERS = TIERS.filter((t) => t.name);

  // ---------------------------------------------------------------
  // XP — quantidade configurável por tipo de ação. Missões e hábitos já
  // têm XP configurável no próprio cadastro (mission.xp/habit.xp); as
  // demais ações de gamificação pura ficam centralizadas aqui.
  // ---------------------------------------------------------------
  const XP_RULES = {
    goalCompleted: 100,     // concluir um Objetivo
    dailyPlanCompleted: 30, // resolver todas as missões do dia (bônus único/dia)
    skillLevelUp: 15,       // uma habilidade sobe de nível
  };

  // ---------------------------------------------------------------
  // CONQUISTAS — definição fixa; a condição é avaliada contra o estado
  // atual (achievements.js não guarda progresso próprio, só o instante
  // do desbloqueio).
  // ---------------------------------------------------------------
  const ACHIEVEMENT_DEFS = [
    { key: 'first_mission', icon: '🎯', name: 'Primeira Missão', description: 'Concluiu sua primeira missão.', check: (s) => s.lifetime.missionsCompleted >= 1 },
    { key: 'first_habit', icon: '🔁', name: 'Primeiro Hábito', description: 'Criou seu primeiro hábito.', check: (s) => s.lifetime.habitsCreated >= 1 },
    { key: 'first_goal', icon: '🏁', name: 'Primeiro Objetivo', description: 'Concluiu seu primeiro objetivo.', check: (s) => s.lifetime.goalsCompleted >= 1 },
    { key: 'first_skill_evo', icon: '🌱', name: 'Primeira Evolução', description: 'Evoluiu uma habilidade pela primeira vez.', check: (s) => s.lifetime.skillLevelUps >= 1 },
    { key: 'streak_7', icon: '🔥', name: 'Uma Semana de Fogo', description: '7 dias seguidos de disciplina.', check: (s) => s.streak.best >= 7 },
    { key: 'streak_30', icon: '🔥', name: 'Um Mês Inteiro', description: '30 dias seguidos de disciplina.', check: (s) => s.streak.best >= 30 },
    { key: 'missions_100', icon: '💯', name: 'Centena', description: '100 missões concluídas.', check: (s) => s.lifetime.missionsCompleted >= 100 },
    { key: 'habits_365', icon: '📅', name: 'Um Ano de Hábitos', description: '365 execuções de hábitos.', check: (s) => s.lifetime.habitMissionsCompleted >= 365 },
    { key: 'hours_100', icon: '⏳', name: '100 Horas', description: '100 horas investidas em missões.', check: (s) => s.lifetime.minutesLogged >= 6000 },
  ];

  let STATE = null;

  function defaultGamState() {
    return {
      totalXP: 0,
      skills: { saude: 0, hobbies: 0, trabalho: 0 },
      streak: { count: 0, best: 0, lastDate: null, totalActiveDays: 0 },
      lifetime: { missionsCompleted: 0, habitMissionsCompleted: 0, minutesLogged: 0, goalsCompleted: 0, habitsCreated: 0, skillLevelUps: 0 },
      lastDailyPlanBonusDate: null,
      achievements: [], // [{ key, unlockedAt }]
      history: [], // [{ id, type, xp, label, at }]
    };
  }

  // Migra o totalXP/skills/streak do STATE antigo (script legado,
  // localStorage key "mestre-state") só na primeira vez que esta camada
  // roda — pra quem já jogava antes dela existir não perder progresso.
  async function migrateFromLegacyState() {
    try {
      const r = await window.storage.get('mestre-state');
      if (!r) return;
      const legacy = JSON.parse(r.value);
      if (legacy.totalXP != null) STATE.totalXP = legacy.totalXP;
      if (legacy.skills) STATE.skills = Object.assign(STATE.skills, legacy.skills);
      if (legacy.streak) {
        STATE.streak.count = legacy.streak.count || 0;
        STATE.streak.best = legacy.streak.best || legacy.streak.count || 0;
        STATE.streak.lastDate = legacy.streak.lastDate || null;
      }
    } catch (e) { /* sem estado legado — segue com o padrão */ }
  }

  async function load() {
    try {
      const r = await window.storage.get('mestre-gamification');
      STATE = r ? JSON.parse(r.value) : null;
    } catch (e) { STATE = null; }
    if (!STATE) {
      STATE = defaultGamState();
      await migrateFromLegacyState();
      await save();
    }
    // Garante que estados antigos (de versões intermediárias) tenham todos os campos.
    STATE.lifetime = Object.assign({ missionsCompleted: 0, habitMissionsCompleted: 0, minutesLogged: 0, goalsCompleted: 0, habitsCreated: 0, skillLevelUps: 0 }, STATE.lifetime);
    STATE.streak = Object.assign({ count: 0, best: 0, lastDate: null, totalActiveDays: 0 }, STATE.streak);
    if (!Array.isArray(STATE.achievements)) STATE.achievements = [];
    if (!Array.isArray(STATE.history)) STATE.history = [];
  }

  async function save() {
    try { await window.storage.set('mestre-gamification', JSON.stringify(STATE)); }
    catch (e) { if (window.PdmCore) window.PdmCore.toast('Erro ao salvar sua evolução.'); }
  }

  async function init() { await load(); }

  // ---------------------------------------------------------------
  // FUNÇÕES PURAS — nível, Battle Pass, habilidades, streak
  // ---------------------------------------------------------------
  function getMultiplier(streakCount) {
    if (streakCount >= 90) return 2.0;
    if (streakCount >= 30) return 1.5;
    if (streakCount >= 7) return 1.2;
    return 1.0;
  }

  function getLevelInfo(xp) {
    xp = xp != null ? xp : STATE.totalXP;
    let current = NAMED_TIERS[0];
    let next = NAMED_TIERS[1];
    for (let i = 0; i < NAMED_TIERS.length; i++) {
      if (xp >= NAMED_TIERS[i].xp) { current = NAMED_TIERS[i]; next = NAMED_TIERS[i + 1] || null; }
    }
    const stage = NAMED_TIERS.indexOf(current);
    let progressPct = 100;
    let toNext = 'Nível máximo';
    if (next) {
      const span = next.xp - current.xp;
      const done = xp - current.xp;
      progressPct = Math.max(0, Math.min(100, (done / span) * 100));
      toNext = (next.xp - xp) + ' XP para ' + next.name;
    }
    return { current, next, stage, progressPct, toNext, xp };
  }

  function skillLevel(xp) { return Math.floor(Math.sqrt((xp || 0) / 40)) + 1; }
  function skillLevelProgress(xp) {
    const lvl = skillLevel(xp);
    const base = Math.pow(lvl - 1, 2) * 40;
    const nextBase = Math.pow(lvl, 2) * 40;
    return Math.max(0, Math.min(100, ((xp - base) / (nextBase - base)) * 100));
  }
  function getSkillLevelInfo(category) {
    const xp = STATE.skills[category] || 0;
    return { xp, level: skillLevel(xp), progressPct: skillLevelProgress(xp) };
  }

  function tiersReachedCount(xp) { return TIERS.filter((t) => xp >= t.xp).length; }

  // ---------------------------------------------------------------
  // CONQUISTAS
  // ---------------------------------------------------------------
  function evaluateAchievements() {
    const unlocked = [];
    ACHIEVEMENT_DEFS.forEach((def) => {
      if (STATE.achievements.some((a) => a.key === def.key)) return;
      if (def.check(STATE)) {
        const entry = { key: def.key, unlockedAt: new Date().toISOString() };
        STATE.achievements.push(entry);
        unlocked.push(def);
      }
    });
    return unlocked;
  }

  function pushHistory(type, xp, label) {
    STATE.history.unshift({ id: uid('gh'), type, xp, label, at: new Date().toISOString() });
    if (STATE.history.length > 200) STATE.history.length = 200;
  }

  // Um dia "conta" pra sequência se pelo menos um critério mínimo foi
  // cumprido nele (hoje: concluir ao menos uma missão) — chamado de dentro
  // de recordMissionCompleted, nunca direto por outro módulo.
  function registerStreakDay() {
    const t = todayISO();
    const s = STATE.streak;
    if (s.lastDate === t) return false;
    if (s.lastDate && daysBetween(s.lastDate, t) === 1) s.count += 1;
    else s.count = 1;
    s.lastDate = t;
    s.best = Math.max(s.best || 0, s.count);
    s.totalActiveDays = (s.totalActiveDays || 0) + 1;
    return true;
  }

  // Aplica `amount` de XP a totalXP (e, se houver categoria, à habilidade
  // correspondente), detectando subida de nível geral, de tier do Battle
  // Pass (recompensas) e de nível de habilidade — sem ainda persistir nem
  // avaliar conquistas (isso é feito pelo chamador, no fim do evento).
  function applyXp(amount, category) {
    const xpBefore = STATE.totalXP;
    const levelBefore = getLevelInfo(xpBefore);
    const tiersBefore = tiersReachedCount(xpBefore);
    let skillBefore = null, skillAfter = null;

    STATE.totalXP += amount;
    if (category) {
      skillBefore = skillLevel(STATE.skills[category] || 0);
      STATE.skills[category] = (STATE.skills[category] || 0) + amount;
      skillAfter = skillLevel(STATE.skills[category]);
    }

    const xpAfter = STATE.totalXP;
    const levelAfter = getLevelInfo(xpAfter);
    const tiersAfter = tiersReachedCount(xpAfter);

    const result = {
      xpGained: amount,
      totalXP: xpAfter,
      leveledUp: levelAfter.stage > levelBefore.stage,
      levelFrom: levelBefore.current,
      levelTo: levelAfter.current,
      newTiersUnlocked: tiersAfter > tiersBefore ? TIERS.slice(tiersBefore, tiersAfter) : [],
      skillCategory: category || null,
      skillLeveledUp: !!(category && skillAfter > skillBefore),
      skillLevelFrom: skillBefore,
      skillLevelTo: skillAfter,
    };

    if (result.skillLeveledUp) {
      STATE.lifetime.skillLevelUps += 1;
      STATE.totalXP += XP_RULES.skillLevelUp;
      result.totalXP = STATE.totalXP;
      result.skillLevelUpBonus = XP_RULES.skillLevelUp;
      pushHistory('skill_level_up', XP_RULES.skillLevelUp, 'Habilidade evoluiu para nível ' + skillAfter);
    }
    return result;
  }

  // ---------------------------------------------------------------
  // EVENTOS — API pública que os demais módulos usam pra "informar"
  // que uma ação aconteceu. Cada um calcula XP, aplica, registra
  // histórico, avalia conquistas, persiste e devolve um resumo pra UI
  // decidir que feedback visual mostrar.
  // ---------------------------------------------------------------
  function recordMissionCompleted(opts) {
    const mult = getMultiplier(STATE.streak.count);
    const gained = Math.round((opts.xp || 0) * mult);
    const result = applyXp(gained, opts.category);
    result.mult = mult;

    STATE.lifetime.missionsCompleted += 1;
    if (opts.isHabitMission) STATE.lifetime.habitMissionsCompleted += 1;
    if (opts.durationMin) STATE.lifetime.minutesLogged += opts.durationMin;
    pushHistory('mission_completed', gained, opts.label || 'Missão concluída');

    result.streakIncreased = registerStreakDay();
    result.streak = Object.assign({}, STATE.streak);

    result.dailyPlanBonus = 0;
    const today = todayISO();
    if (opts.dailyPlanJustCompleted && STATE.lastDailyPlanBonusDate !== today) {
      STATE.lastDailyPlanBonusDate = today;
      const bonusResult = applyXp(XP_RULES.dailyPlanCompleted, null);
      result.dailyPlanBonus = XP_RULES.dailyPlanCompleted;
      result.totalXP = bonusResult.totalXP;
      result.leveledUp = result.leveledUp || bonusResult.leveledUp;
      if (bonusResult.leveledUp) { result.levelFrom = bonusResult.levelFrom; result.levelTo = bonusResult.levelTo; }
      result.newTiersUnlocked = result.newTiersUnlocked.concat(bonusResult.newTiersUnlocked);
      pushHistory('daily_plan_completed', XP_RULES.dailyPlanCompleted, 'Planejamento do dia cumprido');
    }

    result.achievementsUnlocked = evaluateAchievements();
    save();
    return result;
  }

  // Estorna o XP de uma missão reaberta/excluída (sem mexer em streak ou
  // nos contadores vitalícios — conquista e sequência já conquistadas não
  // são desfeitas por um estorno pontual).
  function revertMissionCompletion(opts) {
    STATE.totalXP = Math.max(0, STATE.totalXP - (opts.xpAwarded || 0));
    if (opts.category) {
      STATE.skills[opts.category] = Math.max(0, (STATE.skills[opts.category] || 0) - (opts.xpAwarded || 0));
    }
    save();
  }

  function recordHabitCreated() {
    STATE.lifetime.habitsCreated += 1;
    const achievementsUnlocked = evaluateAchievements();
    save();
    return { achievementsUnlocked };
  }

  function recordGoalCompleted() {
    const result = applyXp(XP_RULES.goalCompleted, null);
    STATE.lifetime.goalsCompleted += 1;
    pushHistory('goal_completed', XP_RULES.goalCompleted, 'Objetivo concluído');
    result.achievementsUnlocked = evaluateAchievements();
    save();
    return result;
  }

  function revertGoalCompletion() {
    STATE.totalXP = Math.max(0, STATE.totalXP - XP_RULES.goalCompleted);
    save();
  }

  // ---------------------------------------------------------------
  // LEITURA (usada pela UI — nunca muta estado)
  // ---------------------------------------------------------------
  function getState() { return STATE; }
  function getTotalXP() { return STATE.totalXP; }
  function getSkillXp(category) { return STATE.skills[category] || 0; }
  function getStreak() { return STATE.streak; }
  function getTiers() { return TIERS; }
  function getNamedTiers() { return NAMED_TIERS; }
  function getCurrentMultiplier() { return getMultiplier(STATE.streak.count); }
  function getAchievements() { return STATE.achievements.slice(); }
  function getAchievementDefs() { return ACHIEVEMENT_DEFS; }
  function getHistory(limit) { return STATE.history.slice(0, limit || STATE.history.length); }
  function getXpRules() { return Object.assign({}, XP_RULES); }
  function getLifetime() { return Object.assign({}, STATE.lifetime); }

  // Usado pelo "Zerar todo o progresso".
  async function resetAll() {
    STATE = defaultGamState();
    await save();
  }

  window.PdmGamification = {
    init,
    resetAll,
    getMultiplier,
    getLevelInfo,
    getSkillLevelInfo,
    getTiers,
    getNamedTiers,
    getState,
    getTotalXP,
    getSkillXp,
    getStreak,
    getCurrentMultiplier,
    getAchievements,
    getAchievementDefs,
    getHistory,
    getXpRules,
    getLifetime,
    recordMissionCompleted,
    revertMissionCompletion,
    recordHabitCreated,
    recordGoalCompleted,
    revertGoalCompletion,
  };
})();
