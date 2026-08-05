/**
 * Cliente HTTP para a Zendesk REST API (Ticketing API + Help Center API).
 *
 * Baseado na documentação oficial:
 * - Autenticação: https://developer.zendesk.com/api-reference/introduction/security-and-auth/
 * - Rate limits:   https://developer.zendesk.com/api-reference/introduction/rate-limits/
 * - Paginação:     https://developer.zendesk.com/api-reference/introduction/pagination/
 *
 * Credenciais SEMPRE vêm de variáveis de ambiente — nunca hardcoded aqui.
 */

const REQUIRED_ENV = ["ZENDESK_SUBDOMAIN", "ZENDESK_EMAIL"];

function readConfig() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Configuração do Zendesk incompleta. Variáveis de ambiente faltando: ${missing.join(", ")}. ` +
        "Veja o README.md deste servidor para instruções de configuração."
    );
  }

  const apiToken = process.env.ZENDESK_API_TOKEN;
  const password = process.env.ZENDESK_PASSWORD;
  if (!apiToken && !password) {
    throw new Error(
      "Configuração do Zendesk incompleta. Defina ZENDESK_API_TOKEN (recomendado, veja " +
        "https://developer.zendesk.com/api-reference/introduction/security-and-auth/#api-token) " +
        "ou, como alternativa não recomendada, ZENDESK_PASSWORD."
    );
  }

  return {
    subdomain: process.env.ZENDESK_SUBDOMAIN,
    email: process.env.ZENDESK_EMAIL,
    apiToken,
    password,
  };
}

function baseUrl(subdomain) {
  return `https://${subdomain}.zendesk.com`;
}

function authHeader({ email, apiToken, password }) {
  // Formato oficial de Basic Auth por token: "{email}/token:{api_token}".
  // Ver https://developer.zendesk.com/api-reference/introduction/security-and-auth/#api-token
  const user = apiToken ? `${email}/token` : email;
  const secret = apiToken ?? password;
  const encoded = Buffer.from(`${user}:${secret}`).toString("base64");
  return `Basic ${encoded}`;
}

const MAX_RETRIES = 3;

/**
 * Teto de segurança pra `max_items` nas ferramentas de listagem — evita uma
 * chamada acidental disparar centenas de requisições em sequência. 1000 já
 * cobre folgadamente uma conta de teste/demo; se um dia isso for pouco pra
 * um caso real, é só subir esse número (custo é só mais chamadas HTTP em
 * série dentro da mesma tool call, a API não tem esse limite).
 */
export const MAX_LIST_ITEMS = 1000;

/**
 * Executa uma requisição autenticada contra a Zendesk API.
 * Trata automaticamente 429 (rate limit) respeitando o header Retry-After,
 * conforme https://developer.zendesk.com/api-reference/introduction/rate-limits/
 *
 * @param {string} path - Caminho da API, ex: "/api/v2/tickets.json" ou uma URL completa (usada em paginação por cursor).
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {object} [options.body] - Corpo JSON da requisição.
 * @param {URLSearchParams|Record<string,string>} [options.query] - Parâmetros de query string.
 */
export async function zendeskRequest(path, options = {}) {
  const config = readConfig();
  const { method = "GET", body, query } = options;

  let url = path.startsWith("http") ? new URL(path) : new URL(path, baseUrl(config.subdomain));
  if (query) {
    const params = query instanceof URLSearchParams ? query : new URLSearchParams(query);
    for (const [key, value] of params) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    }
  }

  const headers = {
    Authorization: authHeader(config),
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get("Retry-After")) || 1;
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      continue;
    }

    const text = await response.text();
    const data = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      const detail = data ? JSON.stringify(data) : text;
      lastError = new Error(
        `Zendesk API respondeu ${response.status} ${response.statusText} em ${method} ${url.pathname}: ${detail}`
      );
      // Erros 5xx podem ser transitórios — tenta novamente com backoff simples.
      if (response.status >= 500 && attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      throw lastError;
    }

    return { data, response };
  }

  throw lastError ?? new Error("Falha desconhecida ao chamar a Zendesk API.");
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

/**
 * Helper para listar recursos com paginação por cursor, seguindo `links.next`
 * automaticamente até acumular `maxItems` (ou acabarem as páginas). Ver
 * https://developer.zendesk.com/api-reference/introduction/pagination/#cursor-pagination
 *
 * Cada página busca até 100 itens (máximo permitido pela Zendesk API por
 * requisição) — `maxItems` maior só significa mais requisições em sequência
 * dentro desta mesma chamada, não um limite da API em si.
 *
 * @param {string} path
 * @param {string} rootKey - Chave do array na resposta (ex: "tickets").
 * @param {object} [options]
 * @param {URLSearchParams|Record<string,string>} [options.query]
 * @param {number} [options.maxItems] - Máximo de itens a retornar no total.
 * @returns {Promise<{items: any[], hasMore: boolean}>} `hasMore` indica se
 *   existem mais registros na conta além dos `maxItems` retornados aqui.
 */
export async function zendeskListPaginated(path, rootKey, options = {}) {
  const { query, maxItems = 100 } = options;
  let nextUrl = null;
  let items = [];

  do {
    const { data } = await zendeskRequest(nextUrl ?? path, {
      query: nextUrl ? undefined : query,
    });
    items = items.concat(data?.[rootKey] ?? []);
    nextUrl = data?.links?.next ?? data?.next_page ?? null;
  } while (nextUrl && items.length < maxItems);

  const hasMore = items.length > maxItems || Boolean(nextUrl);
  return { items: items.slice(0, maxItems), hasMore };
}

export function getConfiguredSubdomain() {
  return process.env.ZENDESK_SUBDOMAIN;
}
