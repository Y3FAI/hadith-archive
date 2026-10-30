import { parseArgs } from "node:util";

import { buildSite } from "./build.ts";

const USAGE = "Usage: bun run apps/web/src/main.ts --core <dir> --topics <dir> --site <file> --out <dir>\n";

let values;
try {
  ({ values } = parseArgs({
    allowPositionals: false,
    options: {
      core: { type: "string" },
      out: { type: "string" },
      site: { type: "string" },
      topics: { type: "string" },
    },
    strict: true,
  }));
} catch {
  values = undefined;
}

if (
  values === undefined || values.core === undefined || values.out === undefined ||
  values.site === undefined || values.topics === undefined
) {
  process.stderr.write(USAGE);
  process.exitCode = 2;
} else {
  try {
    const result = await buildSite({
      core: values.core,
      out: values.out,
      site: values.site,
      topics: values.topics,
    });
    if (result.kind === "built") {
      process.stdout.write(`Built ${result.files.length} files into ${values.out}\n`);
    } else {
      for (const finding of result.findings) {
        const rule = finding.rule === undefined ? "" : ` [${finding.rule}]`;
        process.stderr.write(`${finding.file} ${finding.path}: ${finding.message}${rule}\n`);
      }
      process.stderr.write("Build refused; nothing was written.\n");
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`Build failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
