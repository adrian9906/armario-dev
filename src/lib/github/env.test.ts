import { describe, expect, it } from "vitest";
import { getGitHubAppConfig, getGitHubOAuthConfig, getGitHubWebhookSecret, githubAppInstallationUrl } from "./env";

const validEnvironment = {
  GITHUB_APP_ID: "123456",
  GITHUB_APP_SLUG: "armario-dev",
  GITHUB_APP_CLIENT_ID: "Iv1.example",
  GITHUB_APP_CLIENT_SECRET: "secret",
  GITHUB_APP_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\\nkey\\n-----END RSA PRIVATE KEY-----",
  GITHUB_WEBHOOK_SECRET: "webhook-secret",
  NEXT_PUBLIC_APP_URL: "https://armario.example/",
};

describe("GitHub App environment", () => {
  it("normaliza la configuración válida", () => {
    const config = getGitHubAppConfig(validEnvironment);
    expect(config?.privateKey).toContain("\nkey\n");
    expect(config?.appUrl).toBe("https://armario.example");
  });

  it("rechaza valores incompletos o inválidos", () => {
    expect(getGitHubAppConfig({ ...validEnvironment, GITHUB_APP_ID: "abc" })).toBeNull();
    expect(getGitHubAppConfig({ ...validEnvironment, NEXT_PUBLIC_APP_URL: "not-a-url" })).toBeNull();
  });

  it("mantiene el secreto de webhook como configuración opcional independiente", () => {
    expect(getGitHubWebhookSecret(validEnvironment)).toBe("webhook-secret");
    expect(getGitHubWebhookSecret({})).toBeNull();
  });

  it("rechaza una ruta de clave que no existe", () => {
    expect(getGitHubAppConfig({
      ...validEnvironment,
      GITHUB_APP_PRIVATE_KEY: undefined,
      GITHUB_APP_PRIVATE_KEY_PATH: "Z:\\missing\\github-app.pem",
    })).toBeNull();
  });

  it("permite iniciar OAuth aunque la clave privada todavía no esté disponible", () => {
    expect(getGitHubOAuthConfig({
      ...validEnvironment,
      GITHUB_APP_PRIVATE_KEY: undefined,
    })?.clientId).toBe(validEnvironment.GITHUB_APP_CLIENT_ID);
  });

  it("crea la URL oficial de instalación", () => {
    expect(githubAppInstallationUrl({ appSlug: "armario dev" }))
      .toBe("https://github.com/apps/armario%20dev/installations/new");
  });
});
