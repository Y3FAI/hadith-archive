import { expect, test } from "bun:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadRepositorySnapshot } from "@hadith-archive/verifier";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../..");

test("loads only Git-tracked repository files with relative sorted paths", async () => {
  const snapshot = await loadRepositorySnapshot(repositoryRoot);
  const paths = snapshot.files.map((file) => file.path);

  expect(paths).toContain("schemas/common/v1.schema.json");
  expect(paths).not.toContain("AGENTS.md");
  expect(paths).toEqual([...paths].sort());
  expect(paths.every((path) => !path.startsWith("/"))).toBe(true);
});
