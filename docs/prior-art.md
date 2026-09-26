# Agentic Security Prior Art (26 September 2026)

This is a scoped, source-led technical comparison, not a complete market census. Specifications, repository documentation, and product claims describe intended capabilities; they do not prove deployment, independent assessment, or operational effectiveness.

## Existing Prior Art

### Schrock IETF drafts

The strongest direct conceptual overlap is Schrock's IETF work. The overlap is substantial: these drafts address authorization/action evidence bound to observed consequences, comparison outcomes, and how missing or conflicting evidence affects result classification. Kalpang does not claim novelty for that concept.

- [Outcome Binding for Authorized Actions and Independently Observed Effects, draft-schrock-ep-outcome-binding-00](https://datatracker.ietf.org/doc/draft-schrock-ep-outcome-binding/) is listed by IETF Datatracker as an active Internet-Draft, revision 00, dated 29 July 2026, expiring 30 January 2027. Its abstract describes signed predicted effects with required source roles/classes, signed executor/system-of-record/observer observations bound to authorization, action digest, CAID, nonce, operation, facility, and observation window. It distinguishes unavailable or unauthenticated evidence (`indeterminate`) from comparisons of authentic evidence (`in_bounds`, `divergent`, or `incomparable`) and disclaims proof of physical truth, sensor correctness, or legal finality.
- [The Action Evidence Boundary for Consequential Agent Effects, draft-schrock-action-evidence-boundary-07](https://datatracker.ietf.org/doc/draft-schrock-action-evidence-boundary/) is listed as an active Internet-Draft, revision 07, updated 26 September 2026, expiring 30 March 2027. Its abstract describes native artifact verification, exact-action binding, relying-party authorization, durable consumption/reservation, provider entry, closed effect outcomes, and authenticated reconciliation. It states that MCP/API invocation alone does not establish a downstream provider effect.
- [The Agent Action Control Manifest, draft-schrock-agent-action-manifest-00](https://datatracker.ietf.org/doc/draft-schrock-agent-action-manifest/) is an Internet-Draft, revision 00, dated 3 July 2026, expiring 4 January 2027. It specifies a public per-action declaration of enforcement point, authorization evidence profile/assurance tier, system-of-record fields, replay model, and post-effect evidence. It declares requirements; it does not replace enforcement.

These documents are IETF Internet-Drafts, not RFCs or finalized standards. Their specifications do not by themselves establish a deployed or independently evaluated implementation.

### Protocol, Governance, And Testing Work

- [MCP authorization](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/authorization) concerns access to protected MCP resources and servers. [MCP conformance](https://github.com/modelcontextprotocol/conformance) tests client/server behavior against protocol requirements. Protocol conformance does not by itself establish authorization correctness for an agent's intended action, runtime governance policy, or verification of a downstream external effect. This repository speaks MCP version `2025-03-26`; it is not a run of the MCP conformance framework.
- The [OWASP Agent Control Standard (ACS)](https://github.com/GenAI-Security-Project/agent-control-standard) addresses runtime control hooks, policy decisions, and observability. Its repository documentation distinguishes the standard, implementation, and conformance profiles; the checked profile documentation describes self-declared conformance and does not claim third-party verification. The repository currently lists tags through `v0.1.2`, while its README identifies the specification as `0.1.0`; those labels should not be conflated. ACS runtime governance is relevant prior art, but a governance decision or tool-event log is not automatically a signed, independently sourced system-of-record effect receipt.
- The [Microsoft Agent Governance Toolkit](https://github.com/microsoft/agent-governance-toolkit) publicly documents policy enforcement, identity, MCP integrations, execution sandboxing, and audit capabilities. Those are relevant governance and execution controls. The checked repository material does not establish an independently trusted system-of-record observer bound cryptographically to every action; absence from the checked material is not proof that no such capability exists elsewhere.

The distinctions are important: protocol conformance, authorization correctness, runtime governance, execution evidence, and observed external-effect verification are related but not interchangeable claims.

## Current Kalpang Experiment

| Dimension | What the repository implements | What it does not establish |
|---|---|---|
| Authorized action | Ten fixed cases supply `ALLOW`/`DENY` fixture values and one expected filesystem target. | A live policy decision point, agent identity, delegation, or correctness of an authorization decision. |
| Execution | Allowed cases invoke the official MCP filesystem server over stdio; denied cases do not invoke it. | Production interception, a deployed agent runtime, or security of other tools/providers. |
| Observation | The harness snapshots a private local filesystem tree, including file hashes and symlink targets. | An external observer, independently trusted system of record, or observation outside the harness host/user trust domain. |
| Binding and comparison | Changed paths are compared to the exact fixture-authorized path. Results distinguish `IN-BOUNDS`, `DIVERGENT`, denied/not-executed, no observed effect, and execution error. | Signed action/effect binding, operation-level business semantics, or an `INDETERMINATE` lifecycle state. |
| Evidence and provenance | JSON records include requests, tool logs/results, snapshots, and SHA-256 digests. Run provenance hashes the relevant source files and evidence. | Signatures, append-only storage, trusted provenance, replay protection, or tamper resistance. |
| System-of-record trust | No external system of record is queried. | Independent confirmation that a downstream business effect occurred. |
| Reproducibility | `npm ci`, `npm test`, and `npm run reproduce`; GitHub Actions runs the same locked install, tests, and reproduction command. | Reproduction of a production deployment or independent assessment by a third party. |

The measured suite is a finite local case set: ten core cases and one deliberate divergence sentinel. Its meaningful engineering result is a public, reproducible demonstration that exact path mismatches from real local MCP filesystem writes can be captured and classified using same-environment snapshots. The sentinel intentionally permits both sandbox roots to the MCP server so the harness, rather than the server's root restriction, observes the mismatch.

## Unresolved Gaps

The repository does not implement signed observations; authenticated observer/source identity; action digests, nonces, or replay fencing; an external system-of-record integration; proof of provider entry or downstream transaction outcome; or explicit handling of missing/conflicting evidence as `INDETERMINATE`. It does not test concurrent filesystem races or establish symlink-safe behavior of arbitrary production tools. Its snapshots and artifacts remain mutable within the same host trust domain.

These gaps are not hidden by the passing harness tests. They mark the difference between this experiment and the more complete outcome-binding/effect-boundary models in the cited drafts.

## SVP Lineage And Assessment Direction

[SVP Semantic Validation Protocol Kernel](https://github.com/gokuljayaprakash8/SVP-Semantic-Validation-Protocol-KERNEL) is separate research lineage. Its public README describes semantic validation and policy evaluation before execution with audit logging; this lab instead measures whether a harness-supplied expected path matches a later local filesystem change. No SVP decision or code is integrated, and this experiment does not validate every property of SVP Kernel.

The conservative lineage is research foundation, engineering experiment, measured evidence, then a commercial assessment hypothesis. The proposed KALPANG Agent Effect-Boundary Assessment direction is limited to examining whether an action's authorized effect matches a suitably trusted observed effect. This repository does not demonstrate customer demand, production assurance, or novelty over the direct IETF overlap.
