import { readFileSync } from "node:fs";

export type GitHubOAuthConfig = {
  appId: string;
  appSlug: string;
  clientId: string;
  clientSecret: string;
  appUrl: string;
};

export type GitHubAppConfig = GitHubOAuthConfig & { privateKey: string };

type Environment = Record<string, string | undefined>;

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n").trim();
}

function readPrivateKey(environment: Environment) {
  const inlineKey = environment.GITHUB_APP_PRIVATE_KEY?.trim();
  if (inlineKey) return inlineKey;

  const keyPath = environment.GITHUB_APP_PRIVATE_KEY_PATH?.trim();
  if (!keyPath) return null;
  try {
    return readFileSync(keyPath, "utf8").trim();
  } catch {
    return null;
  }
}

export function getGitHubOAuthConfig(environment: Environment = process.env): GitHubOAuthConfig | null {
  const appId = environment.GITHUB_APP_ID?.trim();
  const appSlug = environment.GITHUB_APP_SLUG?.trim();
  const clientId = environment.GITHUB_APP_CLIENT_ID?.trim();
  const clientSecret = environment.GITHUB_APP_CLIENT_SECRET?.trim();
  const appUrl = environment.NEXT_PUBLIC_APP_URL?.trim();

  if (!appId || !/^\d+$/.test(appId) || !appSlug || !clientId || !clientSecret
    || !appUrl) return null;

  try {
    new URL(appUrl);
  } catch {
    return null;
  }

  return {
    appId,
    appSlug,
    clientId,
    clientSecret,
    appUrl: appUrl.replace(/\/$/, ""),
  };
}

export function getGitHubAppConfig(environment: Environment = process.env): GitHubAppConfig | null {
  const oauth = getGitHubOAuthConfig(environment);
  const privateKey = readPrivateKey(environment);
  if (!oauth || !privateKey) return null;

  const normalizedPrivateKey = normalizePrivateKey(privateKey);
  if (!normalizedPrivateKey.includes("BEGIN") || !normalizedPrivateKey.includes("PRIVATE KEY")) return null;
  return { ...oauth, privateKey: normalizedPrivateKey };
}

export function getGitHubWebhookSecret(environment: Environment = process.env) {
  return environment.GITHUB_WEBHOOK_SECRET?.trim() || null;
}

export function requireGitHubAppConfig(environment: Environment = process.env) {
  const config = getGitHubAppConfig(environment);
  if (!config) throw new Error("github_app_not_configured");
  return config;
}

export function githubAppInstallationUrl(config: Pick<GitHubOAuthConfig, "appSlug">) {
  return `https://github.com/apps/${encodeURIComponent(config.appSlug)}/installations/new`;
}
