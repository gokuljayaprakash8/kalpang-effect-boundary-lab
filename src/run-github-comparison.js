import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  assertGitHubCommentAuthorization,
  canonicalizeGitHubCommentRequest,
  createGitHubCommentAuthorization,
  hashGitHubCommentRequest,
} from './github-comment-binding.js';
import { executeAuthorizedGitHubComment } from './execute-github-comment.js';

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const nestedValue of Object.values(value)) deepFreeze(nestedValue);
    Object.freeze(value);
  }
  return value;
}

export const FROZEN_GITHUB_COMMENT_REQUEST = deepFreeze(canonicalizeGitHubCommentRequest({
  jsonrpc: '2.0',
  method: 'tools/call',
  params: {
    name: 'add_issue_comment',
    arguments: {
      owner: 'gokuljayaprakash8',
      repo: 'kalpang-effect-boundary-lab',
      issue_number: 1,
      body: 'KALPANG controlled comparison: this exact approved comment body is frozen.',
    },
  },
}));

const MUTATIONS = Object.freeze({
  'before-gate': 'KALPANG controlled comparison: body changed before Gate admission.',
  'after-gate-before-github': 'KALPANG controlled comparison: body changed after Gate admission.',
});

const PROTECTED_ARTIFACT_DIRECTORIES = [
  'github-live-2026-09-27',
  'github-body-substitution-2026-09-27',
  'github-observer-unavailable-2026-09-27',
].map((name) => fileURLToPath(new URL(`../artifacts/${name}/`, import.meta.url)));

function isWithin(directory, candidate) {
  return candidate === directory || candidate.startsWith(`${directory}${path.sep}`);
}

async function resolveCanonicalPath(candidate) {
  let unresolvedPath = path.resolve(candidate);
  const remainingSegments = [];
  while (true) {
    try {
      const resolvedAncestor = await fs.realpath(unresolvedPath);
      return path.resolve(resolvedAncestor, ...remainingSegments.reverse());
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      const parentPath = path.dirname(unresolvedPath);
      if (parentPath === unresolvedPath) throw error;
      remainingSegments.push(path.basename(unresolvedPath));
      unresolvedPath = parentPath;
    }
  }
}

function commentFor(request, id) {
  const { owner, repo, issue_number: issueNumber, body } = request.params.arguments;
  return {
    id,
    body,
    issue_url: `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
  };
}

async function runCase(mutationPoint, request, authorization, requestDigest) {
  const comments = [];
  let listCount = 0;
  let transportRequest;
  let mcpCallCount = 0;
  const observerEvidence = {
    observer: 'in-memory stand-in; no GitHub API requests are made',
    before_comments: null,
    after_comments: null,
  };
  const restObserver = {
    async listIssueComments() {
      listCount += 1;
      if (mutationPoint === 'observer-unavailable' && listCount > 1) {
        observerEvidence.post_execution_available = false;
        throw new Error('Simulated post-execution observer outage.');
      }
      const snapshot = [...comments];
      if (listCount === 1) observerEvidence.before_comments = snapshot;
      else observerEvidence.after_comments = snapshot;
      return snapshot;
    },
    async getComment(_request, commentId) {
      return comments.find((comment) => comment.id === commentId) ?? null;
    },
  };

  const admissionRequest = mutationPoint === 'before-gate'
    ? {
      ...request,
      params: {
        ...request.params,
        arguments: { ...request.params.arguments, body: MUTATIONS['before-gate'] },
      },
    }
    : request;
  let admission;
  try {
    assertGitHubCommentAuthorization(admissionRequest, authorization);
    admission = {
      decision: 'ALLOW',
      result: 'ADMITTED',
      presented_request_sha256: hashGitHubCommentRequest(admissionRequest),
    };
  } catch (error) {
    if (mutationPoint !== 'before-gate') throw error;
    admission = {
      decision: 'REFUSED',
      result: 'REFUSED',
      reason: 'AUTHORIZATION_BINDING_MISMATCH',
      presented_request_sha256: hashGitHubCommentRequest(admissionRequest),
    };
  }
  admission.authorized_request_sha256 = requestDigest;

  let executionReport;
  if (admission.result === 'ADMITTED') {
    executionReport = await executeAuthorizedGitHubComment({
      request,
      authorization,
      async mcpCall(admittedRequest) {
        mcpCallCount += 1;
        transportRequest = admittedRequest;
        if (mutationPoint === 'after-gate-before-github') {
          transportRequest = {
            ...admittedRequest,
            params: {
              ...admittedRequest.params,
              arguments: {
                ...admittedRequest.params.arguments,
                body: MUTATIONS['after-gate-before-github'],
              },
            },
          };
        }
        comments.push(commentFor(transportRequest, 1));
        return { isError: false };
      },
      restObserver,
    });
  } else {
    const before = await restObserver.listIssueComments(request);
    const after = await restObserver.listIssueComments(request);
    executionReport = {
      canonical_request_sha256: requestDigest,
      execution_performed: false,
      mcp_call_status: 'NOT CALLED',
      comparison_result: 'REFUSED / NOT EXECUTED',
      final_status: 'PASS',
    };
    observerEvidence.denied_execution_snapshots = {
      before_comment_ids: before.map((comment) => comment.id),
      after_comment_ids: after.map((comment) => comment.id),
    };
  }

  const effectObservation = admission.result === 'REFUSED'
    ? {
      comparison_result: 'INDETERMINATE',
      final_status: 'INDETERMINATE',
      reason: 'NO_NEW_COMMENT_OBSERVED',
      independent_observation: observerEvidence.denied_execution_snapshots,
    }
    : {
      comparison_result: executionReport.comparison_result,
      final_status: executionReport.final_status,
      reason: executionReport.reason ?? null,
      observed_comment_id: executionReport.observed_comment_id ?? null,
    };

  return {
    mutation_point: mutationPoint,
    admission,
    effect_observation: effectObservation,
    integration_prevention_failure: mutationPoint === 'after-gate-before-github'
      && executionReport.comparison_result === 'DIVERGENT'
      && mcpCallCount === 1,
    execution_report: executionReport,
    mcp_execution: {
      execution_performed: mcpCallCount === 1,
      authorized_request_sha256: requestDigest,
      transport_request_sha256: transportRequest ? hashGitHubCommentRequest(transportRequest) : null,
      transport_body: transportRequest?.params.arguments.body ?? null,
      simulated_external_write: mcpCallCount === 1,
      external_effect_body: comments[0]?.body ?? null,
    },
    rest_observation: observerEvidence,
  };
}

export async function runGitHubComparison(outputDirectory) {
  if (!outputDirectory) {
    throw new Error('Usage: node src/run-github-comparison.js <new-output-directory>');
  }
  const [resolvedOutputDirectory, protectedDirectories] = await Promise.all([
    resolveCanonicalPath(outputDirectory),
    Promise.all(PROTECTED_ARTIFACT_DIRECTORIES.map(resolveCanonicalPath)),
  ]);
  if (protectedDirectories.some((directory) => isWithin(directory, resolvedOutputDirectory))) {
    throw new Error('Output directory is protected existing GitHub evidence.');
  }
  await fs.mkdir(resolvedOutputDirectory);

  const request = FROZEN_GITHUB_COMMENT_REQUEST;
  const authorization = createGitHubCommentAuthorization(request, 'ALLOW');
  const requestDigest = authorization.canonical_request_sha256;
  const cases = [];
  for (const mutationPoint of ['before-gate', 'after-gate-before-github', 'observer-unavailable']) {
    cases.push(await runCase(mutationPoint, request, authorization, requestDigest));
  }

  const comparison = {
    mode: 'offline simulation; no credentials, MCP server, or GitHub REST API used',
    frozen_request_sha256: requestDigest,
    runner_invocation: {
      command: 'node',
      arguments: ['src/run-github-comparison.js', outputDirectory],
    },
    cases,
  };
  await Promise.all([
    fs.writeFile(path.join(resolvedOutputDirectory, 'request.json'), `${JSON.stringify(request, null, 2)}\n`),
    fs.writeFile(path.join(resolvedOutputDirectory, 'authorization.json'), `${JSON.stringify(authorization, null, 2)}\n`),
    fs.writeFile(path.join(resolvedOutputDirectory, 'comparison.json'), `${JSON.stringify(comparison, null, 2)}\n`),
  ]);
  return comparison;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const comparison = await runGitHubComparison(process.argv[2]);
    process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}