import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertGitHubCommentAuthorization,
  createGitHubCommentAuthorization,
  hashGitHubCommentRequest,
} from '../src/github-comment-binding.js';
import { executeAuthorizedGitHubComment } from '../src/execute-github-comment.js';
import { FROZEN_GITHUB_COMMENT_REQUEST } from '../src/run-github-comparison.js';

function makeRequest(overrides = {}) {
  return {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'add_issue_comment',
      arguments: {
        owner: 'gokuljayaprakash8',
        repo: 'kalpang-effect-boundary-lab',
        issue_number: 42,
        body: 'kalpang effect-boundary test comment',
        ...overrides,
      },
    },
  };
}

function makeComment(request, { id = 1001, body = request.params.arguments.body } = {}) {
  const { owner, repo, issue_number: issueNumber } = request.params.arguments;
  return {
    id,
    body,
    issue_url: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
    html_url: `https://github.com/${owner}/${repo}/issues/${issueNumber}#issuecomment-${id}`,
  };
}

test('authorization is produced in a separate process and persisted for execution', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kalpang-github-auth-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const request = makeRequest();
  const requestPath = path.join(directory, 'request.json');
  const authorizationPath = path.join(directory, 'authorization.json');
  await fs.writeFile(requestPath, `${JSON.stringify(request)}\n`);

  const authorizerPath = fileURLToPath(new URL('../src/authorize-github-comment.js', import.meta.url));
  const authorizer = spawnSync(process.execPath, [authorizerPath, requestPath, authorizationPath, 'ALLOW'], { encoding: 'utf8' });
  assert.equal(authorizer.status, 0, authorizer.stderr);

  const authorization = JSON.parse(await fs.readFile(authorizationPath, 'utf8'));
  assert.equal(authorization.decision, 'ALLOW');
  assert.equal(authorization.canonical_request_sha256, hashGitHubCommentRequest(request));
  assert.equal(assertGitHubCommentAuthorization(request, authorization), 'ALLOW');

  let called = false;
  const report = await executeAuthorizedGitHubComment({
    request,
    authorization,
    mcpCall: async () => { called = true; return {}; },
    restObserver: { listIssueComments: async () => [], getComment: async () => null },
  });
  assert.equal(called, true);
  assert.equal(report.comparison_result, 'INDETERMINATE');
});

test('authorization cannot be reused for a materially different MCP request', async () => {
  const authorizedRequest = makeRequest();
  const authorization = createGitHubCommentAuthorization(authorizedRequest, 'ALLOW');
  const changedRequests = [
    makeRequest({ issue_number: 43 }),
    makeRequest({ repo: 'another-repository' }),
    makeRequest({ body: 'different comment' }),
  ];
  for (const request of changedRequests) {
    assert.throws(() => assertGitHubCommentAuthorization(request, authorization), /does not bind|canonical repository/);
  }

  let called = false;
  await assert.rejects(executeAuthorizedGitHubComment({
    request: changedRequests[0],
    authorization,
    mcpCall: async () => { called = true; return {}; },
    restObserver: { listIssueComments: async () => [], getComment: async () => null },
  }), /does not bind/);
  assert.equal(called, false);
});

test('caller mutation during REST observation cannot alter the authorized MCP request', async () => {
  const request = makeRequest();
  const authorization = createGitHubCommentAuthorization(request, 'ALLOW');
  const comment = makeComment(request);
  let listCount = 0;
  let actualMcpBody;
  const report = await executeAuthorizedGitHubComment({
    request,
    authorization,
    mcpCall: async (mcpRequest) => {
      actualMcpBody = mcpRequest.params.arguments.body;
      return {};
    },
    restObserver: {
      listIssueComments: async () => {
        listCount += 1;
        if (listCount === 1) {
          request.params.arguments.body = 'mutated after authorization';
          return [];
        }
        return [comment];
      },
      getComment: async () => comment,
    },
  });
  assert.equal(actualMcpBody, 'kalpang effect-boundary test comment');
  assert.equal(report.comparison_result, 'IN-BOUNDS');
});

test('REST observation, not MCP output, determines an in-bounds result', async () => {
  const request = makeRequest();
  const authorization = createGitHubCommentAuthorization(request, 'ALLOW');
  const comment = makeComment(request);
  let listCount = 0;
  const report = await executeAuthorizedGitHubComment({
    request,
    authorization,
    mcpCall: async () => ({ isError: true, content: [{ type: 'text', text: 'MCP said error' }] }),
    restObserver: {
      listIssueComments: async () => (++listCount === 1 ? [] : [comment]),
      getComment: async () => comment,
    },
  });
  assert.equal(report.comparison_result, 'IN-BOUNDS');
  assert.equal(report.mcp_call_status, 'MCP REPORTED ERROR');
  assert.equal(report.observed_comment_id, comment.id);
});

test('missing or unavailable REST observation remains INDETERMINATE', async (t) => {
  const request = makeRequest();
  const authorization = createGitHubCommentAuthorization(request, 'ALLOW');

  await t.test('comment not present', async () => {
    let listCount = 0;
    const report = await executeAuthorizedGitHubComment({
      request,
      authorization,
      mcpCall: async () => ({ isError: false }),
      restObserver: {
        listIssueComments: async () => (++listCount === 1 ? [] : []),
        getComment: async () => null,
      },
    });
    assert.equal(report.comparison_result, 'INDETERMINATE');
    assert.equal(report.final_status, 'INDETERMINATE');
    assert.equal(report.reason, 'NO_NEW_COMMENT_OBSERVED');
  });

  await t.test('REST unavailable after execution', async () => {
    let listCount = 0;
    let mcpCalled = false;
    const report = await executeAuthorizedGitHubComment({
      request,
      authorization,
      mcpCall: async () => {
        mcpCalled = true;
        return { isError: false };
      },
      restObserver: {
        listIssueComments: async () => {
          listCount += 1;
          if (listCount === 1) return [];
          throw new Error('simulated REST outage');
        },
        getComment: async () => null,
      },
    });
    assert.equal(mcpCalled, true);
    assert.equal(report.execution_performed, true);
    assert.equal(report.mcp_call_status, 'RESPONSE RECEIVED');
    assert.equal(report.comparison_result, 'INDETERMINATE');
    assert.equal(report.final_status, 'INDETERMINATE');
    assert.equal(report.reason, 'POST_EXECUTION_REST_OBSERVATION_UNAVAILABLE');
  });
});

test('conflicting list and comment-detail observations remain INDETERMINATE', async () => {
  const request = makeRequest();
  const authorization = createGitHubCommentAuthorization(request, 'ALLOW');
  const listed = makeComment(request);
  const detail = makeComment(request, { body: 'inconsistent REST detail' });
  let listCount = 0;
  const report = await executeAuthorizedGitHubComment({
    request,
    authorization,
    mcpCall: async () => ({ isError: false }),
    restObserver: {
      listIssueComments: async () => (++listCount === 1 ? [] : [listed]),
      getComment: async () => detail,
    },
  });
  assert.equal(report.comparison_result, 'INDETERMINATE');
  assert.equal(report.final_status, 'INDETERMINATE');
  assert.equal(report.reason, 'REST_OBSERVATIONS_CONFLICT');
});

test('a body substituted at the MCP transport is divergent against authorization', async () => {
  const request = FROZEN_GITHUB_COMMENT_REQUEST;
  const authorization = createGitHubCommentAuthorization(request, 'ALLOW');
  const authorizedBody = request.params.arguments.body;
  const substitutedBody = 'different body sent to GitHub after authorization';
  let externalComment;
  const sideEffectBodies = [];
  let listCount = 0;
  const report = await executeAuthorizedGitHubComment({
    request,
    authorization,
    mcpCall: async (authorizedRequest) => {
      const transportRequest = {
        ...authorizedRequest,
        params: {
          ...authorizedRequest.params,
          arguments: { ...authorizedRequest.params.arguments, body: substitutedBody },
        },
      };
      const sideEffectSink = (downstreamRequest) => {
        sideEffectBodies.push(downstreamRequest.params.arguments.body);
        externalComment = makeComment(downstreamRequest);
      };
      sideEffectSink(transportRequest);
      return { isError: false };
    },
    restObserver: {
      listIssueComments: async () => (++listCount === 1 ? [] : [externalComment]),
      getComment: async () => externalComment,
    },
  });
  assert.equal(authorization.canonical_request_sha256, hashGitHubCommentRequest(request));
  assert.equal(authorizedBody, FROZEN_GITHUB_COMMENT_REQUEST.params.arguments.body);
  assert.deepEqual(sideEffectBodies, [substitutedBody]);
  assert.equal(externalComment.body, substitutedBody);
  assert.equal(report.comparison_result, 'DIVERGENT');
  assert.equal(report.final_status, 'DIVERGENT / FAIL');
});

test('four-condition local comparison separates admission, execution, and observed effect', async () => {
  const request = FROZEN_GITHUB_COMMENT_REQUEST;
  const authorization = createGitHubCommentAuthorization(request, 'ALLOW');
  const approvedEffect = effectFromRequest(request);
  const mutatedBody = 'downstream-only local test mutation';

  function effectFromRequest(value) {
    return {
      action: value.params.name,
      ...value.params.arguments,
    };
  }

  function requestWithBody(value, body) {
    return {
      ...value,
      params: {
        ...value.params,
        arguments: { ...value.params.arguments, body },
      },
    };
  }

  function invokeLocalSideEffectSink(effect, sinkState, executionEvidence) {
    executionEvidence.sink_executed = true;
    executionEvidence.final_request = { ...effect };
    sinkState.push({ ...effect });
  }

  async function runCondition({ mutate, enforceAtSink }) {
    const sinkState = [];
    const evidence = {
      approved_semantic_effect: { ...approvedEffect },
      admission: { result: 'NOT REACHED', authorized_request_sha256: authorization.canonical_request_sha256 },
      final_boundary: { decision: 'NOT REACHED', presented_effect: null },
      execution: { sink_executed: false, final_request: null },
      observation: {
        source: 'separate local sink-state reader; does not read authorization or execution records',
        observed_state: null,
        actual_effect: null,
        reconciliation_result: 'INDETERMINATE',
        existing_pipeline_reconciliation_result: null,
      },
    };

    function sinkComment(effect) {
      return {
        id: 1,
        body: effect.body,
        issue_url: `https://api.github.com/repos/${effect.owner}/${effect.repo}/issues/${effect.issue_number}`,
      };
    }

    const restObserver = {
      async listIssueComments() {
        return sinkState.map(sinkComment);
      },
      async getComment(_request, commentId) {
        return sinkState.map(sinkComment).find((comment) => comment.id === commentId) ?? null;
      },
    };

    const independentObserver = {
      async readState() {
        return sinkState.map((effect) => ({ ...effect }));
      },
    };

    const executionReport = await executeAuthorizedGitHubComment({
      request,
      authorization,
      async mcpCall(admittedRequest) {
        evidence.admission.result = 'ADMITTED';
        evidence.admission.presented_request_sha256 = hashGitHubCommentRequest(admittedRequest);
        const downstreamRequest = mutate ? requestWithBody(admittedRequest, mutatedBody) : admittedRequest;
        const presentedEffect = effectFromRequest(downstreamRequest);
        evidence.final_boundary.presented_effect = presentedEffect;

        if (enforceAtSink) {
          try {
            assertGitHubCommentAuthorization(downstreamRequest, authorization);
            evidence.final_boundary.decision = 'ACCEPTED';
          } catch (error) {
            evidence.final_boundary.decision = 'REJECTED';
            throw error;
          }
        } else {
          evidence.final_boundary.decision = 'NOT REVALIDATED';
        }

        invokeLocalSideEffectSink(presentedEffect, sinkState, evidence.execution);
        return { isError: false };
      },
      restObserver,
    });

    evidence.observation.existing_pipeline_reconciliation_result = executionReport.comparison_result;
    evidence.observation.observed_state = await independentObserver.readState();
    if (evidence.observation.observed_state.length === 1) {
      evidence.observation.actual_effect = { ...evidence.observation.observed_state[0] };
      evidence.observation.reconciliation_result = JSON.stringify(evidence.observation.observed_state[0])
        === JSON.stringify(approvedEffect) ? 'IN-BOUNDS' : 'DIVERGENT';
    }
    return evidence;
  }

  const currentBoundary = await runCondition({ mutate: true, enforceAtSink: false });
  const enforcedMutation = await runCondition({ mutate: true, enforceAtSink: true });
  const enforcedObserved = await runCondition({ mutate: false, enforceAtSink: true });
  const falsificationAttempt = await runCondition({ mutate: false, enforceAtSink: true });

  assert.equal(authorization.canonical_request_sha256, hashGitHubCommentRequest(request));

  assert.equal(currentBoundary.admission.result, 'ADMITTED');
  assert.equal(currentBoundary.admission.presented_request_sha256, authorization.canonical_request_sha256);
  assert.equal(currentBoundary.final_boundary.decision, 'NOT REVALIDATED');
  assert.equal(currentBoundary.execution.sink_executed, true);
  assert.equal(currentBoundary.execution.final_request.body, mutatedBody);
  assert.equal(currentBoundary.observation.actual_effect.body, mutatedBody);
  assert.equal(currentBoundary.observation.reconciliation_result, 'DIVERGENT');

  assert.equal(enforcedMutation.admission.result, 'ADMITTED');
  assert.equal(enforcedMutation.admission.presented_request_sha256, authorization.canonical_request_sha256);
  assert.equal(enforcedMutation.final_boundary.decision, 'REJECTED');
  assert.equal(enforcedMutation.final_boundary.presented_effect.body, mutatedBody);
  assert.equal(enforcedMutation.execution.sink_executed, false);
  assert.equal(enforcedMutation.observation.actual_effect, null);
  assert.equal(enforcedMutation.observation.reconciliation_result, 'INDETERMINATE');

  for (const condition of [enforcedObserved, falsificationAttempt]) {
    assert.equal(condition.admission.result, 'ADMITTED');
    assert.equal(condition.admission.presented_request_sha256, authorization.canonical_request_sha256);
    assert.equal(condition.final_boundary.decision, 'ACCEPTED');
    assert.equal(condition.execution.sink_executed, true);
    assert.deepEqual(condition.execution.final_request, approvedEffect);
    assert.deepEqual(condition.observation.observed_state, [approvedEffect]);
    assert.deepEqual(condition.observation.actual_effect, approvedEffect);
    assert.equal(condition.observation.reconciliation_result, 'IN-BOUNDS');
  }
  assert.equal(falsificationAttempt.observation.existing_pipeline_reconciliation_result, 'IN-BOUNDS');
});

test('successful final-conduit validation does not guarantee matching provider state', async () => {
  const request = FROZEN_GITHUB_COMMENT_REQUEST;
  const authorization = createGitHubCommentAuthorization(request, 'ALLOW');
  const approvedEffect = {
    action: request.params.name,
    ...request.params.arguments,
  };
  const providerState = [];
  const evidence = {
    admission: { result: 'NOT REACHED', approved_semantic_effect: approvedEffect },
    execution: {
      result: 'NOT EXECUTED',
      final_boundary_decision: 'NOT REACHED',
      final_request: null,
      final_request_sha256: null,
      conduit_executed: false,
      provider_response: null,
    },
    observation: {
      source: 'local full-state reader; reads providerState, not authorization or execution records',
      observed_effects: null,
      result: 'INDETERMINATE',
      existing_issue_scoped_report: null,
    },
  };

  const providerSimulator = {
    async apply(validatedRequest) {
      const acceptedEffect = {
        action: validatedRequest.params.name,
        ...validatedRequest.params.arguments,
      };
      providerState.push({ ...acceptedEffect, issue_number: acceptedEffect.issue_number + 1 });
      return { isError: false };
    },
  };

  function commentsForRequest(value) {
    const { owner, repo, issue_number: issueNumber } = value.params.arguments;
    return providerState
      .filter((effect) => effect.owner === owner && effect.repo === repo && effect.issue_number === issueNumber)
      .map((effect, index) => ({
        id: index + 1,
        body: effect.body,
        issue_url: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
      }));
  }

  const restObserver = {
    async listIssueComments(value) {
      return commentsForRequest(value);
    },
    async getComment(value, commentId) {
      return commentsForRequest(value).find((comment) => comment.id === commentId) ?? null;
    },
  };

  async function finalConduit(validatedRequest) {
    assert.equal(assertGitHubCommentAuthorization(validatedRequest, authorization), 'ALLOW');
    evidence.execution.final_boundary_decision = 'ACCEPTED';
    evidence.execution.final_request = {
      action: validatedRequest.params.name,
      ...validatedRequest.params.arguments,
    };
    evidence.execution.final_request_sha256 = hashGitHubCommentRequest(validatedRequest);
    evidence.execution.result = JSON.stringify(evidence.execution.final_request) === JSON.stringify(approvedEffect)
      ? 'IN-BOUNDS' : 'DIVERGENT';
    evidence.execution.conduit_executed = true;
    const response = await providerSimulator.apply(validatedRequest);
    evidence.execution.provider_response = response.isError ? 'ERROR' : 'SUCCESS';
    return response;
  }

  const executionReport = await executeAuthorizedGitHubComment({
    request,
    authorization,
    async mcpCall(admittedRequest) {
      evidence.admission.result = 'IN-BOUNDS';
      evidence.admission.authorized_request_sha256 = authorization.canonical_request_sha256;
      evidence.admission.presented_request_sha256 = hashGitHubCommentRequest(admittedRequest);
      return finalConduit(admittedRequest);
    },
    restObserver,
  });

  const independentObserver = {
    async readAllEffects() {
      return providerState.map((effect) => ({ ...effect }));
    },
  };
  evidence.observation.observed_effects = await independentObserver.readAllEffects();
  evidence.observation.existing_issue_scoped_report = executionReport.comparison_result;
  if (evidence.observation.observed_effects.length === 1) {
    evidence.observation.result = JSON.stringify(evidence.observation.observed_effects[0])
      === JSON.stringify(approvedEffect) ? 'IN-BOUNDS' : 'DIVERGENT';
  }

  assert.equal(evidence.admission.result, 'IN-BOUNDS');
  assert.equal(evidence.admission.presented_request_sha256, authorization.canonical_request_sha256);
  assert.equal(evidence.execution.final_boundary_decision, 'ACCEPTED');
  assert.equal(evidence.execution.final_request_sha256, authorization.canonical_request_sha256);
  assert.deepEqual(evidence.execution.final_request, approvedEffect);
  assert.equal(evidence.execution.result, 'IN-BOUNDS');
  assert.equal(evidence.execution.conduit_executed, true);
  assert.equal(evidence.execution.provider_response, 'SUCCESS');
  assert.deepEqual(evidence.observation.observed_effects, [{ ...approvedEffect, issue_number: approvedEffect.issue_number + 1 }]);
  assert.equal(evidence.observation.result, 'DIVERGENT');
  assert.equal(evidence.observation.existing_issue_scoped_report, 'INDETERMINATE');
});
