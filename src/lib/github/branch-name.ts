const invalidCharacters = /[\x00-\x20~^:?*[\\\x7f]/;

export function isValidGitBranchName(value: string) {
  if (!value || value.length > 255 || value === "@") return false;
  if (value.startsWith("/") || value.endsWith("/") || value.startsWith(".") || value.endsWith(".")) return false;
  if (value.includes("..") || value.includes("//") || value.includes("@{") || invalidCharacters.test(value)) return false;
  return value.split("/").every((segment) => segment && !segment.endsWith(".lock"));
}
