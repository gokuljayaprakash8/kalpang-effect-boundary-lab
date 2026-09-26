# KALPANG Effect Boundary Lab

This repository is a small, reproducible MCP filesystem experiment. It tests whether a harness can compare an authorization fixture and execution request with the filesystem destination actually changed by a tool call. The current commercial direction is a KALPANG Agent Effect-Boundary Assessment; that is a validation hypothesis, not a demonstrated product or market fit.

## Experiment

The suite supplies `ALLOW` and `DENY` as harness fixture inputs. They are not decisions from a live authorization service or agent. A denied fixture short-circuits before MCP execution. An allowed fixture invokes the official `@modelcontextprotocol/server-filesystem` package over stdio using MCP protocol version `2025-03-26`, then compares the exact changed path with the fixture-authorized target.

The observer records before/after snapshots of a private temporary filesystem tree. Snapshots include file-content SHA-256 hashes and symlink targets; the harness derives changed paths and stores request/response logs. Case 10 makes two tool calls and records a snapshot after each. The deliberate sentinel authorizes one path while asking the server to write another; both sandbox roots are passed to the server so the server's own path restriction does not prevent the comparison.

The experiment asks whether the observed path matches the one fixture-authorized path. It does not test an authorization service or prove that a denied decision was correct.

## Reproduce

From the repository root, run the canonical path:

```bash
npm ci
npm test
npm run reproduce
```

`npm run reproduce` runs the test suite, runs the standalone experiment, checks measured scenario/evidence consistency, and writes `artifacts/run-provenance.json`. GitHub Actions uses Node 22 and runs these same commands. This local run used Node 24.21.0; provenance records the actual runtime, so the commands and locked dependencies match CI while the runtime major differs.

## Measured Run

The checked-in evidence from the current reproduction records 10 core cases plus one deliberate sentinel: 11 scenarios total. The core results are 2 `IN-BOUNDS`, 6 `DIVERGENT`, and 2 `DENIED / NOT EXECUTED`. The sentinel is an additional `DIVERGENT` result, so there are 7 divergences across all 11 scenarios. No core case has an allowed execution with no observed effect. The automated test suite has 5 top-level tests; the reproduction runner reports their pass/fail totals separately from scenario classifications.

These counts are generated from the measured results, not fixed summary values. `conformance-suite-summary.json` stores the per-case classifications and computed counts; `run-provenance.json` records those counts and SHA-256 digests for source files and evidence JSON. The evidence set contains 16 JSON files hashed by the provenance record, plus the provenance file itself.

## Classifications

- `IN-BOUNDS`: an `ALLOW` tool call succeeded and every observed changed path exactly matched the fixture-authorized path.
- `DIVERGENT`: an `ALLOW` tool call succeeded but the observed path differed from the authorized path. The summary also includes the deliberately divergent sentinel.
- `DENIED / NOT EXECUTED`: a `DENY` fixture made no MCP call and the before/after sandbox snapshots were unchanged.
- `NO OBSERVED EFFECT`: no filesystem effect was observed for an allowed execution; this is a failure, not evidence of successful execution.
- `EXECUTION ERROR`: the tool call did not report success. This is not classified as an in-bounds outcome.

`final_status: PASS` is the harness verification result, not a statement that every scenario performed a successful effect. In particular, a denied case can pass verification while `execution_performed` is `false`, `comparison_result` is `DENIED / NOT EXECUTED`, and `observed_effect_within_authorization` is `null`. The harness has no production `INDETERMINATE` lifecycle classification.

## Evidence And Cleanup

The `artifacts/` directory contains one JSON record per core case, `conformance-suite-summary.json`, `sentinel-divergence-proof.json`, four standalone experiment records, and run provenance. The runner verifies that case JSON matches the measured results before it records provenance. Provenance includes the source commit at run start, source-file hashes, dependency-lock hash, runtime versions, test result, measured classifications, and evidence-file hashes. It is unsigned and does not establish who ran the experiment or whether files were later changed.

Each process uses a unique private temporary directory. The standalone runner and test teardown remove only that process's sandbox; evidence is written outside it under `artifacts/` and remains after cleanup. Path checks constrain harness inputs to the private tree and resolve existing symlink ancestors, but they do not eliminate concurrent filesystem races on a compromised host.

## Trust And Limits

The current experiment does not yet constitute a production-grade independently trusted external-attestation architecture. The current `ALLOW` and `DENY` values are harness fixture inputs. The current observer measures filesystem state inside the experiment environment and remains subject to that environment's trust assumptions. It is not an independently trusted system of record.

The evidence chain separates authorization fixture, execution request/tool call, filesystem observation, path comparison, JSON evidence, and run provenance. These are all produced within one local harness trust domain. The experiment does not provide signed observations, authenticated observer identity, replay protection, trusted source identity, cross-system observation, or an external system-of-record receipt. It does not cover a full agent, other tool types, production authorization, or effects outside its private sandbox; it does not establish a vulnerability in the MCP filesystem server.

Denied cases prove only that this harness did not invoke the MCP server and observed no sandbox change. A production assessment would need an independently governed observation source appropriate to the action, authenticated evidence bound to the exact authorization and execution, provenance controls, and an explicit result for missing or conflicting observations.

## Prior Art And Lineage

The strongest direct conceptual overlap is Schrock's IETF Internet-Draft work on Outcome Binding and the Action Evidence Boundary: both address binding authorization/action evidence to observed consequences and classifying divergence. Those documents are drafts, not finalized standards, and do not establish that a production implementation exists. See [docs/prior-art.md](docs/prior-art.md) for the scoped source-led comparison; overlap is acknowledged, not claimed as novelty.

SVP Kernel is a separate research lineage exploring semantic validation and runtime policy decisions before execution, with audit evidence. This repository is a narrower engineering experiment about comparing a fixture claim with a later filesystem effect. No SVP decision or code is integrated here, and this experiment does not validate all SVP properties. The lineage is research foundation, then experiment, evidence, and finally a commercial assessment hypothesis.

## Current Result

The experiment demonstrates that, in these local filesystem scenarios, a successful tool write to a different path can be detected by comparing a same-environment filesystem snapshot with the exact fixture-authorized path. It does not establish the trustworthiness of that observation outside the harness, prove a general security property, or show that outcome verification is novel. The practical assessment question is whether this narrow reconciliation can be extended to customer-relevant actions with a trusted system-of-record observer and defensible evidence.
