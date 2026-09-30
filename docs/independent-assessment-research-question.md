# Independent Assessment Research Question

## Hypothesis

An outside assessor may identify an evidence gap between a deployed agent-security control path's own execution claim and independently observed system-of-record state.

## Falsification

For the tested action, `DISTINCT-ASSESSMENT-SIGNAL = NO DISTINCT SIGNAL` falsifies differentiation when the operator's own evidence already established the same external-effect conclusion with sufficient evidentiary strength. The operator-claim result (`SUPPORTED`, `CONTRADICTED`, or `INDETERMINATE`) is reported separately from the assessment signal (`DISTINCT SIGNAL`, `NO DISTINCT SIGNAL`, `NOT DECISIVE`, or `INDETERMINATE`). Neither result is collapsed into the technical effect result.

## Evidence boundary

One real operator action, a read-only observer of the real system of record, and separately reported operator-claim and assessment-signal results. Anonymous observation is credential-separated from the writer but is not a separately controlled trust domain.

## Current status

UNCERTAIN

## Required experiment

One preregistered real-world action following the exact procedure in [preregistered-independent-assessment-v1.md](preregistered-independent-assessment-v1.md).