import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  compareMigrationLock,
  readLocalMigrations,
  readMigrationLock
} from "./lib/supabase-migration-state.mjs";

if (process.env.APP_ENV !== "staging") {
  throw new Error("History repair SQL can be generated only with APP_ENV=staging.");
}
const projectRef = process.env.STAGING_SUPABASE_PROJECT_REF?.trim();
if (!projectRef) throw new Error("STAGING_SUPABASE_PROJECT_REF is required.");
if (projectRef === process.env.PRODUCTION_SUPABASE_PROJECT_REF?.trim()) {
  throw new Error("Staging and production Supabase project references must differ.");
}

const root = process.cwd();
const migrations = await readLocalMigrations(root);
const lockProblems = compareMigrationLock(migrations, await readMigrationLock(root));
if (lockProblems.length > 0) throw new Error(lockProblems.join(" "));
const sentinelQuery = (await readFile(
  path.join(root, "supabase", "verification", "staging_migration_sentinels.sql"),
  "utf8"
)).trim().replace(/;$/, "");

const values = migrations.map((migration, index) => {
  const delimiter = `$lyf9_migration_${index}$`;
  return `  ('${migration.version}', '${migration.name}', array[${delimiter}${migration.sql}${delimiter}]::text[])`;
}).join(",\n");
const expectedValues = migrations
  .map((migration) => `  ('${migration.version}', '${migration.name}')`)
  .join(",\n");

process.stdout.write(`-- Generated for staging project ${projectRef}. Review the dashboard project ref before running.
begin;

create temporary table _lyf9_expected_migrations (
  version text primary key,
  name text not null
) on commit drop;

insert into _lyf9_expected_migrations (version, name)
values
${expectedValues};

create temporary table _lyf9_migration_sentinels on commit drop as
${sentinelQuery};

do $$
begin
  if exists (select 1 from _lyf9_migration_sentinels where not schema_present) then
    raise exception 'Refusing migration-history repair: one or more schema sentinels are missing';
  end if;
end $$;

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);

insert into supabase_migrations.schema_migrations (version, name, statements)
values
${values}
on conflict (version) do nothing;

do $$
begin
  if (select count(*) from supabase_migrations.schema_migrations) <> ${migrations.length} then
    raise exception 'Refusing migration-history repair: unexpected remote migration count';
  end if;
  if exists (
    select 1
    from _lyf9_expected_migrations expected
    full join supabase_migrations.schema_migrations remote using (version)
    where expected.version is null
      or remote.version is null
      or expected.name is distinct from remote.name
      or remote.statements is null
      or cardinality(remote.statements) = 0
  ) then
    raise exception 'Refusing migration-history repair: unexpected or incomplete migration row';
  end if;
end $$;

commit;

select version, name, cardinality(statements) as statement_count
from supabase_migrations.schema_migrations
order by version;
`);
