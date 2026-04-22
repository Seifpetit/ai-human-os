# Product Standards

## Purpose

Defines the product-level quality bar for generated work.

This file is the human-readable source of truth for:
- expected completeness
- acceptable UX quality
- accessibility baseline
- consistency requirements across features

---

## Usage Rule

Execution agents should NOT invent product quality standards.

They should read them from this file.

If a choice is unspecified here:
- prefer restraint
- prefer consistency with existing product files
- do not escalate polish level implicitly

---

## Human Input

[ PRODUCT STANDARDS INPUT START ]

Product quality level:
<prototype | standard_passing | production_ready | premium_polished>

Target audience:
<who this product is for>

Interaction priority:
<speed | clarity | delight | density | accessibility>

Accessibility baseline:
<keyboard support / color contrast / touch target expectations>

Preferred product tone:
<playful | serious | tactical | premium | minimal | bold>

Things the UI should avoid:
- <avoidance 1>
- <avoidance 2>
- <avoidance 3>

Styling contract mode:
<class_hook_surfaces | shared_theme_import>

Styling hooks:
<className required on user-facing layout surfaces>

Token usage mode:
<shared_css_variables | shared_theme_import>

Inline styles:
<forbidden | limited>

Local token objects:
<forbidden | limited>

Hardcoded colors:
<forbidden | limited>

[ PRODUCT STANDARDS INPUT END ]

---

## Layer 1: Quality Bar

### Definition Of Done

- every user-facing file must satisfy its plan purpose
- empty placeholder structure is not acceptable unless explicitly requested
- generated UI must be coherent with existing product files
- loading, empty, and disabled states should exist when relevant
- no obvious dead ends in user flow

### Quality Levels

#### prototype
- minimal but understandable
- enough to validate the feature path
- styling may be sparse

#### standard_passing
- complete and coherent
- sensible spacing, hierarchy, and labels
- no obviously rough UX edges

#### production_ready
- component composition should feel intentional
- accessibility and states should be considered by default
- visuals should follow the design language consistently

#### premium_polished
- strong visual identity
- refined hierarchy and spacing
- richer state communication and interaction detail

---

## Layer 2: UX And Component Standards

### Interaction Rules

- all clickable elements must look clickable
- disabled actions must be visually distinct
- button labels should describe the action clearly
- layout should make the primary next action obvious
- repeated interaction patterns should use the same conventions

### State Rules

- if a component can be busy, define a loading state
- if a component can be unavailable, define a disabled state
- empty states must explain what the user can do next
- error states should be plain and actionable

### Composition Rules

- prefer reuse of existing components over raw HTML duplication
- avoid inline one-off patterns when a project component already exists
- parent layout files should compose child components rather than reimplement them

---

## Layer 3: Visual Direction Rules

### Design Character

- visual style should feel: <fill>
- density should feel: <airy | balanced | compact>
- motion should feel: <still | restrained | expressive>
- visual hierarchy should feel: <soft | clear | strong>

### Visual Consistency

- color usage must follow DESIGN_TOKENS.json
- spacing should follow the shared spacing scale
- typography should follow the shared type hierarchy
- repeated controls should share the same visual treatment

### Styling Contract

- define how user-facing files are allowed to consume tokens
- define whether `className` is required
- define whether inline style objects are allowed
- define whether local token objects are allowed
- define whether hardcoded colors are allowed

### Explicit Anti-Patterns

- avoid generic placeholder styling in final user-facing files
- avoid random one-off colors outside the token system
- avoid mixing multiple visual styles in one feature
- avoid using raw default browser presentation when a styled product surface is expected

---

## Notes

- this file defines quality and UX expectations, not exact token values
- exact token values belong in DESIGN_TOKENS.template.json / DESIGN_TOKENS.json
- component-specific reusable interaction rules belong in UI_PATTERNS.template.md / UI_PATTERNS.md
