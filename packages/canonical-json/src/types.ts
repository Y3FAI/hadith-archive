export type CanonicalJsonArray = CanonicalJsonValue[];

export interface CanonicalJsonObject {
  [key: string]: CanonicalJsonValue;
}

export type CanonicalJsonValue =
  | CanonicalJsonArray
  | CanonicalJsonObject
  | bigint
  | boolean
  | null
  | number
  | string;

export function isCanonicalJsonObject(
  value: CanonicalJsonValue,
): value is CanonicalJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
