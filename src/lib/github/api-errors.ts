export function makeGitHubApiError(status: number, headers: Headers, responseBody = "") {
  const limited = status === 429
    || (status === 403 && (headers.get("x-ratelimit-remaining") === "0"
      || headers.has("retry-after")
      || /rate limit|secondary rate limit/i.test(responseBody)));
  return new Error(limited ? "github_api_rate_limited" : `github_api_${status}`);
}

export function formatMcpGitHubError(error: unknown, fallback: string) {
  const code = error instanceof Error ? error.message : "";
  if (code === "github_api_rate_limited") return "GitHub limitó temporalmente las solicitudes. Espera un poco y vuelve a intentarlo.";
  if (code === "github_api_401") return "GitHub rechazó la autenticación de la App. Vuelve a conectar la GitHub App.";
  if (code === "github_api_403") return "La GitHub App o las reglas del repositorio no permiten esta operación.";
  if (code === "github_api_404") return "No se encontró el repositorio, la rama o el elemento solicitado.";
  if (code === "github_api_409" || code === "github_branch_moved") return "La rama cambió durante la operación. Actualiza el SHA y vuelve a intentarlo.";
  if (code === "github_api_422") return "GitHub rechazó los datos. Comprueba nombres, ramas y estado del elemento.";
  if (code === "github_api_timeout" || code.startsWith("github_dns_")) return "No se pudo comunicar con GitHub. Inténtalo de nuevo.";
  if (code.startsWith("mcp_github_") && code.endsWith("_required")) return "Necesitas ser responsable del proyecto y tener el permiso de GitHub correspondiente.";
  return fallback;
}
