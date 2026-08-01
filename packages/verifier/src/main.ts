import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runVerifierCli } from "./cli.ts";
import { verifyRepositoryFiles } from "./verify.ts";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../..");
process.exitCode = await runVerifierCli(
  () => verifyRepositoryFiles(repositoryRoot),
  process,
);
