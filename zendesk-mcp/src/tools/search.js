/**
 * Busca unificada — Zendesk Search API.
 * Referência oficial: https://developer.zendesk.com/api-reference/ticketing/ticket-management/search/
 * Sintaxe de query: https://support.zendesk.com/hc/en-us/articles/4408886879258
 *
 * Nota: a própria Zendesk Search API limita resultados a 1000 registros por
 * busca, independente de paginação — não é uma limitação deste servidor.
 */
import { z } from "zod";
import { zendeskListPaginated, MAX_LIST_ITEMS } from "../zendeskClient.js";
import { toListResult } from "./shared.js";

export function registerSearchTools(server) {
  server.registerTool(
    "zendesk_search",
    {
      title: "Busca unificada Zendesk",
      description:
        "Busca tickets, usuários, organizações ou grupos usando a query syntax do Zendesk " +
        "(ex: 'type:ticket status:open priority:urgent', 'type:user email:foo@bar.com', " +
        "'type:organization name:Acme'). Paginação é tratada automaticamente (até " +
        `${MAX_LIST_ITEMS} resultados — a própria Zendesk Search API não retorna mais que 1000 por ` +
        "busca, então esse já é o teto real). Referência: " +
        "https://developer.zendesk.com/api-reference/ticketing/ticket-management/search/",
      inputSchema: {
        query: z.string().min(1).describe("Query no formato da Zendesk Search API."),
        sort_by: z.enum(["updated_at", "created_at", "priority", "status", "ticket_type", "relevance"]).optional(),
        sort_order: z.enum(["asc", "desc"]).optional(),
        max_items: z.number().int().min(1).max(MAX_LIST_ITEMS).default(25),
      },
    },
    async ({ query, sort_by, sort_order, max_items }) => {
      const { items, hasMore } = await zendeskListPaginated("/api/v2/search.json", "results", {
        maxItems: max_items,
        query: {
          query,
          "page[size]": String(Math.min(max_items, 100)),
          ...(sort_by ? { sort_by } : {}),
          ...(sort_order ? { sort_order } : {}),
        },
      });
      return toListResult(items, hasMore);
    }
  );
}
