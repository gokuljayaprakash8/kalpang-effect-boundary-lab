import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertGitHubCommentAuthorization,
  createGitHubCommentAuthorization,
  hashGitHubCommentRequest,
} from '../src/github-comment-binding.js';
import { executeAuthorizedGitHubComment } from '../src/execute-github-comment.js';
import { FROZEN_GITHUB_COMMENT_REQUEST } from '../src/run-github-comparison.js';

test('different upstream intents collapse to one authorized request and effect', async () => {
  const request = FROZEN_GITHUB_COMMENT_REQUEST;
  const authorization = createGitHubCommentAuthorization(request, 'ALLOW');
  const requestBytes = Buffer.from(JSON.stringify(request));
  const approvedBody = 'KALPANG controlled comparison: this exact approved comment body is frozen.';
  const intentCases = [
    {
      name: 'A',
      instruction: 'Post this exact comment publicly on issue 1 now.',
      intentExpectation: {
        issue_comments: [{
          owner: 'gokuljayaprakash8',
          repo: 'kalpang-effect-boundary-lab',
          issue_number: 1,
          body: approvedBody,
        }],
        private_drafts: [],
      },
    },
    {
      name: 'B',
      instruction: 'Prepare this exact text as a private draft for review; do not post it to GitHub.',
      intentExpectation: {
        issue_comments: [],
        private_drafts: [{ body: approvedBody }],
      },
    },
  ];

  async function runIntentCase(intentCase) {
    const localProviderState = { issueComments: [], privateDrafts: [] };
    const evidence = {
      INTENT_EXPECTATION: {
        instruction: intentCase.instruction,
        expected_effect: structuredClone(intentCase.intentExpectation),
      },
      APPROVED_REQUEST: {
        decision: authorization.decision,
        canonical_request_sha256: authorization.canonical_request_sha256,
        request_json: JSON.stringify(request),
      },
      ADMISSION: {
        request_binding: 'NOT CHECKED',
        result: 'NOT REACHED',
      },
      FINAL_EXECUTION: {
        final_boundary_decision: 'NOT REACHED',
        final_request_json: null,
        final_request_sha256: null,
        result: 'NOT EXECUTED',
        sink_invocations: 0,
        provider_response: null,
      },
      OBSERVED_EFFECT: {
        source: 'local provider-state reader; reads localProviderState only',
        initial_state: { issueComments: [], privateDrafts: [] },
        state: null,
      },
      INTENT_RECONCILIATION: null,
    };

    evidence.ADMISSION.request_binding = assertGitHubCommentAuthorization(request, authorization);
    evidence.ADMISSION.result = evidence.ADMISSION.request_binding === 'ALLOW' ? 'ALLOW' : 'DENY';
    const restObserver = {
      async listIssueComments() {
        return localProviderState.issueComments.map((comment) => ({ ...comment }));
      },
      async getComment(_request, commentId) {
        return localProviderState.issueComments.find((comment) => comment.id === commentId) ?? null;
      },
    };

    const executionReport = await executeAuthorizedGitHubComment({
      request,
      authorization,
      async mcpCall(admittedRequest) {
        evidence.FINAL_EXECUTION.final_boundary_decision = assertGitHubCommentAuthorization(admittedRequest, authorization);
        evidence.FINAL_EXECUTION.final_request_json = JSON.stringify(admittedRequest);
        evidence.FINAL_EXECUTION.final_request_sha256 = hashGitHubCommentRequest(admittedRequest);
        evidence.FINAL_EXECUTION.result = evidence.FINAL_EXECUTION.final_request_sha256
          === authorization.canonical_request_sha256 ? 'IN-BOUNDS' : 'DIVERGENT';
        const arguments_ = admittedRequest.params.arguments;
        evidence.FINAL_EXECUTION.sink_invocations += 1;
        localProviderState.issueComments.push({
          id: 1,
          owner: arguments_.owner,
          repo: arguments_.repo,
          issue_number: arguments_.issue_number,
          body: arguments_.body,
          issue_url: `https://api.github.com/repos/${arguments_.owner}/${arguments_.repo}/issues/${arguments_.issue_number}`,
        });
        evidence.FINAL_EXECUTION.provider_response = 'SUCCESS';
        return { isError: false };
      },
      restObserver,
    });
    evidence.FINAL_EXECUTION.existing_observer_result = executionReport.comparison_result;

    evidence.OBSERVED_EFFECT.state = {
      issue_comments: localProviderState.issueComments.map(({ owner, repo, issue_number: issueNumber, body }) => ({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      })),
      private_drafts: localProviderState.privateDrafts.map((draft) => ({ ...draft })),
    };
    evidence.INTENT_RECONCILIATION = JSON.stringify(evidence.OBSERVED_EFFECT.state)
      === JSON.stringify(evidence.INTENT_EXPECTATION.expected_effect) ? 'IN-BOUNDS' : 'DIVERGENT';
    return evidence;
  }

  function evaluateIntentPredicateAtAdmission(intentCase) {
    const approvalEnvelope = {
      request_authorization: authorization,
      intent_expectation: intentCase.intentExpectation,
    };
    const requestDecision = assertGitHubCommentAuthorization(request, approvalEnvelope.request_authorization);
    const emittedEffect = {
      issue_comments: [{
        owner: request.params.arguments.owner,
        repo: request.params.arguments.repo,
        issue_number: request.params.arguments.issue_number,
        body: request.params.arguments.body,
      }],
      private_drafts: [],
    };
    const matchesIntent = JSON.stringify(emittedEffect) === JSON.stringify(approvalEnvelope.intent_expectation);
    return requestDecision === 'ALLOW' && matchesIntent ? 'ALLOW' : 'DENY';
  }

  const [intentA, intentB] = await Promise.all(intentCases.map(runIntentCase));

  assert.equal(Buffer.compare(requestBytes, Buffer.from(intentA.APPROVED_REQUEST.request_json)), 0);
  assert.equal(Buffer.compare(requestBytes, Buffer.from(intentB.APPROVED_REQUEST.request_json)), 0);
  assert.equal(intentA.APPROVED_REQUEST.canonical_request_sha256, intentB.APPROVED_REQUEST.canonical_request_sha256);
  for (const evidence of [intentA, intentB]) {
    assert.equal(evidence.ADMISSION.request_binding, 'ALLOW');
    assert.equal(evidence.ADMISSION.result, 'ALLOW');
    assert.equal(evidence.FINAL_EXECUTION.final_boundary_decision, 'ALLOW');
    assert.equal(evidence.FINAL_EXECUTION.final_request_json, JSON.stringify(request));
    assert.equal(evidence.FINAL_EXECUTION.final_request_sha256, authorization.canonical_request_sha256);
    assert.equal(evidence.FINAL_EXECUTION.result, 'IN-BOUNDS');
    assert.equal(evidence.FINAL_EXECUTION.sink_invocations, 1);
    assert.equal(evidence.FINAL_EXECUTION.provider_response, 'SUCCESS');
    assert.equal(evidence.FINAL_EXECUTION.existing_observer_result, 'IN-BOUNDS');
  }
  assert.deepEqual(intentA.OBSERVED_EFFECT.initial_state, intentB.OBSERVED_EFFECT.initial_state);
  assert.deepEqual(intentA.OBSERVED_EFFECT.state, intentB.OBSERVED_EFFECT.state);
  assert.equal(intentA.INTENT_RECONCILIATION, 'IN-BOUNDS');
  assert.equal(intentB.INTENT_RECONCILIATION, 'DIVERGENT');
  assert.equal(evaluateIntentPredicateAtAdmission(intentCases[0]), 'ALLOW');
  assert.equal(evaluateIntentPredicateAtAdmission(intentCases[1]), 'DENY');
});
