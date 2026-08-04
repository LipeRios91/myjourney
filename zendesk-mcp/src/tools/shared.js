/** Helpers compartilhados entre os módulos de ferramentas MCP. */

export function toJsonResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}
