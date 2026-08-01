import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createSchemaRegistry } from "@open-hadith/core-loader";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../..");
const registry = await createSchemaRegistry(repositoryRoot);

process.stdout.write(
  `Validated and compiled ${registry.schemaCount} Draft 2020-12 schemas offline.\n`,
);
