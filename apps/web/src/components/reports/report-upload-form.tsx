"use client";

import { ChangeEvent, DragEvent, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Upload, X } from "lucide-react";

import {
  ENTRY_FLOW_DISCLAIMER,
  SUPPORTED_REPORT_TYPES,
  UNSUPPORTED_REPORT_FALLBACK
} from "@lyf9/shared";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ALLOWED_REPORT_MIME_TYPES,
  getMaxReportFileSizeBytes
} from "@/lib/reports/validation";

type UploadState = "idle" | "hashing" | "initializing" | "uploading" | "done" | "error";

const stageProgress: Record<UploadState, number> = {
  idle: 0,
  hashing: 20,
  initializing: 45,
  uploading: 75,
  done: 100,
  error: 0
};

const stageLabels: Record<UploadState, string> = {
  idle: "",
  hashing: "Verifying file integrity...",
  initializing: "Preparing secure upload...",
  uploading: "Uploading to private storage...",
  done: "Upload complete!",
  error: ""
};

export function ReportUploadForm({ onUploaded }: { onUploaded: () => void }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<UploadState>("idle");
  const [isDragging, setIsDragging] = useState(false);

  function handleFile(file: File | null) {
    setError("");
    setStatus("idle");
    setSelectedFile(file);
    if (file) {
      const err = validateBrowserFile(file);
      if (err) setError(err);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    handleFile(event.target.files?.[0] ?? null);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    handleFile(file);
  }

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave() {
    setIsDragging(false);
  }

  async function upload() {
    if (!selectedFile) {
      setError("Choose a report file first.");
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
        headers: { "Content-Type": "application/json" },
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

      if (!uploadResponse.ok) throw new Error("Private upload failed.");

      if (initBody.requiresUploadComplete && initBody.uploadCompleteUrl) {
        const completeResponse = await fetch(initBody.uploadCompleteUrl, { method: "POST" });
        if (!completeResponse.ok) throw new Error("Private upload could not be finalized.");
      }

      setStatus("done");
      setSelectedFile(null);
      onUploaded();
    } catch (caught) {
      setStatus("error");
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    }
  }

  const isUploading = status === "hashing" || status === "initializing" || status === "uploading";
  const progress = stageProgress[status];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload lab report</CardTitle>
        <CardContent>
          Files are stored privately and processed only after consent. Processing starts after a
          malware scan passes.
        </CardContent>
      </CardHeader>
      <div className="grid gap-5">
        {/* Drop zone */}
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-card border-2 border-dashed p-12 text-center transition-all duration-200",
            isDragging
              ? "border-orange/60 bg-orange/[0.06]"
              : "border-white/20 bg-white/[0.02] hover:border-orange/40 hover:bg-orange/[0.03]"
          )}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <div
            className={cn(
              "flex size-14 items-center justify-center rounded-full border border-white/10 transition-colors",
              isDragging ? "bg-orange/20 border-orange/40" : "bg-white/[0.05]"
            )}
          >
            <Upload className={cn("size-6 transition-colors", isDragging ? "text-orange" : "text-muted")} aria-hidden />
          </div>
          <div>
            <p className="font-medium text-ivory">
              {isDragging ? "Drop your report here" : "Drop your lab report here"}
            </p>
            <p className="mt-1 text-sm text-muted">
              PDF, JPG, or PNG · Max {Math.floor(getMaxReportFileSizeBytes() / (1024 * 1024))} MB ·{" "}
              <span className="text-orange">browse to upload</span>
            </p>
          </div>
          <input
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            className="sr-only"
            onChange={onFileChange}
            type="file"
          />
        </label>

        {/* Selected file preview */}
        {selectedFile && (
          <div className="flex items-center justify-between gap-3 rounded-ui border border-white/10 bg-white/[0.04] p-4">
            <div className="flex items-center gap-3">
              <FileText className="size-5 flex-shrink-0 text-orange" aria-hidden />
              <div>
                <p className="text-sm font-medium text-ivory">{selectedFile.name}</p>
                <p className="text-xs text-muted">
                  {selectedFile.type || "Unknown type"} · {Math.round(selectedFile.size / 1024)} KB
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleFile(null)}
              className="rounded-full p-1 text-dim hover:bg-white/10 hover:text-ivory"
              aria-label="Remove file"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}

        {/* Upload progress bar */}
        {isUploading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">{stageLabels[status]}</span>
              <span className="text-orange">{progress}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-orange transition-all duration-700 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <Alert variant="info">
          <AlertCircle className="mr-2 inline size-4" aria-hidden />
          {ENTRY_FLOW_DISCLAIMER}
        </Alert>

        {/* Error */}
        {error ? <Alert variant="error">{error}</Alert> : null}

        {/* Success */}
        {status === "done" ? (
          <Alert variant="success">
            <CheckCircle2 className="mr-2 inline size-4" aria-hidden />
            Report uploaded privately. Security scan is pending.
          </Alert>
        ) : null}

        <Button isLoading={isUploading} onClick={upload}>
          <Upload className="mr-2 size-4" aria-hidden />
          {isUploading ? stageLabels[status].replace("...", "") : "Upload report"}
        </Button>
      </div>

      <div className="mt-6">
        <p className="text-sm font-medium text-ivory">Supported report types</p>
        <p className="mt-1 text-xs text-muted">{UNSUPPORTED_REPORT_FALLBACK}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUPPORTED_REPORT_TYPES.map((type) => (
            <span
              className="rounded-full border border-white/10 px-3 py-1 text-xs text-muted"
              key={type}
            >
              {type}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

function validateBrowserFile(file: File) {
  if (!ALLOWED_REPORT_MIME_TYPES.includes(file.type as (typeof ALLOWED_REPORT_MIME_TYPES)[number])) {
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


