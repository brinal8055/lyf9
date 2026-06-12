import { spawnSync } from "node:child_process";

const blocked = [
  ["N", "idar"].join(""),
  ["n", "idar"].join(""),
  ["NID", "AR"].join(""),
  ["N", "idar", " Health ", "Graph"].join(""),
  ["Need", "er"].join(""),
  ["need", "er"].join(""),
  ["Need", "ar"].join(""),
  ["need", "ar"].join(""),
  ["inf", "y9"].join(""),
  ["Inf", "y9"].join(""),
  ["inf", "y9", ".ai"].join(""),
  ["Med", "Vi"].join(""),
  ["AI", "diagnosis"].join(" "),
  ["AI", "prescription"].join(" "),
  ["no", "doctor", "needed"].join(" "),
  ["AI", "doctor"].join(" "),
  ["Cure", "your"].join(" "),
  ["Guaranteed", "results"].join(" ")
];

const paths = [
  "apps",
  "docs",
  "infra",
  "packages",
  "scripts",
  "supabase",
  "README.md",
  "package.json"
];

const result = spawnSync(
  "rg",
  [
    "-n",
    blocked.map(escapeRegex).join("|"),
    ...paths,
    "--glob",
    "!**/node_modules/**",
    "--glob",
    "!package-lock.json"
  ],
  { encoding: "utf8" }
);

if (result.status === 0) {
  process.stdout.write(result.stdout);
  process.exit(1);
}

if (result.status === 1) {
  process.exit(0);
}

process.stderr.write(result.stderr);
process.exit(result.status ?? 1);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
