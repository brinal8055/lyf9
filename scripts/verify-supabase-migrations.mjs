import {
  compareMigrationLock,
  readLocalMigrations,
  readMigrationLock,
  verifyRemoteMigrationState
} from "./lib/supabase-migration-state.mjs";

const root = process.cwd();
const local = await readLocalMigrations(root);
const locked = await readMigrationLock(root);
const lockProblems = compareMigrationLock(local, locked);
if (lockProblems.length > 0) throw new Error(lockProblems.join(" "));

if (process.argv.includes("--remote")) {
  if (process.env.APP_ENV !== "staging") throw new Error("Remote migration verification requires APP_ENV=staging.");
  const result = await verifyRemoteMigrationState({
    databaseUrl: requiredEnv("DATABASE_URL"),
    productionProjectRef: process.env.PRODUCTION_SUPABASE_PROJECT_REF,
    projectRef: requiredEnv("STAGING_SUPABASE_PROJECT_REF"),
    root
  });
  console.log(`Supabase staging migration history and ${result.sentinelCount} schema sentinels match ${result.migrationCount} locked migrations.`);
} else {
  console.log(`${local.length} Supabase migration files match the locked checksums and ordering.`);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
