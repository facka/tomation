// @tomation/dsl — ambient global declarations
// These are injected into .test.ts / .pom.ts files by the runner so authors
// can use the DSL without explicit imports.

/// <reference types="." />

import {
  Step,
  ElementDescriptor,
  ElementBuilder,
  XPathElementBuilder,
  WhereMatcher,
} from "./index";

declare global {

  // --- Action globals ---

  /** Clicks the given element descriptor. */
  function Click(element: ElementDescriptor): any;

  /** Types a value into the given element. Usage: Type('value').in(element) */
  function Type(value: string): { in(element: ElementDescriptor): any };

  /** Types a password (masked) into the given element. Usage: TypePassword('value').in(element) */
  function TypePassword(value: string): { in(element: ElementDescriptor): any };

  /** Selects a value in the given element. Usage: Select('value').in(element) */
  function Select(value: string): { in(element: ElementDescriptor): any };

  /** Asserts the given element exists on the page. */
  function AssertExists(element: ElementDescriptor): any;

  /** Asserts the given element does not exist on the page. */
  function AssertNotExists(element: ElementDescriptor): any;

  /** Asserts the given element contains the specified text. */
  function AssertHasText(element: ElementDescriptor, text: string): any;

  /** Navigates the browser to the given URL. */
  function Navigate(url: string): any;

  /** Waits for the given number of milliseconds. */
  function Wait(ms: number): any;

  /** Waits for the given element to appear on the page. */
  function WaitFor(element: ElementDescriptor): any;

  /** Waits for the given element to disappear from the page. */
  function WaitForGone(element: ElementDescriptor): any;

  /** Documents a manual step that a human must perform. */
  function Manual(description: string): any;

  // --- Element builders ---

  /**
   * Creates an XPath-based element builder.
   * @param xpath - The XPath expression used to locate the element.
   */
  function Element(xpath: string): XPathElementBuilder;

  /**
   * The `is` proxy — provides an ElementBuilder for every uppercase HTML tag name,
   * plus ELEMENT() for XPath-based elements.
   */
  const is: {
    [TAG in keyof HTMLElementTagNameMap as Uppercase<TAG>]: ElementBuilder;
  } & {
    ELEMENT: (xpath: string) => XPathElementBuilder;
  };

  // --- Matcher factories ---

  function innerTextIs(text: string): { textIs: string };
  function innerTextContains(text: string): { textContains: string };
  function classIncludes(cls: string): { classIncludes: string };
  function placeholderIs(ph: string): { placeholder: string };
  function nameIs(name: string): { name: string };
  function typeIs(type: string): { type: string };
  function idIs(id: string): { id: string };

  // --- Task and Test ---

  /**
   * Declares a named, reusable task with optional parameters.
   */
  function Task(
    name: string,
    fn: (params: any) => void
  ): { __task: true; name: string; fn: (params: any) => void };

  /**
   * Declares a named test scenario.
   */
  function Test(
    name: string,
    fn: () => void
  ): { __test: true; name: string; fn: () => void };
}
