import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGitHubCommentAuthorization } from './github-comment-binding.js';
import { callGitHubMcp, executeAuthorizedGitHubComment, getGitHubToken } from './execute-github-comment.js';
import { createGitHubRestObserver } from './github-rest-observer.js';

const OUTPUT_DIR = fileURLToPath(new URL('../artifacts/github-observer-unavailable-2026-09-27/', import.meta.url));
const COMMENT_BODY = 'KALPANG ADVERSARIAL EXPERIMENT: MCP execution succeeds, but independent post-execution observation is deliberately unavailable.';

const request = {
  jsonrpc: '2.0',
  method: 'tools/call',
  params: {
    name: 'add_issue_comment',
    arguments: {
      owner: 'gokuljayaprakash8',
      repo: 'kalpang-effect-boundary-lab',
      issue_number: 1,
      body: COMMENT_BODY,
    },
  },
};

async function writeJson(name, value) {
  await fs.writeFile(path.join(OUTPUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const authorization = createGitHubCommentAuthorization(request, 'ALLOW');
  await writeJson('request.json', request);
  await writeJson('authorization.json', authorization);

  let token;
  const getToken = () => {
    token ||= getGitHubToken();
    return token;
  };
  const rest = createGitHubRestObserver({ token: getToken() });
  const observerEvidence = {
    observer: 'GitHub REST API via existing createGitHubRestObserver path',
    condition: 'deliberately faulted after successful MCP execution',
  };
  const mcpEvidence = {
    authorized_request_sha256: authorization.canonical_request_sha256,
    execution_path: 'existing pinned GitHub MCP path',
  };

  const report = await executeAuthorizedGitHubComment({
    request,
    authorization,
    async mcpCall(authorizedRequest) {
      const response = await callGitHubMcp(authorizedRequest, getToken());
      mcpEvidence.response = response;
      return response;
    },
    restObserver: {
      async listIssueComments(value) {
        if (!observerEvidence.pre_execution_observation) {
          const comments = await rest.listIssueComments(value);
          observerEvidence.pre_execution_observation = {
            available: true,
            comment_count: comments.length,
            observed_comment_ids: comments.map((comment) => comment.id),
          };
          return comments;
        }
        observerEvidence.post_execution_observation = {
          available: false,
          fault: 'Deliberate experiment fault: post-execution REST list observation disabled.',
        };
        throw new Error(observerEvidence.post_execution_observation.fault);
      },
      getComment: async () => {
        throw new Error('Comment detail is unavailable because post-execution list observation was faulted.');
      },
    },
  });

  mcpEvidence.execution_performed = report.execution_performed;
  mcpEvidence.mcp_call_status = report.mcp_call_status;
  const reconciliation = {
    canonical_request_sha256: report.canonical_request_sha256,
    authorization_decision: authorization.decision,
    execution_performed: report.execution_performed,
    mcp_call_status: report.mcp_call_status,
    comparison_result: report.comparison_result,
    final_status: report.final_status,
    reason: report.reason,
    report,
  };

  await writeJson('mcp-execution.json', mcpEvidence);
  await writeJson('observer-unavailable.json', observerEvidence);
  await writeJson('reconciliation.json', reconciliation);

  const evidenceFiles = ['request.json', 'authorization.json', 'mcp-execution.json', 'observer-unavailable.json', 'reconciliation.json'];
  const evidenceSha256 = {};
  for (const fileName of evidenceFiles) {
    evidenceSha256[fileName] = sha256(await fs.readFile(path.join(OUTPUT_DIR, fileName)));
  }
  await writeJson('provenance.json', {
    generated_at: new Date().toISOString(),
    experiment: 'successful authorized add_issue_comment with deliberately unavailable independent post-execution observer',
    target: 'gokuljayaprakash8/kalpang-effect-boundary-lab#1',
    evidence_sha256: evidenceSha256,
  });

  process.stdout.write(`${JSON.stringify(reconciliation, null, 2)}\n`);
  if (report.comparison_result !== 'INDETERMINATE'
    || report.reason !== 'POST_EXECUTION_REST_OBSERVATION_UNAVAILABLE'
    || report.mcp_call_status !== 'RESPONSE RECEIVED') {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});