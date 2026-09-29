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