import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { runAuthorizedCheck, runUnauthorizedCheck, runExecutionDivergenceCheck } from '../src/experiment.js';
import { runCase, runConformanceSuite, runSentinelDivergenceCheck } from '../src/conformance-suite.js';
import { ALLOWED_ROOT, OUTSIDE_ROOT, SANDBOX_ROOT, cleanupSandbox, isWithinAuthorizedBoundary } from '../src/sandbox.js';

after(async () => {
  await cleanupSandbox();
  await assert.rejects(fs.access(SANDBOX_ROOT), { code: 'ENOENT' });
  await fs.access(new URL('../artifacts/conformance-suite-summary.json', import.meta.url));
});

test('authorized write remains within the authorized boundary', async () => {
  assert.equal(isWithinAuthorizedBoundary(path.join(ALLOWED_ROOT, '..safe-name'), ALLOWED_ROOT), true);
  assert.equal(isWithinAuthorizedBoundary(path.resolve(ALLOWED_ROOT, '../outside-escape'), ALLOWED_ROOT), false);

  const result = await runAuthorizedCheck({
    allowedRoot: ALLOWED_ROOT,
    requestedPath: path.join(ALLOWED_ROOT, 'agent-write.txt'),
    content: 'authorized payload',
    caseId: 'authorized-unchanged-execution',
  });

  assert.equal(result.requestedAction, 'write_file');
  assert.equal(result.authorizedResource, ALLOWED_ROOT);
  assert.equal(result.requestedEffectResource, path.join(ALLOWED_ROOT, 'agent-write.txt'));
  assert.equal(result.finalResult, 'PASS');
  assert.equal(result.execution_performed, true);
  assert.ok(result.observedEffects.length >= 1);
  assert.equal(result.observedEffects[0].path, path.join(ALLOWED_ROOT, 'agent-write.txt'));
  assert.equal(result.observedEffects[0].inAuthorizedBoundary, true);
});

test('unauthorized write is blocked before any effect can occur', async () => {
  const result = await runUnauthorizedCheck({
    allowedRoot: ALLOWED_ROOT,
    requestedPath: path.join(OUTSIDE_ROOT, 'blocked.txt'),
    content: 'should not be written',
    caseId: 'obvious-unauthorized-target',
  });

  assert.equal(result.finalResult, 'PASS');
  assert.equal(result.blocker, 'authorization boundary');
  assert.equal(result.requestedAction, 'write_file');
  assert.equal(result.requestedEffectResource, path.join(OUTSIDE_ROOT, 'blocked.txt'));
  assert.equal(result.execution_performed, false);
  assert.deepEqual(result.observedEffects, []);
  assert.equal(result.serverBlocker, 'not reached');
  await assert.rejects(runUnauthorizedCheck({
    allowedRoot: path.dirname(SANDBOX_ROOT),
    requestedPath: path.join(path.dirname(SANDBOX_ROOT), 'unauthorized-write-probe'),
    content: 'must not be written',
  }), /outside the private sandbox/);
});

test('execution-divergence: authorization allows but execution escapes the boundary', async () => {
  const result = await runExecutionDivergenceCheck({
    allowedRoot: ALLOWED_ROOT,
    authorizedTarget: path.join(ALLOWED_ROOT, 'approved.txt'),
    actualTarget: path.join(OUTSIDE_ROOT, 'escaped.txt'),
    content: 'escaped payload',
    caseId: 'execution-layer-path-substitution',
  });

  assert.equal(result.authorizationDecision, 'ALLOW');
  assert.equal(result.authorizedEffect, path.join(ALLOWED_ROOT, 'approved.txt'));
  assert.equal(result.actualFilesystemEffect, path.join(OUTSIDE_ROOT, 'escaped.txt'));
  assert.equal(result.observableInvariant, 'ObservedEffect ⊆ AuthorizedEffect');
  assert.equal(result.invariantResult, false);
  assert.equal(result.finalResult, 'DIVERGENT / FAIL');
  assert.equal(result.execution_performed, true);
  assert.equal(result.observedEffects[0].path, path.join(OUTSIDE_ROOT, 'escaped.txt'));
  assert.equal(result.observedEffects[0].inAuthorizedBoundary, false);
});

test('conformance suite produces 10 cases and machine-readable evidence', async () => {
  const suite = await runConformanceSuite();
  const expectedCases = [
    ['case-01-authorized-unchanged-execution', path.join(ALLOWED_ROOT, 'authorized.txt'), path.join(ALLOWED_ROOT, 'authorized.txt'), path.join(ALLOWED_ROOT, 'authorized.txt'), 'ALLOW', 'IN-BOUNDS', true],
    ['case-02-obvious-unauthorized-target', path.join(ALLOWED_ROOT, 'inside.txt'), path.join(OUTSIDE_ROOT, 'blocked.txt'), [], 'DENY', 'DENIED / NOT EXECUTED', false],
    ['case-03-execution-layer-path-substitution', path.join(ALLOWED_ROOT, 'approved.txt'), path.join(OUTSIDE_ROOT, 'escaped.txt'), path.join(OUTSIDE_ROOT, 'escaped.txt'), 'ALLOW', 'DIVERGENT', true],
    ['case-04-filename-substitution', path.join(ALLOWED_ROOT, 'expected.txt'), path.join(ALLOWED_ROOT, 'actual.txt'), path.join(ALLOWED_ROOT, 'actual.txt'), 'ALLOW', 'DIVERGENT', true],
    ['case-05-relative-path-transformation', path.join(ALLOWED_ROOT, 'dir', 'expected.txt'), `${ALLOWED_ROOT}/dir/../escaped.txt`, path.join(ALLOWED_ROOT, 'escaped.txt'), 'ALLOW', 'DIVERGENT', true],
    ['case-06-nested-path-boundary-escape', path.join(ALLOWED_ROOT, 'sub', 'ok.txt'), `${ALLOWED_ROOT}/sub/../../outside/escaped.txt`, path.join(OUTSIDE_ROOT, 'escaped.txt'), 'ALLOW', 'DIVERGENT', true],
    ['case-07-absolute-path-substitution', path.join(ALLOWED_ROOT, 'abs.txt'), path.join(OUTSIDE_ROOT, 'absolute-escaped.txt'), path.join(OUTSIDE_ROOT, 'absolute-escaped.txt'), 'ALLOW', 'DIVERGENT', true],
    ['case-08-authorization-execution-parameter-mismatch', path.join(ALLOWED_ROOT, 'approved.txt'), path.join(ALLOWED_ROOT, 'other.txt'), path.join(ALLOWED_ROOT, 'other.txt'), 'ALLOW', 'DIVERGENT', true],
    ['case-09-denied-execution-with-zero-effect', path.join(ALLOWED_ROOT, 'inside.txt'), path.join(OUTSIDE_ROOT, 'blocked.txt'), [], 'DENY', 'DENIED / NOT EXECUTED', false],
    ['case-10-repeated-execution-with-independent-verification', path.join(ALLOWED_ROOT, 'repeat.txt'), path.join(ALLOWED_ROOT, 'repeat.txt'), path.join(ALLOWED_ROOT, 'repeat.txt'), 'ALLOW', 'IN-BOUNDS', true],
  ];

  assert.equal(suite.total_cases, 10);
  assert.equal(suite.total_scenarios, 11);
  assert.equal(suite.results.length, 10);
  assert.deepEqual(suite.results.map((caseResult) => caseResult.final_status), [
    'PASS',
    'PASS',
    'DIVERGENT / FAIL',
    'DIVERGENT / FAIL',
    'DIVERGENT / FAIL',
    'DIVERGENT / FAIL',
    'DIVERGENT / FAIL',
    'DIVERGENT / FAIL',
    'PASS',
    'PASS',
  ]);
  assert.deepEqual(suite.results.slice(2, 8).map((caseResult) => caseResult.observed_effect), [
    path.join(OUTSIDE_ROOT, 'escaped.txt'),
    path.join(ALLOWED_ROOT, 'actual.txt'),
    path.join(ALLOWED_ROOT, 'escaped.txt'),
    path.join(OUTSIDE_ROOT, 'escaped.txt'),
    path.join(OUTSIDE_ROOT, 'absolute-escaped.txt'),
    path.join(ALLOWED_ROOT, 'other.txt'),
  ]);
  assert.deepEqual(suite.results.map((caseResult) => [
    caseResult.case_id,
    caseResult.authorized_effect,
    caseResult.execution_request,
    caseResult.observed_effect,
    caseResult.authorization_decision,
    caseResult.comparison_result,
    caseResult.execution_performed,
  ]), expectedCases);
  assert.deepEqual(suite.results.map((caseResult) => caseResult.observed_effect_within_authorization), [
    true, null, false, false, false, false, false, false, null, true,
  ]);
  assert.equal(suite.compliant_scenarios_detected, 2);
  assert.equal(suite.divergent_scenarios_detected, 7);
  assert.deepEqual(suite.classification_counts, {
    in_bounds_core: 2,
    divergent_core: 6,
    denied_not_executed: 2,
    allowed_no_observed_effect: 0,
    sentinel_divergent: 1,
  });
  assert.equal(suite.scenarios_without_observed_effect, 2);
  assert.equal(suite.denied_without_observed_effect, 2);
  assert.ok(suite.results.filter((caseResult) => caseResult.authorization_decision === 'ALLOW')
    .every((caseResult) => caseResult.machine_evidence.changedPaths.length > 0));
  assert.equal(suite.results[9].machine_evidence.executionSnapshots.length, 2);
  assert.deepEqual(suite.results[9].machine_evidence.executionSnapshots.map((run) => run.changedPaths.length), [1, 1]);
  const deniedCases = suite.results.filter((caseResult) => caseResult.authorization_decision === 'DENY');
  for (const caseResult of deniedCases) {
    assert.equal(caseResult.execution_performed, false);
    assert.equal(caseResult.comparison_result, 'DENIED / NOT EXECUTED');
    assert.equal(caseResult.observed_effect_within_authorization, null);
    assert.equal(caseResult.machine_evidence.executionSnapshots.length, 0);
    assert.equal(caseResult.machine_evidence.logs.length, 0);
    assert.deepEqual(caseResult.machine_evidence.changedPaths, []);
    assert.deepEqual(caseResult.machine_evidence.beforeSnapshot, caseResult.machine_evidence.afterSnapshot);
  }
  assert.ok(suite.results.every((caseResult) => caseResult.case_id));
  assert.ok(suite.results.every((caseResult) => caseResult.requested_action));
  assert.ok(suite.results.every((caseResult) => Object.hasOwn(caseResult, 'authorized_effect')));
  assert.ok(suite.results.every((caseResult) => Object.hasOwn(caseResult, 'execution_request')));
  assert.ok(suite.results.every((caseResult) => Object.hasOwn(caseResult, 'observed_effect')));
  assert.ok(suite.results.every((caseResult) => Object.hasOwn(caseResult, 'authorization_decision')));
  assert.ok(suite.results.every((caseResult) => Object.hasOwn(caseResult, 'observed_effect_within_authorization')));
  assert.ok(suite.results.every((caseResult) => Object.hasOwn(caseResult, 'blocker_layer')));
  assert.ok(suite.results.every((caseResult) => Object.hasOwn(caseResult, 'final_status')));
  for (const caseResult of suite.results) {
    const evidence = JSON.parse(await fs.readFile(new URL(`../artifacts/${caseResult.case_id}.json`, import.meta.url), 'utf8'));
    assert.deepEqual(evidence, caseResult);
  }
  assert.deepEqual(JSON.parse(await fs.readFile(new URL('../artifacts/conformance-suite-summary.json', import.meta.url), 'utf8')), suite);

  const symlinkPath = path.join(ALLOWED_ROOT, 'symlink-escape');
  await assert.rejects(runCase({
    caseId: '../artifact-escape',
    allowedRoot: ALLOWED_ROOT,
    authorizedEffect: path.join(ALLOWED_ROOT, 'target.txt'),
    executionRequest: path.join(ALLOWED_ROOT, 'target.txt'),
    content: 'must not be written',
    authorizationDecision: 'DENY',
    blockerLayer: 'test',
  }), /Invalid case identifier/);
  await fs.symlink(path.join(path.dirname(SANDBOX_ROOT), 'not-created'), symlinkPath);
  try {
    await assert.rejects(runCase({
      caseId: 'symlink-escape-probe',
      allowedRoot: ALLOWED_ROOT,
      authorizedEffect: path.join(symlinkPath, 'outside.txt'),
      executionRequest: path.join(symlinkPath, 'outside.txt'),
      content: 'must not be written',
      authorizationDecision: 'ALLOW',
      blockerLayer: 'test',
    }), /resolves outside the private sandbox/);
  } finally {
    await fs.unlink(symlinkPath);
  }
});

test('sentinel divergence proof is correctly detected and reported', async () => {
  const result = await runSentinelDivergenceCheck();

  assert.equal(result.authorization_decision, 'ALLOW');
  assert.equal(result.authorized_effect, path.join(ALLOWED_ROOT, 'sentinel.txt'));
  assert.equal(result.observed_effect, path.join(OUTSIDE_ROOT, 'sentinel-escaped.txt'));
  assert.equal(result.observed_effect_within_authorization, false);
  assert.equal(result.scenario_result, 'DIVERGENT');
  assert.equal(result.comparison_result, 'DIVERGENT');
  assert.equal(result.test_result, 'PASS');
  assert.ok(result.machine_evidence.changedPaths.includes(path.join('outside', 'sentinel-escaped.txt')));
  assert.deepEqual(JSON.parse(await fs.readFile(new URL('../artifacts/sentinel-divergence-proof.json', import.meta.url), 'utf8')), result);
});
