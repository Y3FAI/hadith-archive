import { lstat, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  CanonicalJsonError,
  parseCanonicalJsonBytes,
  parseJsonBytes,
} from "../../../packages/canonical-json/src/index.ts";
import {
  EXPECTED_SCHEMA_PATHS,
  type HadithRecord,
  type OccurrenceRecord,
  type SectionRecord,
  type SourceRecord,
  type SourceWitnessRecord,
} from "../../../packages/core-loader/src/index.ts";
import {
  createRepositorySnapshot,
  createStructuralVerificationContext,
  GRAPH_RULES,
  REPOSITORY_FILE_RULES,
  runVerification,
  SEMANTIC_RULES,
  STRUCTURAL_RULES,
  validSingleLine,
  type RepositoryFileInput,
} from "../../../packages/verifier/src/index.ts";

export const REPOSITORY_ROOT = resolve(import.meta.dir, "../../..");
export const SCHEMAS_DIRECTORY = resolve(REPOSITORY_ROOT, "schemas");

/** One reason the inputs were refused; `rule` names the verifier rule when one applies. */
export interface InputFinding {
  readonly file: string;
  readonly path: string;
  readonly message: string;
  readonly rule?: string;
}

export interface Topic {
  readonly hadith_ids: readonly number[];
  readonly title: string;
  readonly topic_id: number;
}

export interface SiteConfig {
  readonly name: string;
  readonly source_url: string;
  /** The site's public address, such as https://y3fai.github.io/hadith-archive. */
  readonly url: string;
}

export interface CoreRecords {
  readonly hadith: readonly HadithRecord[];
  readonly occurrences: readonly OccurrenceRecord[];
  readonly sections: readonly SectionRecord[];
  readonly sources: readonly SourceRecord[];
  readonly witnesses: readonly SourceWitnessRecord[];
}

export interface SiteInputs {
  readonly core: CoreRecords;
  readonly site: SiteConfig;
  readonly topics: readonly Topic[];
}

export type InputResult =
  | { readonly ok: true; readonly inputs: SiteInputs }
  | { readonly ok: false; readonly findings: readonly InputFinding[] };

interface TreeFile {
  readonly bytes: Uint8Array;
  readonly path: string;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortFindings(findings: InputFinding[]): InputFinding[] {
  return findings.sort((left, right) =>
    compareText(left.file, right.file) ||
    compareText(left.path, right.path) ||
    compareText(left.rule ?? "", right.rule ?? "") ||
    compareText(left.message, right.message)
  );
}

// Reads every regular file under a real directory, by forward-slash paths
// relative to it. Symlinks and other entries are refused, never followed.
async function readTree(
  root: string,
  label: string,
  findings: InputFinding[],
): Promise<TreeFile[] | undefined> {
  const status = await lstat(root).catch(() => undefined);
  if (status === undefined || !status.isDirectory()) {
    findings.push({ file: label, message: "Input directory does not exist", path: "" });
    return undefined;
  }
  const files: TreeFile[] = [];
  const visit = async (directory: string, prefix: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory()) {
        await visit(join(directory, entry.name), `${path}/`);
      } else if (entry.isFile()) {
        files.push({ bytes: new Uint8Array(await readFile(join(directory, entry.name))), path });
      } else {
        findings.push({
          file: `${label}/${path}`,
          message: "Input entry is not a regular file or directory",
          path: "",
        });
      }
    }
  };
  await visit(root, "");
  return files;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

// The core input gets every verifier rule except the historical ones, which
// need Git: the same checks that admit a record, without admitting it.
async function loadCore(
  root: string,
  label: string,
  findings: InputFinding[],
): Promise<CoreRecords | undefined> {
  const files = await readTree(root, label, findings);
  if (files === undefined) {
    return undefined;
  }
  if (files.length === 0) {
    findings.push({ file: label, message: "Core input contains no records", path: "" });
    return undefined;
  }
  const schemas: RepositoryFileInput[] = await Promise.all(EXPECTED_SCHEMA_PATHS.map(
    async (path) => ({
      bytes: new Uint8Array(await readFile(resolve(SCHEMAS_DIRECTORY, path))),
      path: `schemas/${path}`,
    }),
  ));
  const context = createStructuralVerificationContext(createRepositorySnapshot([
    ...schemas,
    ...files.map((file) => ({ bytes: file.bytes, path: `core/${file.path}` })),
  ]));
  const result = await runVerification(context, [
    ...REPOSITORY_FILE_RULES,
    ...STRUCTURAL_RULES,
    ...SEMANTIC_RULES,
    ...GRAPH_RULES,
  ]);
  if (result.kind === "incomplete") {
    findings.push({ file: label, message: result.error.message, path: "" });
    return undefined;
  }
  for (const item of result.report.findings) {
    findings.push({
      file: item.file.startsWith("core/") ? `${label}/${item.file.slice(5)}` : item.file,
      message: item.message,
      path: item.instance_path,
      rule: item.rule_id,
    });
  }
  if (!result.report.valid) {
    return undefined;
  }
  const records = context.validRecords.map((entry) => entry.record);
  return {
    hadith: records.filter((record) => record.record_type === "hadith") as HadithRecord[],
    occurrences: records.filter((record) => record.record_type === "occurrence") as
      OccurrenceRecord[],
    sections: records.filter((record) => record.record_type === "section") as SectionRecord[],
    sources: records.filter((record) => record.record_type === "source") as SourceRecord[],
    witnesses: records.filter((record) => record.record_type === "source_witness") as
      SourceWitnessRecord[],
  };
}

const TOPIC_KEYS = ["hadith_ids", "title", "topic_id"];

function checkTopic(
  file: TreeFile,
  label: string,
  hadithIds: ReadonlySet<number>,
  findings: InputFinding[],
): Topic | undefined {
  const name = `${label}/${file.path}`;
  const fail = (path: string, message: string) => {
    findings.push({ file: name, message, path });
    return undefined;
  };
  const match = /^([1-9][0-9]*)\.json$/.exec(file.path);
  if (match === null) {
    return fail("", "Topic files must be named <topic_id>.json directly inside the topics directory");
  }
  let value: unknown;
  try {
    value = parseCanonicalJsonBytes(file.bytes);
  } catch (error) {
    return fail("", error instanceof CanonicalJsonError
      ? `Topic file is not canonical JSON: ${error.message}`
      : "Topic file could not be parsed");
  }
  if (!isObject(value)) {
    return fail("", "Topic must be a JSON object");
  }
  const before = findings.length;
  for (const key of Object.keys(value)) {
    if (!TOPIC_KEYS.includes(key)) {
      fail(`/${key}`, "Unknown topic property");
    }
  }
  for (const key of TOPIC_KEYS) {
    if (!(key in value)) {
      fail("", `Missing topic property ${key}`);
    }
  }
  const { hadith_ids: members, title, topic_id: id } = value;
  if ("topic_id" in value) {
    if (!isPositiveSafeInteger(id)) {
      fail("/topic_id", "topic_id must be a positive safe integer");
    } else if (String(id) !== match[1]) {
      fail("/topic_id", "topic_id does not match the file name");
    }
  }
  if ("title" in value && (typeof title !== "string" || !validSingleLine(title))) {
    fail("/title", "title must be nonempty single-line text");
  }
  if ("hadith_ids" in value) {
    if (!Array.isArray(members) || members.length === 0) {
      fail("/hadith_ids", "hadith_ids must be a nonempty array");
    } else {
      members.forEach((member: unknown, index) => {
        if (!isPositiveSafeInteger(member)) {
          fail(`/hadith_ids/${index}`, "Hadith identifier must be a positive safe integer");
        } else if (!hadithIds.has(member)) {
          fail(`/hadith_ids/${index}`, "Hadith identifier does not resolve to a hadith record");
        } else if (index > 0 && !((members[index - 1] as number) < member)) {
          fail(`/hadith_ids/${index}`, "hadith_ids must be in strictly ascending numeric order");
        }
      });
    }
  }
  return findings.length === before
    ? { hadith_ids: members as number[], title: title as string, topic_id: id as number }
    : undefined;
}

async function loadTopics(
  root: string,
  label: string,
  hadithIds: ReadonlySet<number>,
  findings: InputFinding[],
): Promise<Topic[] | undefined> {
  const files = await readTree(root, label, findings);
  if (files === undefined) {
    return undefined;
  }
  const topics = files.flatMap((file) => checkTopic(file, label, hadithIds, findings) ?? []);
  const byTitle = new Map<string, Topic[]>();
  for (const topic of topics) {
    byTitle.set(topic.title, [...byTitle.get(topic.title) ?? [], topic]);
  }
  for (const group of byTitle.values()) {
    if (group.length > 1) {
      for (const topic of group) {
        findings.push({
          file: `${label}/${topic.topic_id}.json`,
          message: "Topic title is not unique",
          path: "/title",
        });
      }
    }
  }
  // A hadith belongs to one topic at most.
  topics.sort((left, right) => left.topic_id - right.topic_id);
  const listedIn = new Map<number, number>();
  for (const topic of topics) {
    topic.hadith_ids.forEach((id, position) => {
      const first = listedIn.get(id);
      if (first === undefined) {
        listedIn.set(id, topic.topic_id);
      } else {
        findings.push({
          file: `${label}/${topic.topic_id}.json`,
          message: `Hadith is already listed in topic ${first}`,
          path: `/hadith_ids/${position}`,
        });
      }
    });
  }
  return topics;
}

const SITE_KEYS = ["name", "source_url", "url"];

// An https address written as the URL parser writes it, with no query,
// fragment, credentials, or trailing slash.
function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string" || !URL.canParse(value) || value.endsWith("/")) {
    return false;
  }
  const url = new URL(value);
  return url.protocol === "https:" && url.search === "" && url.hash === "" &&
    url.username === "" && url.password === "" &&
    (url.href === value || url.href === `${value}/`);
}

async function loadSite(
  path: string,
  label: string,
  findings: InputFinding[],
): Promise<SiteConfig | undefined> {
  const status = await lstat(path).catch(() => undefined);
  if (status === undefined || !status.isFile()) {
    findings.push({ file: label, message: "Site configuration file does not exist", path: "" });
    return undefined;
  }
  const fail = (pointer: string, message: string) => {
    findings.push({ file: label, message, path: pointer });
    return undefined;
  };
  let value: unknown;
  try {
    value = parseJsonBytes(new Uint8Array(await readFile(path)));
  } catch (error) {
    return fail("", error instanceof CanonicalJsonError
      ? `Site configuration is not valid JSON: ${error.message}`
      : "Site configuration could not be parsed");
  }
  if (!isObject(value)) {
    return fail("", "Site configuration must be a JSON object");
  }
  const before = findings.length;
  for (const key of Object.keys(value)) {
    if (!SITE_KEYS.includes(key)) {
      fail(`/${key}`, "Unknown site configuration property");
    }
  }
  const { name, source_url: sourceUrl, url } = value;
  if (typeof name !== "string" || !validSingleLine(name)) {
    fail("/name", "name must be nonempty single-line text");
  }
  if (!isHttpsUrl(sourceUrl)) {
    fail("/source_url", "source_url must be an https URL without a trailing slash, query, or fragment");
  }
  if (!isHttpsUrl(url)) {
    fail("/url", "url must be an https URL without a trailing slash, query, or fragment");
  }
  return findings.length === before
    ? { name: name as string, source_url: sourceUrl as string, url: url as string }
    : undefined;
}

export interface InputPaths {
  readonly core: string;
  readonly site: string;
  readonly topics: string;
}

export async function loadInputs(paths: InputPaths): Promise<InputResult> {
  const findings: InputFinding[] = [];
  const site = await loadSite(resolve(paths.site), paths.site, findings);
  const core = await loadCore(resolve(paths.core), paths.core, findings);
  // Topic references are only meaningful against a valid core.
  const topics = core === undefined
    ? undefined
    : await loadTopics(
        resolve(paths.topics),
        paths.topics,
        new Set(core.hadith.map((record) => record.hadith_id)),
        findings,
      );
  if (findings.length > 0 || core === undefined || topics === undefined || site === undefined) {
    return { findings: sortFindings(findings), ok: false };
  }
  return { inputs: { core, site, topics }, ok: true };
}
