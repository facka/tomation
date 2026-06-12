// @tomation/dsl — TypeScript definitions

/**
 * Describes the criteria used to locate an element on the page.
 * At least one key should be provided (TypeScript cannot enforce this natively,
 * but providing none will result in an unresolvable element at runtime).
 */
export interface WhereDescriptor {
  id?: string;
  textIs?: string;
  textContains?: string;
  classIncludes?: string;
  placeholder?: string;
  name?: string;
  type?: string;
}

/**
 * Describes a single named element in a page's element map.
 */
export interface ElementDescriptor {
  tag: string;
  label?: string;
  childOf?: string;
  where: WhereDescriptor;
}

/**
 * A discriminated union covering all supported automation action types.
 */
export type Step =
  | { action: "click";           target: string }
  | { action: "type";            target: string; value: string }
  | { action: "typePassword";    target: string; value: string }
  | { action: "select";          target: string; value: string }
  | { action: "assertExists";    target: string }
  | { action: "assertNotExists"; target: string }
  | { action: "assertHasText";   target: string; value: string }
  | { action: "task";            name: string; params?: Record<string, string> }
  | { action: "navigate";        url: string }
  | { action: "wait";            ms: number }
  | { action: "waitFor";         target: string; gone: boolean }
  | { action: "manual";          description: string };

/**
 * Defines a reusable task — an ordered list of steps with optional parameter names.
 */
export interface TaskDefinition {
  params?: string[];
  steps: Step[];
}

/**
 * Defines a page — a named element map and optional task definitions.
 */
export interface PageDefinition {
  elements: Record<string, ElementDescriptor>;
  tasks?: Record<string, TaskDefinition>;
}

/**
 * Defines a Page Object Model.
 * @param name - The page name used for namespacing.
 * @param definition - The page definition containing elements and tasks.
 */
export declare function Page(
  name: string,
  definition: PageDefinition
): { __pom: true; name: string; definition: PageDefinition };

/**
 * Defines a reusable task.
 * @param steps - The ordered list of steps.
 */
export declare function Task(
  steps: Step[]
): { __task: true; steps: Step[] };

/**
 * Defines an element descriptor.
 * @param descriptor - The element descriptor object.
 */
export declare function el(
  descriptor: ElementDescriptor
): { __el: true } & ElementDescriptor;
