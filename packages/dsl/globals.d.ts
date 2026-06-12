// @tomation/dsl — ambient global function declarations
// These are injected into test .test.js files by the runner so they can call
// action helpers (e.g. click("btn")) without any explicit import.

/// <reference types="." />

import { Step } from "./index";

declare global {
  /** Clicks the element identified by the given key. */
  function click(target: string): Step;

  /** Types the given value into the element identified by the given key. */
  function type(target: string, value: string): Step;

  /** Types the given password value (masked in logs) into the identified element. */
  function typePassword(target: string, value: string): Step;

  /** Selects the given value in the identified select element. */
  function select(target: string, value: string): Step;

  /** Asserts that the identified element exists on the page. */
  function assertExists(target: string): Step;

  /** Asserts that the identified element does not exist on the page. */
  function assertNotExists(target: string): Step;

  /** Asserts that the identified element contains the given text. */
  function assertHasText(target: string, value: string): Step;

  /** Calls a reusable named task, optionally passing parameter values. */
  function task(name: string, params?: Record<string, string>): Step;

  /** Navigates the browser to the given URL. */
  function navigate(url: string): Step;

  /** Waits for the given number of milliseconds. */
  function wait(ms: number): Step;

  /** Waits for the identified element to appear or disappear. */
  function waitFor(target: string, gone: boolean): Step;

  /** Documents a manual step that a human must perform. */
  function manual(description: string): Step;
}
