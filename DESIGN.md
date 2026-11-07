---
name: PayProof Merchant Desk
description: A calm, legible operations console for payment incidents and merchant cases.
colors:
  ink: "#111416"
  canvas: "#f6f7f8"
  surface: "#ffffff"
  line: "#e2e6e9"
  muted: "#66717d"
  success: "#13834e"
  failure: "#dc3938"
typography:
  display:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "42px"
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-0.045em"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  control: "8px"
  card: "13px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "22px"
  xl: "34px"
components:
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px"
  feature-panel:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "20px"
  status-chip:
    backgroundColor: "#e9f7ef"
    textColor: "{colors.success}"
    rounded: "{rounded.control}"
    padding: "5px 8px"
---

## Overview

The merchant console is an operations surface for reviewing checkout outcomes, payment incidents, and case evidence. It keeps PayProof's Sandbox and demo constraints visible. Payment records help operators investigate an incident; they do not establish customer intent.

The main workspace pairs a quiet white canvas with crisp black feature panels. A narrow icon rail preserves section-based navigation, while a separate activity stream keeps recent payment and case events in view on wide screens. Secondary records sit lower on the page so the opening view remains focused.

These rules describe `/admin`. The storefront at `/` retains its existing visual treatment until it is redesigned separately.

## Colors

- Use near-black for primary text and the two feature panels.
- Use white for information panels and a cool near-white canvas behind them.
- Keep borders cool and subtle. Use green for successful or enabled states and red for failed payments; do not use either as decoration.
- Keep muted copy dark enough to read against white.

## Typography

- Use DM Sans for interface text, labels, and headings.
- Use tabular-feeling, compact labels only when they represent operational metadata; do not use monospace as a technical costume.
- Keep titles strong and concise; metric values are large but subordinate to their labels and context.

## Layout

- Keep the left rail narrow and icon-led. Give every icon an accessible name, preserve anchor scrolling, and track the section in view.
- Snap each major section to a full viewport start so a manual scroll does not leave the previous section's rows hanging above the active view.
- On wide screens, use a flexible content column and a right activity stream. Move the stream below the main content at tablet widths.
- Use a four-column metric row on wide screens and a two-column grid on smaller screens.
- Keep case evidence and the full ledger lower in the page than the payment overview.

## Elevation & Depth

- Prefer a 1px cool-gray border over shadows. Use a restrained shadow only when a control needs a clear raised state.
- Use the black surface as a deliberate contrast panel, not as a shadow or decorative accent.

## Shapes

- Information panels use a 12–14px radius. Small controls use 8px; status chips use a full pill radius.
- Keep chart geometry and event timelines precise and quiet.

## Components

- Metric panels show the label, value, and one line of context.
- The payment overview uses the black surface to emphasize failure patterns and next steps.
- Activity items are derived from persisted order, payment, incident, and case records.
- Evidence rows distinguish found records from unavailable records.

## Do's and Don'ts

- Do label all demo data as simulated.
- Do keep failures, pending states, and successful outcomes visually distinct.
- Do retain functional section anchors and keyboard focus states.
- Don't infer customer intent from payment state.
- Don't fill the first viewport with every available record.
