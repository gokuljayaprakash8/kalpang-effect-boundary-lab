# Semantic Admission Boundary

## Problem

Two different upstream instructions can produce the same canonical request. The request alone records the proposed action, but not whether that action satisfies the user's intended meaning or constraints.

## Evidence

In the hidden-intent fixture, Intent A requests a public comment on issue 1; Intent B requests a private draft only and forbids posting. Both use byte-identical canonical `add_issue_comment` requests and the same authorization digest. Request-only admission, final-conduit validation, and local observation are identical for both; comparing the observed effect to each independently supplied intent expectation yields `IN-BOUNDS` for A and `DIVERGENT` for B. A test-only intent predicate allows A and denies B.

## Acceptance criterion

**SUPPORTED INFERENCE:** A canonical action is eligible for authorization only when an explicit, resolved semantic expectation uniquely permits its effect under the relevant context and authority. The approved expectation must preserve all material constraints, including operation, target resource, content, and visibility or non-publication requirements. If intent is unresolved, conflicting, or the proposed action violates a constraint, do not authorize the consequential action; refuse or request clarification rather than silently selecting an interpretation.

Applied to the fixture, the expectation for Intent A permits posting the exact body publicly to the specified repository's issue 1. Intent B permits a private draft and explicitly forbids that public comment, so the identical emitted request is ineligible under Intent B.

## Architecture boundary

This is an upstream semantic prerequisite/refinement, not a fourth integrity property:

```text
intent -> approved action -> execution boundary -> observed effect
```

An admission layer can consume the resolved expectation as an additional predicate before authorizing the canonical request. The fixture's test-only predicate demonstrates this representation; the current KALPANG admission implementation binds and validates the request digest and does not itself resolve upstream intent.

## What this does NOT claim

This does not claim that real LLM agents satisfy the criterion, that Tolkappiyam proves it, or that SVP already implements it. It does not solve ambiguity universally. The fixture is local and synthetic; it does not establish an independent trust domain or a real provider behavior.

## Open validation question

Can a real agent or authorization workflow reliably produce and evaluate this explicit intent-to-action expectation before admission, especially when the instruction is ambiguous or its material constraints are implicit?
