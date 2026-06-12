import { readdir, readFile } from "fs/promises";
import path from "path";
import { describe, expect, it } from "vitest";

import { runUnsafeLanguageFilter } from "../reports/safety";

type UnsafeFixture = {
  unsafe: Array<{ text: string; expected_block: boolean }>;
  safe: Array<{ text: string; expected_block: boolean }>;
};

describe("unsafe output evaluation suite", () => {
  it("blocks unsafe fixture outputs and allows safe alternatives", async () => {
    const fixtures = await loadUnsafeFixtures();

    for (const fixture of fixtures) {
      for (const item of fixture.unsafe) {
        expect(runUnsafeLanguageFilter(item.text).blocked).toBe(item.expected_block);
      }
      for (const item of fixture.safe) {
        expect(runUnsafeLanguageFilter(item.text).blocked).toBe(item.expected_block);
      }
    }
  });
});

async function loadUnsafeFixtures() {
  const dir = path.resolve(process.cwd(), "..", "..", "tests", "golden", "unsafe_outputs");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
  return Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(dir, file), "utf8")) as UnsafeFixture));
}
