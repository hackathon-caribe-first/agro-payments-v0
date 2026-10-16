---
name: surco-design
description: "Trigger: frontend UI, components, styles, screens, Tailwind, shadcn, colors, typography, payment states in Surco/Agro Payments. Apply the Surco design system."
license: Apache-2.0
metadata:
  author: "hans peter"
  version: "1.0"
---

## Activation Contract

Use for any UI work under `frontend/` (apps or `packages/shared`): new screens, components, styling, copy, money/payment states.

## Hard Rules

- Tokens live ONLY in `frontend/packages/shared/src/styles.css`. Use semantic Tailwind classes (`bg-primary`, `text-muted-foreground`, `bg-secondary`, `text-destructive`, `bg-warning`, `bg-sidebar`); never hex, never `var()` in className.
- Use only the 10 brand colors + semantic text tokens from the reference. A new color requires updating `references/DESIGN.md` in the same PR.
- Small text on white: `text-muted-foreground` (#53675A), never brand gray #737B73 or red #BC614E.
- Headings, brand, buttons: `font-brand` (Nunito, 700–900). Body, forms, numbers: `font-sans` (Inter).
- Money, percentages, dates: `tabular-nums`, ISO currency (USD, COP). Body ≥16px, decision data ≥14px; never 9–11px.
- One primary action per context. Touch targets ≥44px (Button default size already complies).
- Status = text + color + symbol, never color alone. Financial screens always show «Entorno de simulación · Sin dinero real»; never present simulated money as real.
- Approve milestone ≠ order payment ≠ confirm receipt: separate states, never a green check on «Pago en proceso».
- Respect `prefers-reduced-motion`; motion 120–220ms; no glassmorphism, neon, decorative charts, or Rappi orange.
- Copy: clear Colombian Spanish, concrete verbs, actionable errors. Never «rentabilidad garantizada» or «pago exitoso» without confirmation.

## Decision Gates

| Need | Use |
|------|-----|
| Main action | `<Button>` (green) |
| Advance, non-payment | `<Button variant="secondary">` (lime) |
| Tertiary | `<Button variant="outline">` |
| Destructive | `<Button variant="destructive">` + consequence text + confirmation |
| Pending/attention | `bg-warning text-warning-foreground` |
| Confirmed | `text-success` |
| Error | `text-destructive` next to the field, not only a toast |

## Execution Steps

1. Reuse or add components in `frontend/packages/shared/src/ui` (`shadcn add` from `packages/shared`); restyle to these tokens.
2. Check the money-state table and per-role journeys in the reference before building a flow.
3. Before finishing, walk the reference "Definición de terminado" checklist (§9).

## Output Contract

State which tokens/variants were used and any checklist item left unverified (contrast, 320px, keyboard, zoom 200%).

## References

- `references/DESIGN.md` — full Surco design spec: palette, contrast audit, type scale, layout, components, money states, per-screen hierarchy.
