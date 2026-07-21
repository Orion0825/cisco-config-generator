---
name: Cisco Config Generator
description: Dense operator workbench for generating, checking, and tuning Cisco configs.
colors:
  bg: "#f5f7f9"
  surface: "#ffffff"
  surface-strong: "#eef3f6"
  surface-soft: "#f8fbfc"
  surface-tint: "#ecf7f4"
  line: "#d8e0e5"
  text: "#16212a"
  muted: "#66737d"
  accent: "#0f766e"
  accent-strong: "#0b5f59"
  blue: "#1f5f99"
  violet: "#6d4aff"
  orange: "#c45a1b"
  danger: "#b42318"
  warning: "#8a5a00"
typography:
  display:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  title:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0"
  body:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0"
  mono:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "0"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "14px"
  xl: "16px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0 12px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "6px 8px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "12px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
---

# Design System: Cisco Config Generator

## 1. Overview

**Creative North Star: "The Operator's Workbench"**

This system is a control surface, not a presentation site. It should feel like a reliable bench where an internal engineer can scan, edit, copy, and verify without friction. The tone is direct, compact, and calm, with enough structure to keep dense config work readable.

The current surface is a cool neutral shell with teal as the main action color, blue/orange/violet as contextual accents, and white panels separated by thin lines and shallow shadows. Inter keeps the interface familiar and unsentimental; monospace is reserved for IPs, configs, and code-like values. The result should feel precise, not theatrical.

It explicitly rejects the three failure modes from the product brief: a marketing page, a beginner tutorial, and a flashy dashboard. The right answer is a working instrument that lets experienced people move quickly.

**Key Characteristics:**
- Dense, but still scannable.
- Familiar form controls, not custom flourishes.
- Clear state and selection signals.
- Terse copy, practical feedback.
- One visual language for general Cisco work and ATM-specific editing.

## 2. Colors

The palette is a cool technical neutral base with a small set of purposeful accents.

### Primary
- **Teal Action** (#0f766e): primary buttons, selected states, focus rings, active tabs, and the main affirmative signal.
- **Deep Teal** (#0b5f59): hover / pressed state for primary action.

### Secondary
- **Network Blue** (#1f5f99): upload actions, routing utilities, and informational badges.

### Tertiary
- **ATM Orange** (#c45a1b): ATM mode, special editable regions, and attention cues tied to the ATM workflow.
- **Policy Violet** (#6d4aff): ACL / NAT / policy-like badges and other secondary domain tags.

### Neutral
- **Cool Canvas** (#f5f7f9): page background.
- **Surface White** (#ffffff): panels, cards, and inputs.
- **Soft Surface** (#f8fbfc): low-contrast input and card interiors.
- **Tint Surface** (#ecf7f4): subtle positive states and copy zones.
- **Line Gray** (#d8e0e5): dividers and strokes.
- **Text Navy** (#16212a): body text and labels.
- **Muted Slate** (#66737d): secondary copy and metadata.

### Named Rules
**The Rare Accent Rule.** Teal carries primary action. Blue, violet, and orange stay contextual. If every section wants attention, none of them gets it.

## 3. Typography

**Display Font:** Inter  
**Body Font:** Inter  
**Label/Mono Font:** ui-monospace

**Character:** One sans family keeps the UI familiar and operational. Monospace appears only where the content is already code-like, so IPs, hostnames, and config lines read as data instead of decoration.

### Hierarchy
- **Display** (700, 21px, 1.2): page title and top-level status.
- **Headline** (700, 16px, 1.25): section titles and panel headings.
- **Title** (700, 14px, 1.25): compact subheads inside dense sections.
- **Body** (400, 13px, 1.5): explanatory copy and helper text.
- **Label** (700, 12px, 1.2): field labels, pills, and small control text.

### Named Rules
**The One Family Rule.** Use Inter for the whole interface. Keep mono for config-like content only.

## 4. Elevation

Depth is mostly tonal and structural rather than dramatic. White surfaces sit on a cool neutral canvas, with thin borders, inset highlights, and shallow shadows used to separate layers without making the UI feel glossy.

### Shadow Vocabulary
- **Ambient Card** (`0 14px 34px rgba(22, 33, 42, 0.09)`): primary panels and editor regions.
- **Tight Card** (`0 7px 18px rgba(22, 33, 42, 0.08)`): smaller surfaced controls and active devices.
- **Header Lift** (`0 1px 0 rgba(22, 33, 42, 0.03), 0 10px 28px rgba(22, 33, 42, 0.06)`): sticky topbar separation.

### Named Rules
**The Flat-at-Rest Rule.** Surfaces should feel stable when idle. Depth should support separation and state, not become decoration.

## 5. Components

Buttons, panels, and inputs are all built from the same compact control vocabulary: low radius, thin borders, modest shadows, and strong hover/focus signals.

### Buttons
- **Shape:** 6px radius, 34px minimum height.
- **Primary:** solid teal with white text; used for the main action only.
- **Hover / Focus:** slight lift, darker teal hover state, and a clear teal focus outline.
- **Secondary / Ghost:** neutral white or transparent surfaces for supporting actions.

### Tabs and Segmented Controls
- **Style:** compact, pill-like controls with an active state that reads as selected rather than decorative.
- **State:** active tabs use teal or orange emphasis depending on the surface they belong to.

### Cards / Containers
- **Corner Style:** 8-10px radius.
- **Background:** white on cool neutral, sometimes with a subtle gradient tint.
- **Shadow Strategy:** light ambient shadow plus inset highlight.
- **Border:** 1px line gray divider, never heavy framing.
- **Internal Padding:** typically 12px, with tighter 8px-10px clusters inside dense regions.

### Inputs / Fields
- **Style:** white fill, 1px line border, 6px radius, compact vertical height.
- **Focus:** teal border and a clean focus ring.
- **Error / Disabled:** error uses danger red; disabled stays quiet and low-contrast.

### Navigation / Shell
- **Style:** sticky topbar, intro strip, left device list, central editor, and output panel as a workbench layout.
- **Mobile:** stack the workspace into one column and collapse dense regions instead of shrinking type.

### ATM Editing Surface
- **Style:** more specialized and more explicit than the general editor, with orange used to mark the ATM flow and mono-heavy values for machine-like fields.
- **Behavior:** keep editable fields obvious, keep the fixed values visually distinct, and keep ATM mode separate from general device editing.

## 6. Do's and Don'ts

### Do:
- **Do** keep the interface dense, practical, and fast to scan.
- **Do** use the same compact control vocabulary everywhere.
- **Do** keep teal for the primary path and use the other accent colors sparingly.
- **Do** preserve the distinction between editable values and fixed config text.
- **Do** keep feedback terse and operational.

### Don't:
- **Don't** make it look like a marketing website.
- **Don't** turn it into a beginner tutorial with oversized explanations and lots of prose.
- **Don't** make it feel like a flashy dashboard with decorative widgets and unnecessary motion.
- **Don't** introduce oversized display typography or playful visual flourishes.
- **Don't** replace familiar buttons, tabs, inputs, or pills with invented controls.
- **Don't** let shadows, blur, or gradients become the main event.
