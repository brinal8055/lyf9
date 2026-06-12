# Lyf9 AI Brand And Design DNA

## Brand Direction

Public brand: **lyf9.ai**  
Product voice: **Lyf9 AI**

Lyf9 AI should feel like a personal health operating system, not a clinic website, supplement store, or generic AI summarizer. The experience should be premium, calm, intelligent, privacy-first, and trustworthy for Indian preventive-health users.

Core creative idea:

> A living health graph inside your body.

Positioning line:

> Your health, decoded over time.

Primary homepage message:

> Your body has data. We turn it into direction.

## Visual Principles

- Dark premium base with warm biological accents.
- Spacious layouts with one dominant message per section.
- Dashboard/product visuals over generic wellness stock images.
- Source-linked biomarker cards and timeline previews as core visual proof.
- Warm trust sections on ivory backgrounds for doctors, privacy, and safety.
- No fear-based medical visuals.
- No overuse of generic hospital imagery, pills, or fitness/bodybuilder aesthetics.
- No doctor-replacement framing.

## Color Tokens

Use black, warm ivory, and orange as the identity. Use green, blue, and yellow only for health categories, status, and data accents.

```txt
Primary background:        #050505
Secondary background:      #101010
Card background:           #171717
Elevated card:             #202020
Primary text:              #F7F4ED
Secondary text:            #A7A29A
Muted text:                #6F6A63

Primary accent / CTA:      #FF6A3D
Secondary accent / health: #45D6A2
Calm accent / sleep:       #5B7CFA
Nutrition accent:          #F5B65A
Mind accent:               #C084FC
Warning / risk:            #FF4D4D
Success:                   #6FE7B1

Light section background:  #F6F1E8
Light card:                #FFFDF7
Dark border:               rgba(255,255,255,0.10)
Light border:              rgba(0,0,0,0.08)
```

Implementation naming:

```ts
colors: {
  ink: "#050505",
  charcoal: "#101010",
  card: "#171717",
  elevated: "#202020",
  ivory: "#F7F4ED",
  muted: "#A7A29A",
  dim: "#6F6A63",
  orange: "#FF6A3D",
  green: "#45D6A2",
  blue: "#5B7CFA",
  yellow: "#F5B65A",
  violet: "#C084FC",
  danger: "#FF4D4D",
  success: "#6FE7B1",
  cream: "#F6F1E8",
  lightCard: "#FFFDF7"
}
```

## Typography

Preferred stack:

```txt
Primary font: Inter, Satoshi, Geist Sans
Editorial accent: Fraunces, Canela, or Playfair Display for 1-2 large emotional lines only
Fallback: system-ui, sans-serif
```

Font scale:

```txt
Hero headline desktop:     72-88px
Hero headline mobile:      42-52px
Section headline desktop:  44-56px
Section headline mobile:   32-40px
Card title:                22-28px
Body large:                20px
Body normal:               16-18px
Small label / eyebrow:     12-14px
Button text:               15-16px
```

Rules:

- Use large clean sans-serif for hero copy.
- Use the orange accent on one emotional keyword or phrase, not whole paragraphs.
- Do not scale font size with viewport width.
- Letter spacing should be 0 unless a local component clearly needs small uppercase labels.
- Keep dashboard, admin, and form text tighter than marketing hero text.

## Layout

```txt
Max container width:        1200-1280px
Hero height:                92-100vh desktop, auto on mobile
Section vertical padding:   96-140px desktop, 64-80px mobile
Grid gap:                   24-32px
Card padding:               28-40px
Navbar height:              72px
Announcement bar height:    36px
```

Border radius:

```txt
Small UI:       12px
Compact card:   20px
Large card:     28px
Feature panel:  36px
Button/pill:    999px
```

Cards can be expressive on the public landing page, but app surfaces should be quieter and denser. Avoid cards inside cards.

## Component Style

Buttons:

- Primary CTA: orange background, dark or white text depending contrast.
- Secondary CTA: transparent or dark glass with subtle border.
- Hover: scale to 1.03 and increase border/accent glow.
- Active: scale to 0.98.

Cards:

- Dark cards use `#101010` or `#171717` with subtle white borders.
- Premium feature cards can use soft glow, but do not create decorative orb backgrounds.
- Dashboard marker cards must prioritize value, unit, status, and source.

Badges:

- Use small pill badges for "Doctor-reviewed", "Source-linked", "Privacy-first", and status.
- Do not use "clinically proven" unless evidence exists.

Forms:

- Use calm, high-contrast fields.
- Consent choices must be explicit and purpose-wise.
- Medical safety disclaimers should be visible near upload and result pages.

## Motion

Motion should be premium and slow, not flashy.

```txt
Hero text: fade in from y=24px over 700ms
Hero graph/orb: slow rotation, 30s linear infinite
Nodes/cards: subtle vertical float, 6px alternate
Cards on scroll: fade in with 0.15s stagger
Marquee: announcement scroll, 25-35s loop
Dashboard preview: values count up on view
Timeline: line draws top to bottom
Easing: cubic-bezier(0.22, 1, 0.36, 1)
```

Respect reduced-motion preferences.

## Landing Page Sections

Use these public landing sections for Phase 1:

1. Announcement bar.
2. Sticky navbar.
3. Hero with living health graph visual.
4. Trust strip.
5. How it works.
6. Interactive health graph preview.
7. Personalization engine.
8. Health pillars.
9. Doctor review trust section.
10. Simple beta pricing or waitlist CTA.
11. FAQ.
12. Final CTA.
13. Footer.

Keep Phase 1 landing page focused on private beta. Journal, full plans, lab booking, supplement programs, and doctor marketplace can be placeholders or omitted.

## Hero Biomarker Graph

The hero differentiator should be a semi-animated product visual, not a generic image.

Elements:

- Central abstract body outline, helix, or health graph.
- Orbiting biomarker chips: Blood Reports, Thyroid, Vitamin D, HbA1c, Lipids, Energy, Doctor Review.
- Connecting lines.
- Floating cards: "Vitamin D: Low", "HbA1c: Watch", "Doctor reviewed", "Retest in 8 weeks".
- Source-linked dashboard feel.

Style:

```txt
orb background: radial-gradient(circle, rgba(255,106,61,0.22), transparent 55%)
floating card: rgba(255,255,255,0.08)
border: 1px solid rgba(255,255,255,0.12)
blur: backdrop-filter blur(16px)
```

## App Surface Style

For logged-in pages, shift from expressive landing design to functional health cockpit:

- Left navigation or compact top navigation.
- Clear upload and processing states.
- Marker cards grouped by Critical, Needs Attention, Monitor, Normal.
- Source values visible on every insight card where possible.
- Timeline and report history optimized for scanning.
- Doctor review state visible without hype.
- Admin and doctor dashboards should be quiet, dense, and operational.

## Tone And Copy

Tone:

- Clear.
- Premium.
- Scientific.
- Warm.
- Not scary.
- Not overpromising.

Use:

- "Understand what may need attention."
- "AI-powered insights, reviewed by doctors where needed."
- "Your health timeline, explained."
- "Get source-linked explanations from your report."
- "Please discuss this with a qualified doctor."

Avoid:

- Deficiency cure claims.
- Doctor-replacement framing.
- "Buy supplements."
- Claims that medical review is unnecessary.
- Guaranteed outcome claims.
- "You have [diagnosis]."

## Responsive Behavior

Desktop:

- Hero can use two-column layout: copy left, health graph/product visual right.
- How-it-works can use four horizontal cards.
- Preview/dashboard sections can use wide product panels.

Mobile:

- Hero stacks copy above visual.
- Navbar collapses to menu.
- How-it-works becomes a vertical timeline.
- Product preview uses horizontal tabs or stacked cards.
- Buttons must fit without text overflow.
- Health graph visual must stay readable and not overlap text.

## Key Components

```txt
AnnouncementBar
Navbar
HeroHealthGraph
TrustBadges
HowItWorksTimeline
HealthGraphPreview
SignalCard
PillarCard
ProtocolPreviewCard
PricingCard
DoctorReviewSection
FAQAccordion
FinalCTA
Footer
```

Do not build long-term components for lab booking, pharmacy, supplement marketplace, wearables, ABDM/ABHA, or genetics in the private beta.
