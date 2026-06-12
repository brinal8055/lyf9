"use client";

import { FormEvent, useState } from "react";
import { MessageSquareText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export function DashboardFeedback() {
  const [status, setStatus] = useState("");

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/feedback", {
      body: JSON.stringify({
        confusingText: form.get("confusingText") || null,
        feedbackSurface: "dashboard",
        freeText: form.get("freeText") || null,
        helpful: form.get("helpful"),
        reportFileId: null,
        wouldTrustDoctorReview: form.get("wouldTrustDoctorReview")
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    setStatus(response.ok ? "Thanks. Feedback saved." : "Feedback could not be saved.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Beta feedback</CardTitle>
        <CardContent>Share what feels useful, confusing, or missing in the private beta.</CardContent>
      </CardHeader>
      <form className="grid gap-3" onSubmit={submitFeedback}>
        <label className="grid gap-2 text-sm text-muted">
          Is Lyf9 AI useful so far?
          <Select name="helpful" required>
            <option value="yes">Yes</option>
            <option value="unsure">Unsure</option>
            <option value="no">No</option>
          </Select>
        </label>
        <label className="grid gap-2 text-sm text-muted">
          Would you trust doctor review?
          <Select name="wouldTrustDoctorReview" required>
            <option value="yes">Yes</option>
            <option value="unsure">Unsure</option>
            <option value="no">No</option>
          </Select>
        </label>
        <Textarea name="confusingText" placeholder="What was confusing?" />
        <Textarea name="freeText" placeholder="Optional feedback" />
        <Button type="submit">
          <MessageSquareText className="mr-2 size-4" aria-hidden />
          Send feedback
        </Button>
        {status ? <p className="text-sm text-muted">{status}</p> : null}
      </form>
    </Card>
  );
}
