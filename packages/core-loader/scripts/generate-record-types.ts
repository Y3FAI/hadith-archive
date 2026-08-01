import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GENERATED_RECORD_TYPES_PATH,
  generateRecordTypes,
} from "./record-types.ts";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../..");
const outputPath = resolve(repositoryRoot, GENERATED_RECORD_TYPES_PATH);
const source = await generateRecordTypes(repositoryRoot);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, source, "utf8");
