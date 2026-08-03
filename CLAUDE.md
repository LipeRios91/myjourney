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

- `index.html` — aplicação inteira (HTML + CSS + JS num arquivo só, IIFE).
  Views trocadas via `data-view` + classe `.active` (`pdmGoto()`), sem router.
- `window.storage` — shim que grava em `localStorage` do navegador (ver bloco
  de script logo após `<body>`). Formato: `get(key)` retorna `{value}` ou
  `null`; `set(key, value)` grava string. Estado principal fica em `STATE`
  (objeto JS) e é persistido via `saveState()`.
- **Isso significa que hoje o progresso não sincroniza entre dispositivos.**
  Se uma feature nova exigir isso (multi-dispositivo, backup na nuvem, IA que
  precise rodar server-side, etc.), isso é uma decisão arquitetural real —
  pare e comunique antes de introduzir um backend, não faça isso silenciosamente
  no meio de uma feature não relacionada.
- `manifest.json` + `sw.js` — PWA instalável (cache-first do app shell).
  Qualquer novo arquivo estático (imagem, ícone) precisa entrar em
  `APP_SHELL` no `sw.js` e ter o `CACHE_NAME` incrementado na versão pra
  invalidar cache antigo, senão o usuário fica preso numa versão velha.
- `icons/` — ícones do PWA (gerados a partir do brasão dourado do app).
- `.github/workflows/pages.yml` — todo push neste branch publica
  automaticamente em https://liperios91.github.io/myjourney/ via GitHub Pages.
  Repositório é público (decisão consciente do usuário); dados do usuário
  nunca saem do navegador dele, então isso não expõe informação pessoal.

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

`dashboard` (painel/hero/XP), `quests` (missões diárias), `pass` (passe de
batalha com tiers), `evolution` (fotos mensais), `secret` (Projeto Zero).
Uma feature nova normalmente é uma dessas views, ou uma seção dentro de uma
delas — raramente justifica uma view nova.

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
