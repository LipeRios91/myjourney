# Passe do Mestre — instruções do projeto

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

O Passe do Mestre é um sistema operacional pessoal para disciplina e evolução:
XP, streaks, missões diárias e um "passe de batalha" com recompensas reais.
Antes de construir uma feature, pergunte: isso aumenta execução, consistência
ou evolução do usuário? Se não, questione se vale a pena.

IA e integração com Google Agenda (sincronização bidirecional) são recursos
**complementares** hoje ainda não implementados — não são o foco do produto.
Use-os só quando agregarem valor real a uma feature específica, não como
objetivo em si.

## Estado real da arquitetura (agosto/2026)

Isso é importante: a aplicação **não tem backend nem banco de dados hoje**.
Tudo roda 100% client-side:

- `index.html` — shell da aplicação (HTML + CSS + o script legado original:
  dashboard/XP/passe de batalha/evolução/Projeto Zero, tudo numa IIFE só).
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
- `window.PdmCore` — ponte definida no script legado (dentro de `index.html`),
  hoje só expõe `toast()` pros módulos externos dispararem o toast genérico
  de erro. XP/nível/streak não vivem mais aqui — são responsabilidade de
  `window.PdmGamification` (ver seção "Gamificação" abaixo).
- `window.storage` — shim que grava em `localStorage` do navegador (bloco de
  script logo após `<body>`). Formato: `get(key)` retorna `{value}` ou `null`;
  `set(key, value)` grava string.
- **Isso significa que hoje o progresso não sincroniza entre dispositivos.**
  Se uma feature nova exigir isso (multi-dispositivo, backup na nuvem, IA que
  precise rodar server-side, etc.), isso é uma decisão arquitetural real —
  pare e comunique antes de introduzir um backend, não faça isso silenciosamente
  no meio de uma feature não relacionada.
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
  do antigo `STATE` do script legado (`mestre-state`) uma única vez, pra
  quem já usava o app antes desta camada existir não perder progresso.
  `STATE` (script legado) hoje só guarda o Projeto Zero — feature separada,
  não é gamificação.

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

## Google Agenda (integração unidirecional)

`js/gcal.js` (`window.PdmGCal`) + `js/gcal-ui.js`. Status/ações vivem no
header da view `quests` (`#pdmGCalStatus`, populado por
`pdmRenderGCalStatus()`), e cada missão ganha um botão de envio individual
(`buildMissionActionsHtml` em `habits-missions-ui.js`).

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
`window.PdmTheme`, painel "Aparência" na view `perfil`).

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
  **Não** muda os `text-shadow` decorativos dourado+azul dos títulos grandes
  — são a assinatura visual fixa do app nos dois modos.
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
  `loadState()`), pra o tema já estar aplicado quando a tela carrega.

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

`home` (tela principal — ponto de entrada diário, ver seção própria abaixo),
`quests` (agenda diária de missões, navegável por dia — não é mais uma lista
fixa, gera via `PdmHM.ensureMissionsForDate`), `habits` (lista de hábitos +
CRUD), `goals` (lista de objetivos + CRUD), `pass` (passe de batalha com
tiers + Frase do dia), `perfil` (Perfil/Habilidades/Conquistas — ver seção
"Gamificação"; o mini-perfil do header, antes um atalho redundante pra Home,
agora aponta pra cá), `evolution` (foto + peso mensais), `secret` (Projeto Zero).
Detalhe/formulário de hábito, missão, objetivo e habilidade são modais
(`pdmHabitFormModal`, `pdmHabitDetailModal`, `pdmMissionModal`,
`pdmGoalFormModal`, `pdmGoalDetailModal`, `pdmSkillFormModal`), não views
próprias — segue o padrão de modal já usado pra foto/tier/confirmação. Uma
feature nova normalmente é uma dessas views/modais, ou uma seção dentro de
uma delas — raramente justifica uma view nova (Perfil foi uma exceção
deliberada, pedida explicitamente pelo usuário).

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
