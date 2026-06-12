import { isLocalLikeExtractionEnv, type DocumentParserProvider, type ParseDocumentParams } from "./document-parser-provider";

export class MarkerProvider implements DocumentParserProvider {
  name = "marker";

  async parseDocument(_params: ParseDocumentParams) {
    void _params;
    const command = process.env.MARKER_COMMAND?.trim();
    const apiUrl = process.env.MARKER_API_URL?.trim();

    if (!command && !apiUrl) {
      return {
        errorCode: "marker_configuration_required",
        errorMessage: isLocalLikeExtractionEnv()
          ? "Marker is not configured. Use DOCUMENT_PARSER_PROVIDER=mock for local fixtures."
          : "Marker parser is not configured.",
        parserVersion: "marker_unconfigured",
        provider: this.name,
        status: "failed" as const
      };
    }

    return {
      errorCode: "marker_runner_not_wired",
      errorMessage: "Marker command/API execution is a staging integration step.",
      parserVersion: "marker_contract_v1",
      provider: this.name,
      status: "failed" as const
    };
  }
}
