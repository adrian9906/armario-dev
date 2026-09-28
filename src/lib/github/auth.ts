import "server-only";

import { createSign } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import type { GitHubAppConfig, GitHubOAuthConfig } from "@/lib/github/env";

const githubApiVersion = "2026-03-10";

type GitHubAccount = {
  id: number;
  login: string;
  type: "User" | "Organization" | "Enterprise";
};

export type GitHubInstallation = {
  id: number;
  account: GitHubAccount | null;
  repository_selection: "all" | "selected";
  permissions: Record<string, string>;
  suspended_at?: string | null;
};

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function isDnsLookupFailure(error: unknown) {
  if (!(error instanceof Error) || !("cause" in error)) return false;
  const cause = error.cause as { code?: string } | undefined;
  return cause?.code === "ENOTFOUND" || cause?.code === "EAI_AGAIN";
}

async function resolveGitHubApiAddress() {
  const response = await fetch("https://1.1.1.1/dns-query?name=api.github.com&type=A", {
    headers: { Accept: "application/dns-json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`github_dns_${response.status}`);
  const data = await response.json() as { Status?: number; Answer?: Array<{ type?: number; data?: string }> };
  const address = data.Status === 0
    ? data.Answer?.find((answer) => answer.type === 1 && isIP(answer.data ?? "") === 4)?.data
    : undefined;
  if (!address) throw new Error("github_dns_missing_address");
  return address;
}

async function githubJsonThroughResolvedAddress<T>(url: string, token: string, init?: RequestInit) {
  const target = new URL(url);
  if (target.hostname !== "api.github.com") throw new Error("github_dns_invalid_host");
  const address = await resolveGitHubApiAddress();
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-GitHub-Api-Version", githubApiVersion);
  headers.set("User-Agent", "Armario-Dev-GitHub-App");
  headers.set("Host", "api.github.com");

  const body = typeof init?.body === "string" || Buffer.isBuffer(init?.body) ? init.body : undefined;
  if (init?.body && body === undefined) throw new Error("github_api_unsupported_body");

  return new Promise<T>((resolve, reject) => {
    const request = httpsRequest({
      hostname: address,
      port: 443,
      path: `${target.pathname}${target.search}`,
      method: init?.method ?? "GET",
      servername: "api.github.com",
      headers: Object.fromEntries(headers.entries()),
      timeout: 15_000,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const status = response.statusCode ?? 500;
        const text = Buffer.concat(chunks).toString("utf8");
        if (status < 200 || status >= 300) {
          reject(new Error(`github_api_${status}`));
          return;
        }
        try {
          resolve(JSON.parse(text) as T);
        } catch {
          reject(new Error("github_api_invalid_json"));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("github_api_timeout")));
    request.on("error", reject);
    if (body) request.write(body);
    request.end();
  });
}

export function createGitHubAppJwt(config: Pick<GitHubAppConfig, "clientId" | "privateKey">, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000) - 60;
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: issuedAt, exp: issuedAt + 600, iss: config.clientId }));
  const unsignedToken = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(unsignedToken).sign(config.privateKey);
  return `${unsignedToken}.${base64Url(signature)}`;
}

async function githubJson<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": githubApiVersion,
        "User-Agent": "Armario-Dev-GitHub-App",
        ...init?.headers,
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`github_api_${response.status}`);
    return response.json() as Promise<T>;
  } catch (error) {
    if (!isDnsLookupFailure(error)) throw error;
    return githubJsonThroughResolvedAddress<T>(url, token, init);
  }
}

export async function exchangeGitHubUserCode(config: GitHubOAuthConfig, code: string) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: `${config.appUrl}/api/github/callback`,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`github_oauth_${response.status}`);
  const data = await response.json() as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(data.error ? `github_oauth_${data.error}` : "github_oauth_missing_token");
  return data.access_token;
}

export function getGitHubUserInstallation(userToken: string, installationId: number) {
  return githubJson<GitHubInstallation>(
    `https://api.github.com/user/installations/${installationId}`,
    userToken,
  );
}

export function getGitHubAppInstallation(config: GitHubAppConfig, installationId: number) {
  return githubJson<GitHubInstallation>(
    `https://api.github.com/app/installations/${installationId}`,
    createGitHubAppJwt(config),
  );
}

export async function createGitHubInstallationToken(config: GitHubAppConfig, installationId: number) {
  const data = await githubJson<{ token: string; expires_at: string }>(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    createGitHubAppJwt(config),
    { method: "POST" },
  );
  return { token: data.token, expiresAt: data.expires_at };
}
