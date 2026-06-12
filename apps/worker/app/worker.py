import argparse
import os

PHASE3B_STATES = [
    "uploaded",
    "malware_scan",
    "scan_pending",
    "scan_passed",
    "scan_failed",
    "scan_configuration_required",
    "classified",
    "text_extraction_pending",
    "text_extracted",
    "ocr_required",
    "ocr_completed",
    "unsupported",
    "extraction_failed",
    "biomarker_extraction_pending",
    "biomarker_extracted",
    "normalized",
    "validated",
    "validation_failed",
    "low_confidence_review_required",
    "critical_review_required",
    "insight_generation_pending",
    "insight_generated",
    "doctor_review_required",
    "doctor_reviewed",
    "published",
    "failed",
    "archived",
    "deleted",
]


def health() -> dict[str, object]:
    return {
        "status": "ok",
        "service": "worker",
        "checks": {
            "database_configured": bool(os.getenv("DATABASE_URL")),
            "redis_configured": bool(os.getenv("REDIS_URL")),
            "storage_configured": bool(
                os.getenv("S3_REPORT_BUCKET") or os.getenv("STORAGE_PROVIDER") in ("local", "mock")
            ),
            "malware_scanner_configured": bool(
                os.getenv("MALWARE_SCANNER_PROVIDER") not in (None, "", "mock")
                or os.getenv("APP_ENV", "development") in ("local", "development", "test")
            ),
            "supabase_url_configured": bool(os.getenv("SUPABASE_URL")),
            "supabase_service_role_configured": bool(os.getenv("SUPABASE_SERVICE_ROLE_KEY")),
            "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
            "processing_version": os.getenv("PROCESSING_VERSION", "v1"),
            "queue_name": os.getenv("QUEUE_NAME", "report-processing"),
            "document_parser_provider": os.getenv("DOCUMENT_PARSER_PROVIDER", "mock"),
            "marker_configured": bool(os.getenv("MARKER_COMMAND") or os.getenv("MARKER_API_URL")),
            "ocr_provider": os.getenv("OCR_PROVIDER", "mock"),
            "textract_region_configured": bool(os.getenv("AWS_TEXTRACT_REGION")),
            "worker_lease_seconds": int(os.getenv("WORKER_LEASE_SECONDS", "300")),
            "worker_max_attempts": int(os.getenv("WORKER_MAX_ATTEMPTS", "3")),
            "workflow_provider": os.getenv("WORKFLOW_PROVIDER", "database"),
        },
    }


def process_once() -> dict[str, object]:
    return {
        "status": "ok",
        "service": "worker",
        "mode": "phase3b_schema_first_ai_stub",
        "workflow_provider": os.getenv("WORKFLOW_PROVIDER", "database"),
        "first_step": "malware_scan",
        "lease_seconds": int(os.getenv("WORKER_LEASE_SECONDS", "300")),
        "scan_gate": "scan_pending, scan_failed, and scan_configuration_required do not advance to extraction",
        "document_steps": ["extract_document", "ocr_fallback", "classify_report"],
        "ai_steps": [
            "extract_biomarkers",
            "normalize_biomarkers",
            "validate_biomarkers",
            "run_safety_rules",
            "generate_patient_explanation",
            "route_review",
        ],
        "parser_interface": "Marker-compatible parser contract and Textract OCR contract are ready for staging wiring.",
        "simulated_states": PHASE3B_STATES,
        "ai_interpretation": "schema_first_provider_required",
        "ai_explanation": "schema_valid_safe_output_only",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Lyf9 AI worker")
    parser.add_argument("command", choices=["health", "process-once"])
    args = parser.parse_args()

    if args.command == "health":
        print(health())
    if args.command == "process-once":
        print(process_once())


if __name__ == "__main__":
    main()
