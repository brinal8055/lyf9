import Link from "next/link";

// ── Constants ─────────────────────────────────────────────────────────────────

const REPORT_MARQUEE = [
  "CBC", "Lipid profile", "Thyroid profile", "Liver function (LFT)",
  "Kidney function (KFT)", "HbA1c / Glucose", "Vitamin D", "Vitamin B12",
  "Ferritin", "Iron studies", "Full-body checkup",
];

const FAQS = [
  {
    q: "Is Lyf9 AI a doctor?",
    a: "No. Lyf9 AI provides AI-assisted report explanations, not diagnosis or prescription. Doctor review is required for medical decisions.",
  },
  {
    q: "Which reports are supported first?",
    a: "The private beta starts with common blood reports such as CBC, lipid, thyroid, liver, kidney, glucose, HbA1c, Vitamin D, B12 and ferritin.",
  },
  {
    q: "Can unsupported reports be interpreted?",
    a: "No. Unsupported report types are blocked from automated interpretation and should be reviewed by a qualified doctor.",
  },
  {
    q: "What happens in Phase 1 of the beta?",
    a: "Phase 1 captures your profile, questionnaire and consent so report upload, AI extraction and doctor review can begin safely in Phase 2.",
  },
];

// ── Phone mockup (Hero A) ─────────────────────────────────────────────────────

function PhoneMockup() {
  return (
    <div className="relative flex justify-center">
      <div
        className="relative w-[312px] animate-floaty rounded-[34px] bg-white p-3.5"
        style={{ boxShadow: "0 40px 80px -30px rgba(12,51,44,.5), 0 0 0 1px rgba(12,51,44,.05)" }}
      >
        <div className="overflow-hidden rounded-3xl" style={{ background: "#0C332C" }}>
          {/* Scanning line */}
          <div
            className="absolute left-0 right-0 z-[3] h-0.5"
            style={{
              background: "linear-gradient(90deg,transparent,#7FD8B4,transparent)",
              animation: "scan 3.6s ease-in-out infinite",
            }}
          />
          <div className="flex items-center justify-between px-[18px] pb-2.5 pt-4 text-xs font-semibold" style={{ color: "#9FB8AF" }}>
            <span>Blood report · Apr 2026</span>
            <span style={{ color: "#7FD8B4" }}>Reviewed</span>
          </div>
          {/* Biomarker card */}
          <div className="mx-3.5 mb-3.5 rounded-[16px] p-4" style={{ background: "#F4EEE2" }}>
            <div className="mb-2.5 text-[11px] font-bold uppercase tracking-widest" style={{ color: "#9A8A6F" }}>
              Flagged biomarker
            </div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-lg font-extrabold" style={{ color: "#0E3B33" }}>Vitamin D</span>
              <span className="rounded-full px-2.5 py-1 text-[11.5px] font-extrabold text-white" style={{ background: "#D9774B" }}>LOW</span>
            </div>
            <div className="text-[30px] font-extrabold leading-none tracking-tight" style={{ color: "#0E3B33" }}>
              18 <span className="text-[15px] font-semibold" style={{ color: "#7E8C84" }}>ng/mL</span>
            </div>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[11.5px] font-semibold" style={{ color: "#15695B", background: "#DCEBE3" }}>
              🔗 Source value · page 2
            </div>
          </div>
          {/* Explanation cards */}
          <div className="mx-3.5 mb-3.5 grid gap-2">
            <div className="rounded-xl p-3 text-xs leading-relaxed" style={{ background: "#16403A", color: "#CFE3DA" }}>
              <strong style={{ color: "#7FD8B4" }}>What it means:</strong> Below the typical range — common and usually correctable.
            </div>
            <div className="rounded-xl p-3 text-xs leading-relaxed" style={{ background: "#16403A", color: "#CFE3DA" }}>
              <strong style={{ color: "#E8B07A" }}>Ask your doctor:</strong> About supplementation and a retest in ~8 weeks.
            </div>
          </div>
          {/* Action buttons */}
          <div className="flex gap-2 px-3.5 pb-4">
            <div className="flex-1 rounded-xl py-2.5 text-center text-xs font-bold" style={{ background: "#E8915B", color: "#0C332C" }}>
              Plan retest
            </div>
            <div className="flex-1 rounded-xl py-2.5 text-center text-xs font-semibold" style={{ color: "#CFE3DA", border: "1px solid rgba(207,227,218,.25)" }}>
              Full report
            </div>
          </div>
        </div>
      </div>
      {/* Floating chip: HbA1c */}
      <div
        className="absolute -left-6 top-[18px] flex items-center gap-2 rounded-[14px] bg-white px-3 py-2.5"
        style={{ boxShadow: "0 18px 36px -16px rgba(12,51,44,.4)", animation: "floaty2 6s ease-in-out infinite 0.4s" }}
      >
        <span className="size-2 rounded-full" style={{ background: "#D8A33C" }} />
        <span className="text-[13px] font-bold" style={{ color: "#0E3B33" }}>HbA1c</span>
        <span className="text-xs font-semibold" style={{ color: "#7E8C84" }}>Monitor</span>
      </div>
      {/* Floating chip: Thyroid */}
      <div
        className="absolute -right-8 bottom-14 flex items-center gap-2 rounded-[14px] bg-white px-3 py-2.5"
        style={{ boxShadow: "0 18px 36px -16px rgba(12,51,44,.4)", animation: "floaty3 7.5s ease-in-out infinite 0.8s" }}
      >
        <span className="size-2 rounded-full" style={{ background: "#2E9E7B" }} />
        <span className="text-[13px] font-bold" style={{ color: "#0E3B33" }}>Thyroid</span>
        <span className="text-xs font-semibold" style={{ color: "#7E8C84" }}>Normal</span>
      </div>
    </div>
  );
}

// ── Shared CTA row ────────────────────────────────────────────────────────────

function HeroCTAs({ centered = false }: { centered?: boolean }) {
  return (
    <div className={`flex flex-wrap gap-3.5 ${centered ? "justify-center" : ""}`}>
      <Link
        href="/signup"
        className="inline-flex items-center gap-2 rounded-full px-7 py-4 text-[16.5px] font-bold no-underline transition-all hover:-translate-y-0.5"
        style={{ background: "#E8915B", color: "#0C332C", boxShadow: "0 14px 28px -12px rgba(232,145,91,.75)" }}
      >
        Start onboarding →
      </Link>
      <a
        href="#safety"
        className="inline-flex items-center gap-2 rounded-full border px-[26px] py-4 text-[16.5px] font-bold no-underline transition-all hover:bg-black/5"
        style={{ color: "#0E3B33", borderColor: "rgba(14,59,51,.2)" }}
      >
        Read safety promise
      </a>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  return (
    <div className="relative overflow-x-hidden font-hanken" style={{ background: "#F4EEE2", color: "#0E3B33" }}>

      {/* Ambient blobs */}
      <div className="pointer-events-none absolute -right-[140px] -top-[160px] z-0 h-[540px] w-[540px] animate-blob rounded-full"
        style={{ background: "radial-gradient(circle at 30% 30%,rgba(31,132,114,.30),rgba(31,132,114,0) 70%)", filter: "blur(8px)" }} />
      <div className="pointer-events-none absolute -left-[180px] top-[520px] z-0 h-[480px] w-[480px] animate-blob2 rounded-full"
        style={{ background: "radial-gradient(circle at 50% 50%,rgba(232,145,91,.22),rgba(232,145,91,0) 70%)", filter: "blur(8px)" }} />

      {/* ── Announcement bar ── */}
      <div className="relative z-[5] flex items-center justify-center gap-2.5 px-5 py-2.5 text-center text-[13.5px] font-medium"
        style={{ background: "#0C332C", color: "#F4EEE2", letterSpacing: ".01em" }}>
        <span className="animate-pulsedot inline-block size-[7px] rounded-full" style={{ background: "#7FD8B4" }} />
        Private beta now open — early onboarding for Indian preventive-health users
        <Link href="/signup" className="font-bold no-underline" style={{ color: "#E8915B", borderBottom: "1px solid rgba(232,145,91,.4)" }}>
          Join ›
        </Link>
      </div>

      {/* ── Nav ── */}
      <nav className="relative z-[5] mx-auto flex max-w-[1240px] items-center justify-between px-8 py-[22px]">
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <span className="inline-flex size-[34px] items-center justify-center rounded-[10px] text-[17px] font-extrabold" style={{ background: "#0C332C", color: "#7FD8B4" }}>l9</span>
          <span className="text-[21px] font-extrabold" style={{ color: "#0E3B33", letterSpacing: "-.02em" }}>
            lyf9<span style={{ color: "#1F8472" }}>.ai</span>
          </span>
        </Link>
        <div className="hidden items-center gap-[30px] md:flex">
          {[["How it works", "#how"], ["Reports", "#reports"], ["Product", "#preview"], ["Safety", "#safety"], ["FAQ", "#faq"]].map(([label, href]) => (
            <a key={href} href={href} className="text-[15px] font-semibold no-underline" style={{ color: "#3D514A" }}>{label}</a>
          ))}
        </div>
        <Link href="/signup"
          className="inline-flex items-center gap-1.5 rounded-full px-5 py-[11px] text-[15px] font-bold no-underline transition-all hover:-translate-y-0.5"
          style={{ background: "#0C332C", color: "#F4EEE2" }}>
          Join beta →
        </Link>
      </nav>

      {/* ── Hero A: Editorial split ── */}
      <header className="relative z-[2] mx-auto grid max-w-[1240px] grid-cols-1 items-center gap-12 px-8 pb-8 pt-[52px] lg:grid-cols-[1.05fr_.95fr]">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border px-3.5 py-[7px] text-[13px] font-bold tracking-wide"
            style={{ background: "#E5EFE9", borderColor: "#CADED4", color: "#15695B" }}>
            <span className="size-1.5 rounded-full" style={{ background: "#2E9E7B" }} />
            Source-linked report explanations
          </div>
          <h1 className="mb-[22px] font-extrabold leading-[1.02]" style={{ fontSize: "clamp(42px,5.6vw,74px)", letterSpacing: "-.03em", color: "#0E3B33" }}>
            Your body has data.<br />
            We turn it into{" "}
            <em className="font-newsreader font-medium not-italic" style={{ fontStyle: "italic", color: "#E8915B" }}>direction</em>.
          </h1>
          <p className="mb-8 max-w-[520px] leading-[1.62]" style={{ fontSize: "19.5px", color: "#46584F" }}>
            Upload your blood report. Lyf9 AI explains what changed, what needs attention, what to ask your doctor, and when to retest — every claim tied back to your own source values.
          </p>
          <div className="mb-[30px]">
            <HeroCTAs />
          </div>
          <div className="flex flex-wrap items-center gap-[22px]">
            {["Privacy-first", "Consent-led", "Doctor review"].map((t) => (
              <span key={t} className="inline-flex items-center gap-2 text-[14.5px] font-semibold" style={{ color: "#3D514A" }}>
                <span style={{ color: "#1F8472" }}>✓</span>{t}
              </span>
            ))}
          </div>
        </div>
        <PhoneMockup />
      </header>


      {/* ── Trust strip ── */}
      <div className="relative z-[2] mx-auto mt-[30px] max-w-[1240px] px-8">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t pt-[26px]" style={{ borderColor: "rgba(14,59,51,.1)" }}>
          <span className="mr-1.5 text-xs font-bold uppercase tracking-widest" style={{ color: "#7E8C84" }}>Built for</span>
          {["Indian preventive-health users", "Supported panels only", "Medical decisions need doctors"].map((t) => (
            <span key={t} className="rounded-full border bg-white px-4 py-2 text-sm font-semibold" style={{ color: "#3D514A", borderColor: "#EBE2D2" }}>{t}</span>
          ))}
        </div>
      </div>

      {/* ── Stats band ── */}
      <section className="relative z-[2] mx-auto mt-16 max-w-[1240px] px-8">
        <div className="relative overflow-hidden rounded-[28px] px-10 py-12 grid grid-cols-2 gap-7 lg:grid-cols-4"
          style={{ background: "#0C332C" }}>
          <div className="pointer-events-none absolute -right-[60px] -top-[80px] size-[280px] rounded-full"
            style={{ background: "radial-gradient(circle,rgba(127,216,180,.16),transparent 70%)" }} />
          {[
            { val: "13+", label: "Supported lab panels at launch", c: "#7FD8B4" },
            { val: "100%", label: "Explanations linked to your source values", c: "#7FD8B4" },
            { val: "0", label: "Diagnoses made — every medical call stays with your doctor", c: "#E8915B" },
            { val: "8wk", label: "Default retest reminder window", c: "#7FD8B4" },
          ].map(({ val, label, c }) => (
            <div key={val} className="relative">
              <div className="font-extrabold leading-none tracking-tight" style={{ fontSize: "clamp(36px,4vw,52px)", color: c }}>{val}</div>
              <div className="mt-1.5 text-[14.5px] font-medium leading-snug" style={{ color: "#9FB8AF" }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how" className="relative z-[2] mx-auto mt-24 max-w-[1240px] px-8">
        <div className="mb-12 max-w-[720px]">
          <div className="mb-3.5 text-[13px] font-bold uppercase tracking-[.14em]" style={{ color: "#1F8472" }}>How it works</div>
          <h2 className="font-extrabold leading-[1.06]" style={{ fontSize: "clamp(30px,4vw,50px)", letterSpacing: "-.025em", color: "#0E3B33" }}>
            A safer path from report data to{" "}
            <em className="font-newsreader font-medium not-italic" style={{ fontStyle: "italic", color: "#1F8472" }}>useful</em> doctor conversations.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              num: "01", title: "Upload your report",
              desc: "Private PDF, JPG and PNG upload for supported lab reports.",
              preview: (
                <div className="rounded-xl border border-dashed px-3.5 py-3.5 text-center text-xs font-semibold"
                  style={{ background: "#F8F4EB", borderColor: "#CDBF9F", color: "#9A8A6F" }}>
                  ↑ Drop report · PDF / JPG
                </div>
              ),
            },
            {
              num: "02", title: "See what changed",
              desc: "Source-linked biomarkers and trends over time.",
              preview: (
                <div className="flex items-center justify-between rounded-xl px-3.5 py-3" style={{ background: "#F8F4EB" }}>
                  <span className="text-sm font-bold" style={{ color: "#0E3B33" }}>Vitamin D</span>
                  <span className="rounded-full px-2.5 py-0.5 text-[10.5px] font-extrabold text-white" style={{ background: "#D9774B" }}>LOW</span>
                </div>
              ),
            },
            {
              num: "03", title: "Prepare better questions",
              desc: "Organise what to discuss with a qualified doctor — no guesswork.",
              preview: (
                <div className="rounded-xl px-3.5 py-3 text-xs leading-snug" style={{ background: "#F8F4EB", color: "#3D514A" }}>
                  &ldquo;Should I supplement &amp; retest in 8 weeks?&rdquo;
                </div>
              ),
            },
            {
              num: "04", title: "Plan retests",
              desc: "Retest reminders keep follow-up timing visible — without overclaiming.",
              preview: (
                <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-3" style={{ background: "#F8F4EB" }}>
                  <span>📅</span>
                  <span className="text-sm font-bold" style={{ color: "#0E3B33" }}>Retest in 8 weeks</span>
                </div>
              ),
            },
          ].map(({ num, title, desc, preview }) => (
            <div key={num} className="rounded-[20px] border bg-white p-6 transition-all hover:-translate-y-1.5 hover:shadow-[0_24px_44px_-24px_rgba(12,51,44,.35)]"
              style={{ borderColor: "#EBE2D2" }}>
              <div className="mb-[18px] inline-flex size-[42px] items-center justify-center rounded-xl text-sm font-extrabold"
                style={{ background: "#0C332C", color: "#7FD8B4" }}>{num}</div>
              <h3 className="mb-2 text-[19px] font-extrabold" style={{ color: "#0E3B33" }}>{title}</h3>
              <p className="mb-4 text-[14.5px] leading-[1.55]" style={{ color: "#5C6E68" }}>{desc}</p>
              {preview}
            </div>
          ))}
        </div>
      </section>

      {/* ── Supported reports ── */}
      <section id="reports" className="relative z-[2] mt-24">
        <div className="mx-auto max-w-[1240px] px-8">
          <div className="mb-8 max-w-[720px]">
            <div className="mb-3.5 text-[13px] font-bold uppercase tracking-[.14em]" style={{ color: "#1F8472" }}>Supported report types</div>
            <h2 className="font-extrabold leading-[1.06]" style={{ fontSize: "clamp(30px,4vw,50px)", letterSpacing: "-.025em", color: "#0E3B33" }}>
              The beta starts with common{" "}
              <em className="font-newsreader font-medium not-italic" style={{ fontStyle: "italic", color: "#1F8472" }}>structured</em> lab reports.
            </h2>
          </div>
        </div>
        {/* Marquee */}
        <div className="relative overflow-hidden py-2"
          style={{ WebkitMaskImage: "linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)", maskImage: "linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)" }}>
          <div className="flex w-max gap-3.5 animate-marquee-fast">
            {[...REPORT_MARQUEE, ...REPORT_MARQUEE].map((r, i) => (
              <span key={i} className="whitespace-nowrap rounded-full border bg-white px-5 py-3 text-[15px] font-bold" style={{ color: "#0E3B33", borderColor: "#EBE2D2" }}>{r}</span>
            ))}
          </div>
        </div>
        <div className="mx-auto mt-7 grid max-w-[1240px] grid-cols-1 gap-5 px-8 sm:grid-cols-2">
          <div className="flex items-start gap-3.5 rounded-[18px] border p-6" style={{ background: "#E5EFE9", borderColor: "#CADED4" }}>
            <span className="text-[22px]">✅</span>
            <div>
              <div className="mb-1 text-base font-extrabold" style={{ color: "#0E3B33" }}>Full-body checkups with supported panels</div>
              <div className="text-sm leading-relaxed" style={{ color: "#3D514A" }}>Structured panels are parsed and explained against your source values.</div>
            </div>
          </div>
          <div className="flex items-start gap-3.5 rounded-[18px] border p-6" style={{ background: "#FBEFE6", borderColor: "#F0D6C2" }}>
            <span className="text-[22px]">⚠️</span>
            <div>
              <div className="mb-1 text-base font-extrabold" style={{ color: "#0E3B33" }}>Unsupported reports → doctor review</div>
              <div className="text-sm leading-relaxed" style={{ color: "#3D514A" }}>Anything unsupported is blocked from automated interpretation.</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Product preview ── */}
      <section id="preview" className="relative z-[2] mx-auto mt-24 max-w-[1240px] px-8">
        <div className="relative overflow-hidden rounded-[30px] px-12 py-[54px]" style={{ background: "#0C332C" }}>
          <div className="pointer-events-none absolute -bottom-[120px] -left-[80px] size-[360px] rounded-full"
            style={{ background: "radial-gradient(circle,rgba(232,145,91,.18),transparent 70%)" }} />
          <div className="relative grid grid-cols-1 gap-11 lg:grid-cols-[.92fr_1.08fr] lg:items-center">
            <div>
              <div className="mb-3.5 text-[13px] font-bold uppercase tracking-[.14em]" style={{ color: "#7FD8B4" }}>Product preview</div>
              <h2 className="mb-[18px] font-extrabold leading-[1.08]" style={{ fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "-.025em", color: "#F4EEE2" }}>
                Designed around source values, status &amp;{" "}
                <em className="font-newsreader font-medium not-italic" style={{ fontStyle: "italic", color: "#E8B07A" }}>timeline</em> context.
              </h2>
              <p className="mb-[26px] text-[17px] leading-[1.6]" style={{ color: "#9FB8AF" }}>
                Phase 1 captures profile, questionnaire and consent so report upload can begin safely in Phase 2 — nothing is interpreted until you opt in.
              </p>
              <div className="grid gap-3">
                {["Consent complete", "Profile ready", "Questionnaire ready"].map((t) => (
                  <div key={t} className="flex items-center gap-3 text-[15px] font-semibold" style={{ color: "#CFE3DA" }}>
                    <span className="inline-flex size-6 items-center justify-center rounded-full text-[13px] font-extrabold"
                      style={{ background: "#2E9E7B", color: "#0C332C" }}>✓</span>
                    {t}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-[22px] bg-white p-[22px]" style={{ boxShadow: "0 40px 80px -36px rgba(0,0,0,.5)" }}>
              <div className="mb-4 flex items-center justify-between">
                <span className="text-base font-extrabold" style={{ color: "#0E3B33" }}>Biomarker overview</span>
                <span className="rounded-full px-3 py-1.5 text-xs font-bold" style={{ color: "#15695B", background: "#DCEBE3" }}>3 flagged</span>
              </div>
              <div className="grid gap-3">
                {[
                  { name: "Vitamin D", badge: "LOW", bBg: "#D9774B", bText: "white", note: "Ask about retest · ~8 wks", stroke: "#D9774B", pts: "0,22 22,18 44,20 66,12 90,8" },
                  { name: "HbA1c", badge: "MONITOR", bBg: "#F3DFA8", bText: "#7A5C12", note: "Track trend over time", stroke: "#D8A33C", pts: "0,16 22,18 44,14 66,16 90,13" },
                  { name: "LDL", badge: "ATTENTION", bBg: "#F2C9B6", bText: "#7A2E12", note: "Discuss risk with doctor", stroke: "#C25A33", pts: "0,20 22,16 44,18 66,10 90,6" },
                ].map(({ name, badge, bBg, bText, note, stroke, pts }) => (
                  <div key={name} className="flex items-center gap-3.5 rounded-[14px] border p-[15px]" style={{ background: "#F8F4EB", borderColor: "#EBE2D2" }}>
                    <div className="flex-1">
                      <div className="mb-0.5 flex items-center gap-2">
                        <span className="text-[15px] font-extrabold" style={{ color: "#0E3B33" }}>{name}</span>
                        <span className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold" style={{ background: bBg, color: bText }}>{badge}</span>
                      </div>
                      <div className="text-[12.5px]" style={{ color: "#7E8C84" }}>{note}</div>
                    </div>
                    <svg viewBox="0 0 90 30" className="h-7 w-[90px] flex-none">
                      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Doctor trust / Safety ── */}
      <section id="safety" className="relative z-[2] mx-auto mt-24 max-w-[1000px] px-8 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-bold"
          style={{ background: "#E5EFE9", borderColor: "#CADED4", color: "#15695B" }}>
          🩺 Doctor-reviewed trust
        </div>
        <h2 className="mb-[22px] font-extrabold leading-[1.05]" style={{ fontSize: "clamp(30px,4.4vw,56px)", letterSpacing: "-.03em", color: "#0E3B33" }}>
          AI can organize.<br />
          Doctors make{" "}
          <em className="font-newsreader font-medium not-italic" style={{ fontStyle: "italic", color: "#E8915B" }}>medical decisions</em>.
        </h2>
        <p className="mx-auto mb-7 max-w-[680px] text-[18.5px] leading-[1.6]" style={{ color: "#46584F" }}>
          Lyf9 AI explains supported report data in plain language, shows source values, and helps you prepare better questions. It does not replace qualified medical care.
        </p>
        <div className="mx-auto inline-flex max-w-[640px] items-start gap-3.5 rounded-[16px] border bg-white px-[22px] py-[18px] text-left"
          style={{ borderColor: "#EBE2D2", boxShadow: "0 18px 40px -28px rgba(12,51,44,.4)" }}>
          <span className="mt-0.5 text-[20px] leading-none">⚠️</span>
          <p className="text-[14.5px] leading-[1.55]" style={{ color: "#3D514A" }}>
            <strong style={{ color: "#0E3B33" }}>Lyf9 AI provides AI-assisted report explanations</strong> — not diagnosis or prescription. Doctor review is required for medical decisions.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="relative z-[2] mx-auto mt-24 max-w-[840px] px-8">
        <div className="mb-10 text-center">
          <div className="mb-3.5 text-[13px] font-bold uppercase tracking-[.14em]" style={{ color: "#1F8472" }}>FAQ</div>
          <h2 className="font-extrabold leading-[1.06]" style={{ fontSize: "clamp(30px,4vw,50px)", letterSpacing: "-.025em", color: "#0E3B33" }}>
            Built <em className="font-newsreader font-medium not-italic" style={{ fontStyle: "italic", color: "#1F8472" }}>carefully</em> before it grows.
          </h2>
        </div>
        <div className="grid gap-3.5">
          {FAQS.map((faq) => (
            <details
              key={faq.q}
              className="group overflow-hidden rounded-[16px] border bg-white"
              style={{ borderColor: "#EBE2D2" }}
            >
              <summary className="flex w-full cursor-pointer list-none items-center justify-between gap-4 px-6 py-[22px] text-left font-hanken [&::-webkit-details-marker]:hidden">
                <span className="text-[17.5px] font-bold" style={{ color: "#0E3B33" }}>{faq.q}</span>
                <span
                  className="inline-flex size-7 flex-none items-center justify-center rounded-full bg-[#E5EFE9] text-lg font-bold leading-none text-[#15695B] transition-colors group-open:bg-[#0C332C] group-open:text-[#7FD8B4]"
                  aria-hidden
                >
                  <span className="block group-open:hidden">+</span>
                  <span className="hidden group-open:block">−</span>
                </span>
              </summary>
              <div className="px-6 pb-6 text-[15.5px] leading-[1.6]" style={{ color: "#5C6E68" }}>
                {faq.a}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* ── Closing CTA ── */}
      <section className="relative z-[2] mx-auto mt-24 max-w-[1240px] px-8">
        <div className="relative overflow-hidden rounded-[32px] px-12 py-16 text-center"
          style={{ background: "linear-gradient(135deg,#E8915B 0%,#E0A93F 100%)" }}>
          <div className="pointer-events-none absolute -left-[50px] -top-[90px] size-[300px] rounded-full" style={{ background: "rgba(255,255,255,.18)" }} />
          <div className="pointer-events-none absolute -bottom-[110px] -right-[40px] size-[340px] rounded-full" style={{ background: "rgba(12,51,44,.16)" }} />
          <div className="relative">
            <h2 className="mb-4 font-extrabold leading-[1.05]" style={{ fontSize: "clamp(30px,4.4vw,56px)", letterSpacing: "-.03em", color: "#0C332C" }}>
              Start with profile, questionnaire &amp; consent.
            </h2>
            <p className="mx-auto mb-[30px] max-w-[560px] text-[18.5px] font-medium leading-[1.55]" style={{ color: "#3a2a12" }}>
              Phase 1 prepares the safe entry flow before uploads, AI extraction and doctor review are added.
            </p>
            <Link href="/signup"
              className="inline-flex items-center gap-2.5 rounded-full px-[34px] py-[18px] text-[17px] font-bold no-underline transition-all hover:-translate-y-0.5"
              style={{ background: "#0C332C", color: "#F4EEE2", boxShadow: "0 20px 40px -16px rgba(12,51,44,.6)" }}>
              Join the Lyf9 AI private beta →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-[2] mx-auto mt-16 max-w-[1240px] border-t px-8 pb-14 pt-10" style={{ borderColor: "rgba(14,59,51,.12)" }}>
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-[11px]">
            <span className="inline-flex size-[34px] items-center justify-center rounded-[10px] text-base font-extrabold" style={{ background: "#0C332C", color: "#7FD8B4" }}>l9</span>
            <div>
              <div className="text-[18px] font-extrabold" style={{ color: "#0E3B33", letterSpacing: "-.02em" }}>lyf9<span style={{ color: "#1F8472" }}>.ai</span></div>
              <div className="text-[12.5px]" style={{ color: "#7E8C84" }}>Private beta · lyf9.ai</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-6">
            {[["How it works", "#how"], ["Reports", "#reports"], ["Safety", "#safety"], ["FAQ", "#faq"]].map(([label, href]) => (
              <a key={href} href={href} className="text-sm font-semibold no-underline" style={{ color: "#3D514A" }}>{label}</a>
            ))}
            <Link href="/signup" className="text-sm font-bold no-underline" style={{ color: "#15695B" }}>Join beta →</Link>
          </div>
        </div>
        <p className="mt-[26px] max-w-[640px] text-[13px] leading-[1.5]" style={{ color: "#7E8C84" }}>
          Private beta. Lyf9 AI provides AI-assisted report explanations, not diagnosis or prescription. Medical decisions require qualified doctors.
        </p>
      </footer>



    </div>
  );
}
