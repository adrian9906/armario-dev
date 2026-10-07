export const MCP_OUTPUT_LIMIT_CHARACTERS = 120_000;

export function serializeMcpOutput(value: unknown, limit = MCP_OUTPUT_LIMIT_CHARACTERS) {
  const serialized = JSON.stringify(value);
  if (serialized.length <= limit) return serialized;

  const notice = {
    truncated: true,
    reason: "response_too_large",
    maxCharacters: limit,
    message: "La respuesta se recortó para ajustarse al límite MCP. Usa búsqueda o solicita un elemento más concreto.",
  };
  let preview = serialized.slice(0, Math.max(0, limit - JSON.stringify({ ...notice, preview: "" }).length - 4));
  let output = JSON.stringify({ ...notice, preview });
  while (output.length > limit && preview.length) {
    preview = preview.slice(0, Math.max(0, preview.length - (output.length - limit) - 1));
    output = JSON.stringify({ ...notice, preview });
  }
  return output;
}
