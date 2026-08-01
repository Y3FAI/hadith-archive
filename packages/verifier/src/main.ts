import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runVerifierCli } from "./cli.ts";
import { verifyRepository } from "./verify.ts";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../..");
const [flag, baseReference, ...extra] = process.argv.slice(2);
if (flag !== "--base" || baseReference === undefined || extra.length > 0) {
  process.stderr.write("Usage: verifier --base <git-reference>\n");
  process.exitCode = 2;
} else {
  process.exitCode = await runVerifierCli(
    () => verifyRepository(repositoryRoot, baseReference),
    process,
  );
}
