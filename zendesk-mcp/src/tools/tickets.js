/**
 * Ferramentas de Tickets — Zendesk Ticketing API.
 * Referência oficial: https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/
 *                      https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_comments/
 */
import { z } from "zod";
import { zendeskRequest, zendeskListPaginated } from "../zendeskClient.js";
import { toJsonResult } from "./shared.js";

const PRIORITIES = ["urgent", "high", "normal", "low"];
const STATUSES = ["new", "open", "pending", "hold", "solved", "closed"];
const SORT_FIELDS = ["created_at", "updated_at", "priority", "status", "ticket_type"];

export function registerTicketTools(server) {
  server.registerTool(
    "zendesk_list_tickets",
    {
      title: "Listar tickets",
      description:
        "Lista tickets do Zendesk (paginação por cursor). Use zendesk_search para filtrar por critérios específicos.",
      inputSchema: {
        max_items: z.number().int().min(1).max(100).default(25).describe("Máximo de tickets a retornar."),
        sort_by: z.enum(SORT_FIELDS).optional().describe("Campo de ordenação."),
        sort_order: z.enum(["asc", "desc"]).optional(),
      },
    },
    async ({ max_items, sort_by, sort_order }) => {
      const items = await zendeskListPaginated("/api/v2/tickets.json", "tickets", {
        maxItems: max_items,
        query: {
          "page[size]": String(Math.min(max_items, 100)),
          ...(sort_by ? { sort_by } : {}),
          ...(sort_order ? { sort_order } : {}),
        },
      });
      return toJsonResult(items);
    }
  );

  server.registerTool(
    "zendesk_get_ticket",
    {
      title: "Obter ticket",
      description: "Busca um ticket pelo ID, incluindo campos padrão e customizados.",
      inputSchema: {
        ticket_id: z.number().int().describe("ID numérico do ticket."),
      },
    },
    async ({ ticket_id }) => {
      const { data } = await zendeskRequest(`/api/v2/tickets/${ticket_id}.json`);
      return toJsonResult(data.ticket);
    }
  );

  server.registerTool(
    "zendesk_create_ticket",
    {
      title: "Criar ticket",
      description:
        "Cria um novo ticket. Requer subject + comment (mensagem inicial). " +
        "Referência: https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/#create-ticket",
      inputSchema: {
        subject: z.string().min(1).describe("Assunto do ticket."),
        comment_body: z.string().min(1).describe("Texto do comentário inicial (corpo do ticket)."),
        comment_html_body: z.string().optional().describe("Versão HTML opcional do comentário inicial."),
        requester_email: z
          .string()
          .email()
          .optional()
          .describe("E-mail do solicitante (cria o usuário automaticamente se não existir)."),
        requester_name: z.string().optional().describe("Nome do solicitante (usado junto com requester_email)."),
        priority: z.enum(PRIORITIES).optional(),
        status: z.enum(STATUSES).optional(),
        type: z.enum(["problem", "incident", "question", "task"]).optional(),
        tags: z.array(z.string()).optional(),
        assignee_email: z.string().email().optional().describe("E-mail do agente responsável."),
        group_id: z.number().int().optional(),
        public: z.boolean().default(true).describe("Se o comentário inicial é público (visível ao solicitante)."),
      },
    },
    async (input) => {
      const ticket = {
        subject: input.subject,
        comment: {
          body: input.comment_body,
          ...(input.comment_html_body ? { html_body: input.comment_html_body } : {}),
          public: input.public,
        },
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.type ? { type: input.type } : {}),
        ...(input.tags ? { tags: input.tags } : {}),
        ...(input.group_id ? { group_id: input.group_id } : {}),
        ...(input.assignee_email ? { assignee_email: input.assignee_email } : {}),
        ...(input.requester_email
          ? {
              requester: {
                email: input.requester_email,
                ...(input.requester_name ? { name: input.requester_name } : {}),
              },
            }
          : {}),
      };
      const { data } = await zendeskRequest("/api/v2/tickets.json", { method: "POST", body: { ticket } });
      return toJsonResult(data.ticket);
    }
  );

  server.registerTool(
    "zendesk_update_ticket",
    {
      title: "Atualizar ticket",
      description:
        "Atualiza campos de um ticket existente (status, prioridade, tags, atribuição, etc). " +
        "Para adicionar apenas um comentário, prefira zendesk_add_comment.",
      inputSchema: {
        ticket_id: z.number().int(),
        status: z.enum(STATUSES).optional(),
        priority: z.enum(PRIORITIES).optional(),
        type: z.enum(["problem", "incident", "question", "task"]).optional(),
        subject: z.string().optional(),
        tags: z.array(z.string()).optional().describe("Substitui a lista de tags do ticket."),
        additional_tags: z.array(z.string()).optional().describe("Adiciona tags sem remover as existentes."),
        assignee_email: z.string().email().optional(),
        group_id: z.number().int().optional(),
      },
    },
    async (input) => {
      const ticket = {
        ...(input.status ? { status: input.status } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
        ...(input.type ? { type: input.type } : {}),
        ...(input.subject ? { subject: input.subject } : {}),
        ...(input.tags ? { tags: input.tags } : {}),
        ...(input.additional_tags ? { additional_tags: input.additional_tags } : {}),
        ...(input.group_id ? { group_id: input.group_id } : {}),
        ...(input.assignee_email ? { assignee_email: input.assignee_email } : {}),
      };
      const { data } = await zendeskRequest(`/api/v2/tickets/${input.ticket_id}.json`, {
        method: "PUT",
        body: { ticket },
      });
      return toJsonResult(data.ticket);
    }
  );

  server.registerTool(
    "zendesk_add_comment",
    {
      title: "Adicionar comentário ao ticket",
      description:
        "Adiciona um comentário (público ou interno/privado) a um ticket existente, sem alterar outros campos.",
      inputSchema: {
        ticket_id: z.number().int(),
        body: z.string().min(1).describe("Texto do comentário."),
        public: z.boolean().default(true).describe("false = nota interna, visível só para agentes."),
      },
    },
    async ({ ticket_id, body, public: isPublic }) => {
      const { data } = await zendeskRequest(`/api/v2/tickets/${ticket_id}.json`, {
        method: "PUT",
        body: { ticket: { comment: { body, public: isPublic } } },
      });
      return toJsonResult(data.ticket);
    }
  );

  server.registerTool(
    "zendesk_list_ticket_comments",
    {
      title: "Listar comentários de um ticket",
      description:
        "Lista o histórico completo de comentários (públicos e internos) de um ticket. " +
        "Referência: https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_comments/",
      inputSchema: {
        ticket_id: z.number().int(),
        max_items: z.number().int().min(1).max(100).default(50),
      },
    },
    async ({ ticket_id, max_items }) => {
      const items = await zendeskListPaginated(`/api/v2/tickets/${ticket_id}/comments.json`, "comments", {
        maxItems: max_items,
      });
      return toJsonResult(items);
    }
  );
}
