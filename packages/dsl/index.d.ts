// @tomationjs/dsl — TypeScript definitions

// --- Matcher / Where Types ---

/**
 * Describes the criteria used to locate an element on the page.
 */
export interface WhereDescriptor {
  id?: string;
  textIs?: string;
  textContains?: string;
  classIncludes?: string;
  placeholder?: string;
  name?: string;
  type?: string;
  value?: string;
  dataAttr?: { name: string; value: string };
  ariaLabel?: string;
  role?: string;
  title?: string;
  hrefContains?: string;
  isDisabled?: boolean;
  nthChild?: number;
  closestLabel?: { tag: string; text: string };
}

/**
 * Union of all matcher factory return types.
 */
export type WhereMatcher =
  | { textIs: string }
  | { textContains: string }
  | { classIncludes: string }
  | { placeholder: string }
  | { name: string }
  | { type: string }
  | { id: string }
  | { value: string }
  | { dataAttr: { name: string; value: string } }
  | { ariaLabel: string }
  | { role: string }
  | { title: string }
  | { hrefContains: string }
  | { isDisabled: true }
  | { nthChild: number }
  | { closestLabel: { tag: string; text: string } };

// --- Element Descriptors ---

/**
 * Describes a single named element in the spec output.
 */
export interface ElementDescriptor {
  tag: string;
  label?: string;
  childOf?: string;
  where: WhereDescriptor;
  xpath?: string;
  __el?: true;
}

// --- Element Builders ---

/**
 * Builder chain returned by `is.TAG` access.
 * Supports .where(matcher), .childOf(parent), .as(label) chaining.
 */
export interface ElementBuilder {
  where(matcher: WhereMatcher): ElementBuilder;
  childOf(parent: ElementDescriptor): ElementBuilder;
  as(label: string): ElementDescriptor;
}

/**
 * Builder for XPath-based elements — returned by Element() or is.ELEMENT().
 * Supports only .as(label).
 */
export interface XPathElementBuilder {
  as(label: string): ElementDescriptor;
}

// --- Step Types ---

export interface PressKeyOptions {
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

/**
 * A discriminated union covering all supported automation action types.
 */
export type Step =
  | { action: "click"; target: string }
  | { action: "type"; target: string; value: string }
  | { action: "typePassword"; target: string; value: string }
  | { action: "select"; target: string; value: string }
  | { action: "assertExists"; target: string }
  | { action: "assertNotExists"; target: string }
  | { action: "assertHasText"; target: string; value: string }
  | { action: "task"; name: string; params?: Record<string, string> }
  | { action: "navigate"; url: string }
  | { action: "wait"; ms: number }
  | { action: "waitFor"; target: string; gone: boolean }
  | { action: "manual"; description: string }
  | { action: "upload"; target: string; value: string }
  | { action: "pressKey"; key: string; target?: string; options?: PressKeyOptions };

// --- Matcher Factories ---

export declare function innerTextIs(text: string): { textIs: string };
export declare function innerTextContains(text: string): { textContains: string };
export declare function classIncludes(cls: string): { classIncludes: string };
export declare function placeholderIs(ph: string): { placeholder: string };
export declare function nameIs(name: string): { name: string };
export declare function typeIs(type: string): { type: string };
export declare function idIs(id: string): { id: string };
export declare function valueIs(val: string): { value: string };
export declare function dataAttr(name: string, val: string): { dataAttr: { name: string; value: string } };
export declare function ariaLabel(val: string): { ariaLabel: string };
export declare function roleIs(val: string): { role: string };
export declare function titleIs(val: string): { title: string };
export declare function hrefContains(val: string): { hrefContains: string };
export declare function isDisabled(): { isDisabled: true };
export declare function nthChild(n: number): { nthChild: number };
export declare function closestLabelIs(tag: string, text: string): { closestLabel: { tag: string; text: string } };

// --- XPath Element Constructor ---

/**
 * Creates an XPath-based element builder.
 * @param xpath - The XPath expression used to locate the element.
 */
export declare function Element(xpath: string): XPathElementBuilder;

// --- `is` Proxy ---

/**
 * The `is` proxy provides an ElementBuilder for every uppercase HTML tag name,
 * plus an `ELEMENT` method for XPath-based element construction.
 */
export declare const is: {
  [TAG in keyof HTMLElementTagNameMap as Uppercase<TAG>]: ElementBuilder;
} & {
  ELEMENT: (xpath: string) => XPathElementBuilder;
};

// --- Task, Test, and Automation ---

/**
 * A task builder returned by Task(fn).
 * Callable (for invoking the task from tests) and has .as() for setting a display label.
 */
interface TaskBuilder<P = void> {
  __task: true;
  fn: P extends void ? () => void : (params: P) => void;
  as(label: string): TaskDescriptor<P>;
  (params: P): void;
}

/**
 * A task with a display label (returned by .as()).
 * Callable for invoking the task from tests.
 */
interface TaskDescriptor<P = void> {
  __task: true;
  fn: P extends void ? () => void : (params: P) => void;
  label: string;
  (params: P): void;
}

// Task with no params
export declare function Task(fn: () => void): TaskBuilder<void> & (() => void);
// Task with typed params
export declare function Task<P>(fn: (params: P) => void): TaskBuilder<P> & ((params: P) => void);

/**
 * Declares a named test scenario.
 * @param name - The test name.
 * @param fn - The test function containing steps.
 */
export declare function Test(
  name: string,
  fn: () => void
): { __test: true; name: string; fn: () => void };

// --- Automation ---

/**
 * Constrains Automation param values to supported scalar types.
 */
type AutomationParamValue = string | number | Date;

/**
 * Builder returned by Automation(fn) — chain .as(label) to finalize.
 */
export interface AutomationBuilder<P extends Record<string, AutomationParamValue>> {
  __automation: true;
  fn: (params: P) => void;
  as(label: string): AutomationDescriptor<P>;
}

/**
 * Finalized Automation descriptor returned by .as(label).
 */
export interface AutomationDescriptor<P extends Record<string, AutomationParamValue>> {
  __automation: true;
  fn: (params: P) => void;
  label: string;
}

/**
 * Declares a parameterized Automation.
 * @param fn - The automation function with a typed params object.
 */
export declare function Automation<P extends Record<string, AutomationParamValue>>(
  fn: (params: P) => void
): AutomationBuilder<P>;

// --- Action Stubs ---

export declare function Click(element: ElementDescriptor): any;
export declare function Type(value: string): { in(element: ElementDescriptor): any };
export declare function TypePassword(value: string): { in(element: ElementDescriptor): any };
export declare function Select(value: string): { in(element: ElementDescriptor): any };
export declare function AssertExists(element: ElementDescriptor): any;
export declare function AssertNotExists(element: ElementDescriptor): any;
export declare function AssertHasText(element: ElementDescriptor, text: string): any;
export declare function Navigate(url: string): any;
export declare function Wait(ms: number): any;
export declare function WaitFor(element: ElementDescriptor): any;
export declare function WaitForGone(element: ElementDescriptor): any;
export declare function Manual(description: string): any;

// --- File Upload ---

export declare function Upload(filePath: string): { in(element: ElementDescriptor): any };

// --- Keyboard Actions ---

/**
 * Press a specific key with optional modifiers.
 * @param key - The key to press (e.g., 'a', 'Enter', 'Tab')
 * @param options - Modifier keys: { alt, ctrl, meta, shift }
 */
export declare function PressKey(key: string, options?: PressKeyOptions): any;

/**
 * Press a key, optionally targeting a specific element.
 * @param key - The key to press
 * @param options - Modifier keys: { alt, ctrl, meta, shift }
 */
export declare function Press(key: string, options?: PressKeyOptions): { in(element: ElementDescriptor): any };

// Shortcut press functions
export declare function PressUp(): any;
export declare function PressDown(): any;
export declare function PressLeft(): any;
export declare function PressRight(): any;
export declare function PressTab(): any;
export declare function PressEnter(): any;
export declare function PressEsc(): any;
export declare function PressSpace(): any;

// --- Save Action Builder ---

/**
 * Builder returned by SaveText/SaveAttribute/SaveValue/Save.
 * Use .as(keyName) to assign the saved value to a context key.
 */
export interface SaveBuilder {
  as(keyName: string): any;
}

// --- Save Actions ---

export declare function SaveText(element: any): SaveBuilder;
export declare function SaveAttribute(element: any, attributeName: string): SaveBuilder;
export declare function SaveValue(element: any): SaveBuilder;
export declare function Save(expression: any): SaveBuilder;

// --- Date Helper Functions ---

export declare function today(format?: string): string;
export declare function tomorrow(format?: string): string;
export declare function yesterday(format?: string): string;
export declare function nextWeek(format?: string): string;
export declare function lastWeek(format?: string): string;
export declare function nextMonth(format?: string): string;
export declare function lastMonth(format?: string): string;
export declare function firstDateOfMonth(offset: number, format?: string): string;
export declare function lastDateOfMonth(offset: number, format?: string): string;
