/**
 * Ferramentas de Usuários — Zendesk Ticketing API.
 * Referência oficial: https://developer.zendesk.com/api-reference/ticketing/users/users/
 */
import { z } from "zod";
import { zendeskRequest, zendeskListPaginated, MAX_LIST_ITEMS } from "../zendeskClient.js";
import { toJsonResult, toListResult } from "./shared.js";

const ROLES = ["end-user", "agent", "admin"];

export function registerUserTools(server) {
  server.registerTool(
    "zendesk_list_users",
    {
      title: "Listar usuários",
      description:
        `Lista usuários (agentes, admins e end-users) da conta Zendesk. Paginação é tratada ` +
        `automaticamente — use max_items alto (até ${MAX_LIST_ITEMS}) pra trazer todos de uma vez.`,
      inputSchema: {
        max_items: z.number().int().min(1).max(MAX_LIST_ITEMS).default(25),
        role: z.enum(ROLES).optional().describe("Filtra por papel do usuário."),
      },
    },
    async ({ max_items, role }) => {
      const { items, hasMore } = await zendeskListPaginated("/api/v2/users.json", "users", {
        maxItems: max_items,
        query: {
          "page[size]": String(Math.min(max_items, 100)),
          ...(role ? { role } : {}),
        },
      });
      return toListResult(items, hasMore);
    }
  );

  server.registerTool(
    "zendesk_get_user",
    {
      title: "Obter usuário",
      description: "Busca um usuário pelo ID.",
      inputSchema: { user_id: z.number().int() },
    },
    async ({ user_id }) => {
      const { data } = await zendeskRequest(`/api/v2/users/${user_id}.json`);
      return toJsonResult(data.user);
    }
  );

  server.registerTool(
    "zendesk_search_users",
    {
      title: "Buscar usuários",
      description:
        "Busca usuários por nome, e-mail ou termo livre. " +
        "Referência: https://developer.zendesk.com/api-reference/ticketing/users/users/#search-users",
      inputSchema: {
        query: z.string().min(1).describe("Nome, e-mail (ex: nome@dominio.com) ou termo de busca."),
        max_items: z.number().int().min(1).max(MAX_LIST_ITEMS).default(25),
      },
    },
    async ({ query, max_items }) => {
      const { items, hasMore } = await zendeskListPaginated("/api/v2/users/search.json", "users", {
        maxItems: max_items,
        query: { query, "page[size]": String(Math.min(max_items, 100)) },
      });
      return toListResult(items, hasMore);
    }
  );

  server.registerTool(
    "zendesk_create_user",
    {
      title: "Criar usuário",
      description: "Cria um novo usuário (end-user ou agente) na conta Zendesk.",
      inputSchema: {
        name: z.string().min(1),
        email: z.string().email(),
        role: z.enum(ROLES).default("end-user"),
        organization_id: z.number().int().optional(),
        phone: z.string().optional(),
      },
    },
    async ({ name, email, role, organization_id, phone }) => {
      const user = {
        name,
        email,
        role,
        ...(organization_id ? { organization_id } : {}),
        ...(phone ? { phone } : {}),
      };
      const { data } = await zendeskRequest("/api/v2/users.json", { method: "POST", body: { user } });
      return toJsonResult(data.user);
    }
  );
}
