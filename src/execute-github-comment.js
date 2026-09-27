import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  GITHUB_MCP_SERVER_IMAGE,
  GITHUB_MCP_TOOLSET,
  assertGitHubCommentAuthorization,
  canonicalizeGitHubCommentRequest,
  hashGitHubCommentRequest,
} from './github-comment-binding.js';
import { createGitHubRestObserver } from './github-rest-observer.js';

function issueUrl(request) {
  const { owner, repo, issue_number: issueNumber } = request.params.arguments;
  return `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`.toLowerCase();
}

function indeterminate(requestHash, reason, executionPerformed, mcpCallStatus = 'NOT CALLED') {
  return {
    canonical_request_sha256: requestHash,
    execution_performed: executionPerformed,
    mcp_call_status: mcpCallStatus,
    comparison_result: 'INDETERMINATE',
    final_status: 'INDETERMINATE',
    reason,
  };
}

function freezeRequest(request) {
  Object.freeze(request.params.arguments);
  Object.freeze(request.params);
  return Object.freeze(request);
}

function classifyObservation(request, requestHash, beforeComments, afterComments, commentDetail, mcpCallStatus) {
  if (!Array.isArray(beforeComments) || !Array.isArray(afterComments)) {
    return indeterminate(requestHash, 'INVALID_REST_COMMENT_LIST', true, mcpCallStatus);
  }

  const beforeIds = new Set(beforeComments.map((comment) => comment?.id));
  const newComments = afterComments.filter((comment) => Number.isSafeInteger(comment?.id) && !beforeIds.has(comment.id));
  if (newComments.length === 0) {
    return indeterminate(requestHash, 'NO_NEW_COMMENT_OBSERVED', true, mcpCallStatus);
  }
  if (newComments.length !== 1) {
    return indeterminate(requestHash, 'MULTIPLE_NEW_COMMENTS_OBSERVED', true, mcpCallStatus);
  }

  const listedComment = newComments[0];
  if (!commentDetail || listedComment.id !== commentDetail.id
    || listedComment.body !== commentDetail.body
    || listedComment.issue_url !== commentDetail.issue_url) {
    return indeterminate(requestHash, 'REST_OBSERVATIONS_CONFLICT', true, mcpCallStatus);
  }

  if (String(commentDetail.issue_url).toLowerCase() !== issueUrl(request)) {
    return indeterminate(requestHash, 'REST_OBSERVATIONS_CONFLICT', true, mcpCallStatus);
  }

  if (commentDetail.body !== request.params.arguments.body) {
    return {
      canonical_request_sha256: requestHash,
      execution_performed: true,
      mcp_call_status: mcpCallStatus,
      comparison_result: 'DIVERGENT',
      final_status: 'DIVERGENT / FAIL',
      observed_comment_id: commentDetail.id,
    };
  }

  return {
    canonical_request_sha256: requestHash,
    execution_performed: true,
    mcp_call_status: mcpCallStatus,
    comparison_result: 'IN-BOUNDS',
    final_status: 'PASS',
    observed_comment_id: commentDetail.id,
  };
}

export async function executeAuthorizedGitHubComment({ request, authorization, mcpCall, restObserver }) {
  const canonicalRequest = freezeRequest(canonicalizeGitHubCommentRequest(request));
  const decision = assertGitHubCommentAuthorization(canonicalRequest, authorization);
  const requestHash = hashGitHubCommentRequest(canonicalRequest);
  if (decision === 'DENY') {
    return {
      canonical_request_sha256: requestHash,
      execution_performed: false,
      mcp_call_status: 'NOT CALLED',
      comparison_result: 'DENIED / NOT EXECUTED',
      final_status: 'PASS',
    };
  }

  let beforeComments;
  try {
    beforeComments = await restObserver.listIssueComments(canonicalRequest);
  } catch {
    return indeterminate(requestHash, 'PRE_EXECUTION_REST_OBSERVATION_UNAVAILABLE', false);
  }

  let mcpCallStatus = 'RESPONSE RECEIVED';
  try {
    const response = await mcpCall(canonicalRequest);
    if (response?.isError) {
      mcpCallStatus = 'MCP REPORTED ERROR';
    }
  } catch {
    mcpCallStatus = 'MCP CALL UNAVAILABLE';
  }

  let afterComments;
  try {
    afterComments = await restObserver.listIssueComments(canonicalRequest);
  } catch {
    return indeterminate(requestHash, 'POST_EXECUTION_REST_OBSERVATION_UNAVAILABLE', true, mcpCallStatus);
  }

  const beforeIds = new Set(Array.isArray(beforeComments) ? beforeComments.map((comment) => comment?.id) : []);
  const newComments = Array.isArray(afterComments)
    ? afterComments.filter((comment) => Number.isSafeInteger(comment?.id) && !beforeIds.has(comment.id))
    : [];
  if (newComments.length !== 1) {
    return classifyObservation(request, requestHash, beforeComments, afterComments, null, mcpCallStatus);
  }

  let commentDetail;
  try {
    commentDetail = await restObserver.getComment(canonicalRequest, newComments[0].id);
  } catch {
    return indeterminate(requestHash, 'COMMENT_DETAIL_OBSERVATION_UNAVAILABLE', true, mcpCallStatus);
  }
  return classifyObservation(canonicalRequest, requestHash, beforeComments, afterComments, commentDetail, mcpCallStatus);
}

export function getGitHubToken() {
  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) {
    return token;
  }
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    throw new Error('Set GITHUB_PERSONAL_ACCESS_TOKEN or authenticate with gh; credentials are never written to evidence.');
  }
}

export async function callGitHubMcp(request, token) {
  const environment = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    GITHUB_PERSONAL_ACCESS_TOKEN: token,
    GITHUB_TOOLSETS: GITHUB_MCP_TOOLSET,
  };
  const transport = new StdioClientTransport({
    command: 'docker',
    args: [
      'run', '-i', '--rm', '--platform=linux/amd64',
      '-e', 'GITHUB_PERSONAL_ACCESS_TOKEN',
      '-e', 'GITHUB_TOOLSETS',
      GITHUB_MCP_SERVER_IMAGE,
    ],
    env: environment,
  });
  const client = new Client({ name: 'kalpang-effect-boundary-lab', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    return await client.callTool({
      name: request.params.name,
      arguments: request.params.arguments,
    });
  } finally {
    await client.close();
  }
}

async function main() {
  const [requestPath, authorizationPath] = process.argv.slice(2);
  if (!requestPath || !authorizationPath) {
    throw new Error('Usage: node src/execute-github-comment.js <request.json> <authorization.json>');
  }

  const [requestText, authorizationText] = await Promise.all([
    fs.readFile(requestPath, 'utf8'),
    fs.readFile(authorizationPath, 'utf8'),
  ]);
  const request = JSON.parse(requestText);
  const authorization = JSON.parse(authorizationText);
  assertGitHubCommentAuthorization(request, authorization);

  let token;
  const getToken = () => {
    token ||= getGitHubToken();
    return token;
  };
  const restObserver = {
    listIssueComments: async (value) => createGitHubRestObserver({ token: getToken() }).listIssueComments(value),
    getComment: async (value, commentId) => createGitHubRestObserver({ token: getToken() }).getComment(value, commentId),
  };
  const report = await executeAuthorizedGitHubComment({
    request,
    authorization,
    mcpCall: (value) => callGitHubMcp(value, getToken()),
    restObserver,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.final_status === 'INDETERMINATE' || report.final_status === 'DIVERGENT / FAIL') {
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}