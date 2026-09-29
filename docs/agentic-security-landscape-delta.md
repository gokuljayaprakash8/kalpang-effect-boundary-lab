# Agentic Security Landscape Delta Audit

**Audit date:** 2026-09-29
**Scope:** Novelty and positioning falsification only. No code or experiments were run for this audit.

## Result

**UNCERTAIN.** KALPANG's current mechanism overlaps heavily with AEB, Outcome Binding, CXI, runtime-control standards, and modern agent-security platforms. A narrowly different role remains conceivable: an independent, vendor-neutral assessment of whether an already-deployed multi-vendor control path constrains a declared consequential effect, checked against system-of-record evidence. This repository has not demonstrated that role on a deployed enterprise stack. No exact existing product or standard performing that full independent assessment was identified in the sources searched; this is **NOT FOUND IN SEARCHED SOURCES**, not a claim that no such assessor exists.

The live GitHub case yields `execution success` plus insufficient independent effect evidence, classified `INDETERMINATE`. AEB and Outcome Binding already define that kind of result. The case is useful as evidence that independent effect observation may be unavailable despite a successful execution response; it is not evidence of GitHub failure, non-creation, provider defect, separate trust-domain independence, or a distinct KALPANG decision.

## Landscape As Of 2026-09-29

- **IETF Action Evidence Boundary (AEB-07), 2026-09-25:** The Internet-Draft specifies executor-side native-artifact verification, exact-action binding, relying-party authorization, durable consumption/reservation, provider entry, `INVOKED` / `EXECUTED` / `FAILED` / `INDETERMINATE`, and authenticated reconciliation. It explicitly treats invocation uncertainty and missing, stale, conflicting, or inadequate evidence as unresolved rather than success or failure. This is direct overlap. It is an IETF Internet-Draft, not an IETF standard.
- **IETF Outcome Binding (-00), 2026-07-28:** Direct overlap with the proposition that authorization does not prove the post-execution effect. It binds signed predicted effects and executor/system-of-record/independent-observer observations to an action, and separates missing/unauthenticated evidence (`indeterminate`) from comparison outcomes (`in_bounds`, `divergent`, `incomparable`). It is an Internet-Draft, not an IETF standard.
- **Context-to-Execution Integrity (CXI), arXiv:2607.06000, 2026-07-07:** Direct prior art for protected sink fields, typed releases, exact-effect and invocation authorization, a deterministic gate, and evaluation on AgentDojo/live episodes and a code-agent benchmark. This is a research preprint, not a market control product, but the mechanisms and evaluation dimensions overlap.
- **NVIDIA Open Agent Safety Platform, 2026-09-28:** NVIDIA describes OpenShell plus the Sentry reference design, an out-of-band watchdog on BlueField-4, isolated in-silicon monitoring/enforcement, quarantine, and agent testing through deployment. External enforcement and isolated monitoring are not KALPANG novelty.
- **OWASP Agent Control Standard (ACS), 2026-09-01 per the supplied audit brief; repository checked 2026-09-29:** A wire specification/reference ecosystem for runtime hooks, Guardian policy decisions, audit trails, and portable controls. The checked README also discloses implementation gaps and a narrow live scope; it does not establish independent system-of-record effect assessment across a deployed enterprise stack.
- **Blueprint Alliance, 2026-09-22 per the supplied audit brief:** Its described architecture covers identity, access policy, runtime authorization, gateways, monitoring, intent/alignment enforcement, and containment. Exact primary source URL and publication were not independently located in this audit's searches; matrix entries reflect the supplied description and are not independently verified.
- **CoSAI, Agentic SOC, cloud/vendor controls:** Treated as adjacent or overlapping infrastructure/control work, not evidence of absence when a feature label was not located. AWS AgentCore documentation, for example, documents agent identity/credential management, authorization, and audit trails. NVIDIA's release names multiple participating vendors. These sources support a crowded control landscape, not a comprehensive capability census.

## Direct Overlaps And Non-Novel Claims

KALPANG must stop claiming novelty for effect reconciliation; `INDETERMINATE` or other non-collapsing execution/effect states; action binding or exact-action correspondence; provider-boundary evidence; semantic authorization; exact-effect authorization; context-to-execution integrity; final-conduit integrity; external enforcement; policy/runtime hooks; monitoring, traceability, or audit logging. AEB and Outcome Binding directly cover reconciliation and uncertain evidence. CXI directly covers sink-field and action authorization at an execution boundary. Blueprint, NVIDIA, ACS, cloud/vendor products, and adjacent agent-security programs occupy identity, gateway, policy, runtime enforcement, containment, telemetry, and testing/control architecture.

Tolkāppiyam is not a technical novelty claim. Its only defensible role here is `semantic distinctions -> adversarial test generation`. The checked notes show this generated useful test dimensions for target substitution, temporal drift, and hidden-intent mismatch. The hidden-intent tests use explicit fixtures/test-only predicates, not a real agent workflow; temporal tests use local state. This is methodological utility within the baseline, not evidence of a novel control or validated semantic interpretation system.

## Possible Assessment Delta

The narrowest candidate is: **independent, vendor-neutral, black-box assessment of whether an already-deployed cross-vendor agent control path actually constrains a declared effect, using a separately trusted system-of-record observer and reporting a reproducible control/effect mismatch or evidence insufficiency.** The potential distinct decision is not another executor's reconciliation status. It is whether the combination of deployed controls actually enforces the property the organization claims it enforces on a real action path.

Strong argument against: an enterprise's gateway, runtime policy engine, containment, telemetry, provider audit logs, and an AEB/Outcome-Binding-compatible executor can already enforce, observe, reconcile, and report the same effect status. Outcome Binding explicitly includes independent observations and reconciliation outcomes; AEB defines the lifecycle and authenticated reconciliation; CXI already evaluates an implementation in agent and code-agent experiments. Red-team/conformance tools can also test agent applications or controls. A separate KALPANG layer would add no decision if it merely repeats those reports or creates another observer/reconciler.

**Existing exact independent assessor:** **NOT FOUND IN SEARCHED SOURCES.** Searches included exact and variant web-index queries for independent agent-security assessment, deployed-stack black-box validation, cross-vendor runtime assessment, and agent red-team systems; primary pages/repositories checked included NVIDIA's release, OWASP ACS, Promptfoo red-team documentation, CXI, AEB, Outcome Binding, and AWS AgentCore docs. The search index returned irrelevant results for some terms, and this was not an exhaustive procurement/consultancy/market survey. Do not infer "no one does this." NVIDIA's agent-testing scope, CXI's benchmarks, ACS conformance/reference work, and generic red-team capability are meaningful adjacent work, but the searched sources did not establish the exact independent end-to-end system-of-record assessment above.

## Function Matrix

Labels describe explicit source/documented scope, not operational effectiveness. The Blueprint column is based only on the supplied architecture description because its primary source was not located. Cloud/vendor controls aggregate non-uniform products; a label does not apply to every named vendor.

| Function | Blueprint | NVIDIA | OWASP ACS | IETF AEB | Outcome Binding | CXI | Cloud/vendor controls | KALPANG |
|---|---|---|---|---|---|---|---|---|
| Identity/delegation | EXPLICIT | PARTIAL | ADJACENT | PARTIAL | PARTIAL | PARTIAL | EXPLICIT | NOT FOUND |
| Intent/action binding | EXPLICIT | PARTIAL | PARTIAL | PARTIAL | PARTIAL | EXPLICIT | PARTIAL | PARTIAL |
| Admission | EXPLICIT | EXPLICIT | EXPLICIT | EXPLICIT | ADJACENT | EXPLICIT | EXPLICIT | PARTIAL |
| Final-conduit enforcement | PARTIAL | EXPLICIT | PARTIAL | EXPLICIT | ADJACENT | EXPLICIT | EXPLICIT | PARTIAL |
| Runtime containment | EXPLICIT | EXPLICIT | PARTIAL | PARTIAL | ADJACENT | PARTIAL | EXPLICIT | NOT FOUND |
| Execution evidence | PARTIAL | EXPLICIT | EXPLICIT | EXPLICIT | EXPLICIT | EXPLICIT | EXPLICIT | EXPLICIT |
| External-state observation | PARTIAL | PARTIAL | ADJACENT | EXPLICIT | EXPLICIT | PARTIAL | PARTIAL | EXPLICIT |
| Effect reconciliation | ADJACENT | ADJACENT | ADJACENT | EXPLICIT | EXPLICIT | PARTIAL | PARTIAL | EXPLICIT |
| Independent observer | UNKNOWN | EXPLICIT | ADJACENT | PARTIAL | EXPLICIT | ADJACENT | PARTIAL | PARTIAL |
| Cross-vendor assessment | PARTIAL | PARTIAL | PARTIAL | ADJACENT | PARTIAL | PARTIAL | PARTIAL | NOT FOUND |
| Black-box adversarial validation | ADJACENT | PARTIAL | PARTIAL | ADJACENT | ADJACENT | PARTIAL | PARTIAL | PARTIAL |
| Tests deployed stack rather than implementing it | UNKNOWN | PARTIAL | PARTIAL | ADJACENT | ADJACENT | PARTIAL | PARTIAL | NOT FOUND |
| Reports control/effect mismatch independently | ADJACENT | PARTIAL | PARTIAL | EXPLICIT | EXPLICIT | PARTIAL | PARTIAL | PARTIAL |

KALPANG matrix boundary: its harness and fixtures implement comparisons and produce `IN-BOUNDS` / `DIVERGENT` / `INDETERMINATE` classifications in bounded tests; the live GitHub run attempted a separate unauthenticated REST observation. The host and provider trust domains were not independent, and no deployed enterprise control path was assessed. `NOT FOUND` for KALPANG means not present in the checked-in architecture/evidence, not a statement about every possible external use.

## Real KALPANG Evidence

`artifacts/github-live-independent-observation-2026-09-29.json` records: GitHub MCP returned success and comment ID `5889000215`; approved and final request digests matched; anonymous read-only REST requests did not establish a matching comment; the REST comment ID was absent; result `INDETERMINATE`; no second write was attempted. The observer used no execution credential, but shared host and provider trust domains, so independent trust was not established. Correct statement: **execution success + insufficient independent effect evidence = INDETERMINATE**. This is useful as an uncertainty/evidence-availability case for an assurance workflow; it is not a successful independent-assessment demonstration because it did not test deployed controls or establish the effect.

## Falsification And Open Empirical Question

**Falsification result: UNCERTAIN.** There is substantial direct overlap and no demonstrated assessment decision beyond existing outcome classifications. A theoretically distinct cross-vendor evaluator remains possible, but absence of an exact product in this limited search cannot establish distinctness. The assessment thesis is not yet supported by the live run.

**Exact open empirical question:** On a consenting, already-deployed multi-vendor agent stack, can a vendor-neutral assessor safely exercise a preregistered consequential action path and determine from a genuinely separate, trusted system-of-record source whether the stack constrained the declared effect, producing a reproducible decision that the stack's existing gateway/runtime/AEB-or-equivalent/telemetry/reconciliation outputs did not already provide?

## Sources Checked

- [AEB-07 Internet-Draft, 2026-09-25 (archived text)](https://www.ietf.org/archive/id/draft-schrock-action-evidence-boundary-07.txt)
- [Outcome Binding -00 Internet-Draft, 2026-07-28 (archived text)](https://www.ietf.org/archive/id/draft-schrock-ep-outcome-binding-00.txt)
- [Context-to-Execution Integrity for LLM Agents, arXiv:2607.06000 (2026-07-07)](https://arxiv.org/abs/2607.06000)
- [NVIDIA Open Agent Safety Platform announcement, 2026-09-28](https://nvidianews.nvidia.com/news/open-agent-safety-platform)
- [NVIDIA platform technical blog, 2026-09-28](https://developer.nvidia.com/blog/nvidia-open-agent-safety-platform-a-reference-for-continuous-in-silicon-agent-monitoring/)
- [OWASP Agent Control Standard repository](https://github.com/GenAI-Security-Project/agent-control-standard)
- [Promptfoo LLM red-teaming documentation](https://www.promptfoo.dev/docs/red-team/)
- [AWS Bedrock AgentCore identity documentation](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/identity.html)
- Blueprint Alliance: primary source not located; architecture/date as supplied in the audit brief.
