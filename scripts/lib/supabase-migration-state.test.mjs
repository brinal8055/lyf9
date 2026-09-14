import assert from "node:assert/strict";
import test from "node:test";

import {
  assertStagingDatabaseTarget,
  compareMigrationLock,
  compareRemoteHistory
} from "./supabase-migration-state.mjs";

const local = [{ version: "202606060001", name: "core", sha256: "abc" }];

test("migration lock comparison detects historical SQL edits", () => {
  assert.deepEqual(compareMigrationLock(local, local), []);
  assert.match(compareMigrationLock(local, [{ ...local[0], sha256: "changed" }]).join(" "), /mismatched sha256/);
  assert.match(compareMigrationLock(
    [
      { version: "202606060001", name: "core", sha256: "abc" },
      { version: "202606060002", name: "next", sha256: "def" }
    ],
    [
      { version: "202606060002", name: "next", sha256: "def" },
      { version: "202606060001", name: "core", sha256: "abc" }
    ]
  ).join(" "), /Migration order mismatch/);
});

test("remote history comparison detects missing, extra, and renamed migrations", () => {
  assert.deepEqual(compareRemoteHistory(local, [
    { version: "202606060001", name: "core", statement_count: 1 }
  ]), []);
  assert.match(compareRemoteHistory(local, []).join(" "), /Missing migration 202606060001/);
  assert.match(
    compareRemoteHistory(local, [
      { version: "202606060001", name: "renamed", statement_count: 1 },
      { version: "202606060002", name: "extra", statement_count: 1 }
    ]).join(" "),
    /mismatched name.*Unexpected migration 202606060002/
  );
  assert.match(
    compareRemoteHistory(local, [
      { version: "202606060001", name: "core", statement_count: 0 }
    ]).join(" "),
    /has no stored statements/
  );
});

test("database target guard accepts staging and rejects ambiguous or production targets", () => {
  assert.doesNotThrow(() => assertStagingDatabaseTarget(
    "postgresql://postgres.wjjwdakfyigwwohbntyv:secret@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres",
    "wjjwdakfyigwwohbntyv",
    "mdxualgpuoqcmtaifaws"
  ));
  assert.throws(() => assertStagingDatabaseTarget(
    "postgresql://postgres:secret@db.mdxualgpuoqcmtaifaws.supabase.co:5432/postgres",
    "wjjwdakfyigwwohbntyv",
    "mdxualgpuoqcmtaifaws"
  ), /does not identify|production/);
  assert.throws(() => assertStagingDatabaseTarget(
    "postgresql://postgres:secret@localhost:5432/postgres",
    "wjjwdakfyigwwohbntyv"
  ), /does not identify/);
});
