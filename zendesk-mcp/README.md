# Zendesk MCP Server

Servidor [MCP](https://modelcontextprotocol.io) que expõe o ambiente Zendesk
(Support/Ticketing API + Help Center API) como ferramentas para um cliente
MCP (Claude Desktop, Claude Code, etc). Baseado exclusivamente na
documentação oficial: https://developer.zendesk.com/api-reference/

## ⚠️ Segurança — leia antes de usar

- **Nunca** commite o arquivo `.env` nem cole credenciais em código. Este
  repositório é público — qualquer segredo commitado fica exposto
  publicamente e deve ser considerado comprometido.
- Prefira sempre um **token de API** (`ZENDESK_API_TOKEN`) a uma senha de
  login. O token pode ser revogado individualmente sem afetar o login do
  usuário; a senha, se vazar, compromete a conta inteira.
- O token/senha usado aqui tem os mesmos privilégios do usuário Zendesk
  associado (neste caso, uma conta **admin** — acesso total à instância).
  Se você colou uma credencial real em algum chat, terminal compartilhado
  ou histórico de comandos, **gere um novo token e revogue o antigo** em
  Admin Center > Apps e integrações > APIs > API do Zendesk.
- As credenciais só devem existir como variáveis de ambiente (`.env` local
  ou configuração do cliente MCP), nunca hardcoded nos arquivos `.js`.

## Ambiente de teste configurado

- Subdomínio: `z3nviaconsultingdemo1769796970` (`https://z3nviaconsultingdemo1769796970.zendesk.com`)
- Autenticação: e-mail do agente admin + token de API (ver `.env.example`)

## Instalação (recomendada) — pacote `.mcpb`, sem terminal

O jeito mais simples de instalar isso no **Claude Desktop**, sem editar
nenhum arquivo de configuração manualmente: gerar um pacote `.mcpb`
([Desktop Extensions](https://github.com/modelcontextprotocol/mcpb) — o
formato oficial de "instale com um clique" da Anthropic) e instalar pela
própria interface do app.

1. Gerar o pacote (uma vez, requer Node.js):
   ```bash
   cd zendesk-mcp
   npm install
   npm run package
   ```
   Isso cria `zendesk-mcp.mcpb` na pasta.
2. No Claude Desktop: **Settings → Extensions → Advanced settings →
   Extension Developer → Install Extension…** e selecione esse arquivo.
3. O próprio app vai pedir o **subdomínio**, **e-mail** e **token de API**
   numa tela com campos (o token fica mascarado/criptografado pelo sistema
   operacional — não precisa editar JSON nem `.env`).
4. Reinicie o Claude Desktop se ele pedir.

Como gerar um token de API (documentação oficial):
https://developer.zendesk.com/api-reference/introduction/security-and-auth/#api-token
— em resumo: Admin Center → **Apps e integrações** → **APIs** → **API do
Zendesk** → habilitar "Autenticação por token" → **Adicionar token de API**.

## Instalação alternativa (Claude Code, ou edição manual de config)

```bash
cd zendesk-mcp
npm install
cp .env.example .env
# edite .env com ZENDESK_SUBDOMAIN, ZENDESK_EMAIL e ZENDESK_API_TOKEN
npm start
```

### Testar com o MCP Inspector

```bash
npm run inspector
```

Abre uma UI local para chamar as tools manualmente e inspecionar
request/response antes de plugar num cliente de verdade.

`src/index.js` carrega o `.env` da pasta do projeto automaticamente (caminho
absoluto, não depende do diretório de onde o processo foi lançado), então
basta ter preenchido o `.env` no passo de Setup acima — não é obrigatório
repetir as credenciais na configuração do cliente MCP. Se preferir (ou
precisar rodar sem um `.env` no disco), também dá pra passar as mesmas
variáveis via o campo `env` do cliente, como nos exemplos abaixo — as duas
formas funcionam juntas sem conflito (o `env` do cliente tem prioridade).

### Configurar no Claude Code

```bash
claude mcp add zendesk -- node /caminho/absoluto/para/zendesk-mcp/src/index.js
```

### Configurar no Claude Desktop

Adicione em `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "zendesk": {
      "command": "node",
      "args": ["/caminho/absoluto/para/zendesk-mcp/src/index.js"]
    }
  }
}
```

## Ferramentas disponíveis

Cada ferramenta chama diretamente um endpoint documentado em
https://developer.zendesk.com/api-reference/. Paginação usa
[cursor pagination](https://developer.zendesk.com/api-reference/introduction/pagination/)
e requisições que recebem `429 Too Many Requests` respeitam o header
`Retry-After` automaticamente
([rate limits](https://developer.zendesk.com/api-reference/introduction/rate-limits/)).

**Sobre listar "tudo"**: a Zendesk API só devolve até 100 registros por
requisição — cada ferramenta de listagem já segue o cursor de paginação
sozinha, buscando página atrás de página dentro da mesma chamada, até o
limite pedido em `max_items` (até 1000). Se ainda sobrar mais do que isso
na conta, a resposta vem com `"has_more": true` — chame a ferramenta de
novo com um `max_items` maior em vez de assumir que já veio tudo.

### Tickets

| Tool | Descrição |
| --- | --- |
| `zendesk_list_tickets` | Lista tickets, com ordenação opcional. |
| `zendesk_get_ticket` | Busca um ticket pelo ID. |
| `zendesk_create_ticket` | Cria um ticket (assunto + comentário inicial, solicitante, prioridade, etc). |
| `zendesk_update_ticket` | Atualiza status, prioridade, tags, atribuição de um ticket. |
| `zendesk_add_comment` | Adiciona um comentário público ou nota interna a um ticket. |
| `zendesk_list_ticket_comments` | Lista o histórico de comentários de um ticket. |

### Usuários

| Tool | Descrição |
| --- | --- |
| `zendesk_list_users` | Lista usuários, com filtro opcional por papel. |
| `zendesk_get_user` | Busca um usuário pelo ID. |
| `zendesk_search_users` | Busca usuários por nome/e-mail/termo livre. |
| `zendesk_create_user` | Cria um novo usuário (end-user ou agente). |

### Organizações e grupos

| Tool | Descrição |
| --- | --- |
| `zendesk_list_organizations` | Lista organizações cadastradas. |
| `zendesk_get_organization` | Busca uma organização pelo ID. |
| `zendesk_list_groups` | Lista grupos de agentes. |

### Busca

| Tool | Descrição |
| --- | --- |
| `zendesk_search` | Busca unificada (tickets, usuários, organizações, grupos) via [Search API](https://developer.zendesk.com/api-reference/ticketing/ticket-management/search/). |

### Help Center (base de conhecimento)

| Tool | Descrição |
| --- | --- |
| `zendesk_list_categories` | Lista categorias da base de conhecimento. |
| `zendesk_list_sections` | Lista seções (de uma categoria ou de toda a conta). |
| `zendesk_list_articles` | Lista artigos (de uma seção, categoria, ou de toda a conta). |
| `zendesk_get_article` | Busca um artigo pelo ID (corpo em HTML). |
| `zendesk_search_articles` | Busca artigos por texto livre. |

## Arquitetura

```
src/
  index.js            → entrypoint, registra as tools e sobe o transporte stdio
  zendeskClient.js     → autenticação, requisição HTTP, paginação por cursor, retry em 429/5xx
  tools/
    tickets.js
    users.js
    organizations.js   → organizações + grupos
    search.js
    helpCenter.js
    shared.js           → helpers comuns (formatação de resultado)
```

Sem framework, sem build step — módulos ES nativos do Node 18+
(`fetch` global). Escopo pensado para as áreas mais usadas da API
(Ticketing + Help Center); novas tools seguem o mesmo padrão: um arquivo por
área de domínio, cada função de API vira uma `server.registerTool(...)` com
schema `zod` e um link para a página oficial correspondente em
`developer.zendesk.com/api-reference`.

## Limitações conhecidas

- Cobre as APIs de Ticketing e Help Center mais usadas — não é uma cobertura
  100% da Zendesk API (que também inclui Chat, Talk, Sell/CRM, Guide
  avançado, Explore, Custom Objects, etc). Adicionar uma nova área é
  seguir o mesmo padrão dos arquivos em `src/tools/`.
- Sem cache — cada chamada de tool bate direto na API do Zendesk.
- Autenticação apenas via Basic Auth (e-mail + token). OAuth não foi
  implementado (não é necessário para o caso de uso de um único agente/admin
  usando isto localmente).
