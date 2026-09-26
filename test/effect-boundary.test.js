import test from 'node:test';
import assert from 'node:assert/strict';

import { runAuthorizedCheck, runUnauthorizedCheck, runExecutionDivergenceCheck } from '../src/experiment.js';
import { runConformanceSuite, runSentinelDivergenceCheck } from '../src/conformance-suite.js';

test('authorized write remains within the authorized boundary', async () => {
  const result = await runAuthorizedCheck({
    allowedRoot: '/sandbox/allowed',
    requestedPath: '/sandbox/allowed/agent-write.txt',
    content: 'authorized payload',
    caseId: 'authorized-unchanged-execution',
  });

  assert.equal(result.requestedAction, 'write_file');
  assert.equal(result.authorizedResource, '/sandbox/allowed');
  assert.equal(result.requestedEffectResource, '/sandbox/allowed/agent-write.txt');
  assert.equal(result.finalResult, 'PASS');
  assert.ok(result.observedEffects.length >= 1);
  assert.equal(result.observedEffects[0].path, '/sandbox/allowed/agent-write.txt');
  assert.equal(result.observedEffects[0].inAuthorizedBoundary, true);
});

test('unauthorized write is blocked before any effect can occur', async () => {
  const result = await runUnauthorizedCheck({
    allowedRoot: '/sandbox/allowed',
    requestedPath: '/sandbox/outside/blocked.txt',
    content: 'should not be written',
    caseId: 'obvious-unauthorized-target',
  });

  assert.equal(result.finalResult, 'FAIL');
  assert.equal(result.blocker, 'authorization boundary');
  assert.equal(result.requestedAction, 'write_file');
  assert.equal(result.requestedEffectResource, '/sandbox/outside/blocked.txt');
  assert.deepEqual(result.observedEffects, []);
  assert.equal(result.serverBlocker, 'not reached');
});

test('execution-divergence: authorization allows but execution escapes the boundary', async () => {
  const result = await runExecutionDivergenceCheck({
    allowedRoot: '/sandbox/allowed',
    authorizedTarget: '/sandbox/allowed/approved.txt',
    actualTarget: '/sandbox/outside/escaped.txt',
    content: 'escaped payload',
    caseId: 'execution-layer-path-substitution',
  });

  assert.equal(result.authorizationDecision, 'ALLOW');
  assert.equal(result.authorizedEffect, '/sandbox/allowed/approved.txt');
  assert.equal(result.actualFilesystemEffect, '/sandbox/outside/escaped.txt');
  assert.equal(result.observableInvariant, 'ObservedEffect ⊆ AuthorizedEffect');
  assert.equal(result.invariantResult, false);
  assert.equal(result.finalResult, 'DIVERGENT / FAIL');
  assert.equal(result.observedEffects[0].path, '/sandbox/outside/escaped.txt');
  assert.equal(result.observedEffects[0].inAuthorizedBoundary, false);
});

test('conformance suite produces 10 cases and machine-readable evidence', async () => {
  const suite = await runConformanceSuite();

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
  assert.equal(suite.compliant_scenarios_detected, 4);
  assert.equal(suite.divergent_scenarios_detected, 7);
  assert.equal(suite.scenarios_without_observed_effect, 2);
  assert.ok(suite.results.filter((caseResult) => caseResult.authorization_decision === 'ALLOW')
    .every((caseResult) => caseResult.machine_evidence.changedPaths.length > 0));
  assert.ok(suite.results.filter((caseResult) => caseResult.authorization_decision === 'DENY')
    .every((caseResult) => caseResult.machine_evidence.changedPaths.length === 0));
  assert.ok(suite.results.every((caseResult) => caseResult.case_id));
  assert.ok(suite.results.every((caseResult) => caseResult.requested_action));
  assert.ok(suite.results.every((caseResult) => Object.hasOwn(caseResult, 'authorized_effect')));
  assert.ok(suite.results.every((caseResult) => Object.hasOwn(caseResult, 'execution_request')));
  assert.ok(suite.results.every((caseResult) => Object.hasOwn(caseResult, 'observed_effect')));
  assert.ok(suite.results.every((caseResult) => Object.hasOwn(caseResult, 'authorization_decision')));
  assert.ok(suite.results.every((caseResult) => Object.hasOwn(caseResult, 'observed_effect_within_authorization')));
  assert.ok(suite.results.every((caseResult) => Object.hasOwn(caseResult, 'blocker_layer')));
  assert.ok(suite.results.every((caseResult) => Object.hasOwn(caseResult, 'final_status')));
});

test('sentinel divergence proof is correctly detected and reported', async () => {
  const result = await runSentinelDivergenceCheck();

  assert.equal(result.authorization_decision, 'ALLOW');
  assert.equal(result.authorized_effect, '/sandbox/allowed/sentinel.txt');
  assert.equal(result.observed_effect, '/sandbox/outside/sentinel-escaped.txt');
  assert.equal(result.observed_effect_within_authorization, false);
  assert.equal(result.scenario_result, 'DIVERGENT');
  assert.equal(result.test_result, 'PASS');
  assert.ok(result.machine_evidence.changedPaths.includes('outside/sentinel-escaped.txt'));
});
