import { createHash } from 'node:crypto';

export const GITHUB_MCP_SERVER_IMAGE = 'ghcr.io/github/github-mcp-server:v1.12.2@sha256:a44e77b9c9003ed0e228716d118aa4ce9f3418dce30fe2340c71553164bd96f0';
export const GITHUB_MCP_TOOLSET = 'issues';
export const GITHUB_REPOSITORY_OWNER = 'gokuljayaprakash8';
export const GITHUB_REPOSITORY_NAME = 'kalpang-effect-boundary-lab';
export const GITHUB_COMMENT_BINDING_FIELDS = [
  'server.image',
  'server.toolset',
  'request.jsonrpc',
  'request.method',
  'request.params.name',
  'request.params.arguments.owner',
  'request.params.arguments.repo',
  'request.params.arguments.issue_number',
  'request.params.arguments.body',
];

function assertExactKeys(value, expectedKeys, description) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expectedKeys].sort())) {
    throw new Error(`${description} has missing or unsupported fields`);
  }
}

export function canonicalizeGitHubCommentRequest(request) {
  assertExactKeys(request, ['jsonrpc', 'method', 'params'], 'MCP request');
  assertExactKeys(request.params, ['name', 'arguments'], 'MCP params');
  assertExactKeys(request.params.arguments, ['owner', 'repo', 'issue_number', 'body'], 'MCP arguments');

  const { owner, repo, issue_number: issueNumber, body } = request.params.arguments;
  if (request.jsonrpc !== '2.0' || request.method !== 'tools/call' || request.params.name !== 'add_issue_comment') {
    throw new Error('MCP request must call add_issue_comment using tools/call');
  }
  if (typeof owner !== 'string' || !/^[A-Za-z0-9-]+$/.test(owner)
    || typeof repo !== 'string' || !/^[A-Za-z0-9._-]+$/.test(repo)
    || !Number.isSafeInteger(issueNumber) || issueNumber < 1
    || typeof body !== 'string' || body.length === 0) {
    throw new Error('MCP issue-comment arguments are invalid');
  }
  if (owner !== GITHUB_REPOSITORY_OWNER || repo !== GITHUB_REPOSITORY_NAME) {
    throw new Error('MCP request target must be the canonical repository');
  }

  return {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: {
      name: 'add_issue_comment',
      arguments: { owner, repo, issue_number: issueNumber, body },
    },
  };
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function canonicalGitHubCommentBinding(request) {
  return JSON.stringify(stableValue({
    server: {
      image: GITHUB_MCP_SERVER_IMAGE,
      toolset: GITHUB_MCP_TOOLSET,
    },
    request: canonicalizeGitHubCommentRequest(request),
  }));
}

export function hashGitHubCommentRequest(request) {
  return createHash('sha256').update(canonicalGitHubCommentBinding(request)).digest('hex');
}

export function createGitHubCommentAuthorization(request, decision) {
  if (!['ALLOW', 'DENY'].includes(decision)) {
    throw new Error('Authorization decision must be ALLOW or DENY');
  }
  return {
    schema_version: 1,
    decision,
    binding_fields: GITHUB_COMMENT_BINDING_FIELDS,
    canonical_request_sha256: hashGitHubCommentRequest(request),
  };
}

export function assertGitHubCommentAuthorization(request, authorization) {
  if (!authorization || authorization.schema_version !== 1
    || !['ALLOW', 'DENY'].includes(authorization.decision)
    || JSON.stringify(authorization.binding_fields) !== JSON.stringify(GITHUB_COMMENT_BINDING_FIELDS)
    || authorization.canonical_request_sha256 !== hashGitHubCommentRequest(request)) {
    throw new Error('Authorization does not bind to this canonical MCP request');
  }
  return authorization.decision;
}