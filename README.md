# KALPANG Effect Boundary Lab v0.1

Minimal empirical MCP effect-boundary conformance suite: 10 core cases plus one deliberate divergence sentinel (11 scenario runs total).

## Purpose

This project is an empirical verification experiment for the relationship between:

- authorization decisions,
- execution requests,
- and independently observed filesystem effects.

The `ALLOW` and `DENY` values are fixture inputs in this harness, not decisions from an independent authorization service or a live agent. For `DENY` fixtures the harness short-circuits before calling the MCP server. For `ALLOW` fixtures it records the real MCP tool response and compares a before/after filesystem snapshot against the exact authorized target. The observer is separate from the fixture decision, but both run in one local harness.

The suite is deliberately not a claim of a novel security theorem or a vulnerability in the official MCP Filesystem server. The purpose is to test the conformance relation:

ObservedEffect ⊆ AuthorizedEffect

and to show how divergence can be detected by independent filesystem inspection.

## Setup

1. Install dependencies from the repository root:

```bash
npm ci
```

2. Create the required sandbox directories and permit writes in this container:

```bash
sudo mkdir -p /sandbox/allowed /sandbox/outside
sudo chmod -R 777 /sandbox
```

The harness also uses `sudo -n` to prepare these paths, so the environment must allow passwordless sudo. It recursively changes permissions only under `/sandbox`.

## Methodology

Each case follows the same minimal pattern:

1. Define an authorized target.
2. Form an execution request.
3. Evaluate the authorization decision.
4. Run the real official `@modelcontextprotocol/server-filesystem` write through stdio.
5. Remove the selected destination, then snapshot `/sandbox` before and after execution.
6. Derive the actual changed path(s) from the state difference without trusting the authorization result.
7. Compare each observed path to the exact authorized effect; an absent effect is not reported as a successful `ALLOW` execution.
8. Record machine-readable evidence with:
   - case_id
   - requested_action
   - authorized_effect
   - execution_request
   - observed_effect
   - authorization_decision
   - observed_effect_within_authorization
   - blocker_layer
   - final_status

## Cases included

1. authorized unchanged execution
2. obvious unauthorized target
3. execution-layer path substitution
4. filename substitution
5. relative-path transformation
6. nested-path boundary escape
7. absolute-path substitution
8. authorization/execution parameter mismatch
9. denied execution with verified zero external effect
10. repeated execution with independently verified state

The sentinel is the eleventh scenario. It labels one target `ALLOW`, asks the official filesystem server to write a different target, and checks whether the independent snapshot detects the mismatch. The server is deliberately configured to allow both directories so its own path restriction does not block the demonstration.

## Automated verification

```bash
cd /workspaces/kalpang-effect-boundary-lab
npm test
```

Expected result:

- 10 core cases and 1 sentinel executed (11 scenarios total)
- the suite records pass/fail/divergent outcomes in machine-readable form
- raw evidence is saved under `artifacts/`

## Raw evidence

The project keeps raw experimental evidence in the `artifacts/` directory, including one JSON record per core case, the suite summary, and the sentinel proof. The summary distinguishes compliant observed effects, divergences, and scenarios with no observed effect.

Earlier standalone experiment records are also retained:

- `authorized-experiment.json`
- `unauthorized-experiment.json`
- `execution-divergence-experiment.json`
- `conformance-suite-summary.json`

Executed MCP cases include before/after snapshots and server logs for inspection. Denied fixtures have no MCP server log because the harness deliberately does not call the server for those cases.

## Sentinel divergence proof

The suite also includes a permanent sentinel case designed to prove that the verifier can detect a known authorization/effect divergence.

Important distinction:

- `scenario_result` describes the external scenario itself.
- `test_result` describes whether the automated verification correctly detected and reported that scenario.

For the sentinel:

- authorization_decision: `ALLOW`
- authorized_effect: `/sandbox/allowed/sentinel.txt`
- observed_effect: `/sandbox/outside/sentinel-escaped.txt`
- observed_effect_within_authorization: `false`
- scenario_result: `DIVERGENT`
- test_result: `PASS`

This is intentionally non-compliant behavior in the scenario, but the automated test is still a PASS because the verifier correctly identifies the divergence.

## Interpretation

This is an empirical conformance/verification procedure, not a novel security theorem. It demonstrates that a fixture authorization claim and a real external effect can diverge in a controlled setting, and that independent filesystem observation can detect the mismatch.

The suite does not claim that the official MCP Filesystem server is vulnerable. It does not test a production authorization system, a full agent, effects outside `/sandbox`, or the security of other tool types. The denied cases establish only that this harness made no MCP call and observed no sandbox change; they do not show that a separate authorization component correctly denied a request.
