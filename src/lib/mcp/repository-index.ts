const supportedExtensions = new Set([
  ".c", ".cc", ".cfg", ".conf", ".cpp", ".cs", ".css", ".csv", ".cjs", ".cts", ".go", ".h", ".hpp",
  ".html", ".java", ".js", ".json", ".jsx", ".md", ".mdx", ".mjs", ".mts", ".php", ".prisma", ".py",
  ".rb", ".rs", ".scss", ".sh", ".sql", ".svelte", ".toml", ".ts", ".tsx", ".txt", ".xml", ".yaml", ".yml",
]);

const supportedBasenames = new Set(["dockerfile", "license", "makefile", "readme", "gemfile", "procfile"]);
const excludedPath = /(^|\/)(\.git|node_modules|vendor|dist|build|coverage|\.next|\.vercel|\.turbo|\.pnpm)(\/|$)|(^|\/)(\.env($|\.)|.*\.(pem|key|p12|pfx|keystore|sqlite|db)$|id_rsa($|\.)|credentials?($|\.)|secrets?($|\.))/i;
const ignoredExtensions = new Set([".lock", ".map", ".min.js", ".min.css", ".svg"]);

export const MCP_REPOSITORY_INDEX_LIMITS = {
  files: 120,
  fileBytes: 48_000,
  totalBytes: 1_500_000,
  treeEntries: 20_000,
} as const;

export function parseRepositoryPush(body: Record<string, unknown>) {
  const repository = body.repository as { id?: number } | undefined;
  const repositoryId = repository?.id;
  const ref = typeof body.ref === "string" ? body.ref : "";
  const sourceCommitSha = typeof body.after === "string" ? body.after.toLowerCase() : "";
  const branch = ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : "";
  if (typeof repositoryId !== "number" || !Number.isSafeInteger(repositoryId) || repositoryId <= 0 || !branch || branch.length > 255
    || !/^[a-f0-9]{40}$/.test(sourceCommitSha) || /^0+$/.test(sourceCommitSha)) return null;
  return { repositoryId, branch, sourceCommitSha };
}

export function isIndexableRepositoryPath(path: string, size: number) {
  if (!path || path.startsWith("/") || path.split("/").some((part) => part === ".." || part === ".") || excludedPath.test(path)) return false;
  if (!Number.isSafeInteger(size) || size < 0 || size > MCP_REPOSITORY_INDEX_LIMITS.fileBytes) return false;
  const basename = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const extension = basename.includes(".") ? basename.slice(basename.lastIndexOf(".")) : "";
  if (ignoredExtensions.has(extension)) return false;
  return supportedBasenames.has(basename) || supportedExtensions.has(extension);
}

export function decodeGitHubTextBlob(content: string, encoding: string) {
  if (encoding !== "base64") return null;
  const bytes = Buffer.from(content.replace(/\s/g, ""), "base64");
  if (bytes.includes(0)) return null;
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return decoded;
}

export function chooseRepositoryFiles<T extends { path: string; type: string; size?: number; sha: string }>(entries: T[]) {
  if (entries.length > MCP_REPOSITORY_INDEX_LIMITS.treeEntries) throw new Error("mcp_repository_tree_too_large");
  return entries
    .filter((entry) => entry.type === "blob" && isIndexableRepositoryPath(entry.path, entry.size ?? -1))
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, MCP_REPOSITORY_INDEX_LIMITS.files);
}
