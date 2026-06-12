from dataclasses import dataclass
from typing import Any, Optional, Protocol


@dataclass(frozen=True)
class AiProviderConfig:
    provider: str
    extraction_model: Optional[str]
    explanation_model: Optional[str]
    doctor_summary_model: Optional[str]
    openai_configured: bool


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
