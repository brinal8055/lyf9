import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const migrationPattern = /^(\d{12}|\d{14})_([a-z0-9_]+)\.sql$/;

export async function readLocalMigrations(root = process.cwd()) {
  const directory = path.join(root, "supabase", "migrations");
  const filenames = (await readdir(directory)).filter((filename) => filename.endsWith(".sql")).sort();
  const migrations = [];

  for (const filename of filenames) {
    const match = filename.match(migrationPattern);
    if (!match) throw new Error(`Invalid migration filename: ${filename}`);
    const sql = await readFile(path.join(directory, filename), "utf8");
    migrations.push({
      filename,
      name: match[2],
      sha256: createHash("sha256").update(sql).digest("hex"),
      sql,
      version: match[1]
    });
  }

  if (migrations.length === 0) throw new Error("No Supabase migrations found.");
  const versions = migrations.map((migration) => migration.version);
  if (new Set(versions).size !== versions.length) throw new Error("Duplicate Supabase migration version found.");
  return migrations;
}

export async function readMigrationLock(root = process.cwd()) {
  const value = JSON.parse(await readFile(path.join(root, "supabase", "migration-lock.json"), "utf8"));
  if (value.schemaVersion !== 1 || !Array.isArray(value.migrations)) {
    throw new Error("Unsupported Supabase migration lock format.");
  }
  return value.migrations;
}

export function compareMigrationLock(local, locked) {
  const expected = local.map(({ version, name, sha256 }) => ({ version, name, sha256 }));
  const problems = compareRows(expected, locked, ["version", "name", "sha256"]);
  for (let index = 0; index < Math.min(expected.length, locked.length); index += 1) {
    if (expected[index].version !== locked[index].version) {
      problems.push(`Migration order mismatch at position ${index + 1}.`);
    }
  }
  return problems;
}

export function compareRemoteHistory(local, remote) {
  const expected = local.map(({ version, name }) => ({ version, name }));
  const problems = compareRows(expected, remote, ["version", "name"]);
  for (const row of remote) {
    if (!Number.isInteger(row.statement_count) || row.statement_count < 1) {
      problems.push(`Migration ${row.version} has no stored statements.`);
    }
  }
  return problems;
}

export function assertStagingDatabaseTarget(databaseUrl, projectRef, productionProjectRef) {
  if (!projectRef) throw new Error("STAGING_SUPABASE_PROJECT_REF is required.");
  if (productionProjectRef && projectRef === productionProjectRef) {
    throw new Error("Staging and production Supabase project references must differ.");
  }

  const url = new URL(databaseUrl);
  if (!url.protocol.startsWith("postgres")) throw new Error("DATABASE_URL must use PostgreSQL.");
  const identity = `${url.username}@${url.hostname}`;
  if (!identity.includes(projectRef)) {
    throw new Error("DATABASE_URL does not identify STAGING_SUPABASE_PROJECT_REF.");
  }
  if (productionProjectRef && identity.includes(productionProjectRef)) {
    throw new Error("Refusing to use a production Supabase DATABASE_URL.");
  }
}

export async function verifyRemoteMigrationState({ databaseUrl, projectRef, productionProjectRef, root = process.cwd() }) {
  assertStagingDatabaseTarget(databaseUrl, projectRef, productionProjectRef);
  const local = await readLocalMigrations(root);
  const locked = await readMigrationLock(root);
  const lockProblems = compareMigrationLock(local, locked);
  if (lockProblems.length > 0) throw new Error(lockProblems.join(" "));

  const postgres = (await import("postgres")).default;
  const sql = postgres(databaseUrl, {
    connect_timeout: 10,
    idle_timeout: 2,
    max: 1,
    ssl: "require"
  });

  try {
    const remote = await sql`
      select version, name, cardinality(statements)::int as statement_count
      from supabase_migrations.schema_migrations
      order by version
    `;
    const historyProblems = compareRemoteHistory(local, remote);
    if (historyProblems.length > 0) throw new Error(historyProblems.join(" "));

    const sentinelQuery = await readFile(
      path.join(root, "supabase", "verification", "staging_migration_sentinels.sql"),
      "utf8"
    );
    const sentinels = await sql.unsafe(sentinelQuery);
    const failed = sentinels.filter((row) => row.schema_present !== true);
    if (failed.length > 0) {
      throw new Error(`Missing schema sentinels for: ${failed.map((row) => row.version).join(", ")}`);
    }

    return { migrationCount: local.length, sentinelCount: sentinels.length };
  } finally {
    await sql.end({ timeout: 2 });
  }
}

function compareRows(expected, actual, fields) {
  const problems = [];
  if (expected.length !== actual.length) {
    problems.push(`Expected ${expected.length} migrations, found ${actual.length}.`);
  }

  const actualByVersion = new Map(actual.map((row) => [row.version, row]));
  for (const expectedRow of expected) {
    const actualRow = actualByVersion.get(expectedRow.version);
    if (!actualRow) {
      problems.push(`Missing migration ${expectedRow.version}.`);
      continue;
    }
    for (const field of fields) {
      if (actualRow[field] !== expectedRow[field]) {
        problems.push(`Migration ${expectedRow.version} has mismatched ${field}.`);
      }
    }
  }

  const expectedVersions = new Set(expected.map((row) => row.version));
  for (const actualRow of actual) {
    if (!expectedVersions.has(actualRow.version)) problems.push(`Unexpected migration ${actualRow.version}.`);
  }
  return problems;
}
