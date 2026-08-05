/**
 * Ferramentas de Help Center (central de ajuda / base de conhecimento).
 * Referência oficial:
 *   https://developer.zendesk.com/api-reference/help_center/help-center-api/categories/
 *   https://developer.zendesk.com/api-reference/help_center/help-center-api/sections/
 *   https://developer.zendesk.com/api-reference/help_center/help-center-api/articles/
 *   https://developer.zendesk.com/api-reference/help_center/help-center-api/help_center_search/
 */
import { z } from "zod";
import { zendeskRequest, zendeskListPaginated, MAX_LIST_ITEMS } from "../zendeskClient.js";
import { toJsonResult, toListResult } from "./shared.js";

const localeDescription =
  "Locale opcional (ex: 'pt-br', 'en-us'). Se omitido, usa o locale padrão da conta.";

function withLocale(path, locale) {
  if (!locale) return path;
  // Endpoints do Help Center aceitam o locale como segmento logo após /help_center/.
  return path.replace("/help_center/", `/help_center/${locale}/`);
}

export function registerHelpCenterTools(server) {
  server.registerTool(
    "zendesk_list_categories",
    {
      title: "Listar categorias do Help Center",
      description:
        "Lista as categorias (nível mais alto) da base de conhecimento. Paginação é tratada automaticamente.",
      inputSchema: {
        locale: z.string().optional().describe(localeDescription),
        max_items: z.number().int().min(1).max(MAX_LIST_ITEMS).default(50),
      },
    },
    async ({ locale, max_items }) => {
      const { items, hasMore } = await zendeskListPaginated(
        withLocale("/api/v2/help_center/categories.json", locale),
        "categories",
        { maxItems: max_items, query: { "page[size]": String(Math.min(max_items, 100)) } }
      );
      return toListResult(items, hasMore);
    }
  );

  server.registerTool(
    "zendesk_list_sections",
    {
      title: "Listar seções do Help Center",
      description:
        "Lista seções da base de conhecimento. Se category_id for informado, lista apenas as seções " +
        "dessa categoria. Paginação é tratada automaticamente.",
      inputSchema: {
        category_id: z.number().int().optional(),
        locale: z.string().optional().describe(localeDescription),
        max_items: z.number().int().min(1).max(MAX_LIST_ITEMS).default(50),
      },
    },
    async ({ category_id, locale, max_items }) => {
      const path = category_id
        ? `/api/v2/help_center/categories/${category_id}/sections.json`
        : "/api/v2/help_center/sections.json";
      const { items, hasMore } = await zendeskListPaginated(withLocale(path, locale), "sections", {
        maxItems: max_items,
        query: { "page[size]": String(Math.min(max_items, 100)) },
      });
      return toListResult(items, hasMore);
    }
  );

  server.registerTool(
    "zendesk_list_articles",
    {
      title: "Listar artigos do Help Center",
      description:
        "Lista artigos da base de conhecimento. Informe section_id ou category_id para restringir o escopo, " +
        "ou nenhum dos dois para listar todos os artigos da conta. Paginação é tratada automaticamente — " +
        `use max_items alto (até ${MAX_LIST_ITEMS}) pra trazer todos de uma vez.`,
      inputSchema: {
        section_id: z.number().int().optional(),
        category_id: z.number().int().optional(),
        locale: z.string().optional().describe(localeDescription),
        max_items: z.number().int().min(1).max(MAX_LIST_ITEMS).default(50),
        sort_by: z.enum(["position", "title", "created_at", "updated_at"]).optional(),
        sort_order: z.enum(["asc", "desc"]).optional(),
      },
    },
    async ({ section_id, category_id, locale, max_items, sort_by, sort_order }) => {
      let path = "/api/v2/help_center/articles.json";
      if (section_id) path = `/api/v2/help_center/sections/${section_id}/articles.json`;
      else if (category_id) path = `/api/v2/help_center/categories/${category_id}/articles.json`;

      const { items, hasMore } = await zendeskListPaginated(withLocale(path, locale), "articles", {
        maxItems: max_items,
        query: {
          "page[size]": String(Math.min(max_items, 100)),
          ...(sort_by ? { sort_by } : {}),
          ...(sort_order ? { sort_order } : {}),
        },
      });
      return toListResult(items, hasMore);
    }
  );

  server.registerTool(
    "zendesk_get_article",
    {
      title: "Obter artigo do Help Center",
      description: "Busca um artigo pelo ID, incluindo corpo em HTML.",
      inputSchema: {
        article_id: z.number().int(),
        locale: z.string().optional().describe(localeDescription),
      },
    },
    async ({ article_id, locale }) => {
      const path = withLocale(`/api/v2/help_center/articles/${article_id}.json`, locale);
      const { data } = await zendeskRequest(path);
      return toJsonResult(data.article);
    }
  );

  server.registerTool(
    "zendesk_search_articles",
    {
      title: "Buscar artigos no Help Center",
      description:
        "Busca artigos por texto livre na base de conhecimento. Paginação é tratada automaticamente. " +
        "Referência: https://developer.zendesk.com/api-reference/help_center/help-center-api/help_center_search/",
      inputSchema: {
        query: z.string().min(1),
        locale: z.string().optional().describe(localeDescription),
        category_id: z.number().int().optional(),
        section_id: z.number().int().optional(),
        max_items: z.number().int().min(1).max(MAX_LIST_ITEMS).default(25),
      },
    },
    async ({ query, locale, category_id, section_id, max_items }) => {
      const { items, hasMore } = await zendeskListPaginated("/api/v2/help_center/articles/search.json", "results", {
        maxItems: max_items,
        query: {
          query,
          "page[size]": String(Math.min(max_items, 100)),
          ...(locale ? { locale } : {}),
          ...(category_id ? { category: String(category_id) } : {}),
          ...(section_id ? { section: String(section_id) } : {}),
        },
      });
      return toListResult(items, hasMore);
    }
  );
}
