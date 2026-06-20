# Requirements Document

## Introduction

This spec adds search/filtering capability to the Tomation browser extension's sidebar panel. Users with many tests need a way to quickly locate specific tests without scrolling through the full list. The search feature provides real-time case-insensitive substring matching against test names in the Home view.

The feature is implemented entirely within `panel.js` — no messages are sent to the Background for search. The extension continues to use ES5-compatible vanilla JavaScript with no bundlers or modern syntax.

## Glossary

- **Panel**: The sidebar UI (`panel.html` / `panel.js`) through which users interact with the extension.
- **Home_View**: The default panel view showing all loaded specs and their tests.
- **Search_Filter**: A case-insensitive text input that narrows the visible test list in real time.
- **Spec_Section**: A group of tests displayed under a spec name header in the Home view.

---

## Requirements

### Requirement 1: Search Tests by Name

**User Story:** As a tester with many tests, I want to filter tests by name, so that I can quickly find and run specific tests without scrolling.

#### Acceptance Criteria

1. THE Panel SHALL display a search input field at the top of the Home view, positioned above the spec/test list, with a maximum input length of 100 characters.
2. WHEN the user types in the search input, THE Panel SHALL filter the visible test list on each keystroke without intentional delay, showing only tests whose names match the search query using case-insensitive substring matching.
3. WHEN no tests within a spec section match the search query, THE Panel SHALL hide that spec section header entirely so that only spec sections containing matching tests remain visible.
4. WHEN no tests match the search query across any spec, THE Panel SHALL display an empty state message indicating no tests were found, in place of the test list.
5. WHEN the search input is cleared, THE Panel SHALL restore the full unfiltered test list including all spec section headers.
6. THE search filter SHALL apply across all loaded specs in the current project — matching tests from any spec SHALL remain visible.
7. WHEN the user navigates from the Home view to the Test Plan or Run view and then returns to the Home view, THE Panel SHALL clear the search input and display the full unfiltered test list.
