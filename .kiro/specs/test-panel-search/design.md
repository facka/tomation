# Design Document: Test Panel Search

## Overview

This spec adds a search/filtering capability to the Tomation browser extension's Home view. Users can filter the visible test list in real time using case-insensitive substring matching, enabling quick location of specific tests without scrolling.

The search is entirely a Panel concern — no messages are sent to the Background. The filter runs on each `input` event against the DOM-rendered test list using case-insensitive `indexOf`.

---

## Architecture

### Search Filter (Panel-only)

The search feature operates entirely within `panel.js`. It does not interact with `background.js` or `runtime.js`. On each `input` event from the search field, the Panel iterates the DOM-rendered test list items and hides/shows them based on whether the test name contains the query as a case-insensitive substring.

```
┌─────────────────────────────────────────┐
│  Panel (Home View)                      │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Search Input (maxlength=100)    │    │
│  └────────────────┬────────────────┘    │
│                   │ input event         │
│                   ▼                     │
│  ┌─────────────────────────────────┐    │
│  │ Filter Logic (indexOf)          │    │
│  │ - case-insensitive comparison   │    │
│  │ - show/hide test items          │    │
│  │ - show/hide spec section headers│    │
│  │ - show empty state if no match  │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Key Design Decisions

- **No debounce**: Filter runs on every keystroke. Given the small DOM size (typically <100 test items), no performance optimization is needed.
- **`indexOf` over regex**: Using `String.prototype.indexOf` avoids regex escaping issues with special characters in search queries. Characters like `.`, `*`, `(` are treated as literals.
- **View navigation clears search**: When the user navigates away from Home view and returns, the search input is cleared and the full list is restored.

---

## Components and Interfaces

### Panel Components (new)

| Component             | Location                | Description                                           |
|-----------------------|-------------------------|-------------------------------------------------------|
| Search input          | Home view, above test list | `<input type="text" maxlength="100">`, filters on `input` event |

### Filter Logic (extracted function)

```js
// Pure function for testability
function filterTests(testNames, query) {
  if (!query) return testNames;
  var lowerQuery = query.toLowerCase();
  return testNames.filter(function(name) {
    return name.toLowerCase().indexOf(lowerQuery) !== -1;
  });
}
```

---

## Data Models

No new data models are introduced. The search filter operates entirely on the existing DOM-rendered test list without persisting any state.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do.*

### Property 1: Search Filter Correctness

*For any* list of test names (across multiple specs) and *for any* search query string, the filter function SHALL return exactly those tests whose names contain the query as a case-insensitive substring. When the query is empty, all tests SHALL be returned. When no tests match, the result SHALL be empty.

**Validates: Requirements 1.2, 1.3, 1.5, 1.6**

---

## Error Handling

### Search Error Scenarios

- **Extremely long input** (>100 chars): The `maxlength="100"` attribute on the HTML input prevents this at the browser level. No server-side validation needed.
- **Special regex characters in search**: The filter uses `indexOf` (not regex), so special characters are treated as literals. No escaping needed.

---

## Testing Strategy

### Dual Testing Approach

- **Unit tests**: Verify specific examples, edge cases, and error conditions.
- **Property-based tests**: Verify universal properties across generated inputs.

Property-based tests use [**fast-check**](https://github.com/dubzzz/fast-check), already installed in the extension package.

### Property Test Configuration

- Library: `fast-check` (v3.23.2, already in devDependencies)
- Test runner: Node.js built-in `node:test`
- Minimum iterations: 100 per property
- Tag format: `// Feature: test-panel-search, Property 1: Search Filter Correctness`
- Each property test must implement exactly one correctness property from this document

### Property Test Plan

| Property | Module under test | Generator strategy |
|----------|------------------|--------------------|
| 1: Search filter correctness | Panel filter function (extracted) | Generate random lists of test names and random query strings |

### Unit Test Plan

| Area | Tests |
|------|-------|
| Search filter | Empty query shows all, partial match, no match shows empty state, case insensitivity, spec section hiding |
| View navigation | Returning to home clears search |
