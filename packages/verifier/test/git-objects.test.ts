import { expect, test } from "bun:test";
import { ReadableStream } from "node:stream/web";

import { GitOutputReader } from "../src/git-objects.ts";

function reader(chunks: readonly Uint8Array[]) {
  return new GitOutputReader(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }));
}

test("reads binary protocol headers and bodies across arbitrary chunk boundaries", async () => {
  const data = Buffer.concat([Buffer.from("header\n"), Buffer.from([0, 255, 10, 42]), Buffer.from("\nnext\0")]);
  for (let split = 0; split <= data.length; split += 1) {
    const output = reader([data.subarray(0, split), new Uint8Array(), data.subarray(split)]);
    expect((await output.until(10))?.toString()).toBe("header");
    expect(await output.bytes(4)).toEqual(Buffer.from([0, 255, 10, 42]));
    expect(await output.bytes(1)).toEqual(Buffer.from("\n"));
    expect((await output.until(0))?.toString()).toBe("next");
    expect(await output.until(0)).toBeUndefined();
  }
});

test("fails closed on truncated protocol headers and blob bodies", async () => {
  await expect(reader([Buffer.from("unterminated")]).until(10)).rejects.toThrow("Truncated Git output");
  await expect(reader([Buffer.from([0, 255])]).bytes(3)).rejects.toThrow("Truncated Git blob");
});
