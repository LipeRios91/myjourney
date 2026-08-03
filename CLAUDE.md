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
- `js/utils.js` — datas/formatação/ids, funções globais (não são módulo ES,
  viram propriedades de `window` automaticamente). Carrega primeiro.
- `js/icons.js` — `HABIT_ICONS`, `HABIT_COLORS`, `HM_CATEGORIES` (categorias
  = as mesmas 3 skills do dashboard: saude/hobbies/trabalho — não duplicar
  taxonomia nova, reusar essa).
- `js/habits-missions-data.js` — camada de dados de Hábitos & Missões (ver
  seção própria abaixo), expõe `window.PdmHM`.
- `js/habits-missions-ui.js` — render + formulários + modais de Hábitos &
  Missões, expõe várias `window.pdmXxx` (mesma convenção do script legado).
- `js/reminders.js` — lembretes best-effort via Notification API, expõe
  `window.PdmReminders`. Só dispara com o app aberto (ver limitação abaixo).
- `window.PdmCore` — ponte definida no script legado (dentro de `index.html`)
  que expõe `getState()/getMultiplier()/registerStreakDay()/saveState()/toast()`
  pros módulos externos lerem/gravarem XP e o streak global sem duplicar essa
  lógica. Se mexer no XP/streak, é aqui que fica a fonte da verdade.
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

`dashboard` (painel/hero/XP), `quests` (agenda diária de missões — não é mais
uma lista fixa, gera via `PdmHM.ensureMissionsForDate`), `habits` (lista de
hábitos + CRUD), `pass` (passe de batalha com tiers), `evolution` (fotos
mensais), `secret` (Projeto Zero). Detalhe/formulário de hábito e de missão
são modais (`pdmHabitFormModal`, `pdmHabitDetailModal`, `pdmMissionModal`),
não views próprias — segue o padrão de modal já usado pra foto/tier/confirmação.
Uma feature nova normalmente é uma dessas views/modais, ou uma seção dentro de
uma delas — raramente justifica uma view nova.

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
