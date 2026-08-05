/** Helpers compartilhados entre os módulos de ferramentas MCP. */

export function toJsonResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

/**
 * Formata o resultado de uma ferramenta de listagem, deixando explícito
 * quando a conta tem mais registros do que os retornados (em vez de
 * truncar silenciosamente) — assim o Claude sabe que precisa pedir de
 * novo com um `max_items` maior se o usuário quiser tudo mesmo.
 */
export function toListResult(items, hasMore) {
  return toJsonResult({
    count: items.length,
    has_more: hasMore,
    ...(hasMore
      ? {
          note: "Há mais registros na conta além dos retornados aqui. Chame esta ferramenta de novo com um max_items maior para trazer mais.",
        }
      : {}),
    items,
  });
}
