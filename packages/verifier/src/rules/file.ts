import {
  CanonicalJsonError,
  type CanonicalJsonValue,
  decodeUtf8,
  parseCanonicalJsonBytes,
  parseJsonSource,
} from "@open-hadith/canonical-json";
import { EXPECTED_SCHEMA_PATHS } from "@open-hadith/core-loader";

import type { VerificationFindingInput, VerificationRule } from "../protocol.ts";
import { isRegularFile, type RepositorySnapshot, type TrackedFile } from "../repository.ts";

const PRIVATE_PATHS = new Set([
  ".claude",
  ".codex",
  "AGENTS.md",
  "CLAUDE.md",
  "decisions",
  "sources",
  "workspace",
]);
const PRIVATE_EXTENSIONS = new Set([
  ".djvu",
  ".epub",
  ".pdf",
]);

// Version-one identifier spellings from schemas/common/v1.schema.json. Numeric
// identifiers use ordinary unpadded decimal notation within the safe range.
const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const SOURCE_ID_MAX_LENGTH = 64;
const SECTION_ID_MAX_LENGTH = 96;
const WITNESS_ID_MAX_LENGTH = 128;

function isSlug(segment: string, maxLength: number): boolean {
  return segment.length <= maxLength && SLUG_PATTERN.test(segment);
}

function isPositiveDecimal(segment: string): boolean {
  return /^[1-9][0-9]*$/.test(segment) && Number.isSafeInteger(Number(segment));
}

function jsonStem(segment: string | undefined): string | undefined {
  return segment !== undefined && segment.endsWith(".json")
    ? segment.slice(0, -".json".length)
    : undefined;
}

function isRecordPath(path: string): boolean {
  const segments = path.split("/");
  if (segments[0] !== "core") {
    return false;
  }
  if (segments[1] === "hadith") {
    const hadithId = jsonStem(segments[2]);
    return segments.length === 3 && hadithId !== undefined && isPositiveDecimal(hadithId);
  }
  if (segments[1] !== "sources" || !isSlug(segments[2] ?? "", SOURCE_ID_MAX_LENGTH)) {
    return false;
  }
  if (segments.length === 4) {
    return segments[3] === "source.json";
  }
  if (segments.length === 5 && segments[3] === "sections") {
    const sectionId = jsonStem(segments[4]);
    return sectionId !== undefined && isSlug(sectionId, SECTION_ID_MAX_LENGTH);
  }
  if (segments[3] !== "witnesses" || !isSlug(segments[4] ?? "", WITNESS_ID_MAX_LENGTH)) {
    return false;
  }
  if (segments.length === 6) {
    return segments[5] === "witness.json";
  }
  const occurrenceId = jsonStem(segments[6]);
  return segments.length === 7 && segments[5] === "occurrences" &&
    occurrenceId !== undefined && isPositiveDecimal(occurrenceId);
}

function isCoreJson(file: TrackedFile): boolean {
  return isRegularFile(file) && file.path.endsWith(".json") &&
    (file.path.startsWith("core/") || file.path.startsWith("schemas/"));
}

function coreJsonFiles(snapshot: RepositorySnapshot): readonly TrackedFile[] {
  return snapshot.files.filter(isCoreJson);
}

function finding(file: TrackedFile, message: string): VerificationFindingInput {
  return { file: file.path, instancePath: "", message };
}

function canonicalError(file: TrackedFile): CanonicalJsonError | undefined {
  try {
    parseCanonicalJsonBytes(file.readBytes());
    return undefined;
  } catch (error: unknown) {
    if (error instanceof CanonicalJsonError) {
      return error;
    }
    throw error;
  }
}

function parsedError(file: TrackedFile): CanonicalJsonError | undefined {
  try {
    parseJsonSource(decodeUtf8(file.readBytes()));
    return undefined;
  } catch (error: unknown) {
    if (error instanceof CanonicalJsonError) {
      return error;
    }
    throw error;
  }
}

function containsNonNfc(value: CanonicalJsonValue): boolean {
  if (typeof value === "string") {
    return value !== value.normalize("NFC");
  }
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(containsNonNfc);
  }
  return Object.entries(value).some(
    ([key, child]) => key !== key.normalize("NFC") || containsNonNfc(child),
  );
}

function hasPrivatePath(path: string): boolean {
  const firstSegment = path.split("/", 1)[0] ?? "";
  if (PRIVATE_PATHS.has(firstSegment)) {
    return true;
  }
  const dot = path.lastIndexOf(".");
  return dot >= 0 && PRIVATE_EXTENSIONS.has(path.slice(dot).toLowerCase());
}

export const repositoryPrivateMaterialAbsent: VerificationRule<RepositorySnapshot> = {
  evaluate: (snapshot) => snapshot.files
    .filter((file) => hasPrivatePath(file.path))
    .map((file) => finding(file, "Private material must not be tracked")),
  id: "repository.private_material_absent",
  prerequisites: [],
};

// Every ASCII case variant of the root aliases core/ on case-insensitive
// filesystems, so variants are rejected rather than normalized.
function hasCoreRoot(path: string): boolean {
  return /^[cC][oO][rR][eE]$/.test(path.split("/", 1)[0] ?? "");
}

// Inspects path metadata only, so unreadable, binary, or non-JSON entries still
// receive a finding. record.path_matches owns agreement with declared identity.
export const repositoryCorePaths: VerificationRule<RepositorySnapshot> = {
  evaluate: (snapshot) => snapshot.files
    .filter((file) => hasCoreRoot(file.path) && !isRecordPath(file.path))
    .map((file) => finding(file, "Core paths must match an approved record path")),
  id: "repository.core_paths",
  prerequisites: [],
};

const SCHEMA_PATHS = new Set(EXPECTED_SCHEMA_PATHS.map((path) => `schemas/${path}`));

// As with core/, every ASCII case variant of the root aliases schemas/.
function hasSchemasRoot(path: string): boolean {
  return /^[sS][cC][hH][eE][mM][aA][sS]$/.test(path.split("/", 1)[0] ?? "");
}

// Inspects path metadata only. main holds just the registered catalog, so a new
// version or entity schema fails until the verifier registers it; the schema.*
// rules then inspect its contents.
export const repositorySchemaPaths: VerificationRule<RepositorySnapshot> = {
  evaluate: (snapshot) => snapshot.files
    .filter((file) => hasSchemasRoot(file.path) && !SCHEMA_PATHS.has(file.path))
    .map((file) => finding(file, "Schema paths must match a registered catalog schema")),
  id: "repository.schema_paths",
  prerequisites: [],
};

export const fileRegular: VerificationRule<RepositorySnapshot> = {
  evaluate: (snapshot) => snapshot.files.filter((file) =>
    !isRegularFile(file) &&
    ["core", "schemas"].some((root) =>
      file.path === root || file.path.startsWith(`${root}/`)
    )
  ).map((file) => finding(file, "Core and schema paths must be regular Git files")),
  id: "file.regular",
  prerequisites: [],
};

export const fileValidUtf8: VerificationRule<RepositorySnapshot> = {
  evaluate: (snapshot) => coreJsonFiles(snapshot).flatMap((file) => {
    try {
      decodeUtf8(file.readBytes());
      return [];
    } catch (error: unknown) {
      return error instanceof CanonicalJsonError && error.code === "invalid_utf8"
        ? [finding(file, "File is not valid UTF-8")]
        : [];
    }
  }),
  id: "file.valid_utf8",
  prerequisites: [],
};

export const fileNoBom: VerificationRule<RepositorySnapshot> = {
  evaluate: (snapshot) => coreJsonFiles(snapshot).flatMap((file) => {
    const bytes = file.readBytes();
    return bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? [finding(file, "UTF-8 BOM is forbidden")]
      : [];
  }),
  id: "file.no_bom",
  prerequisites: [],
};

export const fileLfOnly: VerificationRule<RepositorySnapshot> = {
  evaluate: (snapshot) => coreJsonFiles(snapshot).flatMap((file) =>
    file.readBytes().includes(0x0d)
      ? [finding(file, "Only LF line endings are permitted")]
      : []
  ),
  id: "file.lf_only",
  prerequisites: [],
};

export const fileFinalLf: VerificationRule<RepositorySnapshot> = {
  evaluate: (snapshot) => coreJsonFiles(snapshot).flatMap((file) => {
    const bytes = file.readBytes();
    const valid = bytes.length > 0 && bytes.at(-1) === 0x0a &&
      (bytes.length === 1 || bytes.at(-2) !== 0x0a);
    return valid ? [] : [finding(file, "File must end with exactly one LF")];
  }),
  id: "file.final_lf",
  prerequisites: [],
};

export const jsonParseable: VerificationRule<RepositorySnapshot> = {
  evaluate: (snapshot) => coreJsonFiles(snapshot).flatMap((file) => {
    let source: string;
    try {
      source = decodeUtf8(file.readBytes());
    } catch {
      return [];
    }
    try {
      parseJsonSource(source);
      return [];
    } catch (error: unknown) {
      return error instanceof CanonicalJsonError && error.code === "syntax"
        ? [finding(file, "File is not parseable JSON")]
        : [];
    }
  }),
  id: "json.parseable",
  prerequisites: [],
};

export const jsonUniqueKeys: VerificationRule<RepositorySnapshot> = {
  evaluate: (snapshot) => coreJsonFiles(snapshot).flatMap((file) =>
    parsedError(file)?.code === "duplicate_key"
      ? [finding(file, "JSON object contains a duplicate key")]
      : []
  ),
  id: "json.unique_keys",
  prerequisites: [],
};

const CANONICAL_CODES = new Set([
  "floating_point",
  "ill_formed_unicode",
  "non_canonical",
  "top_level",
  "unsupported_value",
]);

export const jsonCanonical: VerificationRule<RepositorySnapshot> = {
  evaluate: (snapshot) => coreJsonFiles(snapshot).flatMap((file) => {
    const code = canonicalError(file)?.code;
    return code !== undefined && CANONICAL_CODES.has(code)
      ? [finding(file, "JSON bytes are not canonical")]
      : [];
  }),
  id: "json.canonical",
  prerequisites: [],
};

export const textNfc: VerificationRule<RepositorySnapshot> = {
  evaluate: (snapshot) => coreJsonFiles(snapshot).flatMap((file) => {
    try {
      const value = parseJsonSource(decodeUtf8(file.readBytes()));
      return containsNonNfc(value)
        ? [finding(file, "JSON string or key is not NFC")]
        : [];
    } catch {
      return [];
    }
  }),
  id: "text.nfc",
  prerequisites: [],
};

export const REPOSITORY_FILE_RULES = Object.freeze([
  repositoryPrivateMaterialAbsent,
  repositoryCorePaths,
  repositorySchemaPaths,
  fileRegular,
  fileValidUtf8,
  fileNoBom,
  fileLfOnly,
  fileFinalLf,
  jsonParseable,
  jsonUniqueKeys,
  jsonCanonical,
  textNfc,
]);
