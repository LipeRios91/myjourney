# Jornada do Herói — instruções do projeto

## Seu papel

Você é o Product Manager, UX Designer e Engenheiro de Software principal deste
projeto. Sempre que uma nova funcionalidade for pedida, implemente-a
diretamente na aplicação existente — não proponha, não deixe esboçada, entregue.

Antes de implementar qualquer feature:

- Preserve a consistência visual e técnica da aplicação (design system abaixo).
- Evite duplicar funcionalidade já existente — procure antes de criar.
- Reutilize componentes/padrões existentes sempre que possível.
- Pense em escalabilidade, mas sem over-engineering: resolva o problema real,
  sem abstrações para casos hipotéticos.
- Garanta uma boa experiência de uso — carregamento, feedback, responsividade.
- Código limpo e de fácil manutenção.
- Se uma mudança impacta outras áreas do app, adapte essas áreas também, não
  deixe inconsistência pra trás.
- Nada de solução temporária/gambiarra. Entregue pronto pra uso real.
- Quando fizer sentido, entregue o fluxo completo: validação, tratamento de
  erro, estado de carregamento, responsividade, microinterações. Nem toda
  feature pequena precisa de tudo isso — use bom senso.
- Se enxergar uma melhoria clara que não muda a intenção do pedido, implemente
  e explique o motivo brevemente ao final da resposta.

## Visão de produto

A Jornada do Herói (rebrand de agosto/2026, antigo "Passe do Mestre" — nome,
tagline "Suba de nível. Todo dia." e logo/ícone mudaram; ver "Rebrand" logo
abaixo) é um sistema operacional pessoal para disciplina e evolução: XP,
streaks, missões diárias e um "passe de batalha" com recompensas reais.
Antes de construir uma feature, pergunte: isso aumenta execução, consistência
ou evolução do usuário? Se não, questione se vale a pena.

### Rebrand (agosto/2026): o que mudou e o que ficou

Só a superfície visível ao usuário mudou — nome do app (título da aba,
manifest, notificações, textos de UI), tagline, cor de destaque padrão
(roxo `#8B7BFF`/`#A88BD9` no lugar do dourado, ver "Design system" abaixo)
e o ícone/logo (losango roxo, `icons/*.png` regenerados). **De propósito,
não foi tocado**: os prefixos internos `mestre-` (chaves do `localStorage`,
ex. `mestre-habits`) e `Pdm`/`pdm-` (namespaces `window.PdmXxx`, classes
CSS) — renomear isso quebraria a leitura do progresso já salvo de todo
usuário existente (as chaves são lidas literalmente no boot) pra zero
ganho visível. Se uma feature nova pedir mexer nesses nomes internos, é o
mesmo tipo de decisão arquitetural de alto risco que já se aplica a
backend/sincronização — pare e confirme antes, não renomeie silenciosamente.

IA e integração com Google Agenda (sincronização bidirecional) são recursos
**complementares** hoje ainda não implementados — não são o foco do produto.
Use-os só quando agregarem valor real a uma feature específica, não como
objetivo em si.

## Estado real da arquitetura (agosto/2026)

Isso é importante: a aplicação **não tem backend nem banco de dados hoje**.
Tudo roda 100% client-side:

- `index.html` — shell da aplicação (HTML + CSS + o script legado original:
  dashboard/XP/passe de batalha/evolução, tudo numa IIFE só).
  Views trocadas via `data-view` + classe `.active` (`pdmGoto()`), sem router.
  `MONTHLY_PHOTOS[mês]` guarda `{ photo, weight }` (uma foto + um peso por
  mês, ambos opcionais) — formato antigo salvava só a dataURL da foto direto
  no valor; `loadState()` migra isso pra `{photo, weight}` na leitura, sem
  apagar nada de quem já tinha fotos salvas.
- `js/utils.js` — datas/formatação/ids, funções globais (não são módulo ES,
  viram propriedades de `window` automaticamente). Carrega primeiro.
- `js/icons.js` — `HABIT_ICONS`, `HABIT_COLORS` (paleta/ícones compartilhados
  por hábito, objetivo e habilidade). A taxonomia de categoria/habilidade em
  si (antes fixa aqui como `HM_CATEGORIES`) hoje é dinâmica — ver
  `PdmGamification.getSkills()`/`getActiveSkills()` (seção "Gamificação").
- `js/theme.js` — cor de destaque personalizável (`window.PdmTheme`), ver
  seção "Design system" abaixo. Carrega cedo (antes dos módulos de dados)
  porque `PdmTheme.init()` roda primeiro no boot, sem depender de nada.
- `js/gamification-data.js` — camada de Gamificação (ver seção própria
  abaixo), expõe `window.PdmGamification`. É a fonte da verdade de XP,
  nível, Battle Pass, habilidades, streak e conquistas — hábitos/missões/
  objetivos só a chamam pra "informar" que uma ação aconteceu, nunca
  gravam XP diretamente. Não depende de `PdmHM`/`PdmGoals` (sentido único,
  mesma lógica de `PdmGoals` → `PdmHM`).
- `js/habits-missions-data.js` — camada de dados de Hábitos & Missões (ver
  seção própria abaixo), expõe `window.PdmHM`.
- `js/goals-data.js` — camada de dados de Objetivos (ver seção própria
  abaixo), expõe `window.PdmGoals`. Depende de `window.PdmHM` pra consultar
  hábitos/missões vinculados; `PdmHM` **não** depende de `PdmGoals` (sentido
  único, evita dependência circular entre os dois módulos).
- `js/stats-data.js` — camada de Estatísticas e Evolução (ver seção própria
  abaixo), expõe `window.PdmStats`. **Único módulo do app com permissão de
  depender simultaneamente de `PdmHM`/`PdmGoals`/`PdmGamification`** — todo o
  resto do app mantém esses três desacoplados entre si de propósito, mas
  análise cross-domain é a própria razão desse módulo existir. `js/stats-ui.js`
  — view `estatisticas`, mesma convenção `window.pdmXxx`.
- `js/diet-data.js` — camada de dados de Dieta (ver seção própria abaixo),
  expõe `window.PdmDiet`. `js/diet-foodsearch.js` (`window.PdmFoodSearch`,
  busca por nome via Open Food Facts) e `js/diet-ai.js`
  (`window.PdmDietAI`, reconhecimento por foto via Gemini) são independentes
  entre si e de `PdmDiet` — só a UI (`js/diet-ui.js`) os conecta.
- `js/habits-missions-ui.js` — render + formulários + modais de Hábitos &
  Missões, expõe várias `window.pdmXxx` (mesma convenção do script legado).
- `js/goals-ui.js` — render + formulário + detalhe de Objetivos, mesma
  convenção. Os helpers de formulário genéricos (`field`, `buildSegmented`,
  `statTile`, `captureFormValues`/`restoreFormValues`) moraram pra
  `js/utils.js` justamente pra serem compartilhados entre este arquivo e
  `habits-missions-ui.js` — qualquer módulo de UI novo deve reusá-los, não
  redefini-los.
- `js/gcal.js` — integração unidirecional com Google Agenda (ver seção
  própria abaixo), expõe `window.PdmGCal`. `js/gcal-ui.js` — status/botões
  na Agenda, mesma convenção `window.pdmXxx`.
- `js/reminders.js` — lembretes best-effort via Notification API, expõe
  `window.PdmReminders`. Só dispara com o app aberto (ver limitação abaixo).
- `js/sync.js` — sincronização em nuvem OPCIONAL via Firebase (ver seção
  "Sincronização em nuvem" abaixo), expõe `window.PdmSync`. `js/sync-ui.js`
  — painel/modal na view `config`, mesma convenção `window.pdmXxx`.
- `window.PdmCore` — ponte definida no script legado (dentro de `index.html`),
  hoje só expõe `toast()` pros módulos externos dispararem o toast genérico
  de erro. XP/nível/streak não vivem mais aqui — são responsabilidade de
  `window.PdmGamification` (ver seção "Gamificação" abaixo).
- `window.storage` — shim que grava em `localStorage` do navegador (bloco de
  script logo após `<body>`). Formato: `get(key)` retorna `{value}` ou `null`;
  `set(key, value)` grava string, e também dispara `PdmSync.pushKey()`
  (melhor esforço, no-op se a sincronização não estiver configurada).
- **Por padrão o progresso não sincroniza entre dispositivos** — isso só
  muda se o usuário configurar a sincronização opcional (`js/sync.js`, ver
  seção própria). Qualquer OUTRA feature nova que precise de mais do que
  isso (IA que precise rodar server-side, etc.) continua sendo uma decisão
  arquitetural real — pare e comunique antes de introduzir mais backend, não
  faça isso silenciosamente no meio de uma feature não relacionada.
- `manifest.json` + `sw.js` — PWA instalável (cache-first do app shell).
  Qualquer novo arquivo estático (JS, imagem, ícone) precisa entrar em
  `APP_SHELL` no `sw.js` e ter o `CACHE_NAME` incrementado na versão pra
  invalidar cache antigo, senão o usuário fica preso numa versão velha.
- `icons/` — ícones do PWA (gerados a partir do brasão dourado do app).
- `.github/workflows/pages.yml` — todo push neste branch publica
  automaticamente em https://liperios91.github.io/myjourney/ via GitHub Pages.
  Repositório é público (decisão consciente do usuário); dados do usuário
  nunca saem do navegador dele, então isso não expõe informação pessoal.

## Hábitos & Missões

Hábito = template recorrente, nunca tem status de conclusão. Missão = execução
real numa data, gerada de um hábito OU criada manualmente — só ela é concluída.

- `MISSIONS` guarda `scheduledDate` (imutável, data original gerada pela
  recorrência — evita duplicar missão se o usuário reagendar) separado de
  `date` (mutável, o que a agenda exibe). **Nunca gerar missão olhando `date`
  — sempre `scheduledDate`.**
- Estatísticas do hábito (`habit.stats`) são sempre recalculadas a partir das
  missões atuais (`PdmHM.computeHabitStats`) e persistidas depois de qualquer
  mutação — nunca editadas manualmente pelo usuário.
- "Excluir hábito" = soft delete (`archivedAt`), preserva histórico de missões
  já geradas. Missões futuras não tocadas pelo usuário são removidas (param de
  ser geradas); passadas/concluídas ficam.
- Editar campos estruturais do hábito (frequência, horário, prioridade, xp,
  datas) resincroniza missões futuras ainda não tocadas
  (`resyncFutureAutoMissions`) — o que o usuário já concluiu/cancelou/reagendou
  fica intacto.
- Lembretes (`js/reminders.js`) são **best-effort, só com o app aberto** —
  PWA sem backend não tem push notification real. Se pedirem lembrete
  confiável de verdade (app fechado), isso precisa de Web Push + servidor:
  pare e avise antes de implementar, é a mesma regra de "backend" acima.
- **Status `perdida`**: uma missão de um dia passado que nunca foi concluída
  nem cancelada custa o próprio XP dela (`PdmHM.processMissedMissions`,
  chamado uma vez a cada boot do app — sem backend/cron, é o mais perto que
  dá de "avaliar o fim do dia"). Idempotente: só processa missões ainda em
  `nao_iniciada`/`em_andamento`, então não penaliza duas vezes em boots
  seguintes. "Reabrir" uma missão perdida estorna a penalidade
  (`mission.xpPenaltyApplied`) e volta ela pra `nao_iniciada` — só depois
  disso dá pra concluir de novo (`completeMission` bloqueia `perdida`
  direto, força passar pelo reabrir); o toque rápido no checkbox da agenda
  faz reabrir+concluir num gesto só. Não mexe em streak (que já quebra
  sozinha, de forma preguiçosa, da próxima vez que uma missão for concluída
  depois do intervalo) nem em conquistas/contadores vitalícios já
  desbloqueados.

## Objetivos (camada estratégica)

Hierarquia: **Objetivo → Hábito → Missão → Execução.** É a estrutura
principal da aplicação — qualquer feature nova que envolva "propósito",
"progresso" ou "por que o usuário está fazendo isso" deve se apoiar nela em
vez de criar um conceito paralelo.

- Um hábito tem no máximo um objetivo (`habit.goalId`). Missões geradas por
  hábito herdam o `goalId` automaticamente no momento da geração (snapshot,
  igual já acontece com `category`/`color`/`icon` — editar o hábito depois
  não reescreve missões passadas, só resincroniza as futuras não tocadas).
  Missões manuais podem, opcionalmente, se vincular direto a um objetivo
  (`mfGoalId` no formulário).
- **Categorias de Objetivo são uma taxonomia própria** (`GOAL_CATEGORIES`,
  padrão + personalizadas pelo usuário, em `mestre-goal-categories`) —
  **não confundir com as Habilidades** (`PdmGamification.getSkills()`,
  padrão + personalizadas, usada por hábito/missão pra XP de skill). São
  conceitos diferentes que coincidem só parcialmente no nome ("Saúde" existe
  nas duas listas, são chaves separadas).
- "Excluir objetivo" = arquivar (`archivedAt`, preserva o objetivo e seu
  histórico de evolução) **+** `PdmHM.unlinkGoal()` (limpa `goalId` de todo
  hábito/missão vinculado). Isso deixa hábitos "órfãos" de propósito — a UI
  mostra "Sem objetivo vinculado" e deixa o usuário reatribuir editando o
  hábito; não há cascata de exclusão.
- Progresso (`PdmGoals.computeGoalProgress`): se o objetivo tem meta numérica
  (`hasNumericGoal`), é `(atual − inicial) / (alvo − inicial)` — funciona
  igual pra metas que sobem (economizar) ou que descem (perder peso), não
  precisa de lógica separada pros dois casos. Sem meta numérica, cai pra
  "% de missões vinculadas concluídas" (execução). "Valor atual" vem sempre
  do registro mais recente do histórico de evolução (`goal.history`), não de
  um campo solto — se não houver nenhum registro ainda, usa o valor inicial.
- Arquitetura pensada pra caber, sem refatoração grande, features futuras já
  cogitadas (dashboard de objetivos, Disciplina Score por objetivo,
  recomendações de IA, estatísticas, conquistas, Google Agenda): as funções
  de progresso/estatística são puras (recebem o objetivo, devolvem números),
  o módulo só lê de `PdmHM` por uma interface pequena e explícita
  (`listHabitsByGoal`/`listMissionsByGoal`/`unlinkGoal`), e cada objetivo já
  carrega tudo que uma futura tela de dashboard precisaria agregar. Nenhuma
  dessas features foi implementada agora — só a base pra elas não exigirem
  reescrever o modelo de dados depois.

## Gamificação

`js/gamification-data.js` (`window.PdmGamification`) + `js/gamification-ui.js`.
Camada **completamente desacoplada** de Objetivos/Hábitos/Missões: eles só a
chamam pra informar que uma ação aconteceu (`recordMissionCompleted`,
`recordHabitCreated`, `recordGoalCompleted`, `recordMissionMissed` e seus
reversos `revert*`) — nunca leem nem gravam XP/streak/nível diretamente.
`PdmGamification` não depende de `PdmHM`/`PdmGoals` (sentido único, mesma
regra de `PdmGoals` → `PdmHM`): tudo que ela precisa pra decidir (categoria
da missão, se é oriunda de hábito, se o dia inteiro foi resolvido) é passado
pelo chamador como parâmetro, nunca buscado de volta nos outros módulos.

- **XP** é configurável por tipo de ação: missão/hábito usam o próprio
  `mission.xp`/`habit.xp` (cadastro, positivo ao concluir, negativo — o
  mesmo valor — se virar `perdida`, ver seção "Hábitos & Missões"); as
  demais ações vivem centralizadas em `XP_RULES` no topo do arquivo
  (`goalCompleted`, `dailyPlanCompleted`, `skillLevelUp`). Concluir uma
  missão soma XP tanto ao total geral quanto à habilidade da categoria dela
  (`STATE.skills[categoria]`) — é assim que "o XP contribui pro nível geral
  e pra habilidade correspondente" sem precisar de lógica duplicada. Nem
  XP nem skill XP descem abaixo de 0 (clamp), então uma sequência de perdas
  não deixa o total negativo.
- **Nível do usuário = o próprio Battle Pass**: não existem duas progressões
  paralelas. `TIERS`/`NAMED_TIERS` (27 tiers, 9 com nome) moraram pra cá
  (antes viviam soltos no script legado); `getLevelInfo(xp)` acha o tier
  nomeado atual/próximo e é usado tanto pro "Nível geral" da Home quanto pro
  Battle Pass da view `pass`. Subir de tier nomeado dispara a animação de
  level up; cruzar qualquer um dos 27 tiers (nomeado ou não) conta como
  "novos prêmios do Battle Pass desbloqueados", porque todo tier tem
  recompensas mesmo sem nome.
- **Habilidades são uma taxonomia própria e editável** (`PdmGamification`
  gerencia `SKILLS`, padrão + personalizadas pelo usuário, em
  `mestre-skills` — mesmo padrão de `GOAL_CATEGORIES` em `js/goals-data.js`).
  As 3 padrão (`saude`/`hobbies`/`trabalho`) preservam essas keys de
  propósito (é nelas que o XP histórico já vive) e não podem ser arquivadas,
  só renomeadas/reiconadas; habilidades personalizadas podem. "Excluir" uma
  habilidade personalizada = arquivar (`archivedAt`), preserva o XP já
  acumulado nela e só some do seletor de hábito/missão daí pra frente — um
  hábito/missão antigo que já apontava pra ela continua mostrando o nome
  normalmente (`getSkillMeta` busca em todas, arquivadas ou não). Nível de
  habilidade é só uma função pura do XP acumulado nela (`skillLevel`); ao
  cruzar um nível a habilidade concede um bônus fixo (`XP_RULES.skillLevelUp`)
  que soma no XP geral (não recursivamente na própria habilidade, senão
  looparia). Editar/criar habilidade é `js/gamification-ui.js`
  (`pdmOpenSkillForm`), reaproveitando os mesmos pickers de ícone/cor de
  hábito e objetivo.
- **Sequência (streak)** guarda `count` (atual), `best` (recorde) e
  `totalActiveDays` (total histórico de dias que já bateram o critério
  mínimo, mesmo com sequências quebradas no meio — métrica distinta de
  `best`). Critério mínimo pra contar o dia: concluir ao menos uma missão
  (`registerStreakDay`, chamado de dentro de `recordMissionCompleted`).
- **Conquistas** (`ACHIEVEMENT_DEFS`) são condições puras avaliadas contra o
  estado atual a cada evento (`evaluateAchievements`) — uma vez desbloqueada
  fica permanente (guardada com a data), mesmo que a ação que a desbloqueou
  seja desfeita depois (reabrir uma missão não tira a conquista de "100
  missões concluídas", por exemplo — só o XP pontual é estornado).
  Contadores vitalícios (`lifetime.*`) por isso só crescem, nunca diminuem.
- **Reversão de XP** (reabrir/excluir missão, ou tirar um objetivo do status
  "concluído") estorna o XP daquela ação específica (`revertMissionCompletion`/
  `revertGoalCompletion`), mas não mexe em streak, contadores vitalícios ou
  conquistas já desbloqueadas — mesma lógica de antes desta camada existir,
  só que agora centralizada.
- **Dedup de XP**: cada mission só pode gerar um evento de XP (`mission.xpAwarded`
  bloqueia reconclusão) e cada Objetivo só concede o XP de "concluído" uma vez
  (`goal.xpAwarded`, verificado pela transição de status em `PdmGoals.updateGoal`
  — só dispara ao cruzar a fronteira "não concluído → concluído", e estorna ao
  cruzar de volta).
- **Feedback visual** (`js/gamification-ui.js`) é sempre discreto e não
  bloqueia a interação: uma fila de toasts sequenciais (`queueFeedback`) pra
  não sobrepor múltiplos eventos da mesma ação (XP + conquista + evolução de
  habilidade, por exemplo), mais uma animação leve só pra subida de nível
  (`#pdmLevelUpOverlay`, `pointer-events:none`, some sozinha). Qualquer
  handler que chame uma ação de gamificação repassa o resultado retornado
  pra `window.pdmShowGamificationFeedback(result, opts)` — só esse arquivo
  decide o que virou toast, o que virou conquista, etc.
- **Migração**: na primeira execução desta camada, `mestre-gamification` não
  existe ainda — `PdmGamification.init()` migra `totalXP`/`skills`/`streak`
  do antigo `STATE` do script legado (chave `mestre-state`, hoje removida do
  script legado — Projeto Zero, a única coisa que ainda vivia lá, foi
  descontinuado) uma única vez, pra quem já usava o app antes desta camada
  existir não perder progresso.

## Home (tela principal)

`js/home-ui.js` (expõe só `window.pdmRenderHome`) é **puramente
apresentacional** — nenhuma regra de negócio própria, nenhum estado próprio.
Ela só lê dos módulos existentes (`PdmHM`, `PdmGoals`, `PdmGamification`) e
monta a tela; toda ação (concluir, reagendar, criar hábito/missão/objetivo)
delega pros handlers que já existem nos outros módulos.

- Reaproveita componentes de linha já existentes em vez de recriar: `window.
  pdmMissionRowHtml(m, {highlight})` (de `habits-missions-ui.js`) e `window.
  pdmGoalRowHtml(g)` (de `goals-ui.js`) — ambos exportados especificamente
  pra isso. Se o visual de uma linha de missão/objetivo mudar, muda num
  lugar só e reflete em todo canto (Home, Agenda, Objetivos).
- **Atualização automática**: não existe listener/observer — `pdmRenderHome()`
  só entra na função `renderAll()` do script legado (chamada depois de toda
  mutação no app) e no `pdmGoto('home')`. Se um módulo novo passar a mutar
  dados, garanta que ele chama `window.pdmRenderAll()` no fim (padrão já
  seguido por todos os handlers existentes) — a Home atualiza de graça.
  Não crie um mecanismo de atualização paralelo pra Home.
  Se um cálculo genuinamente pertencer a outro domínio (ex: "essa missão
  está atrasada"), implemente-o como função pura exportada do módulo dono,
  não direto dentro de `home-ui.js`.
- "Próxima missão" ganha um badge dourado (`pdm-mission-next-badge`) inline
  na própria linha, não uma fita sobreposta (`::before` com offset negativo)
  — `.pdm-mission` tem `clip-path`, que corta qualquer pseudo-elemento seu
  que tente desenhar fora da própria caixa. Se precisar de um badge/fita
  "flutuando" sobre um elemento com `clip-path`, ele precisa ser um elemento
  real fora da árvore clipada (como `.pdm-pass-ribbon`, cujo pai não usa
  `clip-path`), não um pseudo-elemento do próprio elemento clipado.
- O antigo streak "global" (`STATE.streak`) ganhou `best` (melhor sequência
  histórica, atualizado em `registerStreakDay()`) — a Home é quem pediu esse
  dado; hábitos individuais já tinham `stats.bestStreak` próprio, não confundir
  os dois.
- Estado vazio (`#pdmHomeEmptyState` vs `#pdmHomeContent`) dispara quando não
  há objetivo ativo **e** nenhum hábito **e** nenhuma missão hoje — na prática
  raro, já que hábitos padrão são semeados automaticamente no primeiro uso
  (ver `PdmHM.init`), mas a lógica cobre o caso de tudo ter sido arquivado.
- O painel "Frase do dia" (`#pdmQuoteText`/`#pdmQuoteAuthor`, renderizado por
  `renderQuote()` no script legado) mora no fim da Home — saiu do Passe pra
  cá, pedido explícito do usuário. Continua sendo os mesmos IDs/função de
  sempre, só mudou de view.

## Google Agenda (integração unidirecional)

`js/gcal.js` (`window.PdmGCal`) + `js/gcal-ui.js`. Status/ações do dia a dia
vivem no header da view `quests` (`#pdmGCalStatus`, populado por
`pdmRenderGCalStatus()`), e cada missão ganha um botão de envio individual
(`buildMissionActionsHtml` em `habits-missions-ui.js`). A gestão da
credencial em si (configurar/trocar/remover o Client ID) tem painel próprio
na view `config` (`#pdmGCalConfigStatus`, `pdmRenderGCalConfigStatus()`) —
ver "Configurações (gestão de chaves de API)".

- **Só EMPURRA** (app → Google): cria/atualiza evento por missão via
  `POST`/`PATCH` em `/calendars/primary/events`. Não traz de volta edições
  feitas direto no Google Agenda — sincronização bidirecional de verdade
  exigiria webhooks (push notifications da API do Google), e isso precisa
  de um endpoint de servidor pra receber a notificação. Sem backend (ver
  "Estado real da arquitetura" acima), não dá — se pedirem isso, é a mesma
  regra: parar e comunicar antes, não implementar silenciosamente.
- Autenticação via **Google Identity Services (GIS)**, fluxo de "cliente
  público"/SPA: token de acesso obtido direto no navegador, sem client
  secret e sem servidor. O **Client ID não é segredo** (é seguro expor no
  código/repo público) — só o client secret seria, e este fluxo não usa um.
  O usuário cola o próprio Client ID (criado no Google Cloud Console) em
  `#pdmGCalConfigModal`, guardado em `localStorage` (`mestre-gcal-client-id`).
- Token dura ~1h e vive só em memória (`accessToken` no closure de
  `gcal.js`), nunca em `localStorage` — sem backend não dá pra guardar
  refresh token com segurança. Cada sessão do navegador pode pedir login de
  novo (geralmente silencioso, se o usuário segue logado no Google).
- `mission.gcalEventId` (persistido via `PdmHM.setMissionGCalEventId`) é o
  vínculo missão↔evento: reenviar a mesma missão faz `PATCH` no evento
  existente em vez de duplicar; se o evento foi apagado direto no Google
  (404), cria um novo e substitui o id salvo.
- `sw.js` tem guarda de mesma origem no handler de `fetch` — pedidos pro
  GIS/Calendar API (terceiros) sempre vão direto pra rede, nunca passam
  pelo cache-first do app shell.

## Sincronização em nuvem (opcional)

`js/sync.js` (`window.PdmSync`) + `js/sync-ui.js`. Painel "Sincronização em
nuvem" na view `config` (`#pdmSyncStatus`, populado por `pdmRenderSyncStatus()`) +
`#pdmSyncConfigModal`. Único ponto do app que introduz "backend" de fato —
foi implementado só depois de perguntar ao usuário (ver regra em "Estado
real da arquitetura" acima) e ele escolher explicitamente essa opção em vez
de backup manual exportar/importar.

- **Continua sem backend próprio**: usa um projeto **Firebase gratuito do
  próprio usuário** (Auth + Firestore), criado por ele no Firebase Console —
  o app não tem servidor nenhum, só fala direto com a API do Firebase do
  navegador, mesmo modelo do Google Agenda. O usuário cola os 6 campos de
  config do Firebase (apiKey/authDomain/projectId/storageBucket/
  messagingSenderId/appId) em `#pdmSyncConfigModal`, guardados em
  `localStorage` (`mestre-sync-config`, mesmo tratamento de preferência de
  dispositivo do `mestre-gcal-client-id`).
- **SDK carregado sob demanda**: os 3 scripts do Firebase compat (`firebase-
  app-compat.js`/`firebase-auth-compat.js`/`firebase-firestore-compat.js`,
  via CDN `gstatic.com`) só são injetados quando a sincronização já está
  configurada (no boot) ou quando o usuário inicia a conexão — mesmo padrão
  do `loadGis()` em `gcal.js`. Quem não usa a feature não paga o custo
  (~150-300KB) de baixar esse SDK. É por isso que `js/sync.js` é script
  clássico (não `type="module"`) — teria que carregar depois do script
  legado (`defer` implícito de módulos), o que quebraria o `await
  window.PdmSync.init()` síncrono no boot.
- **Autenticação via Firebase Auth + provedor Google** (`signInWithPopup`),
  fluxo separado do Google Agenda (tokens/propósitos diferentes, sem relação
  entre si). Sessão persiste entre recarregamentos (padrão do próprio SDK),
  então normalmente reconecta sozinho ao abrir o app de novo.
- **O que sincroniza**: toda chave que já passa por `window.storage.get`/
  `set` (`mestre-habits`, `mestre-missions`, `mestre-goals`,
  `mestre-goal-categories`, `mestre-gamification`, `mestre-skills`,
  `mestre-profile-photo`, `mestre-monthly-photos`) — lista em
  `PdmSync.SYNCED_KEYS`. **O que fica de fora, de propósito** (preferência
  de dispositivo, não progresso — mesmo raciocínio do tema): `mestre-theme`,
  `mestre-gcal-client-id`, `mestre-sync-config`.
- **Modelo no Firestore**: um documento por chave, em
  `users/{uid}/data/{key}`, com `{ value: <a mesma string que já ia pro
  localStorage>, updatedAt: serverTimestamp() }` — passthrough direto, sem
  reformatar nada, então nenhum outro módulo (`PdmHM`/`PdmGoals`/
  `PdmGamification`/etc.) precisou mudar pra existir sincronização.
- **Não é tempo real**: sem `onSnapshot`/listeners — só **push a cada
  escrita local** (`window.storage.set()` chama `PdmSync.pushKey()` depois
  de gravar no `localStorage`, melhor esforço, silencioso se falhar — mesma
  filosofia do `js/reminders.js`) e **pull uma vez no boot**
  (`PdmSync.init()`, chamado antes de `PdmGamification.init()`/
  `PdmGoals.init()`/`PdmHM.init()` pra esses módulos já lerem dado fresco).
  Editar em dois aparelhos abertos ao mesmo tempo não converge na hora, só
  no próximo carregamento de cada um.
- **Resolução de conflito: "primeiro aparelho manda"**, não é por timestamp
  por campo. Flag local `mestre-sync-first-done` (por aparelho, fora do
  `window.storage`): se ausente, é a primeira vez que ESTE aparelho conecta
  essa conta — ele **empurra tudo que já tinha pra nuvem** (vira a fonte da
  verdade) e marca a flag. Se já presente, esse aparelho **sempre baixa da
  nuvem** no connect/boot (nuvem manda a partir daí). **Risco conhecido e
  documentado na UI** (`pdmSyncConnectFlow` mostra um confirm antes do
  primeiro connect): conectar um SEGUNDO aparelho que já tinha progresso
  próprio nunca sincronizado faz esse progresso local ser **substituído**
  pelo que já está na nuvem — por isso conecte primeiro o aparelho com o
  progresso que você quer manter.
- `sw.js` tem a mesma guarda de mesma origem do Google Agenda — pedidos pro
  Firebase (terceiro) sempre vão direto pra rede, nunca passam pelo
  cache-first do app shell.

## Dieta (registro de calorias e macronutrientes)

`js/diet-data.js` (`window.PdmDiet`), `js/diet-foodsearch.js`
(`window.PdmFoodSearch`), `js/diet-ai.js` (`window.PdmDietAI`) e
`js/diet-ui.js`. View própria `diet`, entre Evolução e Perfil no nav.
Domínio **independente** de Hábitos/Missões/Objetivos/Gamificação — mesmo
tratamento de Evolução (acompanhamento pessoal, sem XP): os módulos de dieta
não chamam `PdmGamification` nem são chamados por ela.

- **Entrada = snapshot**: cada registro (`PdmDiet.addEntry`) grava
  `kcal`/`protein`/`carbs`/`fat` já calculados pra porção registrada, não uma
  referência viva a um alimento — mesmo princípio de missão herdando dados
  do hábito no momento da geração (ver "Hábitos & Missões"). Editar a busca
  depois não reescreve o que já foi salvo.
- **Três fontes pra popular um registro, todas convergindo pro mesmo passo de
  "confirmar porção"** (valores por 100g + campo de gramas com recálculo ao
  vivo, `pdmDietRecalcPortion`): busca por nome (base BR + Open Food Facts),
  foto (IA) e estimativa por nome via IA (ver abaixo). Os 4 totais nessa
  tela (`pdmDietTotalKcal`/`Protein`/`Carbs`/`Fat`) são campos **editáveis**,
  não só texto — toda fonte aqui é estimativa (base genérica, IA), então se o
  usuário tiver o valor exato à mão (rótulo, por exemplo) corrige direto ali
  antes de salvar; `pdmDietConfirmPortion` lê o que estiver nos campos na
  hora de salvar, não recalcula por conta própria. Um quarto modo, Manual,
  pula esse passo — usuário digita os totais direto
  (é o fallback pra prato caseiro/genérico que a busca não cobre bem).
- **Busca por nome — duas fontes combinadas** (`js/diet-foodsearch.js`):
  uma base própria de ~70 pratos/alimentos brasileiros comuns (`BR_FOODS`,
  valores por 100g tipo TACO/USDA, embutida no arquivo — sem rede, nunca
  falha) **+** Open Food Facts (API pública, **sem chave nenhuma**, nem
  client ID restrito por domínio como o Google Agenda — aqui é totalmente
  anônima). A base local existe porque o Open Food Facts sozinho é fraco
  pra comida caseira/genérica em português (é montado principalmente por
  leitura de rótulo de industrializado) — "ovos mexidos" ou "pão com
  manteiga" não existiam lá. `searchByName()` busca nas duas e mostra a
  base local primeiro (mais relevante pra prato caseiro), Open Food Facts
  depois (forte em industrializado/marca) — resultado da base local nunca
  desaparece mesmo se a rede falhar. Busca por palavra (`ovo mexido` acha
  `Ovos mexidos`, singular/plural não trava), sem acento/case (`pao`
  acha `Pão`).
- **3º nível de fallback — estimativa por IA a partir só do nome**
  (`PdmDietAI.estimateFromName`, `pdmDietAskAI` em `js/diet-ui.js`): se nem a
  base local nem o Open Food Facts acham nada (ou o usuário quer conferir uma
  alternativa), um botão "Perguntar à IA" no próprio passo de busca manda o
  texto digitado pro Gemini com um prompt pedindo estimativa nutricional —
  mesma chave/config do reconhecimento por foto (`callGemini`, helper
  compartilhado entre as duas features em `js/diet-ai.js`), mesmo formato de
  retorno ("por 100g + porção", cai na mesma tela de confirmação). Existe
  porque não há uma API de busca de texto livre gratuita/sem-chave que
  devolva número pronto de nutriente (a Google Custom Search, por exemplo,
  devolveria links de página, não um JSON estruturado) — uma IA generativa
  resolve isso direto. Se a chave ainda não estiver configurada,
  `pdmOpenGeminiConfigModal()` abre e, ao salvar, **retoma sozinho** a
  pergunta pendente (`pdmSubmitGeminiConfig` chama `pdmDietAskAI()` de volta)
  em vez de forçar o usuário a clicar de novo. Modo Manual continua
  disponível como último recurso pra qualquer prato que nem assim resolva.
- **Reconhecimento por foto — Gemini (Google AI)**: diferente do Client ID
  do Google Agenda ou da config do Firebase, uma chave de API do Gemini
  autoriza chamadas **cobráveis** (mesmo que dentro da faixa gratuita) — só é
  seguro colar no app se o usuário **restringir a própria chave por
  referenciador HTTP (HTTP referrer)** ao domínio publicado, no Google AI
  Studio/Cloud Console. O modal de config (`#pdmGeminiConfigModal`, hoje
  compartilhado entre foto e estimativa por nome) explica esse passo
  explicitamente — não é opcional pular essa parte da explicação. Chave
  guardada em `localStorage` (`mestre-gemini-api-key`, preferência de
  dispositivo, mesmo tratamento do `mestre-gcal-client-id`), nunca em
  `window.storage`. Sem SDK carregado sob demanda (diferente do Firebase) —
  a API do Gemini é um REST simples, `fetch` direto. Modelo fixo numa
  constante (`MODEL` em `js/diet-ai.js`) fácil de trocar se a Google
  descontinuar o nome atual.
- **Metas diárias são opcionais por nutriente** (`PdmDiet.getGoals`/
  `setGoals`, `null` = sem meta): a barra de progresso de cada nutriente
  (calorias usa `.pdm-xpbar`, macros usam `.pdm-skill-bar` — reaproveita os
  mesmos componentes visuais da Gamificação/Habilidades) só aparece pros
  nutrientes com meta definida.
- **"Zerar todo o progresso" NÃO apaga o registro de dieta** — mesmo
  tratamento das fotos de Evolução: é histórico pessoal, não progresso de
  gamificação. Por isso `PdmDiet` não tem (nem precisa de) um `resetAll()`.
- Sincroniza em nuvem como qualquer outra chave real de progresso —
  `mestre-diet-entries`/`mestre-diet-goals` estão em `PdmSync.SYNCED_KEYS`.

## Estatísticas e Evolução

`js/stats-data.js` (`window.PdmStats`) + `js/stats-ui.js`. View própria
`estatisticas`, entre Dieta e Configurações no nav. Consolida/analisa dados
que já existem — **não é dono de nenhum dado próprio, não persiste nada**
(sem chave em `window.storage`, portanto nada a sincronizar ou zerar).

- **Único módulo do app com permissão de depender simultaneamente de
  `PdmHM`/`PdmGoals`/`PdmGamification`** — todo o resto mantém esses três
  desacoplados entre si de propósito (ver "Estado real da arquitetura"), mas
  análise cross-domain é a própria razão desse módulo existir. Só **lê**
  (via as APIs públicas já existentes de cada módulo), nunca escreve de
  volta e nunca duplica regra: XP, nível, streak, Battle Pass, progresso de
  objetivo e estatística de hábito continuam sendo calculados só pelos
  módulos donos — este arquivo só agrega/deriva o resultado já calculado
  por período/filtro.
- **Princípio inegociável, refletido em código**: toda métrica sem
  denominador/dado suficiente devolve `null` (nunca um `0` disfarçado de
  resultado real) — quem decide como exibir "dados insuficientes" é a UI
  (`overviewTile()` em `js/stats-ui.js`), nunca a camada de dados. Um `0`
  legítimo (ex: "0 missões canceladas", "0 sequência atual") continua
  aparecendo normalmente — a regra é só sobre taxas/médias sem base real
  pra calcular, não sobre contagens genuinamente zero.
- **Duas pequenas adições aditivas ao schema existente**, os únicos gaps
  reais que impediam calcular a spec com honestidade (nada foi inventado):
  `Goal.completedAt` (`js/goals-data.js`, seta/limpa em `updateGoal()` toda
  vez que cruza a fronteira de status "concluído", simétrico à lógica já
  existente de `xpAwarded` mas rastreado à parte) e
  `PdmHM.listMissionsInRange(startISO, endISO)` + `listAllMissions()`
  (`js/habits-missions-data.js` — antes só existia
  `listMissionsForDate` de um dia só; filtra por `scheduledDate`, a data
  original imutável, não `date`, mesmo raciocínio de "nunca gerar missão
  olhando `date`" já documentado em Hábitos & Missões).
- **XP por período reaproveita o ledger que já existia**
  (`PdmGamification.getHistory()`, já loga todo evento com XP desde antes
  desta feature) em vez de recalcular do zero. Esse histórico é limitado
  aos últimos 200 eventos (ver "Gamificação") — `sumHistoryXp()` sinaliza
  `possiblyTruncated` quando o período pedido pode ultrapassar essa janela,
  e a UI mostra um aviso em vez de fingir precisão que não tem.
  **XP por habilidade dentro de um período**, por outro lado, não tem
  ledger próprio (`STATE.skills[categoria]` só guarda o total corrente) —
  `computeSkillStatsSection()` reconstrói isso somando
  `mission.xpAwarded`/`xpPenaltyApplied` das missões da categoria resolvidas
  no período (o bônus de `skillLevelUp` não entra nessa soma porque ele
  nunca foi somado em `STATE.skills[categoria]`, só no XP geral).
- **Heatmap de consistência**: intensidade é **relativa à própria
  distribuição do usuário no ano** (quartis dos dias com atividade,
  `computeHeatmapYear`), não um limiar fixo tipo "5+ = melhor" — pedido
  explícito da spec pra não incentivar excesso, só mostrar consistência.
- **Recordes são vitalícios, não escopados por período** (`computeRecords`,
  varre `listAllMissions()` uma vez) — diferente de todo o resto do módulo,
  de propósito: "maior sequência", "mais missões numa semana" etc. são
  marcas pessoais de sempre, não do período selecionado na tela.
- **Insights são 100% regra + dado real, zero IA** — a "IA Coach" citada na
  spec original é feature futura que vai **consumir** essas estatísticas,
  não faz parte desta entrega. Cada insight só aparece com dado real
  suficiente pra sustentá-lo (ex: sequência precisa de 3+ dias; "melhor
  consistência" precisa de 2 períodos anteriores completos pra comparar;
  "taxa por horário do dia" precisa de 5+ missões com horário definido).
- **Renderização não entra no `renderAll()` global** — `pdmRenderStats()` só
  roda quando o usuário navega pra `estatisticas` (`pdmGoto`), de propósito
  (spec pede performance: não recalcular agregações grandes à toa em toda
  mutação do app). Trocar período/filtro/ano do heatmap ou expandir/colapsar
  uma seção redesenha só a raiz `#pdmStatsRoot`, mas re-renderiza tudo do
  zero — por isso o estado de aberto/fechado de cada `<details>` reseta ao
  trocar período ou filtro (aceitável: o usuário troca período com pouca
  frequência comparado a navegar dentro da tela já aberta).
- **Sem gráfico de terceiros** — barras (`.pdm-stats-bars`) e heatmap
  (`.pdm-heatmap-grid`) são CSS puro, mesma filosofia zero-dependência do
  resto do app. Períodos com mais de 60 dias agrupam a série diária por
  semana (`chartSeriesForRange`, usa `PdmStats.groupByWeek`) pra não
  desenhar 90+ barras ilegíveis no mobile.
- **Disciplina Score**: a spec pede preparar a estrutura mas avisa
  explicitamente pra não inventar métrica falsa se ainda não existir —
  `PdmStats.getDisciplineScore()` devolve `null` de propósito hoje; a seção
  "Evolução da Disciplina" já mostra tudo que é real (médias, melhor/pior
  dia) e só sinaliza que o score composto ainda não foi implementado.
- **Sem persistência própria**: preferências de período/filtro/ano do
  heatmap vivem só em memória (`statsState` no closure de `stats-ui.js`) —
  resetam ao sair da view/recarregar a página, propositalmente (não é
  progresso nem preferência de longo prazo que justifique `localStorage`).

## Uso Digital (Android) — pendente de decisão arquitetural, NÃO implementado

Feature pedida (agosto/2026): tela "Uso Digital" mostrando tempo de tela,
apps mais usados, categorização de apps, distribuição por categoria, linha
do tempo do dia, heatmap de uso, evolução, e correlação (nunca causalidade)
com Missões/Hábitos/Objetivos — tudo via `UsageStatsManager` do Android.

**Por que está pausada**: `UsageStatsManager` é API nativa Android
(`android.app.usage`), acessível só por código Kotlin/Java rodando dentro
de um app instalado com a permissão especial `PACKAGE_USAGE_STATS`. Não
existe equivalente Web — nenhum navegador expõe uso por app pra uma página,
nem pra PWA instalada. Diferente do caso "backend" (onde o app já é capaz
tecnicamente, só falta decidir infra), aqui a barreira é de **plataforma**:
a Jornada do Herói é 100% web (HTML/CSS/JS puro, deploy `git push` →
GitHub Pages, zero build nativo) — pra essa feature funcionar de verdade
(API real, permissão real, sem dado fictício), o app precisaria ganhar uma
casca Android nativa via algo como Capacitor + um plugin Kotlin próprio
fazendo a ponte com `UsageStatsManager`, e passaria a exigir Android
Studio/Gradle pra compilar/assinar um APK/AAB — modelo de distribuição
totalmente separado do deploy atual.

**Decisão do usuário (perguntado explicitamente via AskUserQuestion)**: não
implementar agora — só documentar como feature futura, mesmo tratamento já
dado a "IA Coach" e sincronização bidirecional do Google Agenda (ver
"Rebrand" acima). Se pedirem essa feature de novo no futuro, a pergunta já
está respondida: **não fingir com dado fictício, não construir a casca
nativa silenciosamente** — confirmar de novo se o usuário quer investir
nesse escopo antes de tocar código. A spec completa (permissão/consentimento,
telas, categorias, heatmap, integrações com Missões/Hábitos/Objetivos,
insights sem culpabilização, sem XP por reduzir tela) está preservada no
histórico da conversa que gerou esta nota, pra não precisar ser re-pedida
do zero quando essa decisão for tomada.

## Design system

Prefixo `pdm-` em todas as classes (evita colisão, já que é tudo um arquivo
só). Antes de criar uma classe nova, veja se já existe um padrão equivalente.

Paleta (custom properties em `.pdm-root`):
- `--void` / `--void-2`: fundo (navy quase preto)
- `--panel` / `--panel-2`: cards
- `--gold` / `--gold-pale` / `--gold-dim`: cor de destaque/ação primária
- `--blue-pop`: acento secundário
- `--rose` / `--rose-pale`: alerta/destrutivo
- `--fog`: texto principal, `--dim`: texto secundário
- `--line` / `--line-soft`: bordas

**Modo (escuro/claro) e cor de destaque são personalizáveis** (`js/theme.js`,
`window.PdmTheme`, painel "Aparência" na view `config`).

- **Cor de destaque**: `--gold`/`--gold-pale`/`--gold-dim` viram
  `var(--user-gold, <hex padrão>)` em `.pdm-root`, e `PdmTheme.apply(hex)`
  seta `--user-gold`/`--user-gold-pale`/`--user-gold-dim` em `:root` — como
  praticamente todo elemento interativo (botões, nav ativa, barras de XP,
  badges, bordas de destaque) já usa o token `--gold`, trocar esse valor
  retema o app inteiro sem tocar em cada componente. `deriveShades(hex, modo)`
  calcula pale/dim automaticamente (mistura com branco/preto), então o
  usuário escolhe uma cor só (picker livre ou preset) e as 3 variações saem
  consistentes. Cada modo guarda sua própria cor (`accentDark`/`accentLight`
  separados em `mestre-theme`) — trocar de modo não perde a escolha feita
  no outro, e cada um tem seus próprios presets/padrão (pastéis no claro).
- **Modo claro** (`.pdm-root[data-theme="light"]`, `PdmTheme.setMode('light')`):
  redefine `--void`/`--void-2`/`--panel`/`--panel-2`/`--line`/`--line-soft`/
  `--fog`/`--dim`/`--rose`/`--rose-pale`/`--blue-pop` pra uma paleta pastel
  clara (fundo rosa/lavanda bem claro, cards brancos, texto ameixa escuro).
  O `text-shadow` duplo dourado+azul (offset pra lados opostos) dos títulos
  grandes é a assinatura visual do app no escuro, mas sobre fundo claro lê
  como um efeito "tremido"/fantasma incômodo (baixo contraste entre sombra e
  fundo realça o desalinhamento) — por isso `[data-theme="light"]` troca
  esse conjunto de seletores (`.pdm-eyebrow`, `.pdm-level-name`,
  `.pdm-home-greeting` etc.) por uma sombra única e suave, sem offset
  lateral. Qualquer título novo em Anton/Oswald grande que reuse o padrão
  de sombra dupla precisa entrar nessa lista de overrides pro claro.
- **`--on-accent`**: token novo, sempre escuro nos dois modos, usado como cor
  de texto/ícone em cima de preenchimentos sólidos de destaque (`.pdm-btn`,
  `.pdm-fab`, badges cheios, nav ativa, etc.). Existe porque esses elementos
  usavam `color: var(--void)` — funcionava no escuro (void = quase preto),
  mas quebraria a legibilidade no claro (void vira um rosa bem claro). Ao
  criar um componente novo com preenchimento sólido de `--gold`, o texto por
  cima usa `--on-accent`, nunca `--void` direto.
- É preferência de dispositivo, não progresso: `PdmTheme.setAccent`/
  `setMode`/`resetAccent` gravam em `localStorage` direto (`mestre-theme`),
  fora do fluxo de `window.storage`/`STATE`, e "Zerar todo o progresso" não
  mexe nisso (mesmo tratamento da foto de perfil). `PdmTheme.init()` roda
  logo no início do boot (`init()` no script legado, antes até de
  `loadPhotos()`), pra o tema já estar aplicado quando a tela carrega.

Tipografia: `Anton`/`Oswald` para títulos e números grandes (tudo uppercase),
`Inter` para corpo, `Space Mono` para metadados/labels técnicos.

Estética: cantos cortados via `clip-path` (não `border-radius` — é a
assinatura visual do app, ver `.pdm-panel`, `.pdm-nav-btn`, `.pdm-quest`).
Avatares/círculos são exceção (`border-radius: 50%`).

Mobile: touch targets ≥ 40px em telas pequenas (`@media max-width: 480px`),
respeitar `env(safe-area-inset-*)`, `touch-action: manipulation` em elementos
clicáveis. Sempre testar visualmente em viewport mobile antes de considerar
uma feature de UI pronta (ver seção de testes abaixo).

## Views existentes (não duplicar)

`home` (tela principal — ponto de entrada diário, ver seção própria abaixo;
também hospeda a Frase do dia, que saiu do Passe), `quests` (agenda diária
de missões, navegável por dia — não é mais uma lista fixa, gera via
`PdmHM.ensureMissionsForDate`), `habits` (lista de hábitos + CRUD), `goals`
(lista de objetivos + CRUD), `habilidades` (grid de habilidades editável —
tem lugar só dela, pedido explícito do usuário), `pass` (passe de batalha
com tiers), `evolution` (foto + peso mensais), `diet` (registro diário de
calorias/macros — ver seção "Dieta"), `estatisticas` (Estatísticas e
Evolução — resumo, consistência/heatmap, missões, hábitos, objetivos,
habilidades, gamificação, recordes, insights; ver seção própria acima),
`config` (Configurações — Aparência, Sincronização em nuvem, Google Agenda,
IA/Gemini; ver "Configurações (gestão de chaves de API)" abaixo — pedido
explícito do usuário depois de notar que essas configurações estavam
espalhadas e sem jeito fácil de refazer), `perfil` (Perfil/Conquistas — ver
seção "Gamificação"; é a **última** página do menu, pedido explícito do
usuário; o mini-perfil do header, antes um atalho redundante pra Home,
agora aponta pra cá). "Zerar todo o progresso" vive só dentro da view
`perfil` (não é mais global/fixo no fim da página) — se um botão "perigoso"
novo for parecido, mesma regra: fica dentro da view dona dele, não solto
fora de todas. Detalhe/formulário de hábito, missão, objetivo e habilidade
são modais (`pdmHabitFormModal`, `pdmHabitDetailModal`, `pdmMissionModal`,
`pdmGoalFormModal`, `pdmGoalDetailModal`, `pdmSkillFormModal`,
`pdmDietAddModal`, `pdmDietGoalsModal`, `pdmSkillDetailModal` — detalhe de
habilidade individual dentro de Estatísticas, não confundir com
`pdmSkillFormModal`, que é o formulário de criar/editar habilidade em si),
não views próprias — segue o padrão de modal já usado pra foto/tier/
confirmação. Uma feature nova normalmente é uma dessas views/modais, ou uma
seção dentro de uma delas — raramente justifica uma view nova (Perfil,
Habilidades, Dieta, Configurações e Estatísticas foram exceções
deliberadas, pedidas explicitamente pelo usuário).

### Configurações (gestão de chaves de API)

Toda integração que depende de uma credencial colada pelo usuário
(`mestre-gcal-client-id`, `mestre-sync-config`, `mestre-gemini-api-key`) tem
um painel próprio na view `config`, além de continuar acessível nos pontos
de uso (ex: status do Google Agenda no cabeçalho da Agenda, "Trocar chave da
IA" dentro do modal de registro de alimento) — os dois caminhos não são
duplicação, são propósitos diferentes: a view `config` é onde você
**gerencia** a credencial em si (configurar pela primeira vez, trocar,
remover), os pontos de uso são onde você **usa** a integração no dia a dia.

- **Toda config precisa dar pra refazer, não só criar uma vez**: cada
  painel (`pdmRenderGCalConfigStatus`/`pdmRenderSyncStatus`/
  `pdmRenderGeminiConfigStatus`) mostra "Configurar X" quando ainda não
  tem nada salvo, e quando já tem, mostra o status + botão pra **trocar**
  (reabre o mesmo modal, agora pré-preenchido com o valor atual — nunca um
  formulário em branco escondendo o que já está salvo) e, quando faz
  sentido (Google Agenda, Gemini), um botão pra **remover** a config por
  completo. Esse padrão nasceu de um bug real: o usuário colou uma chave
  do Gemini errada, e não tinha nenhum jeito de abrir o modal de novo pra
  corrigir (o botão só existia no estado "ainda não configurado") — ficou
  travado. Qualquer config nova precisa nascer já com o caminho de
  "refazer" incluído, não só o de "configurar pela primeira vez".
- `js/gcal.js` ganhou `clearClientId()` especificamente pra isso (antes só
  tinha `setClientId`, sem remover). `PdmDietAI`/`PdmSync` já tinham
  `clearApiKey`/`clearConfig` — só faltava expor na UI.
- `pdmRenderConfig()` (função global, definida no script legado junto de
  `renderAll()`/`renderPass()` — não pertence a um módulo de dados só, é
  agregador cross-cutting dos 4 painéis) é chamado tanto em `pdmGoto('config')`
  quanto dentro de `renderAll()`, mesmo padrão das outras views.
- Aparência e Sincronização **saíram do Perfil** e foram pra cá — o Perfil
  agora é só identidade/progresso (stats, conquistas, zerar progresso), sem
  nenhuma configuração técnica misturada.

Modais empilhados: o modal de confirmação genérico (`pdmConfirmModal`,
usado por `pdmConfirmGeneric()`) precisa ficar **por último no `<body>`**
pra sempre renderizar por cima de qualquer outro modal já aberto (ex:
confirmar exclusão em cima do detalhe do hábito). Se adicionar um modal novo
que pode abrir "por cima" de outro, mesma regra: ordem no DOM = ordem de
empilhamento, não tem `z-index` diferenciado entre eles hoje.

## Como testar antes de entregar

Não há framework de testes automatizados ainda. Para qualquer mudança de UI:
1. Servir localmente: `python3 -m http.server` na raiz do projeto.
2. Abrir com Playwright (`/opt/pw-browsers/chromium`, `NODE_PATH=/opt/node22/lib/node_modules`)
   emulando um device mobile (ex: `devices['Pixel 7']`), navegar pelas views
   afetadas, tirar screenshot e checar visualmente.
3. Se a mudança envolve `STATE`/persistência: marcar uma ação, recarregar a
   página, confirmar que persistiu via `localStorage`.
4. Checar `page.on('pageerror')`/console antes de considerar concluído.

## Deploy

Sem PR necessário neste fluxo: commit direto no branch
`claude/homepage-menu-background-6k4jtp` (branch padrão do repo) e
`git push` já dispara o deploy automático pro GitHub Pages.
