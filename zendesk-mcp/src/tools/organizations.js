/**
 * Ferramentas de Organizações e Grupos — Zendesk Ticketing API.
 * Referência oficial:
 *   https://developer.zendesk.com/api-reference/ticketing/organizations/organizations/
 *   https://developer.zendesk.com/api-reference/ticketing/groups/groups/
 */
import { z } from "zod";
import { zendeskRequest, zendeskListPaginated, MAX_LIST_ITEMS } from "../zendeskClient.js";
import { toJsonResult, toListResult } from "./shared.js";

export function registerOrganizationTools(server) {
  server.registerTool(
    "zendesk_list_organizations",
    {
      title: "Listar organizações",
      description:
        `Lista as organizações (empresas/clientes) cadastradas na conta Zendesk. Paginação é tratada ` +
        `automaticamente — use max_items alto (até ${MAX_LIST_ITEMS}) pra trazer todas de uma vez.`,
      inputSchema: { max_items: z.number().int().min(1).max(MAX_LIST_ITEMS).default(25) },
    },
    async ({ max_items }) => {
      const { items, hasMore } = await zendeskListPaginated("/api/v2/organizations.json", "organizations", {
        maxItems: max_items,
        query: { "page[size]": String(Math.min(max_items, 100)) },
      });
      return toListResult(items, hasMore);
    }
  );

  server.registerTool(
    "zendesk_get_organization",
    {
      title: "Obter organização",
      description: "Busca uma organização pelo ID.",
      inputSchema: { organization_id: z.number().int() },
    },
    async ({ organization_id }) => {
      const { data } = await zendeskRequest(`/api/v2/organizations/${organization_id}.json`);
      return toJsonResult(data.organization);
    }
  );

  server.registerTool(
    "zendesk_list_groups",
    {
      title: "Listar grupos",
      description:
        "Lista os grupos de agentes da conta (usados para atribuição/roteamento de tickets). " +
        "Paginação é tratada automaticamente. " +
        "Referência: https://developer.zendesk.com/api-reference/ticketing/groups/groups/",
      inputSchema: { max_items: z.number().int().min(1).max(MAX_LIST_ITEMS).default(25) },
    },
    async ({ max_items }) => {
      const { items, hasMore } = await zendeskListPaginated("/api/v2/groups.json", "groups", {
        maxItems: max_items,
        query: { "page[size]": String(Math.min(max_items, 100)) },
      });
      return toListResult(items, hasMore);
    }
  );
}
