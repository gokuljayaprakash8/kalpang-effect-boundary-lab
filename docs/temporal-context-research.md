# Temporal and Semantic Context Research

Baseline: `05d742bd0c611da5acc723e7b1d73d2080065dc4`. Temporal experiment commit: `ad230faf7accea6ce0e1323646113d65dfb91058` on `research/temporal-state-context`.

The semantic labels below are modern analytical abstractions for adversarial testing. They are not claims that Tolkappiyam anticipated authorization, AI, or security systems.

## Demonstrated Cases

| Case | Semantic alteration | Admission | Execution/conduit | Observed effect | Existing layer | Property status | Epistemic status |
|---|---|---|---|---|---|---|---|
| Resource/target substitution | Change the requested repository or issue, or materialize the approved action at another issue. | Changed request target fails the request binding. | A matching final request can still be accepted by the synthetic provider. | The wrong-issue materialization is `DIVERGENT`. | Admission for changed request fields; external-effect reconciliation for provider-side target drift. | Refines existing layers; no new property demonstrated. | `OBSERVED`; provider misrouting is `SYNTHETIC`. |
| Provider materialization context | Keep the approved request and final request identical; simulator applies it to issue 2 instead of issue 1. | `ALLOW`; request digest matches. | Final validation and execution are `IN-BOUNDS`; simulator reports success. | Local full-state observer reports `DIVERGENT`; the issue-scoped observer reports `INDETERMINATE`. | External-effect reconciliation. | Refines the expected-effect comparison; no new property demonstrated. | `OBSERVED`, `SYNTHETIC`. |
| Temporal state context | At T1 the semantic expectation is `issue=open`; change only the local issue state to `closed` before T2. | If the T1 precondition is checked at admission: `REFUSED`. If omitted from request binding/admission: `ADMITTED`. | Refused case does not execute. Unbound case passes final validation and executes the unchanged request (`IN-BOUNDS`). | No effect in refused case (`INDETERMINATE`). In the unbound case, the existing comment observer reports `IN-BOUNDS`, while the state-aware local observer reports `DIVERGENT` against the explicit T1 expectation. | Admission when the precondition is checked; otherwise external-effect reconciliation when the expectation and relevant state are observed. | Refines admission/effect semantics; no new property demonstrated. | `OBSERVED`; state change and observer are `SYNTHETIC`. |

## Provisional Matrix

| Semantic challenge | Admission | Execution/conduit | External-effect reconciliation | New property? |
|---|---|---|---|---|
| Target/resource context | Changed repository or issue is rejected by the canonical request binding. | Final validation can preserve the bound target, but cannot constrain provider remapping. | A wrong materialized target is `DIVERGENT` when observed. | No |
| Provider materialization context | Admission remains valid for the approved request. | Final conduit accepts the exact approved request. | State observation exposes the simulator's wrong-issue result. | No |
| Temporal state context | A checked T1 precondition can refuse at T2; an unbound state change passes request-only admission. | Request digest still matches, so execution is `IN-BOUNDS` despite state drift. | A state-aware observer compares T2 state with the declared T1 effect and reports `DIVERGENT`; the current comment-only observer does not see this condition. | No |

## Provisional Conclusion

The tested context and temporal distinctions do not yet force a fourth integrity property. They instead show that semantic context can affect both authorization and the meaning of the observed effect, while the existing three-layer architecture can represent those failures when the relevant semantic expectation is explicitly specified.

This is not complete semantic coverage. The temporal test is local: its admission precondition check and state observer are test fixtures, not new production behavior. No real provider fault or separate trust domain was demonstrated.

## Highest-Value Untested Dimension

**Hidden/implicit meaning** is the strongest remaining falsification target. The same request fields and unchanged external resource state could still carry different intended meanings, while the current request binding and effect comparison lack an explicit oracle for that intent. This is `SPECULATIVE` and untested; it does not establish a new property. Do not test it as part of this note.
