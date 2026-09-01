/**
 * DSL documentation table.
 *
 * A small, static lookup mapping Tomation DSL symbol names — actions and
 * constructs, matcher factories, element-builder methods, the `is` proxy, and
 * a handful of ambient helpers — to short Markdown descriptions and argument
 * hints. The completion provider attaches these to completion items so a
 * suggestion carries its own docs (Req 8.7), and the hover provider surfaces
 * the same concise description when the pointer rests on a known symbol
 * (Req 9.1).
 *
 * Descriptions are paraphrased from the JSDoc in `@tomationjs/dsl`'s
 * `index.d.ts` and kept to a sentence or two of Markdown. The `signature`
 * field mirrors the `.d.ts` declaration so callers can show an argument hint
 * without parsing types.
 *
 * This is a pure data module plus a lookup helper: no runtime cost beyond a
 * frozen object literal and no dependency on the VS Code API, so it can be
 * shared freely between providers.
 *
 * Requirements: 8.7, 9.1.
 */

/** A single documentation entry for a DSL symbol. */
export interface DslDoc {
  /** Short Markdown description shown in hover and completion. */
  description: string;
  /** Optional signature / argument hint, e.g. `Click(element)`. */
  signature?: string;
}

/**
 * Static symbol → documentation map covering the DSL surface declared in
 * `@tomationjs/dsl`. Keys are the exact identifiers a user writes in a DSL
 * file (matcher factories and builder methods included).
 */
export const DSL_DOCS: Readonly<Record<string, DslDoc>> = Object.freeze({
  // --- Actions & constructs ---
  Click: {
    description: 'Click an element on the page.',
    signature: 'Click(element)',
  },
  Type: {
    description: 'Type text into an input. Chain `.in(element)` to target the field.',
    signature: 'Type(value).in(element)',
  },
  TypePassword: {
    description: 'Type a password into an input, masking the value in the execution log. Chain `.in(element)`.',
    signature: 'TypePassword(value).in(element)',
  },
  Select: {
    description: 'Choose an option in a select/dropdown. Chain `.in(element)` to target the control.',
    signature: 'Select(value).in(element)',
  },
  AssertExists: {
    description: 'Assert that an element is present on the page.',
    signature: 'AssertExists(element)',
  },
  AssertNotExists: {
    description: 'Assert that an element is absent from the page.',
    signature: 'AssertNotExists(element)',
  },
  AssertHasText: {
    description: 'Assert that an element contains the given text.',
    signature: 'AssertHasText(element, text)',
  },
  Navigate: {
    description: 'Navigate the browser to a URL.',
    signature: 'Navigate(url)',
  },
  Wait: {
    description: 'Pause execution for a fixed number of milliseconds.',
    signature: 'Wait(ms)',
  },
  WaitFor: {
    description: 'Wait until an element appears on the page.',
    signature: 'WaitFor(element)',
  },
  WaitForGone: {
    description: 'Wait until an element is removed from the page.',
    signature: 'WaitForGone(element)',
  },
  Manual: {
    description: 'Record a manual step with a description for the tester to perform.',
    signature: 'Manual(description)',
  },
  Upload: {
    description: 'Upload a file to a file input. Chain `.in(element)` to target the field.',
    signature: 'Upload(filePath).in(element)',
  },
  PressKey: {
    description: 'Press a key with optional modifiers (`alt`, `ctrl`, `meta`, `shift`).',
    signature: 'PressKey(key, options?)',
  },
  Press: {
    description: 'Press a key, optionally targeting an element via `.in(element)`.',
    signature: 'Press(key, options?).in(element)',
  },
  PressUp: {
    description: 'Press the Up arrow key.',
    signature: 'PressUp()',
  },
  PressDown: {
    description: 'Press the Down arrow key.',
    signature: 'PressDown()',
  },
  PressLeft: {
    description: 'Press the Left arrow key.',
    signature: 'PressLeft()',
  },
  PressRight: {
    description: 'Press the Right arrow key.',
    signature: 'PressRight()',
  },
  PressTab: {
    description: 'Press the Tab key.',
    signature: 'PressTab()',
  },
  PressEnter: {
    description: 'Press the Enter key.',
    signature: 'PressEnter()',
  },
  PressEsc: {
    description: 'Press the Escape key.',
    signature: 'PressEsc()',
  },
  PressSpace: {
    description: 'Press the Space key.',
    signature: 'PressSpace()',
  },
  SaveText: {
    description: 'Save an element\'s text into the context. Chain `.as(key)` to name it, then reference it via `ctx.key`.',
    signature: 'SaveText(element).as(key)',
  },
  SaveAttribute: {
    description: 'Save an element\'s attribute value into the context. Chain `.as(key)` to name it.',
    signature: 'SaveAttribute(element, attributeName).as(key)',
  },
  SaveValue: {
    description: 'Save a form control\'s value into the context. Chain `.as(key)` to name it.',
    signature: 'SaveValue(element).as(key)',
  },
  Save: {
    description: 'Save the result of an expression into the context. Chain `.as(key)` to name it.',
    signature: 'Save(expression).as(key)',
  },
  When: {
    description: 'Conditionally run a group of steps. The condition may reference a task param or a saved value (`ctx.key`); the decision appears as its own row in the log.',
    signature: 'When(condition, body)',
  },
  Test: {
    description: 'Declare a named test scenario containing a sequence of steps.',
    signature: 'Test(name, fn)',
  },
  Task: {
    description: 'Define a reusable task from a function. Callable to invoke from tests; chain `.as(label)` to set a display label.',
    signature: 'Task(fn)',
  },
  Automation: {
    description: 'Declare a parameterized automation with a typed params object.',
    signature: 'Automation(name, fn)',
  },
  Data: {
    description: 'Declare a reusable data template of static values and/or `Fake` generators, with typed property access. Pass `{ seed }` for reproducible values.',
    signature: 'Data(template, options?)',
  },
  Element: {
    description: 'Create an XPath-based element builder. Chain `.as(label)` to name it.',
    signature: 'Element(xpath)',
  },

  // --- Matcher factories ---
  innerTextIs: {
    description: 'Match an element whose inner text equals the given text exactly.',
    signature: 'innerTextIs(text)',
  },
  innerTextContains: {
    description: 'Match an element whose inner text contains the given substring.',
    signature: 'innerTextContains(text)',
  },
  classIncludes: {
    description: 'Match an element whose class list includes the given class name.',
    signature: 'classIncludes(cls)',
  },
  placeholderIs: {
    description: 'Match an element by its placeholder text.',
    signature: 'placeholderIs(placeholder)',
  },
  nameIs: {
    description: 'Match an element by its `name` attribute.',
    signature: 'nameIs(name)',
  },
  typeIs: {
    description: 'Match an element by its `type` attribute.',
    signature: 'typeIs(type)',
  },
  idIs: {
    description: 'Match an element by its `id` attribute.',
    signature: 'idIs(id)',
  },
  valueIs: {
    description: 'Match an element by its current value.',
    signature: 'valueIs(value)',
  },
  dataAttr: {
    description: 'Match an element by a `data-*` attribute name and value.',
    signature: 'dataAttr(name, value)',
  },
  ariaLabel: {
    description: 'Match an element by its `aria-label`.',
    signature: 'ariaLabel(value)',
  },
  roleIs: {
    description: 'Match an element by its ARIA role.',
    signature: 'roleIs(role)',
  },
  titleIs: {
    description: 'Match an element by its `title` attribute.',
    signature: 'titleIs(title)',
  },
  hrefContains: {
    description: 'Match a link whose `href` contains the given substring.',
    signature: 'hrefContains(value)',
  },
  isDisabled: {
    description: 'Match an element that is disabled.',
    signature: 'isDisabled()',
  },
  nthChild: {
    description: 'Match an element by its 1-based position among its siblings.',
    signature: 'nthChild(n)',
  },
  closestLabelIs: {
    description: 'Match an element by the text of its closest ancestor label of the given tag.',
    signature: 'closestLabelIs(tag, text)',
  },

  // --- Builder methods ---
  where: {
    description: 'Refine an element builder with a matcher (e.g. `innerTextIs(...)`).',
    signature: 'where(matcher)',
  },
  childOf: {
    description: 'Scope an element to be a descendant of the given parent element.',
    signature: 'childOf(parent)',
  },
  navigate: {
    description: 'Associate a navigation path with an element builder.',
    signature: 'navigate(path)',
  },
  as: {
    description: 'Finalize a builder with a display label, producing a named descriptor.',
    signature: 'as(label)',
  },

  // --- `is` proxy ---
  is: {
    description: 'Element factory proxy: `is.TAG` returns a builder for any uppercase HTML tag, and `is.ELEMENT(xpath)` builds an XPath-based element.',
  },
  ELEMENT: {
    description: 'Build an XPath-based element via the `is` proxy. Chain `.as(label)` to name it.',
    signature: 'is.ELEMENT(xpath)',
  },

  // --- Context & data helpers ---
  ctx: {
    description: 'Access values saved during execution via `SaveText`/`SaveAttribute`/`SaveValue`/`Save`. Use `ctx.key` as a value argument or inside a condition.',
  },
  Fake: {
    description: 'Generator object producing placeholder values (names, emails, dates, numbers, …) resolved to random data at runtime.',
  },

  // --- Date helpers ---
  today: {
    description: "Today's date, optionally formatted.",
    signature: 'today(format?)',
  },
  tomorrow: {
    description: "Tomorrow's date, optionally formatted.",
    signature: 'tomorrow(format?)',
  },
  yesterday: {
    description: "Yesterday's date, optionally formatted.",
    signature: 'yesterday(format?)',
  },
  nextWeek: {
    description: 'The date one week from today, optionally formatted.',
    signature: 'nextWeek(format?)',
  },
  lastWeek: {
    description: 'The date one week ago, optionally formatted.',
    signature: 'lastWeek(format?)',
  },
  nextMonth: {
    description: 'The date one month from today, optionally formatted.',
    signature: 'nextMonth(format?)',
  },
  lastMonth: {
    description: 'The date one month ago, optionally formatted.',
    signature: 'lastMonth(format?)',
  },
  firstDateOfMonth: {
    description: 'The first day of a month `offset` months from now, optionally formatted.',
    signature: 'firstDateOfMonth(offset, format?)',
  },
  lastDateOfMonth: {
    description: 'The last day of a month `offset` months from now, optionally formatted.',
    signature: 'lastDateOfMonth(offset, format?)',
  },
});

/**
 * Look up the documentation entry for a DSL symbol, or `undefined` when the
 * symbol is not part of the documented surface.
 */
export function lookupDoc(symbol: string): DslDoc | undefined {
  return DSL_DOCS[symbol];
}
