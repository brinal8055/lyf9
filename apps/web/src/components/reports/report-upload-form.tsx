"use client";

import { ChangeEvent, useState } from "react";
import { AlertCircle, CheckCircle2, Upload } from "lucide-react";

import {
  ENTRY_FLOW_DISCLAIMER,
  SUPPORTED_REPORT_TYPES,
  UNSUPPORTED_REPORT_FALLBACK
} from "@lyf9/shared";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ALLOWED_REPORT_MIME_TYPES,
  getMaxReportFileSizeBytes
} from "@/lib/reports/validation";

type UploadState = "idle" | "hashing" | "initializing" | "uploading" | "done" | "error";

export function ReportUploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<UploadState>("idle");

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError("");
    setStatus("idle");
    setSelectedFile(file);

    if (!file) {
      return;
    }

    const validationError = validateBrowserFile(file);
    if (validationError) {
      setError(validationError);
    }
  }

  async function upload() {
    if (!selectedFile) {
      setError("Choose a report file.");
      return;
    }

    const validationError = validateBrowserFile(selectedFile);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setStatus("hashing");
      const checksumSha256 = await sha256(selectedFile);
      setStatus("initializing");
      const initResponse = await fetch("/api/reports/upload-init", {
        body: JSON.stringify({
          checksumSha256,
          fileSizeBytes: selectedFile.size,
          mimeType: selectedFile.type,
          originalFilename: selectedFile.name
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });

      if (!initResponse.ok) {
        const body = await initResponse.json();
        throw new Error(body.error ?? "Upload could not start.");
      }

      const initBody = (await initResponse.json()) as {
        requiredHeaders?: Record<string, string>;
        requiresUploadComplete?: boolean;
        uploadCompleteUrl?: string;
        uploadUrl: string;
      };
      setStatus("uploading");
      const uploadResponse = await fetch(initBody.uploadUrl, {
        body: selectedFile,
        headers: {
          "Content-Type": selectedFile.type,
          ...(initBody.requiredHeaders ?? {})
        },
        method: "PUT"
      });

      if (!uploadResponse.ok) {
        throw new Error("Private upload failed.");
      }

      if (initBody.requiresUploadComplete && initBody.uploadCompleteUrl) {
        const completeResponse = await fetch(initBody.uploadCompleteUrl, { method: "POST" });
        if (!completeResponse.ok) {
          throw new Error("Private upload could not be finalized.");
        }
      }

      setStatus("done");
      setSelectedFile(null);
      onUploaded();
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload lab report</CardTitle>
        <CardContent>
          PDF, JPG, and PNG files are stored privately and processed only after
          consent. Processing starts after malware scan passes.
        </CardContent>
      </CardHeader>
      <div className="grid gap-5">
        <label className="grid gap-2 text-sm text-muted">
          Report file
          <Input
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            onChange={onFileChange}
            type="file"
          />
        </label>
        {selectedFile ? (
          <div className="rounded-ui border border-white/10 bg-white/[0.04] p-4 text-sm text-muted">
            <p className="font-medium text-ivory">{selectedFile.name}</p>
            <p>{selectedFile.type || "Unknown MIME type"}</p>
            <p>{Math.round(selectedFile.size / 1024)} KB</p>
          </div>
        ) : null}
        <Alert>
          <AlertCircle className="mr-2 inline size-4" aria-hidden />
          {ENTRY_FLOW_DISCLAIMER}
        </Alert>
        <Alert className="border-yellow/30 bg-yellow/10">
          Unsupported report warning: {UNSUPPORTED_REPORT_FALLBACK}
        </Alert>
        {error ? <Alert className="border-danger/30 bg-danger/10">{error}</Alert> : null}
        {status === "done" ? (
          <Alert className="border-green/30 bg-green/10">
            <CheckCircle2 className="mr-2 inline size-4" aria-hidden />
            Report uploaded privately. Scan pending.
          </Alert>
        ) : null}
        <Button disabled={status === "hashing" || status === "initializing" || status === "uploading"} onClick={upload}>
          <Upload className="mr-2 size-4" aria-hidden />
          {status === "hashing"
            ? "Hashing"
            : status === "initializing"
              ? "Preparing"
              : status === "uploading"
                ? "Uploading"
                : "Upload report"}
        </Button>
      </div>
      <div className="mt-6">
        <p className="text-sm font-medium text-ivory">Supported report types</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUPPORTED_REPORT_TYPES.map((type) => (
            <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted" key={type}>
              {type}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

function validateBrowserFile(file: File) {
  if (!ALLOWED_REPORT_MIME_TYPES.includes(file.type as typeof ALLOWED_REPORT_MIME_TYPES[number])) {
    return "Upload a PDF, JPG, JPEG, or PNG lab report.";
  }

  if (file.size <= 0 || file.size > getMaxReportFileSizeBytes()) {
    return `File must be between 1 byte and ${Math.floor(getMaxReportFileSizeBytes() / (1024 * 1024))} MB.`;
  }

  return "";
}

async function sha256(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
