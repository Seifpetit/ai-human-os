# UI Patterns

## Purpose

Defines reusable UI and interaction conventions that should be applied across features.

This file is the human-readable source of truth for:
- button conventions
- layout conventions
- form conventions
- feedback conventions
- common component composition patterns

---

## Usage Rule

If a feature needs a common interaction pattern, agents should look here first before inventing one.

---

## Human Input

[ UI PATTERNS INPUT START ]

Navigation style:
single-screen entry flows with direct action choices before gameplay

Preferred button hierarchy:
one clear primary action, secondary actions visually related but less dominant

Preferred feedback style:
inline status and local feedback near the relevant action

Form style:
strong labels, moderate spacing, mobile-safe controls

Touch behavior expectations:
tap-friendly targets, hover is optional, mobile-first layout tolerance

Component families that should feel consistent:
- buttons
- layout sections
- status messages
- basic forms

[ UI PATTERNS INPUT END ]

---

## Buttons

- primary buttons should represent the main action
- secondary buttons should support but not compete with the primary action
- destructive buttons must be visually distinct
- button labels should use verb-first wording when possible
- loading buttons should keep width stable when text changes

---

## Layouts

- layout files should compose child components instead of duplicating markup
- page-level sections should have a clear primary action area
- repeated action groups should share alignment and spacing
- important content should not depend on color alone for hierarchy

---

## Forms And Inputs

- labels should be present when meaning is not obvious
- placeholders should assist, not replace labels
- validation messages should be specific and local to the field when possible
- touch targets should remain comfortable on mobile-sized screens

---

## Feedback

- loading feedback should appear near the relevant action
- success feedback should confirm what changed
- error feedback should tell the user what to do next
- passive empty states should still offer a next step

---

## Reuse Rules

- if a pattern already exists, reuse it before creating a new variation
- if a new variation is necessary, keep the difference explicit and minimal
- a layout should import existing buttons/components rather than restyling raw tags ad hoc

---

## Notes

- this file describes reusable product interaction patterns
- exact visual values still belong to DESIGN_TOKENS.json
- overall quality expectations belong to PRODUCT_STANDARDS.md
