import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertGitHubCommentAuthorization,
  createGitHubCommentAuthorization,
  hashGitHubCommentRequest,
} from '../src/github-comment-binding.js';
import { executeAuthorizedGitHubComment } from '../src/execute-github-comment.js';
import { FROZEN_GITHUB_COMMENT_REQUEST } from '../src/run-github-comparison.js';

test('temporal state drift is refused when precondition is checked and divergent when only observed', async () => {
  const request = FROZEN_GITHUB_COMMENT_REQUEST;
  const authorization = createGitHubCommentAuthorization(request, 'ALLOW');
  const approvedRequestDigest = authorization.canonical_request_sha256;
  const t1Precondition = {
    issue_number: request.params.arguments.issue_number,
    issue_state: 'open',
  };
  const t1ApprovedSemanticEffect = {
    action: request.params.name,
    ...request.params.arguments,
    issue_state: t1Precondition.issue_state,
  };

  async function runAtT2({ checkPreconditionAtAdmission }) {
    const localState = {
      issue: { number: t1Precondition.issue_number, state: t1Precondition.issue_state },
      comments: [],
    };
    const evidence = {
      t1: {
        approved_request_sha256: approvedRequestDigest,
        resource_precondition: { ...t1Precondition },
        approved_semantic_effect: { ...t1ApprovedSemanticEffect },
        precondition_checked_at_admission: checkPreconditionAtAdmission,
      },
      admission: { request_binding: 'NOT CHECKED', result: 'NOT REACHED' },
      execution: {
        final_boundary_decision: 'NOT REACHED',
        final_request: null,
        final_request_sha256: null,
        result: 'NOT EXECUTED',
        provider_response: null,
        existing_observer_result: null,
      },
      observation: {
        source: 'local state reader; reads localState, not admission or execution records',
        issue_state: null,
        comments: null,
        observed_semantic_effect: null,
        result: 'INDETERMINATE',
      },
    };

    localState.issue.state = 'closed';

    const requestDecision = assertGitHubCommentAuthorization(request, authorization);
    evidence.admission.request_binding = requestDecision;
    if (checkPreconditionAtAdmission && localState.issue.state !== t1Precondition.issue_state) {
      evidence.admission.result = 'REFUSED';
    } else {
      evidence.admission.result = 'ADMITTED';
    }

    if (evidence.admission.result === 'ADMITTED') {
      const restObserver = {
        async listIssueComments() {
          return localState.comments.map((comment) => ({ ...comment }));
        },
        async getComment(_request, commentId) {
          return localState.comments.find((comment) => comment.id === commentId) ?? null;
        },
      };
      const providerSimulator = {
        async addComment(validatedRequest) {
          const arguments_ = validatedRequest.params.arguments;
          localState.comments.push({
            id: 1,
            body: arguments_.body,
            issue_url: `https://api.github.com/repos/${arguments_.owner}/${arguments_.repo}/issues/${arguments_.issue_number}`,
          });
          return { isError: false };
        },
      };

      const executionReport = await executeAuthorizedGitHubComment({
        request,
        authorization,
        async mcpCall(admittedRequest) {
          evidence.execution.final_boundary_decision = assertGitHubCommentAuthorization(admittedRequest, authorization);
          evidence.execution.final_request = {
            action: admittedRequest.params.name,
            ...admittedRequest.params.arguments,
          };
          evidence.execution.final_request_sha256 = hashGitHubCommentRequest(admittedRequest);
          evidence.execution.result = evidence.execution.final_request_sha256 === approvedRequestDigest
            ? 'IN-BOUNDS' : 'DIVERGENT';
          const response = await providerSimulator.addComment(admittedRequest);
          evidence.execution.provider_response = response.isError ? 'ERROR' : 'SUCCESS';
          return response;
        },
        restObserver,
      });
      evidence.execution.existing_observer_result = executionReport.comparison_result;
    }

    evidence.observation.issue_state = localState.issue.state;
    evidence.observation.comments = localState.comments.map((comment) => ({ ...comment }));
    if (evidence.observation.comments.length === 1) {
      evidence.observation.observed_semantic_effect = {
        action: request.params.name,
        ...request.params.arguments,
        issue_state: evidence.observation.issue_state,
      };
      evidence.observation.result = JSON.stringify(evidence.observation.observed_semantic_effect)
        === JSON.stringify(evidence.t1.approved_semantic_effect) ? 'IN-BOUNDS' : 'DIVERGENT';
    }
    return evidence;
  }

  const checkedPrecondition = await runAtT2({ checkPreconditionAtAdmission: true });
  const unboundPrecondition = await runAtT2({ checkPreconditionAtAdmission: false });

  assert.equal(checkedPrecondition.t1.approved_request_sha256, approvedRequestDigest);
  assert.equal(checkedPrecondition.admission.request_binding, 'ALLOW');
  assert.equal(checkedPrecondition.admission.result, 'REFUSED');
  assert.equal(checkedPrecondition.execution.result, 'NOT EXECUTED');
  assert.equal(checkedPrecondition.observation.comments.length, 0);
  assert.equal(checkedPrecondition.observation.observed_semantic_effect, null);
  assert.equal(checkedPrecondition.observation.result, 'INDETERMINATE');

  assert.equal(unboundPrecondition.t1.approved_request_sha256, approvedRequestDigest);
  assert.equal(unboundPrecondition.t1.precondition_checked_at_admission, false);
  assert.equal(unboundPrecondition.admission.request_binding, 'ALLOW');
  assert.equal(unboundPrecondition.admission.result, 'ADMITTED');
  assert.equal(unboundPrecondition.execution.final_boundary_decision, 'ALLOW');
  assert.deepEqual(unboundPrecondition.execution.final_request, {
    action: request.params.name,
    ...request.params.arguments,
  });
  assert.equal(unboundPrecondition.execution.final_request_sha256, approvedRequestDigest);
  assert.equal(unboundPrecondition.execution.result, 'IN-BOUNDS');
  assert.equal(unboundPrecondition.execution.provider_response, 'SUCCESS');
  assert.equal(unboundPrecondition.execution.existing_observer_result, 'IN-BOUNDS');
  assert.equal(unboundPrecondition.observation.issue_state, 'closed');
  assert.deepEqual(unboundPrecondition.observation.observed_semantic_effect, {
    action: request.params.name,
    ...request.params.arguments,
    issue_state: 'closed',
  });
  assert.equal(unboundPrecondition.observation.result, 'DIVERGENT');
});
