import type { PageElement } from '@/types/spec';
import { resolveTargetLabel } from '@/logic/stepLabel';

/**
 * A single node in an element's resolution chain: the element itself, or one of
 * its `childOf` ancestors, resolved from the spec's `pageElements` map. Each
 * node carries enough to render it as an inspectable badge and to build a
 * highlight request for it.
 */
export interface ElementChainNode {
  /** The pageElements key for this node. */
  key: string;
  /** Human-readable label (from the descriptor's `label`, or a formatted key). */
  label: string;
  /** The resolved descriptor, or null when the key is missing from pageElements. */
  descriptor: PageElement | null;
  /** True when this is the target element itself (the first node), false for ancestors. */
  isSelf: boolean;
}

/**
 * The descriptor fields the runtime needs to highlight an element by its spec
 * definition (tag+where or xpath). Mirrors HoverHighlightDescriptorMessage['descriptor'].
 */
export interface HighlightDescriptor {
  tag?: string;
  where?: Record<string, string>;
  xpath?: string;
}

/**
 * Build the ordered resolution chain for an element key: the element itself
 * first, followed by each `childOf` ancestor walking up the spec's pageElements
 * map. Stops when there is no further `childOf`, when an ancestor key is missing
 * from pageElements, or when a cycle is detected (a key already visited), so the
 * result is always finite.
 *
 * The chain is ordered self → immediate parent → grandparent → ... Callers that
 * want a "path" ordering (root → ... → self) can reverse it.
 *
 * @param target the element key of the failing/inspected step
 * @param pageElements the spec's element map
 */
export function buildElementChain(
  target: string | undefined,
  pageElements?: Record<string, PageElement>,
): ElementChainNode[] {
  if (!target) return [];

  const chain: ElementChainNode[] = [];
  const seen = new Set<string>();
  let key: string | undefined = target;
  let isSelf = true;

  while (key && !seen.has(key)) {
    seen.add(key);
    const descriptor: PageElement | null = pageElements?.[key] ?? null;
    chain.push({
      key,
      label: resolveTargetLabel(key, pageElements),
      descriptor,
      isSelf,
    });
    isSelf = false;
    // Advance to the childOf parent, if any. A missing descriptor ends the chain.
    key = descriptor?.childOf;
  }

  return chain;
}

/**
 * Extract the highlight descriptor (tag+where or xpath) from a full PageElement.
 * Returns null when the descriptor is missing or carries no locator, so callers
 * can skip highlighting for un-highlightable nodes.
 */
export function toHighlightDescriptor(
  descriptor: PageElement | null,
): HighlightDescriptor | null {
  if (!descriptor) return null;
  if (descriptor.xpath) return { xpath: descriptor.xpath };
  if (descriptor.tag) return { tag: descriptor.tag, where: descriptor.where };
  return null;
}
