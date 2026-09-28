import { describe, expect, it } from "vitest";
import type { GitHubRepository } from "./repositories";
import { repositoryRecord } from "./repository-record";

const repository: GitHubRepository = {
  id: 42,
  name: "armario-dev",
  full_name: "adrian9906/armario-dev",
  description: "Proyecto",
  private: true,
  visibility: "private",
  html_url: "https://github.com/adrian9906/armario-dev",
  clone_url: "https://github.com/adrian9906/armario-dev.git",
  ssh_url: "git@github.com:adrian9906/armario-dev.git",
  default_branch: "main",
  archived: false,
  owner: { login: "adrian9906" },
  updated_at: "2026-09-28T12:00:00Z",
};

describe("GitHub repository records", () => {
  it("guarda solamente los metadatos necesarios para el vínculo", () => {
    const record = repositoryRecord(repository);
    expect(record).toMatchObject({
      repository_id: 42,
      full_name: "adrian9906/armario-dev",
      owner_login: "adrian9906",
      visibility: "private",
      default_branch: "main",
    });
    expect(record).not.toHaveProperty("token");
  });
});
