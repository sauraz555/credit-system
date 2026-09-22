# ADR-004: IBM Carbon Design System for Enterprise UI Architecture

## Status
Accepted

## Date
2026-09-21

## Context
The Credit Reporting Mechanism is an institutional enterprise platform serving credit bureau analysts, risk officers, regulatory compliance auditors, and consumer subjects. Key requirements include:
- High information density (large data tables, financial metrics strips, bitemporal scrubbers, SVG network graphs).
- Strict adherence to accessibility standards: Australian Government Digital Service Standard mandates **WCAG 2.1 Level AA** compliance.
- Support for industrial enterprise dark-mode aesthetics (`g100`) alongside high-contrast print-ready light themes (`g10`).

## Decision
We adopted the **IBM Carbon Design System (`@carbon/react` v1.70.0 and `@carbon/icons-react`)** as the core component library and design framework:
1. **Accessibility**: IBM Carbon components are engineered from the ground up for full WCAG 2.1 AA compliance, including ARIA landmark roles, focus indicators, keyboard trapping in modals, and `SkipToContent` accessibility primitives.
2. **Design Tokens**: Standardized Carbon color tokens (`--cds-layer-01`, `--cds-border-subtle`, `--cds-text-primary`) and typography (IBM Plex Sans and IBM Plex Mono).
3. **Application Shell**: Built around Carbon's `Header`, `HeaderContainer`, `SideNav`, and `Theme` components.

## Alternatives Considered
1. **Tailwind CSS + Headless UI / Shadcn**:
   - *Considered*: Flexible, but requires writing extensive custom accessibility logic, table pagination, and enterprise navigation landmarks manually.
2. **Material UI (MUI)**:
   - *Considered*: Consumer-oriented aesthetics, less suited for high-density financial data terminals and audit interfaces.

## Consequences
### Positive
- Instant enterprise credibility and sleek institutional aesthetics.
- Seamless passing of automated accessibility testing via `@axe-core/playwright` with zero WCAG 2.1 AA violations.
- Consistent theming and typography across dark and light modes.

### Negative / Trade-offs
- Carbon's component API is strict and opinionated; requires wrapping pages in `HeaderContainer` and configuring feature flags.
