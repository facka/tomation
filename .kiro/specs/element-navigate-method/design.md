# Design Document: Element Navigate Method

## Overview

The `.navigate(path)` method extends the Tomation element builder with relative DOM traversal capabilities. It addresses the common scenario where a target element lacks unique identifiers but can be reached by navigating from a nearby identifiable anchor element.

The feature flows through three packages in sequence:

1. **DSL** — The author calls `.navigate("parent,child[2]")` on an element builder. The builder stores the raw path string and includes it in the descriptor emitted by `.as()`.
2. **Compiler** — The parser recognizes the `navigate` field, validates the path string, parses each comma-separated token into a structured step object, and emits the result in the `.tomation.json` output.
3. **Extension Runtime** — At execution time, the content script resolves the anchor element (using the existing `tag`+`where` polling logic), then synchronously applies each navigation step to traverse the DOM, arriving at the final target element.

### Design Decisions

- **Raw string in DSL, structured array in JSON**: The DSL stores the navigate path as a raw string for ergonomics. The compiler is responsible for validation and structuring. This keeps the DSL lightweight and the runtime free from parsing logic.
- **Synchronous traversal (no per-step polling)**: Navigation steps execute synchronously after the anchor is found. The DOM structure relative to the anchor is assumed stable once the anchor appears. This avoids complexity and performance overhead from polling at each step.
- **1-based indexing**: Consistent with natural language ("child 1" = first child) and matches the existing `nthChild` matcher convention.

## Architecture

```mermaid
flowchart LR
    subgraph DSL["@tomationjs/dsl"]
        EB[ElementBuilder] -->|.navigate(path)| EB
        EB -->|.as(label)| DESC[ElementDescriptor<br/>+ navigate field]
    end

    subgraph Compiler["@tomationjs/compiler"]
        Parser[parser.js] -->|extractElement| NP[Navigate Path<br/>Validator/Parser]
        NP -->|structured steps| Emitter[emitter.js]
    end

    subgraph Extension["Extension Runtime"]
        RT[runtime.js] -->|findElement| Anchor[Anchor Element]
        Anchor -->|applyNavigateSteps| Target[Target Element]
    end

    DESC -->|compiled by| Parser
    Emitter -->|.tomation.json| RT
```

**Data flow**:
1. `is.DIV.where(idIs('anchor')).navigate('parent,child[3]').as('Target')` → descriptor `{ tag: 'div', label: 'Target', where: { id: 'anchor' }, navigate: 'parent,child[3]' }`
2. Compiler parses → `{ ..., navigate: [{ step: 'parent' }, { step: 'child', index: 3 }] }`
3. Runtime receives JSON → finds `<div id="anchor">`, traverses to `.parentElement.children[2]`, uses result as action target.

## Components and Interfaces

### DSL Package (`packages/dsl/`)

**Modified: `ElementBuilder`**

```javascript
function ElementBuilder(tag) {
  this._tag = tag;
  this._where = {};
  this._childOf = undefined;
  this._navigate = undefined; // NEW
}

ElementBuilder.prototype.navigate = function (path) {
  this._navigate = path;
  return this; // chainable
};

ElementBuilder.prototype.as = function (label) {
  var descriptor = { tag: this._tag, label: label, where: this._where, __el: true };
  if (this._childOf !== undefined) {
    descriptor.childOf = this._childOf;
  }
  if (this._navigate !== undefined) {
    descriptor.navigate = this._navigate; // NEW
  }
  return descriptor;
};
```

**Modified: TypeScript definitions (`index.d.ts`)**

```typescript
export interface ElementBuilder {
  where(matcher: WhereMatcher): ElementBuilder;
  childOf(parent: ElementDescriptor): ElementBuilder;
  navigate(path: string): ElementBuilder; // NEW
  as(label: string): ElementDescriptor;
}

export interface ElementDescriptor {
  tag: string;
  label?: string;
  childOf?: string;
  where: WhereDescriptor;
  xpath?: string;
  navigate?: string; // NEW — raw path before compilation
  __el?: true;
}
```

### Compiler Package (`packages/compiler/src/`)

**New: Navigate path parser/validator (in `parser.js` or new `navigate-parser.js`)**

```typescript
interface NavigateStep {
  step: 'parent' | 'child' | 'firstChild' | 'lastChild' | 'nextSibling' | 'prevSibling' | 'sibling';
  index?: number; // present only for 'child' and 'sibling'
}

interface ParseNavigateResult {
  ok: true;
  steps: NavigateStep[];
} | {
  ok: false;
  error: string;
}

function parseNavigatePath(path: string): ParseNavigateResult;
function serializeNavigatePath(steps: NavigateStep[]): string;
```

**Token grammar**:
```
NavigatePath  = Step ("," Step)*
Step          = "parent" | "firstChild" | "lastChild" | "nextSibling" | "prevSibling"
              | "child[" Integer "]"
              | "sibling[" Integer "]"
Integer       = [1-9][0-9]* (range 1–9999)
```

**Modified: `extractElement` in `parser.js`**

The existing `extractElement` function will be extended to recognize `.navigate()` calls in the method chain (alongside `.where()` and `.childOf()`). When found, it stores the string argument in the element definition.

**Modified: Emitter / flattener**

The emitter already serializes `pageElements` as-is to JSON. The navigate field will be emitted as the parsed `NavigateStep[]` array rather than the raw string. This transformation happens during the compilation phase (after parsing, before emission).

### Extension Runtime (`packages/extension/src/runtime.js`)

**New: `applyNavigateSteps` function**

```javascript
/**
 * Apply a sequence of navigation steps starting from an anchor element.
 *
 * @param {Element} anchor - The resolved anchor DOM element
 * @param {Array<{step: string, index?: number}>} steps - Parsed navigate steps
 * @returns {{ok: boolean, element?: Element, error?: string}}
 */
function applyNavigateSteps(anchor, steps) {
  var current = anchor;
  for (var i = 0; i < steps.length; i++) {
    var s = steps[i];
    var next = null;
    switch (s.step) {
      case 'parent':      next = current.parentElement; break;
      case 'child':       next = current.children[s.index - 1]; break;
      case 'firstChild':  next = current.firstElementChild; break;
      case 'lastChild':   next = current.lastElementChild; break;
      case 'nextSibling': next = current.nextElementSibling; break;
      case 'prevSibling': next = current.previousElementSibling; break;
      case 'sibling':
        var parent = current.parentElement;
        if (!parent) {
          return { ok: false, error: 'Navigation failed at step ' + (i + 1) + ' (sibling[' + s.index + ']): no parent element' };
        }
        next = parent.children[s.index - 1];
        break;
    }
    if (!next) {
      var token = s.step + (s.index !== undefined ? '[' + s.index + ']' : '');
      return { ok: false, error: 'Navigation failed at step ' + (i + 1) + ' (' + token + '): element is null' };
    }
    current = next;
  }
  return { ok: true, element: current };
}
```

**Modified: `findElementWithParent`**

After resolving the anchor (with optional parent scoping via `childOf`), if the descriptor contains a `navigate` array, the function calls `applyNavigateSteps` on the resolved anchor and returns the final traversed element.

```javascript
function findElementWithParent(stepMessage) {
  var elementDescriptor = stepMessage.elementDescriptor;
  var parentDescriptor = stepMessage.parentDescriptor;
  var navigateSteps = elementDescriptor.navigate; // array or undefined

  // Resolve anchor element (with optional childOf parent scoping)
  var anchorPromise;
  if (parentDescriptor) {
    anchorPromise = findElement(parentDescriptor, document)
      .then(function (parentEl) {
        return findElement(elementDescriptor, parentEl);
      });
  } else {
    anchorPromise = findElement(elementDescriptor, document);
  }

  return anchorPromise
    .then(function (anchor) {
      if (!navigateSteps || navigateSteps.length === 0) {
        return { ok: true, element: anchor };
      }
      return applyNavigateSteps(anchor, navigateSteps);
    })
    .catch(function (err) {
      return { ok: false, error: err.message || 'Anchor element not found' };
    });
}
```

## Data Models

### DSL Descriptor (pre-compilation)

```json
{
  "tag": "div",
  "label": "Target Cell",
  "where": { "id": "table-header" },
  "childOf": "mainContainer",
  "navigate": "parent,child[2],firstChild",
  "__el": true
}
```

### Compiled JSON (`.tomation.json`)

```json
{
  "PageName__targetCell": {
    "tag": "div",
    "label": "Target Cell",
    "where": { "id": "table-header" },
    "childOf": "main-container",
    "navigate": [
      { "step": "parent" },
      { "step": "child", "index": 2 },
      { "step": "firstChild" }
    ]
  }
}
```

### Navigation Step Object Schema

| Field   | Type    | Required | Description                                      |
|---------|---------|----------|--------------------------------------------------|
| `step`  | string  | yes      | One of: `parent`, `child`, `firstChild`, `lastChild`, `nextSibling`, `prevSibling`, `sibling` |
| `index` | integer | no       | 1-based index for `child` and `sibling` steps only |

### Validation Error Structure

The compiler reports errors as structured messages integrated with the existing warning/error system:

```javascript
{
  message: 'Invalid navigate path: unrecognized token "invalidStep" at position 2',
  filePath: '/path/to/file.pom.ts',
  line: 12
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Navigate path round-trip

*For any* valid navigate path string (composed of comma-separated valid tokens with optional whitespace), parsing then serializing the path SHALL produce a string identical to the input after trimming whitespace from each token.

**Validates: Requirements 2.1, 2.5, 2.6, 3.7**

### Property 2: Navigate path compilation produces correctly shaped step array

*For any* valid navigate path string, the compiled output SHALL be an array where each element has a `step` string field matching the token name, and for `child[n]`/`sibling[n]` tokens, an `index` integer field equal to the parsed 1-based index value in [1, 9999].

**Validates: Requirements 2.3, 3.1, 3.2, 3.4, 3.5**

### Property 3: DSL builder last-navigate-wins and descriptor inclusion

*For any* sequence of `.navigate(path)` calls on the same ElementBuilder, the descriptor produced by `.as()` SHALL contain a `navigate` field equal to the last path string provided, and the builder SHALL return the same instance after each `.navigate()` call.

**Validates: Requirements 1.2, 1.4**

### Property 4: DOM traversal correctness

*For any* DOM tree and valid navigate path where each step has a valid target in the tree, applying the navigation steps sequentially from the anchor element SHALL arrive at the element reachable by the corresponding DOM API calls (`parentElement`, `children[n-1]`, `firstElementChild`, `lastElementChild`, `nextElementSibling`, `previousElementSibling`, `parentElement.children[n-1]`).

**Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.11**

### Property 5: Navigation failure reports step and position

*For any* navigate path where a step at 1-based position P results in a null element, the reported error message SHALL contain both the failing step token and the position P.

**Validates: Requirements 4.10**

### Property 6: Invalid index error reporting

*For any* index value that is not a positive integer in [1, 9999] (including zero, negative numbers, decimals, and non-numeric strings), parsing `child[value]` or `sibling[value]` SHALL produce a validation error.

**Validates: Requirements 5.2, 5.3**

### Property 7: Unrecognized token error with position

*For any* string that does not match a recognized navigation step token, when it appears at position P in a navigate path, the compiler SHALL report a validation error that contains both the invalid token string and position P.

**Validates: Requirements 2.4**

### Property 8: Empty/whitespace-only path error

*For any* string that after splitting by comma produces zero non-empty segments (including empty string, whitespace-only string, and comma-only strings), the compiler SHALL report a validation error indicating no valid steps.

**Validates: Requirements 5.1, 5.4**

## Error Handling

### Compile-Time Errors (Compiler)

| Condition | Error Message Pattern | Recovery |
|-----------|----------------------|----------|
| Empty navigate path | `"Invalid navigate path: path is empty"` | Compilation fails for this element |
| No valid steps after trimming | `"Invalid navigate path: contains no valid steps"` | Compilation fails for this element |
| Unrecognized token | `"Invalid navigate path: unrecognized token \"{token}\" at position {P}"` | Compilation fails for this element |
| Missing index in brackets | `"Invalid navigate path: index is required for \"{token}\" at position {P}"` | Compilation fails for this element |
| Non-integer index | `"Invalid navigate path: index must be an integer for \"{token}\" at position {P}"` | Compilation fails for this element |
| Index out of range (< 1) | `"Invalid navigate path: index must be >= 1 for \"{token}\" at position {P}"` | Compilation fails for this element |
| Index out of range (> 9999) | `"Invalid navigate path: index must be <= 9999 for \"{token}\" at position {P}"` | Compilation fails for this element |

All compile-time errors are reported through the existing warnings/errors array pattern used by `parser.js`. When a navigate path is invalid, the element is still included in the output without the navigate field, and the error is surfaced to the user.

### Runtime Errors (Extension)

| Condition | Error Message Pattern | Behavior |
|-----------|----------------------|----------|
| Anchor element not found (timeout) | `"Element not found: {tag} with conditions {where}"` | Step fails, standard error reporting to panel |
| Navigation step yields null | `"Navigation failed at step {P} ({token}): element is null"` | Step fails immediately, no further steps attempted |
| Sibling step with no parent | `"Navigation failed at step {P} (sibling[{n}]): no parent element"` | Step fails immediately |

Runtime errors integrate with the existing step failure flow — the background script receives a failure result and reports it to the panel UI with the error message.

## Testing Strategy

### Unit Tests (Example-Based)

**DSL package:**
- Verify `.navigate()` is chainable (returns builder)
- Verify all method ordering permutations work: `.where().navigate().as()`, `.navigate().where().as()`, `.childOf().navigate().as()`, etc.
- Verify descriptor omits `navigate` when not called
- Verify `.navigate()` overwrites previous value (concrete example)

**Compiler package:**
- Verify each recognized token parses correctly (one example per token)
- Verify empty brackets (`child[]`, `sibling[]`) produce specific error
- Verify empty string produces specific error
- Verify `childOf` + `navigate` coexist in output

**Extension runtime:**
- Integration test: anchor with navigate resolves correct final element
- Integration test: anchor not found → timeout error, no navigation attempted
- Integration test: `childOf` + `navigate` composition resolves correctly

### Property-Based Tests

Property-based testing is appropriate here because:
- The navigate path parser is a pure function with clear input/output behavior
- The input space is large (arbitrary combinations of tokens, indices, whitespace)
- Universal properties (round-trip, error reporting) hold across all valid/invalid inputs
- The DOM traversal function is deterministic given a tree structure

**Library:** `fast-check` (already used in the project based on `panel.property.test.js`)

**Configuration:** Minimum 100 iterations per property test.

Each property test will be tagged with:
```
// Feature: element-navigate-method, Property {N}: {property_text}
```

Properties 1–3 and 6–8 test the compiler's navigate path parser (pure function, ideal for PBT).
Properties 4–5 test the runtime traversal function (testable with generated DOM trees via JSDOM).

### Test File Locations

- `packages/dsl/index.test.js` — DSL builder unit tests (extend existing)
- `packages/compiler/src/navigate-parser.test.js` — Parser unit + property tests
- `packages/extension/src/runtime.test.js` — Runtime traversal unit + property tests (extend existing)
