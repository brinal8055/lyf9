# Brand Cleanup Audit

## Verdict

Brand cleanup verdict: **Clean after this audit pass**.

Old-name violations remaining: **0**  
Highest remaining severity: **None**

## Search Scope

Scanned:

- `apps`
- `docs`
- `infra`
- `packages`
- `scripts`
- `supabase`
- `README.md`
- `package.json`

Excluded generated dependencies:

- `node_modules`
- `apps/web/node_modules`
- `package-lock.json`

## Pre-Cleanup Findings

The audit found 4 brand/copy cleanup issues and fixed them immediately because they were small, non-risky, and required for a clean review.

| Severity | File | Context | Action |
| --- | --- | --- | --- |
| P1 | `packages/shared/src/index.ts` | Shared constant exposed a retired product-name value. | Replaced with `PRODUCT_SHORT_NAME = "Lyf9"`. |
| P1 | `docs/00_PRODUCT_CONTEXT.md` | Product identity referenced a retired hidden product name. | Replaced with current rule: no separate hidden product name. |
| P2 | `docs/01_BRAND_AND_DESIGN_DNA.md` | Capitalized section heading could read as a product name. | Renamed to “Hero Biomarker Graph”. |
| P2 | `package.json` | Copy scan embedded blocked terms literally. | Moved scan to `scripts/copy-scan.mjs` and built patterns from pieces. |

## Current Checks

| Check | Result |
| --- | --- |
| Retired-name scan | Pass |
| Unsafe public-copy scan | Pass |
| `npm run copy:scan` | Pass |

## Remaining Recommendation

Keep `npm run copy:scan` in CI once CI exists. Do not recreate `docs/07_CODEX_PHASE_PROMPTS.md`.
