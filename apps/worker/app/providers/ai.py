from dataclasses import dataclass
import os
from typing import Any, Optional, Protocol


@dataclass(frozen=True)
class AiProviderConfig:
    provider: str
    extraction_model: Optional[str]
    explanation_model: Optional[str]
    doctor_summary_model: Optional[str]
    configured: bool


def ai_provider_config() -> AiProviderConfig:
    provider = os.getenv("AI_PROVIDER", "mock").strip().lower()
    supported = provider in ("gemini", "mock", "openai")
    local_like = os.getenv("APP_ENV", "development").lower() in ("local", "development", "test")
    prefix = provider.upper()
    extraction_model = os.getenv(f"{prefix}_MODEL_EXTRACTION")
    explanation_model = os.getenv(f"{prefix}_MODEL_EXPLANATION")
    doctor_summary_model = os.getenv(f"{prefix}_MODEL_DOCTOR_SUMMARY")
    configured = supported and (
        local_like
        if provider == "mock"
        else bool(os.getenv(f"{prefix}_API_KEY") and extraction_model and explanation_model)
    )
    return AiProviderConfig(
        configured=configured,
        doctor_summary_model=doctor_summary_model,
        explanation_model=explanation_model,
        extraction_model=extraction_model,
        provider=provider,
    )


class AiProvider(Protocol):
    def extract_biomarkers(self, extracted_document: dict[str, Any], patient_context: dict[str, Any]) -> dict[str, Any]:
        ...

    def generate_patient_explanation(self, biomarkers: list[dict[str, Any]], patient_context: dict[str, Any]) -> dict[str, Any]:
        ...

    def generate_doctor_summary(
        self,
        biomarkers: list[dict[str, Any]],
        patient_context: dict[str, Any],
        insight: dict[str, Any],
    ) -> dict[str, Any]:
        ...

    def run_safety_check(self, output: dict[str, Any]) -> dict[str, Any]:
        ...
