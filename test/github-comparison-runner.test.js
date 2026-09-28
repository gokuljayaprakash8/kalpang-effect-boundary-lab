import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FROZEN_GITHUB_COMMENT_REQUEST, runGitHubComparison } from '../src/run-github-comparison.js';
import { assertGitHubCommentAuthorization, hashGitHubCommentRequest } from '../src/github-comment-binding.js';

test('comparison uses one frozen authorization and records three independent cases', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kalpang-comparison-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const outputDirectory = path.join(directory, 'run');

  const comparison = await runGitHubComparison(outputDirectory);
  const request = JSON.parse(await fs.readFile(path.join(outputDirectory, 'request.json'), 'utf8'));
  const authorization = JSON.parse(await fs.readFile(path.join(outputDirectory, 'authorization.json'), 'utf8'));
  const persistedComparison = JSON.parse(await fs.readFile(path.join(outputDirectory, 'comparison.json'), 'utf8'));

  assert.equal(assertGitHubCommentAuthorization(request, authorization), 'ALLOW');
  assert.equal(hashGitHubCommentRequest(request), comparison.frozen_request_sha256);
  assert.equal(authorization.canonical_request_sha256, comparison.frozen_request_sha256);
  assert.equal(comparison.frozen_request_sha256, 'fb95e7fefd718922a1af792cbcd6e0348ee4fea48b9d834a0ced25b3a6cd1b03');
  assert.deepEqual(request, FROZEN_GITHUB_COMMENT_REQUEST);
  assert.deepEqual(persistedComparison, comparison);
  assert.deepEqual(comparison.cases.map(({ mutation_point: point }) => point), [
    'before-gate',
    'after-gate-before-github',
    'observer-unavailable',
  ]);
  assert.ok(comparison.cases.every(({ admission, effect_observation }) => admission && effect_observation));

  const [beforeGate, afterGate, observerUnavailable] = comparison.cases;
  assert.equal(beforeGate.admission.result, 'REFUSED');
  assert.equal(beforeGate.admission.decision, 'REFUSED');
  assert.equal(beforeGate.mcp_execution.execution_performed, false);
  assert.equal(beforeGate.effect_observation.comparison_result, 'INDETERMINATE');
  assert.equal(afterGate.admission.result, 'ADMITTED');
  assert.equal(afterGate.admission.presented_request_sha256, comparison.frozen_request_sha256);
  assert.notEqual(afterGate.mcp_execution.transport_request_sha256, comparison.frozen_request_sha256);
  assert.equal(afterGate.effect_observation.comparison_result, 'DIVERGENT');
  assert.equal(afterGate.integration_prevention_failure, true);
  assert.equal(observerUnavailable.admission.result, 'ADMITTED');
  assert.equal(observerUnavailable.effect_observation.comparison_result, 'INDETERMINATE');
  assert.equal(observerUnavailable.effect_observation.reason, 'POST_EXECUTION_REST_OBSERVATION_UNAVAILABLE');
});

test('canonical runner request is deeply immutable', () => {
  const originalBody = FROZEN_GITHUB_COMMENT_REQUEST.params.arguments.body;
  assert.throws(() => {
    FROZEN_GITHUB_COMMENT_REQUEST.params.arguments.body = 'mutated';
  }, TypeError);
  assert.equal(FROZEN_GITHUB_COMMENT_REQUEST.params.arguments.body, originalBody);
  assert.ok(Object.isFrozen(FROZEN_GITHUB_COMMENT_REQUEST));
  assert.ok(Object.isFrozen(FROZEN_GITHUB_COMMENT_REQUEST.params));
  assert.ok(Object.isFrozen(FROZEN_GITHUB_COMMENT_REQUEST.params.arguments));
});

test('comparison refuses output nested under protected evidence directories', async () => {
  const protectedOutput = new URL('../artifacts/github-live-2026-09-27/comparison-runner-test/', import.meta.url);
  await assert.rejects(runGitHubComparison(protectedOutput.pathname), /protected existing GitHub evidence/);
});

test('comparison refuses a symlink alias into protected evidence directories', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kalpang-comparison-alias-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const protectedDirectory = new URL('../artifacts/github-live-2026-09-27/', import.meta.url);
  const alias = path.join(directory, 'evidence-alias');
  await fs.symlink(protectedDirectory, alias, 'dir');

  await assert.rejects(runGitHubComparison(path.join(alias, 'comparison-runner-test')), /protected existing GitHub evidence/);
});