import { isLocalLikeExtractionEnv, type ParseDocumentParams } from "./document-parser-provider";
import type { OcrProvider } from "./ocr-provider";

export class TextractOcrProvider implements OcrProvider {
  name = "textract";

  async extractText(_params: ParseDocumentParams) {
    void _params;
    const region = process.env.AWS_TEXTRACT_REGION?.trim();

    if (!region) {
      return {
        errorCode: "ocr_configuration_required",
        errorMessage: isLocalLikeExtractionEnv()
          ? "Textract is not configured. Use OCR_PROVIDER=mock for local fixtures."
          : "Textract OCR is not configured.",
        parserVersion: "textract_unconfigured",
        provider: this.name,
        status: "failed" as const
      };
    }

    return {
      errorCode: "textract_runner_not_wired",
      errorMessage: "Textract execution is a staging integration step.",
      parserVersion: "textract_contract_v1",
      provider: this.name,
      status: "failed" as const
    };
  }
}
