import {
  CanonicalJsonError,
  type CanonicalJsonValue,
  decodeUtf8,
  parseCanonicalJsonBytes,
  parseJsonSource,
} from "@open-hadith/canonical-json";

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
