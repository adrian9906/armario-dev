const unsafePostgrestCharacters = /[%_*\\",()]/g;

export function normalizeMcpSearchQuery(query: string) {
  return query
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(unsafePostgrestCharacters, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export function buildMcpSearchFilter(fields: string[], query: string) {
  const normalized = normalizeMcpSearchQuery(query);
  if (!normalized) return "";
  const pattern = `"%${normalized}%"`;
  return fields.map((field) => `${field}.ilike.${pattern}`).join(",");
}

export function createSearchSnippet(text: string, query: string, context = 110) {
  const normalizedQuery = normalizeMcpSearchQuery(query);
  const cleanText = text.replace(/\s+/g, " ").trim();
  if (!cleanText) return "";

  const matchAt = cleanText.toLocaleLowerCase().indexOf(normalizedQuery.toLocaleLowerCase());
  if (matchAt < 0) return cleanText.slice(0, context * 2);

  const start = Math.max(0, matchAt - context);
  const end = Math.min(cleanText.length, matchAt + normalizedQuery.length + context);
  return `${start > 0 ? "…" : ""}${cleanText.slice(start, end)}${end < cleanText.length ? "…" : ""}`;
}
