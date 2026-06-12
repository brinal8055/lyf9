# Internal Agent Architecture

## Principle

Do not build autonomous medical agents. Build controlled workflow services with typed inputs, typed outputs, validation, and review gates.

## Internal Workflow Components

1. Report Intake Agent
   - Validates metadata, consent, file type, file size, and beta access.
2. Document Extraction Agent
   - Runs Marker/OCR providers and outputs extracted text/tables.
3. Biomarker Extraction Agent
   - Converts extracted document into structured biomarker JSON.
4. Biomarker Normalization Agent
   - Maps aliases to canonical biomarkers while preserving originals.
5. Safety Review Agent
   - Applies unsafe-language filters and critical routing. It does not replace deterministic rules.
6. Patient Explanation Agent
   - Produces safe patient-facing explanation.
7. Doctor Summary Agent
   - Produces doctor-facing review summary.
8. Quality Eval Agent
   - Runs fixture/golden dataset checks.
9. Support Triage Agent
   - Summarizes failed reports and feedback for admins.

## Rules

- Every output must validate against a schema.
- Every medical-facing output must pass safety checks.
- No component can publish high-risk output directly.
- Critical and low-confidence cases require manual/doctor review.
- Agents are internal implementation details, not public doctors.

## Beta Implementation

Use typed Python services/functions behind provider interfaces. Add OpenAI Agents SDK only later if it reduces complexity and stays behind an `AgentRunner` abstraction.
