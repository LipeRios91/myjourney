/**
 * Busca unificada — Zendesk Search API.
 * Referência oficial: https://developer.zendesk.com/api-reference/ticketing/ticket-management/search/
 * Sintaxe de query: https://support.zendesk.com/hc/en-us/articles/4408886879258
 */
import { z } from "zod";
import { zendeskListPaginated } from "../zendeskClient.js";
import { toJsonResult } from "./shared.js";

export function registerSearchTools(server) {
  server.registerTool(
    "zendesk_search",
    {
      title: "Busca unificada Zendesk",
      description:
        "Busca tickets, usuários, organizações ou grupos usando a query syntax do Zendesk " +
        "(ex: 'type:ticket status:open priority:urgent', 'type:user email:foo@bar.com', " +
        "'type:organization name:Acme'). Referência: " +
        "https://developer.zendesk.com/api-reference/ticketing/ticket-management/search/",
      inputSchema: {
        query: z.string().min(1).describe("Query no formato da Zendesk Search API."),
        sort_by: z.enum(["updated_at", "created_at", "priority", "status", "ticket_type", "relevance"]).optional(),
        sort_order: z.enum(["asc", "desc"]).optional(),
        max_items: z.number().int().min(1).max(100).default(25),
      },
    },
    async ({ query, sort_by, sort_order, max_items }) => {
      const items = await zendeskListPaginated("/api/v2/search.json", "results", {
        maxItems: max_items,
        query: {
          query,
          ...(sort_by ? { sort_by } : {}),
          ...(sort_order ? { sort_order } : {}),
        },
      });
      return toJsonResult(items);
    }
  );
}
