from dataclasses import dataclass
from typing import Any, Optional, Protocol


@dataclass(frozen=True)
class ExtractedDocument:
    report_file_id: str
    extraction_version: int
    parser_name: str
    parser_version: str
    page_count: Optional[int]
    extracted_text: Optional[str]
    extracted_tables_json: list[Any]
    page_metadata_json: dict[str, Any]
    confidence_score: Optional[float]
    status: str
    error_message: Optional[str]


class DocumentParserProvider(Protocol):
    def parse_document(self, report_file_id: str, storage_key: str) -> ExtractedDocument:
        ...


class OcrProvider(Protocol):
    def extract_text_from_image_or_scan(self, report_file_id: str, storage_key: str) -> ExtractedDocument:
        ...
