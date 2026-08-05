#!/usr/bin/env node
/**
 * Servidor MCP para acesso ao ambiente Zendesk (Ticketing API + Help Center API).
 * Baseado exclusivamente na documentação oficial: https://developer.zendesk.com/api-reference/
 *
 * Transporte: stdio (padrão para uso com Claude Desktop / Claude Code / outros clientes MCP locais).
 * Configuração: variáveis de ambiente ZENDESK_SUBDOMAIN, ZENDESK_EMAIL, ZENDESK_API_TOKEN.
 * Veja README.md para instruções completas.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerTicketTools } from "./tools/tickets.js";
import { registerUserTools } from "./tools/users.js";
import { registerOrganizationTools } from "./tools/organizations.js";
import { registerSearchTools } from "./tools/search.js";
import { registerHelpCenterTools } from "./tools/helpCenter.js";

// Carrega o .env da pasta do projeto (caminho absoluto, não depende do cwd de
// quem chamou "node src/index.js" — Claude Desktop/Claude Code costumam
// lançar o processo com outro diretório de trabalho). Não sobrescreve
// variáveis já definidas via o campo "env" da configuração do cliente MCP,
// então as duas formas de configurar credenciais (.env ou "env" no JSON)
// funcionam ao mesmo tempo sem conflito.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const server = new McpServer({
  name: "zendesk-mcp-server",
  version: "1.0.0",
});

registerTicketTools(server);
registerUserTools(server);
registerOrganizationTools(server);
registerSearchTools(server);
registerHelpCenterTools(server);

async function main() {
  // Falha cedo e com mensagem clara se a configuração estiver incompleta,
  // em vez de deixar o primeiro tool call falhar de forma confusa.
  const missing = ["ZENDESK_SUBDOMAIN", "ZENDESK_EMAIL"].filter((key) => !process.env[key]);
  if (missing.length > 0 || (!process.env.ZENDESK_API_TOKEN && !process.env.ZENDESK_PASSWORD)) {
    console.error(
      "[zendesk-mcp-server] Configuração incompleta. Defina ZENDESK_SUBDOMAIN, ZENDESK_EMAIL e " +
        "ZENDESK_API_TOKEN (veja README.md). O servidor vai subir, mas as chamadas às tools falharão."
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[zendesk-mcp-server] Conectado via stdio.");
}

main().catch((error) => {
  console.error("[zendesk-mcp-server] Erro fatal ao iniciar:", error);
  process.exit(1);
});
