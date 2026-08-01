type JsonPrimitive = bigint | boolean | null | number | string;

export type DeepReadonly<T> = T extends JsonPrimitive
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (typeof value !== "object" || value === null) {
    return value as DeepReadonly<T>;
  }

  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(Reflect.get(value, key) as unknown);
  }

  return (Object.isFrozen(value)
    ? value
    : Object.freeze(value)) as DeepReadonly<T>;
}
