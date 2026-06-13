# Requirements Document

## Introduction

This spec adds inline SVG icons to all control buttons in the Tomation browser extension's sidebar panel. Icons provide quick visual identification of button actions while retaining readable text labels, improving the overall UI clarity and consistency.

The feature is implemented entirely within `panel.js` using inline SVG elements — no external icon libraries, image files, or icon fonts. The extension continues to use ES5-compatible vanilla JavaScript with no bundlers or modern syntax.

## Glossary

- **Panel**: The sidebar UI (`panel.html` / `panel.js`) through which users interact with the extension.
- **Control_Button**: Any button in the controller bar or action bar (Run, Pause, Continue, Stop, Try Again, Skip).
- **Inline_SVG**: An SVG element embedded directly in the button's HTML markup rather than loaded from an external file.

---

## Requirements

### Requirement 1: Control Button Icons

**User Story:** As a user, I want icons on control buttons, so that I can quickly identify button actions at a glance while retaining readable labels.

#### Acceptance Criteria

1. THE Panel SHALL display an icon alongside the text label on the following control buttons: Run (play icon), Pause (pause icon), Continue (play/resume icon), Stop (stop icon), Try Again (retry/refresh icon), Skip (skip-forward icon).
2. THE Panel SHALL render icons as inline SVG elements embedded directly in the button HTML — no external icon libraries, image files, or icon fonts SHALL be used.
3. THE Panel SHALL size all button icons at 14×14 pixels using explicit `width` and `height` attributes on each SVG element, and each SVG element SHALL include a `viewBox` attribute to ensure proper scaling.
4. THE Panel SHALL position icons to the left of the button text label with 4 pixels of spacing between the icon and the label.
5. THE icons SHALL use `currentColor` for their stroke or fill property so they inherit the button's text color in all states (default, hover, disabled).
6. THE Panel SHALL use a consistent icon stroke width of 2 pixels across all button icons.
7. THE Panel SHALL mark each button icon SVG element with `aria-hidden="true"` so that screen readers do not announce the icon redundantly alongside the button's text label.
