# KALPANG Effect Boundary Lab

This repository contains a working experimental implementation of an AI-agent effect-boundary validation path. It includes the original reproducible MCP filesystem scenarios and an opt-in GitHub issue-comment flow demonstrated against GitHub's external system of record. This is experimental validation work, not a production platform or a demonstrated commercial product.

## Current Status (September 27, 2026)

The current experimental flow is:

```text
SEPARATE AUTHORIZATION PROCESS
→ EXACT REQUEST HASH / MCP-CALL BINDING
→ GITHUB MCP EXECUTION
→ INDEPENDENT GITHUB REST OBSERVATION
→ RECONCILIATION
→ IN-BOUNDS / DIVERGENT / INDETERMINATE
```

- **IMPLEMENTED:** The authorization script, request binding, GitHub MCP execution path, REST observer, reconciliation, and tests exist. The verified test run passed 14/14 tests. The original 11 scenarios and their 16 evidence files are preserved. `npm audit` reported 0 vulnerabilities, and the pinned official GitHub MCP server handshake was verified.
- **LIVE EXPERIMENT:** One `add_issue_comment` action was executed and independently observed on the controlled GitHub fixture issue. See [artifacts/github-live-2026-09-27/](artifacts/github-live-2026-09-27/).
- **PRODUCTION:** Not established.
- **INDEPENDENT TRUST:** Not established. The authorizer and executor are separate local processes but share the host/GitHub credential trust domain; the authorization artifact is unsigned.

The tested GitHub flow returns `INDETERMINATE` for missing/unavailable or conflicting REST observations. These results describe this experiment, not production certification or a general security guarantee.

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

These counts are generated from the measured results, not fixed summary values. `conformance-suite-summary.json` stores the per-case classifications and computed counts; `run-provenance.json` records those counts and SHA-256 digests for source files and evidence JSON. The original evidence set contains 16 JSON files hashed by the provenance record, plus the provenance file itself; those original artifacts are preserved. The separate live GitHub run has its own request, authorization, execution, observation, and provenance records under `artifacts/github-live-2026-09-27/`.

## Classifications

- `IN-BOUNDS`: an `ALLOW` tool call succeeded and every observed changed path exactly matched the fixture-authorized path.
- `DIVERGENT`: an `ALLOW` tool call succeeded but the observed path differed from the authorized path. The summary also includes the deliberately divergent sentinel.
- `DENIED / NOT EXECUTED`: a `DENY` fixture made no MCP call and the before/after sandbox snapshots were unchanged.
- `NO OBSERVED EFFECT`: no filesystem effect was observed for an allowed execution; this is a failure, not evidence of successful execution.
- `EXECUTION ERROR`: the tool call did not report success. This is not classified as an in-bounds outcome.
- `INDETERMINATE`: the GitHub effect cannot be reconciled because observation is missing/unavailable or independent REST observations conflict. It is not coerced into `IN-BOUNDS` or `DIVERGENT`.

`final_status: PASS` is the harness verification result, not a statement that every scenario performed a successful effect. In particular, a denied filesystem case can pass verification while `execution_performed` is `false`, `comparison_result` is `DENIED / NOT EXECUTED`, and `observed_effect_within_authorization` is `null`. `INDETERMINATE` is implemented and tested in the GitHub flow only; it is not a production lifecycle guarantee for arbitrary effects.

## Live GitHub Experiment

On September 27, 2026, one live GitHub experiment was run against the canonical repository, `gokuljayaprakash8/kalpang-effect-boundary-lab`, using controlled fixture issue [#1](https://github.com/gokuljayaprakash8/kalpang-effect-boundary-lab/issues/1). Exactly one authorized `add_issue_comment` MCP operation was executed through the pinned official GitHub MCP server v1.12.2. MCP returned comment ID `5852568889`.

The resulting state was queried separately through GitHub REST: the issue-comment collection and comment-detail endpoint agreed on comment ID, body, and issue URL, and the issue contained exactly one comment. Reconciliation was `IN-BOUNDS / PASS`. MCP success output alone is not treated as authoritative observation.

The live records are in `artifacts/github-live-2026-09-27/`:

- [request.json](artifacts/github-live-2026-09-27/request.json): exact MCP tool and arguments, including issue number and intended comment body.
- [authorization.json](artifacts/github-live-2026-09-27/authorization.json): separate `ALLOW` decision bound to the canonical request hash `6730b82cbdf0b337a46f9466323e7dd81989d5b46746e8c1423ad03c513fd503`.
- [mcp-execution.json](artifacts/github-live-2026-09-27/mcp-execution.json): sanitized execution status, server version, and comment ID.
- [rest-observation.json](artifacts/github-live-2026-09-27/rest-observation.json): independent REST collection and detail observations.
- [provenance.json](artifacts/github-live-2026-09-27/provenance.json): source/evidence hashes, run identifiers, observation window, and reconciliation.

The filesystem scenarios remain unchanged. The GitHub path is opt-in and is not run by `npm test` or `npm run reproduce`; it requires Docker, network access, and GitHub comment permission. Re-running it creates another external comment, so use it only with an explicitly authorized request.

Create a request JSON file with this exact shape, replacing the issue number and comment body:

```json
{
	"jsonrpc": "2.0",
	"method": "tools/call",
	"params": {
		"name": "add_issue_comment",
		"arguments": {
			"owner": "gokuljayaprakash8",
			"repo": "kalpang-effect-boundary-lab",
			"issue_number": 123,
			"body": "KALPANG effect-boundary experiment comment"
		}
	}
}
```

Run authorization and execution as separate processes. The first process writes a persisted authorization JSON file; the second reads that file and the same request before it can make any MCP or REST call:

```bash
npm run authorize:github-comment -- request.json authorization.json ALLOW
npm run execute:github-comment -- request.json authorization.json
```

The SHA-256 binding is over canonical JSON with sorted object keys and these fields: the pinned MCP server image digest and `issues` toolset; `jsonrpc`; `method`; `params.name`; and `params.arguments.owner`, `repo`, `issue_number`, and `body`. Extra request fields are rejected. The MCP SDK assigns the JSON-RPC correlation ID when dispatching the bound tool call; it is transport metadata rather than an input field in the authorized request. Changing any bound value makes execution reject the authorization before the MCP call.

The MCP call uses the pinned official GitHub MCP server over stdio. The observer separately reads the issue's comments through GitHub REST before and after execution, then reads the newly observed comment by ID through REST. MCP response text is diagnostic only. A single consistent REST observation of the exact authorized comment is `IN-BOUNDS`; a consistently observed different body is `DIVERGENT`. A missing comment, unavailable REST call, ambiguous new comments, or disagreement between the list and detail endpoints is explicitly `INDETERMINATE`, never `PASS`, `IN-BOUNDS`, or `DIVERGENT`.

Credentials are read from `GITHUB_PERSONAL_ACCESS_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN`, falling back to `gh auth token`; they are not written to the report. The authorization artifact and report are unsigned. Although the authorization and execution are separate processes and the observation uses an independent GitHub REST route, they run on the same host and use the same GitHub credential trust domain. This does not establish trusted authorization identity or an independently trusted observer.

## Evidence And Cleanup

The `artifacts/` directory contains one JSON record per core case, `conformance-suite-summary.json`, `sentinel-divergence-proof.json`, four standalone experiment records, and run provenance. The runner verifies that case JSON matches the measured results before it records provenance. Provenance includes the source commit at run start, source-file hashes, dependency-lock hash, runtime versions, test result, measured classifications, and evidence-file hashes. It is unsigned and does not establish who ran the experiment or whether files were later changed. The separate live-run provenance is described in the live experiment section.

Each process uses a unique private temporary directory. The standalone runner and test teardown remove only that process's sandbox; evidence is written outside it under `artifacts/` and remains after cleanup. Path checks constrain harness inputs to the private tree and resolve existing symlink ancestors, but they do not eliminate concurrent filesystem races on a compromised host.

## Trust And Limits

## What This Demonstrates

For the controlled GitHub run, the experiment demonstrates that:

1. An authorization can be produced separately from execution.
2. The authorization can be bound to an exact canonical MCP request.
3. The MCP operation can produce a real external GitHub effect.
4. The external effect can be observed through a separate REST path.
5. The observed state can be reconciled against the original authorization.
6. Under the tested conditions, classification distinguishes `IN-BOUNDS`, `DIVERGENT`, and `INDETERMINATE`.

## What This Does NOT Demonstrate

The experiment does not establish:

- Production-grade authorization.
- An independently trusted authorization authority.
- An independently trusted observer.
- General security of MCP.
- Tamper resistance across arbitrary trust boundaries.
- Security across all agent actions or tool types.
- A deployed SaaS/platform product.
- A general guarantee that all agent effects remain within authorization.

The authorizer and executor are separate local processes, but remain within the same host/GitHub credential trust domain. The authorization artifact is unsigned. The GitHub REST route is distinct from the MCP execution path, but its result is not independently trusted against a compromised host or credential domain. The existing filesystem `ALLOW` and `DENY` values remain conformance fixtures; denied cases show only that this harness skipped MCP and observed no sandbox change. The filesystem scenarios do not establish a vulnerability in the MCP filesystem server.

## Prior Art And Lineage

The strongest direct conceptual overlap is Schrock's IETF Internet-Draft work on Outcome Binding and the Action Evidence Boundary: both address binding authorization/action evidence to observed consequences and classifying divergence. Those documents are drafts, not finalized standards, and do not establish that a production implementation exists. See [docs/prior-art.md](docs/prior-art.md) for the scoped source-led comparison; overlap is acknowledged, not claimed as novelty.

SVP Kernel is a separate research lineage exploring semantic validation and runtime policy decisions before execution, with audit evidence. This repository is a narrower engineering experiment about comparing a fixture claim with a later filesystem effect. No SVP decision or code is integrated here, and this experiment does not validate all SVP properties. The lineage is research foundation, then experiment, evidence, and finally a commercial assessment hypothesis.

## Current Result

The original filesystem scenarios demonstrate that, in those local cases, a write to a different path can be detected by comparing same-environment snapshots with the fixture-authorized path. The live GitHub run demonstrates one real issue-comment effect reconciled against separate REST observations. Neither result proves a general security property, production readiness, or that outcome verification is novel. Any future assessment would need to establish customer-relevant scope and the trustworthiness of its authorization and observation sources.
