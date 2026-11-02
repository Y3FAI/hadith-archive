import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import {
  loadInputs,
  REPOSITORY_ROOT,
  SCHEMAS_DIRECTORY,
  type InputFinding,
  type InputPaths,
} from "./inputs.ts";
import { PAGE_SIZE, renderSite } from "./render.ts";

export const ASSETS_DIRECTORY = resolve(REPOSITORY_ROOT, "apps/web/demo");

// Copied byte for byte; the font is never subset or changed.
export const ASSET_PATHS = [
  "favicon.ico",
  "favicon.svg",
  "font/UthmanTN_v2-0.ttf",
  "font/UthmanTN_v2-0.woff2",
  "script.js",
  "style.css",
];

// Linked with a hash of their bytes, so a changed file is never served
// stale from a cache.
const VERSIONED_ASSETS = ["script.js", "style.css"];

export interface BuildOptions extends InputPaths {
  readonly out: string;
}

export type BuildResult =
  | { readonly kind: "built"; readonly files: readonly string[] }
  | { readonly kind: "refused"; readonly findings: readonly InputFinding[] };

// Lowercase ASCII directory segments from validated identifiers, then a file.
const SAFE_OUTPUT_PATH = /^(?:[a-z0-9-]+\/)*[A-Za-z0-9_-]+\.[a-z0-9]+$/;

// Resolves symlinks in the longest existing ancestor, so an output path is
// compared with inputs by where it would really be written.
async function physicalPath(path: string): Promise<string> {
  const absolute = resolve(path);
  const parent = dirname(absolute);
  const real = await realpath(absolute).catch(() => undefined);
  if (real !== undefined) {
    return real;
  }
  return parent === absolute ? absolute : join(await physicalPath(parent), absolute.slice(parent.length + 1));
}

const within = (path: string, root: string) => path === root || path.startsWith(`${root}${sep}`);

async function outputFindings(options: BuildOptions): Promise<InputFinding[]> {
  const findings: InputFinding[] = [];
  const out = await physicalPath(options.out);
  const protectedPaths = [
    [options.core, options.core],
    [options.topics, options.topics],
    [options.site, options.site],
    [ASSETS_DIRECTORY, "apps/web/demo"],
    [SCHEMAS_DIRECTORY, "schemas"],
  ];
  for (const [path, label] of protectedPaths) {
    const physical = await physicalPath(path as string);
    if (within(out, physical) || within(physical, out)) {
      findings.push({
        file: options.out,
        message: `Output directory overlaps ${label}`,
        path: "",
      });
    }
  }
  const status = await lstat(options.out).catch(() => undefined);
  if (status !== undefined) {
    if (!status.isDirectory() || status.isSymbolicLink()) {
      findings.push({ file: options.out, message: "Output path is not a directory", path: "" });
    } else if ((await readdir(options.out)).length > 0) {
      findings.push({ file: options.out, message: "Output directory is not empty", path: "" });
    }
  }
  return findings;
}

/**
 * Validates every input and renders every page in memory, then writes them
 * into an absent or empty output directory. A refused build writes nothing,
 * and no file is ever overwritten.
 */
export async function buildSite(options: BuildOptions): Promise<BuildResult> {
  const outputProblems = await outputFindings(options);
  if (outputProblems.length > 0) {
    return { findings: outputProblems, kind: "refused" };
  }
  const loaded = await loadInputs(options);
  if (!loaded.ok) {
    return { findings: loaded.findings, kind: "refused" };
  }
  const files = new Map<string, Uint8Array>();
  for (const path of ASSET_PATHS) {
    files.set(path, new Uint8Array(await readFile(resolve(ASSETS_DIRECTORY, path))));
  }
  const assetVersions = Object.fromEntries(VERSIONED_ASSETS.map((path) => [
    path,
    createHash("sha256").update(files.get(path) as Uint8Array).digest("hex").slice(0, 10),
  ]));
  const encoder = new TextEncoder();
  for (const page of renderSite(loaded.inputs, { assetVersions, pageSize: PAGE_SIZE })) {
    files.set(page.path, encoder.encode(page.text));
  }
  const paths = [...files.keys()].sort();
  for (const path of paths) {
    if (!SAFE_OUTPUT_PATH.test(path) || path.split("/").includes("..")) {
      throw new Error(`Refusing unsafe output path ${JSON.stringify(path)}`);
    }
  }
  await mkdir(options.out, { recursive: true });
  for (const path of paths) {
    const target = resolve(options.out, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, files.get(path) as Uint8Array, { flag: "wx" });
  }
  return { files: paths, kind: "built" };
}
