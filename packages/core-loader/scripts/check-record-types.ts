import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GENERATED_RECORD_TYPES_PATH,
  generateRecordTypes,
} from "./record-types.ts";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../..");
const generatedPath = resolve(repositoryRoot, GENERATED_RECORD_TYPES_PATH);
const [actual, expected] = await Promise.all([
  readFile(generatedPath, "utf8"),
  generateRecordTypes(repositoryRoot),
]);

if (actual !== expected) {
  throw new Error(
    "Generated record types are stale; run `bun run generate:types`",
  );
}
