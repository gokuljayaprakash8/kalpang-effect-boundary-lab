# Semantic-to-Effect Integrity

## Research question

What failure is KALPANG/SVP trying to address beyond deciding whether a canonical request is authorized or recording that a request crossed an execution path?

**SUPPORTED INFERENCE:** It addresses the gap between an explicitly expected consequential effect and the state that follows execution: an authorized action can be changed before a controlled boundary, or a correctly presented request can still be followed by a different materialized state. The system should compare those stages and preserve `INDETERMINATE` when the effect cannot be established.

## Verified baseline

**CHECKED-IN BASELINE EVIDENCE — commit `05d742bd0c611da5acc723e7b1d73d2080065dc4`:**

- Request binding covers the canonical tool, repository, issue, and body; materially changed request fields fail authorization. See [github-comment.test.js](../test/github-comment.test.js) and [github-comment-binding.js](../src/github-comment-binding.js).
- A downstream mutation can be rejected by the tested final-boundary revalidation before the local sink. The comparison test also preserves the earlier unguarded result where the substituted body reaches the sink. See [github-comment.test.js](../test/github-comment.test.js) and [github-comparison-runner.test.js](../test/github-comparison-runner.test.js).
- Checked-in live GitHub evidence records an in-bounds comment, a body-substituted comment reconciled as `DIVERGENT`, and a successful execution whose unavailable post-execution observation is `INDETERMINATE`. The live observer is a separate REST path, but shares the host and credential trust domain. See the [live execution](../artifacts/github-live-2026-09-27/mcp-execution.json), [body-substitution reconciliation](../artifacts/github-body-substitution-2026-09-27/reconciliation.json), and [observer-unavailable reconciliation](../artifacts/github-observer-unavailable-2026-09-27/reconciliation.json).
- A final-conduit-valid request followed by a wrong-issue provider effect is a **SYNTHETIC** test-only provider fault, not a real GitHub/provider fault. Its local state observer is not a separate trust domain. See the provider-materialization test in [github-comment.test.js](../test/github-comment.test.js).

**RESEARCH-BRANCH EVIDENCE:** Temporal and hidden-intent fixtures and notes are on the research branch. The temporal test uses local state and a test-defined T1 expectation. The hidden-intent tests use explicit fixture oracles and test-only predicates; they do not add production behavior. The semantic-admission and temporal research notes are uncommitted branch files at synthesis time.

**EXTERNAL INPUT:** The conversation supplied an independent blind-model A/B result distinguishing public-comment intent from private-draft-only intent. No model transcript, configuration, or reproducible invocation is checked into the repository. This output is evidence about that supplied run, not ground truth about either intent or model reliability.

## Semantic analytical model

The Tolkāppiyam study supplied semantic/contextual distinctions that were translated into modern adversarial-test dimensions. They are analytical prompts, not historical security mechanisms.

- **Form — UNTESTED:** syntax or paraphrase changes while intended effect is held fixed.
- **Context — OBSERVED / SYNTHETIC:** resource identity is bound; temporal and provider-state cases use local state fixtures.
- **Convention — UNTESTED:** shared usage conventions may affect meaning.
- **Role — UNTESTED:** actor or delegation may affect authority.
- **Temporal state — SYNTHETIC:** T1 `issue=open` versus T2 `issue=closed` was represented by an explicit fixture precondition.
- **Hidden/implicit meaning — EXTERNAL INPUT / SYNTHETIC:** the supplied blind-model result differs by intent; repository fixtures compare explicit intent oracles to the same request/effect.
- **Inference — UNTESTED:** the relation between an instruction and an inferred action was not tested with a real agent workflow.
- **Classification — UNTESTED:** no separate semantic category change was tested.
- **Ambiguity — UNTESTED:** no ambiguous instruction was tested.
- **Environment/effect — OBSERVED / SYNTHETIC:** live effects were observed in the baseline; wrong-issue provider materialization was simulated locally.

## Final layered architecture

```text
USER / AGENT INTENT
        |
        v
SEMANTIC EXPECTATION                 upstream prerequisite
        |
        v
APPROVED CANONICAL ACTION            upstream result
        |
        v
ADMISSION INTEGRITY                  KALPANG/SVP integrity layer
        |
        v
EXECUTION / CONDUIT INTEGRITY        KALPANG/SVP integrity layer
        |
        v
ACTUAL EXTERNAL EFFECT
        |
        v
OBSERVATION / RECONCILIATION         KALPANG/SVP integrity layer
        |
        +--> IN-BOUNDS
        +--> DIVERGENT
        +--> INDETERMINATE
```

Intent resolution is not a fourth integrity layer. It supplies an explicit expected effect before admission; the verified integrity questions remain admission, execution/conduit, and observed effect.

## Evidence matrix

| Failure/question | Admission | Execution/conduit | External effect | Result |
|---|---|---|---|---|
| Target substitution | **OBSERVED:** Changed repository/issue request fields fail the request binding. | **OBSERVED:** Final validation can preserve the approved target. | **OBSERVED / SYNTHETIC:** Wrong-issue materialization is detected by local full-state reconciliation; the existing issue-scoped observer returns `INDETERMINATE`. | Existing admission and effect layers represent it; no fourth property. |
| Downstream mutation | **OBSERVED:** Original request is admitted. | **OBSERVED:** Test-only final revalidation rejects the changed request before the sink; without that check the mutated body reaches the sink. | **SYNTHETIC:** The local sink/observer can report divergence or no effect. | Execution/conduit integrity. |
| Provider materialization divergence | **OBSERVED:** Exact approved request is admitted. | **OBSERVED / SYNTHETIC:** Final check accepts the unchanged request; simulator reports success. | **SYNTHETIC:** Local state observer sees issue 2 instead of approved issue 1 and reports `DIVERGENT`. | External-effect reconciliation. |
| Observer unavailable | **OBSERVED:** Request was authorized. | **OBSERVED:** Execution succeeded. | **OBSERVED:** Post-execution observation is unavailable; result is `INDETERMINATE`. | Observation availability preserves uncertainty. |
| Temporal drift | **SYNTHETIC:** Explicit T1 state precondition can refuse at admission; if omitted, request-only admission accepts. | **SYNTHETIC:** Unchanged request passes final validation and executes. | **SYNTHETIC:** Comment-only observer says `IN-BOUNDS`; state-aware local comparison against T1 expectation says `DIVERGENT`. | Refinement of admission/effect expectations; no fourth property. |
| Hidden-intent mismatch | **OBSERVED / SYNTHETIC:** Request-only binding allows the same valid request under either intent; a test-only intent predicate denies the private-only mismatch. The separate blind-model result is **EXTERNAL INPUT**. | **OBSERVED / SYNTHETIC:** The wrong mapping would pass request integrity because its request is unchanged; the rejection predicate runs before execution. | **SYNTHETIC:** Same request yields same local public comment; comparison to Intent B's explicit expectation is `DIVERGENT`. | Upstream semantic admission refinement; not a fourth integrity property. |

## What the experiments established

- **OBSERVED:** The canonical request binding distinguishes materially different request parameters, not different upstream meanings that collapse to identical request bytes.
- **OBSERVED / SYNTHETIC:** Final-boundary revalidation can reject the tested post-admission mutation before the sink.
- **SYNTHETIC:** Matching request and conduit records do not ensure matching provider state in the wrong-issue simulator; a state-reading path detects the difference.
- **OBSERVED:** Unavailable post-execution observation remains `INDETERMINATE`, not evidence of conformity or divergence.
- **SYNTHETIC:** A declared and checked temporal precondition can be refused at admission. If state is omitted from the binding, request execution can be `IN-BOUNDS` while state-aware reconciliation against the explicit T1 expectation is `DIVERGENT`.
- **SUPPORTED INFERENCE:** The same canonical action may not satisfy two different intent expectations. A test-only predicate can place this mismatch upstream of admission; the test does not show that current production code resolves intent.

Focused test results already obtained on this branch/history: `node --test test/github-comparison-runner.test.js` (**4 passed**); `node --test test/github-comment.test.js` (**10 passed**); `node --test test/temporal-context.test.js` (**1 passed**); `node --test test/hidden-intent.test.js` (**1 passed**); `node --test test/hidden-intent-rejection.test.js` (**1 passed**). These tests were not rerun for this synthesis.

## Upstream semantic admission refinement

**SUPPORTED INFERENCE:** Before a consequential canonical action is eligible for admission, an explicit resolved semantic expectation should specify the permitted operation/effect and material context or constraints. The emitted action must satisfy that expectation; unresolved or conflicting intent should be refused or clarified. This refines admission inputs rather than adding an integrity layer. The current baseline validates the canonical request binding and does not implement this intent-to-action step.

## Semantic-to-Effect Integrity definition

**SUPPORTED INFERENCE:** Semantic-to-Effect Integrity is the relation between (1) an explicit expected consequential effect, including its material operation, target, content, visibility, authority, and relevant preconditions; (2) the canonical action approved as a permitted realization of that expectation; (3) the request that crosses the controlled execution boundary; and (4) the state established by observation afterward. The assessment checks whether the executed request remains bound to the approved action and whether observed state satisfies the stated expectation, classifying a match as `IN-BOUNDS`, an established mismatch as `DIVERGENT`, and an unestablished effect as `INDETERMINATE`.

This is a vendor- and implementation-neutral definition of the research relation, not a claim that every component is implemented or that every observation is independently trusted.

## What SVP/KALPANG does not claim

It does not inherently determine whether a human's intention or an organization's policy is correct; whether an LLM interpreted every instruction correctly; whether a provider is honest or bug-free; or whether identity compromise, prompt injection, ambiguity, or authorization vulnerabilities are eliminated. It is not a universal guarantee, proof of execution, or replacement for existing security controls. The model and provider behavior are not universally validated.

When an explicit expected effect exists, the architecture can bind the approved action, enforce the tested execution boundary, compare observed state with the expectation, classify divergence, and preserve uncertainty when observation is unavailable. The synthetic and local evidence does not establish these as universal production guarantees.

## Why this is not merely authorization

Admission answers whether the proposed canonical action matches the authorization binding. The synthetic provider case holds that request and final-boundary check constant while materializing a different target. External-effect reconciliation asks a different question: whether the resulting state corresponds to the expected semantic effect. This comparison is not unique to SVP.

## Why this is not merely audit logging

A record that request X was authorized or sent describes the control path; by itself it does not establish which state materialized. Reconciliation compares an explicit expected effect with an observed state and can therefore identify a mismatch or return `INDETERMINATE`. A sufficiently trustworthy audit or state-observation system could perform the same comparison; uniqueness is not established.

## Bounded role of Tolkāppiyam

The study supplied semantic/contextual distinctions that were translated into modern analytical dimensions and used to generate adversarial cases:

```text
semantic distinction -> modern adversarial case -> architecture challenge -> evidence
```

This is a methodological role only. The research does not establish that Tolkāppiyam anticipated AI, security, authorization, or modern computing.

## Falsification result

**OBSERVED / SUPPORTED INFERENCE:** Target substitution, downstream mutation, synthetic provider divergence, observer unavailability, temporal state drift, and hidden-intent mismatch were all expressible as admission refusal, execution/conduit divergence or rejection, external-effect `DIVERGENT`, or observation `INDETERMINATE`, with hidden intent requiring an upstream semantic expectation. No demonstrated case forced a fourth integrity layer. Ordinary authorization and conduit checking alone do not identify the full expected-action-to-observed-state relation; ordinary reconciliation/audit mechanisms can implement that comparison, so no unique mechanism is established.

## Final research conclusion

**BASELINE REFINED.** The three verified KALPANG integrity layers remain the architecture. The research adds an upstream semantic prerequisite—an explicit expectation that permits the canonical action—and clarifies that externally observable semantic-effect reconciliation is a distinct assurance question from admission and conduit integrity. The cases show how the existing layers can represent the tested failures when the relevant expected effect is specified; they do not establish complete semantic coverage.

## Open empirical boundary

**UNTESTED:** Demonstrate the full chain against a real external provider while obtaining an observation from a genuinely independent trust domain.
