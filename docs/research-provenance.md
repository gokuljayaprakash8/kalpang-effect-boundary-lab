# Research Provenance

## 1. Research starting point

The starting question was whether an authorized consequential agent action remains bound to its approved request at the final execution boundary, and whether the resulting external state can be established against the expected effect. The frozen verified baseline is commit [`05d742bd0c611da5acc723e7b1d73d2080065dc4`](../README.md): it documents the original filesystem harness and the September 27 live GitHub flow, with explicit limits on production readiness and trust-domain independence. The public remote `main` currently points to `de79f03`, earlier than this frozen baseline; later research remains on a separate branch.

## 2. Evidence progression

| Date/Stage | Question attacked | Experiment/evidence | Result | Commit |
|---|---|---|---|---|
| 2026-09-27, original live GitHub reconciliation | Can a real comment effect be compared to the approved request, including when the body differs or observation is unavailable? | [Three controlled live runs](../artifacts/github-live-2026-09-27/provenance.json), [body-substitution record](../artifacts/github-body-substitution-2026-09-27/reconciliation.json), and [observer-unavailable record](../artifacts/github-observer-unavailable-2026-09-27/reconciliation.json). | One observed `IN-BOUNDS`, one observed `DIVERGENT` body substitution, and one `INDETERMINATE` due to unavailable REST evidence. These were real GitHub actions; the observer shared host/provider trust and did not establish a separate trust domain. | `33103ca` |
| 2026-09-28, offline A/B/C comparison | Can admission, downstream mutation, and observer availability be kept as separate questions? | Offline comparison runner and focused tests; simulated, not live GitHub effects. | A refused before-admission case, a post-admission substitution classified `DIVERGENT`, and an unavailable-observer case classified `INDETERMINATE`. | `de79f03` |
| 2026-09-29, downstream mutation prevention | Can final-boundary revalidation reject a changed request before the tested local sink? | Focused mutation-prevention tests. | The guarded test rejects before the local sink; the unguarded comparison preserves the case where mutated input reaches it. This is bounded test evidence, not universal enforcement. | `0dec50f` |
| 2026-09-29, provider materialization divergence | Does an unchanged, validated request establish which target a provider materializes? | Synthetic provider simulator and local state observer in the frozen baseline tests. | The simulator reports the effect on the wrong issue and local reconciliation detects `DIVERGENT`. This is **SYNTHETIC**, not a GitHub/provider fault or finding. | `05d742b` |
| 2026-09-29, temporal-state experiment | Can a request remain byte-identical while relevant resource state changes? | Local T1/T2 state fixture and test-defined precondition in [temporal-context.test.js](../test/temporal-context.test.js). | A checked precondition can refuse; without it, the unchanged request executes while a state-aware local comparison finds divergence. Synthetic state/observer; no new integrity property demonstrated. | `ad230faf7accea6ce0e1323646113d65dfb91058` |
| 2026-09-29, hidden-intent experiment | Can distinct declared intents collapse to the same canonical action? | Explicit intent fixtures and test-only predicates in [hidden-intent.test.js](../test/hidden-intent.test.js) and [hidden-intent-rejection.test.js](../test/hidden-intent-rejection.test.js). | Request-only binding treats the action identically; comparison to the fixture expectation differs. This is synthetic fixture evidence, not a real agent's intent resolution. | `5866b2767c8bcc546e25fa47d87c45c573baf688` |
| 2026-09-29, semantic-to-effect synthesis | Do the tested context/intent cases require another integrity layer? | [Semantic admission note](semantic-admission-boundary.md) and [semantic-to-effect synthesis](semantic-to-effect-integrity.md). | Intent/semantic expectation is an upstream prerequisite/refinement. No tested case established a fourth integrity layer or universal semantic coverage. | `5866b2767c8bcc546e25fa47d87c45c573baf688` |
| 2026-09-29, independent GitHub observation attempt | Can a successful MCP response and matching request digests independently establish a GitHub effect? | [Live observation artifact](../artifacts/github-live-independent-observation-2026-09-29.json), preserved in commit `6772a8c`. | MCP returned success and comment ID `5889000215`; approved/final digests matched; anonymous REST observation did not establish the effect. `INDETERMINATE`; no retry. Same host and provider trust domain. | `6772a8c` |
| 2026-09-30, preregistered independent assessment | Did read-only system-of-record observation establish material information beyond the frozen operator claim? | Protocol `0a11ff1`; exact target preregistration [`KALPANG-IA-20260930-01`](../artifacts/github-independent-assessment-2026-09-30-preregistration.json), committed as `d3ada02`; real execution and assessment [`result artifact`](../artifacts/github-independent-assessment-2026-09-30.json), committed as `edf1519`. | Real MCP execution returned effect ID `5905995393`; operator claim was frozen before observation. Anonymous direct-ID REST observation established the matching public comment within the fixed observation window. `TECHNICAL_EFFECT_RESULT = IN-BOUNDS`; `OPERATOR_CLAIM_RESULT = SUPPORTED`; `ASSESSMENT_SIGNAL = DISTINCT SIGNAL`. Credential-separated, but same operator, host, process, and GitHub provider trust; no separate trust domain. | `edf1519` |

## 3. Architectural evolution

```text
intent
  -> semantic expectation
  -> approved action
  -> admission
  -> execution/conduit
  -> external effect
  -> observation/reconciliation
```

The integrity questions remain admission, execution/conduit, and external-effect observation/reconciliation. Intent resolution and its semantic expectation are upstream prerequisites/refinements, **not a fourth integrity layer**. Downstream mutation prevention is an execution/conduit question; provider materialization mismatch is an external-effect reconciliation question; unavailable observation is `INDETERMINATE`; hidden-intent mismatch is upstream of admission.

## 4. Falsification discipline

Experiments were designed to support, refine, or contradict the current architecture. Synthetic results are identified as synthetic; a simulator result is not promoted to a provider finding. An `IN-BOUNDS` outcome is allowed, as are `DIVERGENT`, refusal, and `INDETERMINATE`. The work has not proven the architecture, a universal security property, or a provider implementation claim.

## 5. Current evidence status

- **CHECKED-IN BASELINE:** The filesystem evidence, September 27 live GitHub records, tests, and README at frozen commit `05d742bd`. The public remote `main` is currently at `de79f03`, so it does not expose the later baseline/research commits.
- **COMMITTED RESEARCH:** Commits `0dec50f`, `ad230faf`, `b1ef7fd`, `5866b276`, `6772a8c`, `d3ada02`, and `edf1519` contain downstream-mutation testing, temporal and semantic research, synthesis, assessment protocol/preregistration, and the September 29 and September 30 observation records. They are on `research/live-independent-observation`, not the frozen `main`.
- **LIVE EVIDENCE STATUS:** The September 29 observation remains `INDETERMINATE`; the September 30 preregistered assessment completed with a direct anonymous REST observation and the three-axis result recorded above. The live-write runner remains untracked and is not part of the published evidence bundle.
- **EXTERNAL CONVERSATION INPUT:** A blind-model A/B interpretation about public-comment versus private-draft intent was supplied outside the repository. There is no transcript, configuration, or reproducible invocation checked in; it is not repository evidence or ground truth.
- **SUPPORTED INFERENCE:** Enforcing the approved request at a final conduit and independently establishing resulting external state are distinct assurance questions. Whether an independent assessor adds a decision that a deployed stack does not already establish remains uncertain.
- **SYNTHETIC:** Wrong-issue provider materialization, temporal state changes, and hidden-intent comparisons use simulators/local state/explicit test oracles. They are not GitHub faults or real agent intent evaluations.
- **REAL OBSERVATION:** September 27 records include real GitHub effects reconciled `IN-BOUNDS` and `DIVERGENT`; September 29 MCP execution returned success and comment ID `5889000215` with matching request digests; September 30 anonymous direct-ID REST observation established the preregistered effect with ID `5905995393`.
- **INDETERMINATE:** The September 27 unavailable-observer case and the September 29 anonymous REST observation do not establish an effect. Neither proves effect absence or provider failure. The observers shared host and provider trust domains.

## 6. What remains unproven

- No universal semantic coverage or universal correctness of agent interpretation.
- No real provider fault; the wrong-issue materialization is synthetic.
- No genuinely separate trust domain for the local/REST observations described here.
- No universal security guarantee, production certification, or evidence that intent resolution is implemented by this lab.
- No unique novelty over IETF AEB, Outcome Binding, CXI, Blueprint, NVIDIA, OWASP ACS, CoSAI/Agentic SOC, or vendor controls for authorization, action binding, final-conduit enforcement, effect reconciliation, or `INDETERMINATE`.
- No demonstration that an independent assessment produces a decision unavailable from a deployed enterprise stack.

## 7. Current research question

“Can a vendor-neutral independent assessment test whether an already-deployed agent-security control path constrains a declared consequential effect, using independently sourced system-of-record evidence?”

**UNCERTAIN**

## 8. Open empirical boundary

**real deployed control path + independently controlled observer**
