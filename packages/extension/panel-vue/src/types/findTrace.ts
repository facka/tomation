/** A single where-matcher outcome on the Near_Miss_Candidate. */
export interface WhereBreakdownEntry {
  key: string;                 // e.g. 'textIs', 'classIncludes'
  expected: string;            // descriptor value, truncated to 256 chars
  actual: string | null;       // observed value, whitespace-preserved for text*, truncated 256; null = unavailable
  actualUnavailable?: boolean; // true when the actual value could not be observed (Req 2.7)
  passed: boolean;
}

export interface ClosestLabelStrategyOutcome {
  name: 'boundedSubtree' | 'forAttr' | 'ancestorWalk' | 'ariaLabelledby';
  outcome: 'matched' | 'not-matched';
}

export interface ClosestLabelTrace {
  labelTag: string;
  labelText: string | null;    // truncated 256; null when absent (Req 5.3)
  labelTextAbsent?: boolean;
  bounded: boolean;            // true = search bounded to parent subtree (Req 5.4)
  strategies: ClosestLabelStrategyOutcome[];
}

export interface NavigateTrace {
  anchorResolved: boolean;         // Req 6.3, 6.4
  failedHopIndex?: number;         // zero-based index of first failing hop (Req 6.1, 6.2)
  failedHopType?: string;          // e.g. 'child', 'nextSibling' (Req 6.2)
  hopCount?: number;
}

export interface ParentTrace {
  resolved: boolean;               // Req 4.1
  descriptorId?: string;           // identifier from the parent descriptor when not resolved (Req 4.2)
  identifier?: string;             // getElementXPath of resolved parent (Req 4.4)
  matchCount?: number;             // number of parent matches (Req 4.5)
  scopedToParent?: boolean;        // child search was scoped to parent subtree (Req 4.3)
}

export interface XPathTrace {
  expression: string;                                   // Req 7.1, 7.5
  outcome: 'one' | 'many' | 'none' | 'invalid';         // Req 7.2, 7.3, 7.4, 7.5
  matchedNodeCount?: number;                            // Req 7.3
  invalid?: boolean;                                    // Req 7.5
  elapsedMs: number;                                    // Req 7.2, 7.4
  configuredWaitMs: number;                             // Req 7.4
}

/** An ordered resolution step the finder performed (Req 1.4, 1.7). */
export interface FindTraceStep {
  strategy: string;                       // e.g. 'resolve-parent', 'query-tag', 'match-where', 'navigate', 'xpath'
  outcome: 'matched' | 'not-matched';
}

export interface FindTrace {
  scope: 'whole-document' | 'parent-scoped';   // Req 1.3
  action: string;                              // step action the trace was produced for (Req 11.3)
  error: string;                               // preserved human-readable error string (Req 1.6)
  steps: FindTraceStep[];                      // ordered strategies + outcomes; may be empty (Req 1.4, 1.7)

  // tag+where strategy (Req 2)
  tag?: string;
  candidateCount?: number;                     // Req 2.1, 2.2
  whereBreakdown?: WhereBreakdownEntry[];      // Near_Miss_Candidate per-matcher breakdown (Req 2.3–2.7)

  // absence classification (Req 3)
  absence?: 'absent-full-window' | 'present-unmatched' | 'appeared-after-timeout';   // (Req 3.1, 3.2, 3.3, 3.6)
  finalFrameCandidateCount?: number;           // Req 3.2
  elapsedMs?: number;                          // 0..5000 (Req 3.5)

  // childOf (Req 4)
  parent?: ParentTrace;

  // closestLabel (Req 5)
  closestLabel?: ClosestLabelTrace;

  // navigate (Req 6)
  navigate?: NavigateTrace;

  // xpath (Req 7)
  xpath?: XPathTrace;
}
