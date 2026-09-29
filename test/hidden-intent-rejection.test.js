import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertGitHubCommentAuthorization,
  createGitHubCommentAuthorization,
  hashGitHubCommentRequest,
} from '../src/github-comment-binding.js';
import { FROZEN_GITHUB_COMMENT_REQUEST } from '../src/run-github-comparison.js';

test('request binding allows a valid action that a private-only intent predicate rejects', () => {
  const INTENT_EXPECTATION = {
    operation: 'prepare_private_draft',
    target: {
      owner: 'gokuljayaprakash8',
      repo: 'kalpang-effect-boundary-lab',
      issue_number: 1,
    },
    content: 'KALPANG controlled comparison: this exact approved comment body is frozen.',
    visibility: 'private',
    publication_permitted: false,
  };
  const CANONICAL_REQUEST = FROZEN_GITHUB_COMMENT_REQUEST;
  const authorization = createGitHubCommentAuthorization(CANONICAL_REQUEST, 'ALLOW');
  const requestDigest = hashGitHubCommentRequest(CANONICAL_REQUEST);

  const ADMISSION = {
    decision: assertGitHubCommentAuthorization(CANONICAL_REQUEST, authorization),
    request_sha256: requestDigest,
  };

  function intentAwareAdmission(intentExpectation, request, requestAuthorization) {
    const requestDecision = assertGitHubCommentAuthorization(request, requestAuthorization);
    const { owner, repo, issue_number: issueNumber, body } = request.params.arguments;
    const actionPublishes = request.params.name === 'add_issue_comment';
    const actionMatchesIntent = intentExpectation.operation === 'add_issue_comment'
      && intentExpectation.target.owner === owner
      && intentExpectation.target.repo === repo
      && intentExpectation.target.issue_number === issueNumber
      && intentExpectation.content === body
      && intentExpectation.visibility === 'public'
      && intentExpectation.publication_permitted;
    return {
      request_binding: requestDecision,
      semantic_action: actionPublishes ? 'public_comment' : 'other',
      semantic_match: actionMatchesIntent,
      decision: requestDecision === 'ALLOW' && actionMatchesIntent ? 'ALLOW' : 'DENY',
      execution_attempted: false,
    };
  }

  const INTENT_AWARE_ADMISSION = intentAwareAdmission(INTENT_EXPECTATION, CANONICAL_REQUEST, authorization);

  assert.equal(ADMISSION.decision, 'ALLOW');
  assert.equal(ADMISSION.request_sha256, 'fb95e7fefd718922a1af792cbcd6e0348ee4fea48b9d834a0ced25b3a6cd1b03');
  assert.equal(INTENT_EXPECTATION.target.owner, CANONICAL_REQUEST.params.arguments.owner);
  assert.equal(INTENT_EXPECTATION.target.repo, CANONICAL_REQUEST.params.arguments.repo);
  assert.equal(INTENT_EXPECTATION.target.issue_number, CANONICAL_REQUEST.params.arguments.issue_number);
  assert.equal(INTENT_EXPECTATION.content, CANONICAL_REQUEST.params.arguments.body);
  assert.equal(CANONICAL_REQUEST.params.name, 'add_issue_comment');
  assert.equal(INTENT_AWARE_ADMISSION.request_binding, 'ALLOW');
  assert.equal(INTENT_AWARE_ADMISSION.semantic_action, 'public_comment');
  assert.equal(INTENT_AWARE_ADMISSION.semantic_match, false);
  assert.equal(INTENT_AWARE_ADMISSION.decision, 'DENY');
  assert.equal(INTENT_AWARE_ADMISSION.execution_attempted, false);
});
