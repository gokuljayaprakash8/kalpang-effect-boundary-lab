import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalizeGitHubCommentRequest,
  hashGitHubCommentRequest,
} from './github-comment-binding.js';
import {
  callGitHubMcp,
  executeAuthorizedGitHubComment,
} from './execute-github-comment.js';
import { createGitHubRestObserver } from './github-rest-observer.js';
import { FROZEN_GITHUB_COMMENT_REQUEST } from './run-github-comparison.js';

const CONFIRMATION = '--confirm-single-public-test-comment';
const API_ORIGIN = 'https://api.github.com';
const OUTPUT_PATH = fileURLToPath(new URL('../artifacts/github-live-independent-observation-2026-09-29.json', import.meta.url));

if (process.argv[2] !== CONFIRMATION) {
  throw new Error(`Usage: node src/run-github-independent-observation.js ${CONFIRMATION}`);
}

const executionToken = process.env.GITHUB_TOKEN;
if (!executionToken) {
  throw new Error('GITHUB_TOKEN is required for the existing GitHub MCP execution path.');
}
try {
  await fs.access(OUTPUT_PATH);
  throw new Error(`Refusing to overwrite existing evidence: ${OUTPUT_PATH}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const timestamp = new Date().toISOString();
const body = `KALPANG independent REST observation validation ${timestamp}: harmless test comment.`;
const request = canonicalizeGitHubCommentRequest({
  ...FROZEN_GITHUB_COMMENT_REQUEST,
  params: {
    ...FROZEN_GITHUB_COMMENT_REQUEST.params,
    arguments: {
      ...FROZEN_GITHUB_COMMENT_REQUEST.params.arguments,
      body,
    },
  },
});
const { owner, repo, issue_number: issueNumber } = request.params.arguments;
const issueUrl = `${API_ORIGIN}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`;
const expectedIssueUrl = `${issueUrl}`.toLowerCase();
const observerRequests = [];
const evidence = {
  timestamp,
  approved_request: request,
  approved_request_digest: hashGitHubCommentRequest(request),
  authorized_action: {
    action: request.params.name,
    repository: `${owner}/${repo}`,
    issue_number: issueNumber,
    body,
    visibility: 'public issue comment',
  },
  authorization: null,
  execution: {
    attempted: false,
    identity_source: 'GITHUB_TOKEN environment variable; value omitted',
    final_request: null,
    final_request_sha256: null,
    mcp_result: null,
    report: null,
  },
  provider: 'GitHub',
  provider_effect_identifier: {
    mcp_comment_id: null,
    rest_comment_id: null,
  },
  independent_observation: {
    path: 'Unauthenticated, read-only GitHub REST API GETs for issue metadata, issue comments, and comment detail',
    authorization_header_sent: false,
    observer_requests: observerRequests,
    issue_state_before_execution: null,
    comments_before: null,
    comments_after: null,
    observed_effect: null,
  },
  correlation: null,
  reconciliation_result: 'INDETERMINATE',
  observer_identity_separation: {
    execution_credential_source: 'GITHUB_TOKEN environment variable',
    observer_credential: 'none; public unauthenticated REST reads',
    separate_credentials_and_api_path: true,
    same_host: true,
    same_provider: true,
    separate_trust_domain_established: false,
  },
  limitations: [
    'The authorization artifact is unsigned and produced on the same host as execution.',
    'The observer uses no execution credential and reads provider state through REST, but shares the host and GitHub provider trust domain.',
    'One successful comment does not establish universal provider correctness, execution integrity, or semantic correctness.',
    'No provider fault is induced or claimed.',
  ],
};

const anonymousFetch = async (input, init = {}) => {
  const url = new URL(input);
  if (url.origin !== API_ORIGIN) throw new Error('Observer is restricted to the GitHub REST API origin.');
  const headers = new Headers(init.headers);
  headers.delete('authorization');
  observerRequests.push({
    method: init.method ?? 'GET',
    path: `${url.pathname}${url.search}`,
    authorization_header_sent: false,
  });
  return fetch(url, { ...init, headers });
};

const issueResponse = await anonymousFetch(issueUrl, {
  method: 'GET',
  headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
});
if (!issueResponse.ok) {
  evidence.independent_observation.issue_preflight_http_status = issueResponse.status;
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ artifact: OUTPUT_PATH, reconciliation_result: 'INDETERMINATE', reason: 'ANONYMOUS_ISSUE_READ_UNAVAILABLE', execution_attempted: false }, null, 2)}\n`);
  process.exitCode = 2;
} else {
  const issueMetadata = await issueResponse.json();
  evidence.independent_observation.issue_state_before_execution = issueMetadata.state ?? null;

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'kalpang-live-independent-observation-'));
  try {
    const requestPath = path.join(temporaryDirectory, 'request.json');
    const authorizationPath = path.join(temporaryDirectory, 'authorization.json');
    await fs.writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });
    const authorizerPath = fileURLToPath(new URL('./authorize-github-comment.js', import.meta.url));
    const authorizer = spawnSync(process.execPath, [authorizerPath, requestPath, authorizationPath, 'ALLOW'], { encoding: 'utf8' });
    if (authorizer.status !== 0) throw new Error(`Authorization process failed: ${authorizer.stderr}`);
    const authorization = JSON.parse(await fs.readFile(authorizationPath, 'utf8'));
    evidence.authorization = {
      decision: authorization.decision,
      canonical_request_sha256: authorization.canonical_request_sha256,
      source: 'Existing authorize-github-comment.js process; ALLOW supplied by the explicit experiment request',
      artifact_signed: false,
    };

    const baseObserver = createGitHubRestObserver({ token: '', fetchImpl: anonymousFetch });
    const commentSnapshots = [];
    let observedCommentDetail = null;
    const restObserver = {
      async listIssueComments(value) {
        const comments = await baseObserver.listIssueComments(value);
        commentSnapshots.push(comments);
        if (commentSnapshots.length === 1) {
          evidence.independent_observation.comments_before = comments.map(({ id }) => id);
        } else if (commentSnapshots.length === 2) {
          evidence.independent_observation.comments_after = comments.map(({ id }) => id);
        }
        return comments;
      },
      async getComment(value, commentId) {
        observedCommentDetail = await baseObserver.getComment(value, commentId);
        return observedCommentDetail;
      },
    };

    let mcpComment = null;
    let mcpResponse = null;
    const executionReport = await executeAuthorizedGitHubComment({
      request,
      authorization,
      async mcpCall(validatedRequest) {
        evidence.execution.attempted = true;
        evidence.execution.final_request = validatedRequest;
        evidence.execution.final_request_sha256 = hashGitHubCommentRequest(validatedRequest);
        const priorComments = commentSnapshots[0] ?? [];
        if (priorComments.some((comment) => comment.body === body)) {
          throw new Error('Refusing to post: the unique test body already exists on the issue.');
        }
        mcpResponse = await callGitHubMcp(validatedRequest, executionToken);
        const text = mcpResponse.content?.find((item) => item.type === 'text')?.text;
        if (text) {
          try {
            const parsed = JSON.parse(text);
            mcpComment = { id: parsed.id ?? null, url: parsed.url ?? null };
          } catch {
            mcpComment = { id: null, url: null };
          }
        }
        return mcpResponse;
      },
      restObserver,
    });

    const beforeComments = commentSnapshots[0] ?? [];
    const afterComments = commentSnapshots[1] ?? null;
    const beforeIds = new Set(beforeComments.map((comment) => String(comment.id)));
    const newComments = afterComments?.filter((comment) => !beforeIds.has(String(comment.id))) ?? [];
    const observed = observedCommentDetail ? {
      repository: `${owner}/${repo}`,
      issue_number: issueNumber,
      comment_id: observedCommentDetail.id,
      body: observedCommentDetail.body,
      issue_url: observedCommentDetail.issue_url,
      created_at: observedCommentDetail.created_at ?? null,
      author_login: observedCommentDetail.user?.login ?? null,
    } : null;
    evidence.execution.mcp_result = {
      is_error: mcpResponse?.isError === true,
      comment_id: mcpComment?.id ?? null,
      url: mcpComment?.url ?? null,
    };
    evidence.execution.report = executionReport;
    evidence.independent_observation.observed_effect = observed;
    evidence.provider_effect_identifier = {
      mcp_comment_id: mcpComment?.id ?? null,
      rest_comment_id: observed?.comment_id ?? null,
    };

    const correlation = {
      approved_request_digest: evidence.approved_request_digest,
      authorization_digest_matches: authorization.canonical_request_sha256 === evidence.approved_request_digest,
      authorized_action_matches_request: request.params.name === 'add_issue_comment'
        && `${owner}/${repo}` === evidence.authorized_action.repository
        && issueNumber === evidence.authorized_action.issue_number
        && body === evidence.authorized_action.body,
      exactly_one_new_rest_comment: newComments.length === 1,
      mcp_and_rest_comment_ids_match: mcpComment?.id != null && observed?.comment_id != null
        && String(mcpComment.id) === String(observed.comment_id),
      observed_repository_and_issue_match: observed?.issue_url?.toLowerCase() === expectedIssueUrl,
      observed_body_matches_approved_body: observed?.body === body,
    };
    evidence.correlation = correlation;

    if (executionReport.comparison_result === 'INDETERMINATE' || !observed
      || !correlation.exactly_one_new_rest_comment
      || !correlation.mcp_and_rest_comment_ids_match) {
      evidence.reconciliation_result = 'INDETERMINATE';
    } else if (executionReport.comparison_result === 'IN-BOUNDS'
      && correlation.authorization_digest_matches
      && correlation.authorized_action_matches_request
      && correlation.exactly_one_new_rest_comment
      && correlation.mcp_and_rest_comment_ids_match
      && correlation.observed_repository_and_issue_match
      && correlation.observed_body_matches_approved_body) {
      evidence.reconciliation_result = 'IN-BOUNDS';
    } else {
      evidence.reconciliation_result = 'DIVERGENT';
    }

    await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    process.stdout.write(`${JSON.stringify({
      artifact: OUTPUT_PATH,
      approved_request_digest: evidence.approved_request_digest,
      authorization_decision: authorization.decision,
      execution_performed: executionReport.execution_performed,
      mcp_comment_id: mcpComment?.id ?? null,
      rest_comment_id: observed?.comment_id ?? null,
      observer_authenticated: false,
      reconciliation_result: evidence.reconciliation_result,
    }, null, 2)}\n`);
    if (evidence.reconciliation_result !== 'IN-BOUNDS') process.exitCode = 2;
  } catch (error) {
    evidence.execution.error = error.message;
    evidence.reconciliation_result = 'INDETERMINATE';
    await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    process.stderr.write(`${JSON.stringify({ artifact: OUTPUT_PATH, reconciliation_result: 'INDETERMINATE', reason: error.message }, null, 2)}\n`);
    process.exitCode = 2;
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}