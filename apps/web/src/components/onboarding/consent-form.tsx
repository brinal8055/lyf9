"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { CONSENT_VERSION, ENTRY_FLOW_DISCLAIMER } from "@lyf9/shared";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CONSENT_PURPOSES,
  hasRequiredConsent
} from "@/lib/onboarding/consent";
import {
  latestConsentChoices,
  loadConsentRecords,
  saveConsentRecords
} from "@/lib/onboarding/storage";
import type { ConsentChoices, ConsentRecord } from "@/lib/onboarding/types";

const defaultChoices: ConsentChoices = {
  ai_analysis: false,
  doctor_review: false,
  lab_report_processing: false,
  marketing_communication: false,
  reminders_notifications: false
};

const consentRows: Array<{
  key: keyof ConsentChoices;
  label: string;
  required: boolean;
}> = [
  {
    key: "lab_report_processing",
    label: "Lab report processing",
    required: true
  },
  {
    key: "ai_analysis",
    label: "AI analysis",
    required: true
  },
  {
    key: "doctor_review",
    label: "Doctor review",
    required: false
  },
  {
    key: "reminders_notifications",
    label: "Reminders",
    required: false
  },
  {
    key: "marketing_communication",
    label: "Marketing",
    required: false
  }
];

export function ConsentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const [choices, setChoices] = useState<ConsentChoices>(defaultChoices);
  const [records, setRecords] = useState<ConsentRecord[]>([]);
  const [saved, setSaved] = useState(false);
  const requiredGranted = hasRequiredConsent(choices);

  useEffect(() => {
    const savedRecords = loadConsentRecords();
    setRecords(savedRecords);
    setChoices({ ...defaultChoices, ...latestConsentChoices(savedRecords) });
  }, []);

  function update(key: keyof ConsentChoices, granted: boolean) {
    setSaved(false);
    setChoices((current) => ({ ...current, [key]: granted }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const response = await fetch("/api/consent", {
      body: JSON.stringify(choices),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    if (!response.ok) {
      return;
    }

    const body = (await response.json()) as {
      persisted: boolean;
      records: ConsentRecord[];
      requiredGranted: boolean;
    };

    if (!body.persisted) {
      saveConsentRecords(body.records);
    }
    setRecords(body.records);
    setSaved(true);

    if (body.requiredGranted && next) {
      router.push(next);
      router.refresh();
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.75fr]">
      <Card>
        <CardHeader>
          <CardTitle>Purpose-wise consent</CardTitle>
          <CardContent>
            Required consent gates report upload. Optional consent can be
            granted or revoked any time during onboarding.
          </CardContent>
        </CardHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          {consentRows.map((row) => (
            <label
              className="flex gap-4 rounded-ui border border-white/10 bg-white/[0.04] p-4"
              key={row.key}
            >
              <Checkbox
                checked={choices[row.key]}
                onChange={(event) => update(row.key, event.target.checked)}
              />
              <span>
                <span className="block font-medium text-ivory">
                  {row.label}{" "}
                  <span className={row.required ? "text-orange" : "text-muted"}>
                    {row.required ? "Required" : "Optional"}
                  </span>
                </span>
                <span className="mt-1 block text-sm leading-6 text-muted">
                  {CONSENT_PURPOSES[row.key]}
                </span>
              </span>
            </label>
          ))}
          {!requiredGranted ? (
            <Alert>
              Lab report processing and AI analysis consent are required before
              the upload route opens.
            </Alert>
          ) : null}
          {saved ? <Alert>Consent saved. Version: {CONSENT_VERSION}.</Alert> : null}
          <Button type="submit">Save consent choices</Button>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Safety note</CardTitle>
          <CardContent>{ENTRY_FLOW_DISCLAIMER}</CardContent>
        </CardHeader>
        <div className="space-y-3 text-sm text-muted">
          <p>Consent records include version, timestamp, grant/revoke state, and request metadata when available.</p>
          <p>Saved records in this Phase 1 scaffold: {records.length}</p>
        </div>
      </Card>
    </div>
  );
}
