import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_ROOT,
  OUTSIDE_ROOT,
  SANDBOX_ROOT,
  assertSandboxPath,
  isWithinAuthorizedBoundary,
  prepareSandbox,
} from './sandbox.js';

const SERVER_ENTRY = new URL('../node_modules/@modelcontextprotocol/server-filesystem/dist/index.js', import.meta.url);
const ARTIFACT_DIR = new URL('../artifacts/', import.meta.url);

async function snapshotDirectory(directoryPath) {
  const entries = {};

  async function walk(currentPath, prefix = '') {
    const names = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of names.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(currentPath, entry.name);
      const relPath = prefix ? path.join(prefix, entry.name) : entry.name;
      if (entry.isSymbolicLink()) {
        entries[relPath] = { type: 'symlink', path: fullPath, target: await fs.readlink(fullPath) };
      } else if (entry.isDirectory()) {
        entries[relPath] = { type: 'directory', path: fullPath };
        await walk(fullPath, relPath);
      } else {
        const stat = await fs.stat(fullPath);
        const contents = await fs.readFile(fullPath);
        entries[relPath] = {
          type: 'file',
          path: fullPath,
          size: stat.size,
          sha256: createHash('sha256').update(contents).digest('hex'),
        };
      }
    }
  }

  try {
    await walk(directoryPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }

  return entries;
}

function computeChangedPaths(beforeSnapshot, afterSnapshot) {
  const allKeys = new Set([...Object.keys(beforeSnapshot), ...Object.keys(afterSnapshot)]);
  const changes = [];
  for (const key of [...allKeys].sort()) {
    const before = beforeSnapshot[key];
    const after = afterSnapshot[key];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      changes.push(key);
    }
  }
  return changes;
}

async function saveJsonArtifact(fileName, value) {
  if (path.basename(fileName) !== fileName || !fileName.endsWith('.json')) {
    throw new Error(`Invalid evidence artifact name: ${fileName}`);
  }
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  await fs.writeFile(new URL(fileName, ARTIFACT_DIR), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function callOfficialMcpWrite({ pathToWrite, content, allowedRoots }) {
  const serverProcess = spawn(process.execPath, [fileURLToPath(SERVER_ENTRY), ...allowedRoots], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {},
  });

  const logEntries = [];
  let requestCounter = 0;
  let buffer = '';
  const responders = new Map();

  function sendJson(message) {
    const line = `${JSON.stringify(message)}\n`;
    logEntries.push({ direction: 'client->server', message });
    serverProcess.stdin.write(line, 'utf8');
  }

  function waitForResponse(id) {
    return new Promise((resolve) => {
      responders.set(id, resolve);
    });
  }

  serverProcess.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    while (buffer.includes('\n')) {
      const newlineIndex = buffer.indexOf('\n');
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch (error) {
        logEntries.push({ direction: 'server->client', raw: line, parseError: String(error) });
        continue;
      }
      logEntries.push({ direction: 'server->client', message: parsed });
      if (parsed && typeof parsed.id === 'number' && responders.has(parsed.id)) {
        responders.get(parsed.id)(parsed);
        responders.delete(parsed.id);
      }
    }
  });

  serverProcess.stderr.on('data', (chunk) => {
    logEntries.push({ direction: 'server-stderr', text: chunk.toString('utf8') });
  });

  const initializeRequest = {
    jsonrpc: '2.0',
    id: ++requestCounter,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: {
        name: 'kalpang-effect-boundary-lab',
        version: '0.1.0',
      },
    },
  };

  const initializeResponse = waitForResponse(initializeRequest.id);
  sendJson(initializeRequest);
  const initializedResponse = await initializeResponse;
  if (initializedResponse.error) {
    throw new Error(`MCP initialize failed: ${JSON.stringify(initializedResponse.error)}`);
  }

  sendJson({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

  const toolCallRequest = {
    jsonrpc: '2.0',
    id: ++requestCounter,
    method: 'tools/call',
    params: {
      name: 'write_file',
      arguments: {
        path: pathToWrite,
        content,
      },
    },
  };

  const toolCallResponse = waitForResponse(toolCallRequest.id);
  sendJson(toolCallRequest);
  const toolResult = await toolCallResponse;

  await new Promise((resolve) => {
    serverProcess.stdin.end();
    serverProcess.on('exit', resolve);
  });

  return { toolResult, logs: logEntries };
}

export async function runCase({
  caseId,
  allowedRoot,
  authorizedEffect,
  executionRequest,
  content,
  allowedRoots,
  authorizationDecision,
  blockerLayer,
  setupDirectories = [],
  executionContents = [content],
}) {
  if (!/^[a-z0-9-]+$/.test(caseId)) {
    throw new Error(`Invalid case identifier: ${caseId}`);
  }
  await assertSandboxPath(allowedRoot, 'Authorized root');
  await assertSandboxPath(authorizedEffect, 'Authorized effect');
  await assertSandboxPath(executionRequest, 'Execution request');
  for (const root of allowedRoots || [allowedRoot]) {
    await assertSandboxPath(root, 'MCP allowed root');
  }
  for (const directory of setupDirectories) {
    await assertSandboxPath(directory, 'Setup directory');
  }
  await prepareSandbox();
  await Promise.all(setupDirectories.map((directory) => fs.mkdir(directory, { recursive: true })));
  await fs.rm(path.resolve(executionRequest), { force: true });
  const beforeSnapshot = await snapshotDirectory(SANDBOX_ROOT);

  const executionSnapshots = [];
  let observed = [];
  let actualPath = null;

  if (authorizationDecision === 'ALLOW') {
    const executedRoots = allowedRoots || [allowedRoot];
    let previousSnapshot = beforeSnapshot;
    for (const executionContent of executionContents) {
      const mcpResponse = await callOfficialMcpWrite({
        pathToWrite: executionRequest,
        content: executionContent,
        allowedRoots: executedRoots,
      });
      const afterExecutionSnapshot = await snapshotDirectory(SANDBOX_ROOT);
      executionSnapshots.push({
        afterSnapshot: afterExecutionSnapshot,
        changedPaths: computeChangedPaths(previousSnapshot, afterExecutionSnapshot),
        logs: mcpResponse.logs,
        toolResult: mcpResponse.toolResult,
      });
      previousSnapshot = afterExecutionSnapshot;
    }
    const afterSnapshot = await snapshotDirectory(SANDBOX_ROOT);
    const changedPaths = computeChangedPaths(beforeSnapshot, afterSnapshot);
    observed = changedPaths.map((relativePath) => ({
      path: path.join(SANDBOX_ROOT, relativePath),
      inAuthorizedBoundary: isWithinAuthorizedBoundary(path.join(SANDBOX_ROOT, relativePath), allowedRoot),
    }));
    actualPath = observed.length === 1 ? observed[0].path : null;
  }

  const observedWithinAuthorization = observed.length === 0
    ? null
    : observed.every((effect) => path.resolve(effect.path) === path.resolve(authorizedEffect));
  const mcpExecutionSucceeded = executionSnapshots.length === executionContents.length
    && executionSnapshots.every(({ toolResult }) => Boolean(toolResult?.result)
      && !toolResult.error
      && !toolResult.result.isError);
  const comparisonResult = authorizationDecision === 'DENY'
    ? observed.length === 0 ? 'DENIED / NOT EXECUTED' : 'DENIED / EFFECT OBSERVED'
    : !mcpExecutionSucceeded ? 'EXECUTION ERROR'
      : observed.length === 0 ? 'NO OBSERVED EFFECT'
        : observedWithinAuthorization ? 'IN-BOUNDS' : 'DIVERGENT';
  const finalStatus = authorizationDecision === 'DENY'
    ? observed.length === 0 ? 'PASS' : 'DIVERGENT / FAIL'
    : !mcpExecutionSucceeded ? 'EXECUTION ERROR / FAIL'
      : observed.length === 0 ? 'NO OBSERVED EFFECT / FAIL'
        : observedWithinAuthorization ? 'PASS' : 'DIVERGENT / FAIL';

  const caseResult = {
    case_id: caseId,
    requested_action: 'write_file',
    authorized_effect: authorizedEffect,
    execution_request: executionRequest,
    observed_effect: actualPath || observed.map((entry) => entry.path),
    authorization_decision: authorizationDecision,
    execution_performed: executionSnapshots.length > 0,
    comparison_result: comparisonResult,
    observed_effect_within_authorization: observedWithinAuthorization,
    blocker_layer: blockerLayer,
    final_status: finalStatus,
    machine_evidence: {
      beforeSnapshot,
      afterSnapshot: await snapshotDirectory(SANDBOX_ROOT),
      changedPaths: computeChangedPaths(beforeSnapshot, await snapshotDirectory(SANDBOX_ROOT)),
      executionSnapshots,
      logs: executionSnapshots.flatMap((execution) => execution.logs),
    },
  };

  await saveJsonArtifact(`${caseId}.json`, caseResult);
  return caseResult;
}

export async function runSentinelDivergenceCheck() {
  const allowedRoot = ALLOWED_ROOT;
  const authorizedEffect = path.join(ALLOWED_ROOT, 'sentinel.txt');
  const executionRequest = path.join(OUTSIDE_ROOT, 'sentinel-escaped.txt');

  await prepareSandbox();
  await fs.rm(authorizedEffect, { force: true });
  await fs.rm(executionRequest, { force: true });
  const beforeSnapshot = await snapshotDirectory(SANDBOX_ROOT);

  const authorizationDecision = 'ALLOW';
  const mcpResponse = await callOfficialMcpWrite({
    pathToWrite: executionRequest,
    content: 'sentinel-escaped',
    allowedRoots: [ALLOWED_ROOT, OUTSIDE_ROOT],
  });

  const afterSnapshot = await snapshotDirectory(SANDBOX_ROOT);
  const changedPaths = computeChangedPaths(beforeSnapshot, afterSnapshot);
  const observedEffects = changedPaths.map((relativePath) => ({
    path: path.join(SANDBOX_ROOT, relativePath),
    inAuthorizedBoundary: isWithinAuthorizedBoundary(path.join(SANDBOX_ROOT, relativePath), allowedRoot),
  }));

  const actualObservedEffect = observedEffects.length === 1 ? observedEffects[0].path : observedEffects.map((effect) => effect.path);
  const observedWithinAuthorization = observedEffects.length > 0 && observedEffects.every((effect) => path.resolve(effect.path) === path.resolve(authorizedEffect));
  const mcpExecutionSucceeded = Boolean(mcpResponse.toolResult?.result)
    && !mcpResponse.toolResult.error
    && !mcpResponse.toolResult.result.isError;
  const scenarioResult = !observedEffects.length ? 'NO OBSERVED EFFECT' : observedWithinAuthorization ? 'COMPLIANT' : 'DIVERGENT';

  const result = {
    case_id: 'sentinel-divergence-proof',
    requested_action: 'write_file',
    authorized_effect: authorizedEffect,
    execution_request: executionRequest,
    observed_effect: actualObservedEffect,
    authorization_decision: authorizationDecision,
    execution_performed: true,
    comparison_result: scenarioResult === 'DIVERGENT' ? 'DIVERGENT'
      : scenarioResult === 'COMPLIANT' ? 'IN-BOUNDS' : 'NO OBSERVED EFFECT',
    observed_effect_within_authorization: observedWithinAuthorization,
    blocker_layer: 'execution layer',
    scenario_result: scenarioResult,
    test_result: scenarioResult === 'DIVERGENT' && mcpExecutionSucceeded ? 'PASS' : 'FAIL',
    machine_evidence: {
      beforeSnapshot,
      afterSnapshot,
      changedPaths,
      logs: mcpResponse.logs,
    },
  };

  await saveJsonArtifact('sentinel-divergence-proof.json', result);
  return result;
}

export async function runConformanceSuite() {
  const allowedRoot = ALLOWED_ROOT;
  const cases = [
    {
      caseId: 'case-01-authorized-unchanged-execution',
      authorizedEffect: path.join(ALLOWED_ROOT, 'authorized.txt'),
      executionRequest: path.join(ALLOWED_ROOT, 'authorized.txt'),
      content: 'case-01',
      allowedRoots: [ALLOWED_ROOT],
      authorizationDecision: 'ALLOW',
      blockerLayer: 'none',
    },
    {
      caseId: 'case-02-obvious-unauthorized-target',
      authorizedEffect: path.join(ALLOWED_ROOT, 'inside.txt'),
      executionRequest: path.join(OUTSIDE_ROOT, 'blocked.txt'),
      content: 'case-02',
      allowedRoots: [ALLOWED_ROOT],
      authorizationDecision: 'DENY',
      blockerLayer: 'authorization boundary',
    },
    {
      caseId: 'case-03-execution-layer-path-substitution',
      authorizedEffect: path.join(ALLOWED_ROOT, 'approved.txt'),
      executionRequest: path.join(OUTSIDE_ROOT, 'escaped.txt'),
      content: 'case-03',
      allowedRoots: [ALLOWED_ROOT, OUTSIDE_ROOT],
      authorizationDecision: 'ALLOW',
      blockerLayer: 'execution layer',
    },
    {
      caseId: 'case-04-filename-substitution',
      authorizedEffect: path.join(ALLOWED_ROOT, 'expected.txt'),
      executionRequest: path.join(ALLOWED_ROOT, 'actual.txt'),
      content: 'case-04',
      allowedRoots: [ALLOWED_ROOT],
      authorizationDecision: 'ALLOW',
      blockerLayer: 'execution layer',
    },
    {
      caseId: 'case-05-relative-path-transformation',
      authorizedEffect: path.join(ALLOWED_ROOT, 'dir', 'expected.txt'),
      executionRequest: `${ALLOWED_ROOT}/dir/../escaped.txt`,
      content: 'case-05',
      allowedRoots: [ALLOWED_ROOT],
      setupDirectories: [path.join(ALLOWED_ROOT, 'dir')],
      authorizationDecision: 'ALLOW',
      blockerLayer: 'execution layer',
    },
    {
      caseId: 'case-06-nested-path-boundary-escape',
      authorizedEffect: path.join(ALLOWED_ROOT, 'sub', 'ok.txt'),
      executionRequest: `${ALLOWED_ROOT}/sub/../../outside/escaped.txt`,
      content: 'case-06',
      allowedRoots: [ALLOWED_ROOT, OUTSIDE_ROOT],
      setupDirectories: [path.join(ALLOWED_ROOT, 'sub')],
      authorizationDecision: 'ALLOW',
      blockerLayer: 'execution layer',
    },
    {
      caseId: 'case-07-absolute-path-substitution',
      authorizedEffect: path.join(ALLOWED_ROOT, 'abs.txt'),
      executionRequest: path.join(OUTSIDE_ROOT, 'absolute-escaped.txt'),
      content: 'case-07',
      allowedRoots: [ALLOWED_ROOT, OUTSIDE_ROOT],
      authorizationDecision: 'ALLOW',
      blockerLayer: 'execution layer',
    },
    {
      caseId: 'case-08-authorization-execution-parameter-mismatch',
      authorizedEffect: path.join(ALLOWED_ROOT, 'approved.txt'),
      executionRequest: path.join(ALLOWED_ROOT, 'other.txt'),
      content: 'case-08',
      allowedRoots: [ALLOWED_ROOT],
      authorizationDecision: 'ALLOW',
      blockerLayer: 'execution layer',
    },
    {
      caseId: 'case-09-denied-execution-with-zero-effect',
      authorizedEffect: path.join(ALLOWED_ROOT, 'inside.txt'),
      executionRequest: path.join(OUTSIDE_ROOT, 'blocked.txt'),
      content: 'case-09',
      allowedRoots: [ALLOWED_ROOT],
      authorizationDecision: 'DENY',
      blockerLayer: 'authorization boundary',
    },
    {
      caseId: 'case-10-repeated-execution-with-independent-verification',
      authorizedEffect: path.join(ALLOWED_ROOT, 'repeat.txt'),
      executionRequest: path.join(ALLOWED_ROOT, 'repeat.txt'),
      executionContents: ['case-10-first', 'case-10-second'],
      allowedRoots: [ALLOWED_ROOT],
      authorizationDecision: 'ALLOW',
      blockerLayer: 'none',
    },
  ];

  const results = [];
  for (const testCase of cases) {
    const result = await runCase({
      caseId: testCase.caseId,
      allowedRoot,
      authorizedEffect: testCase.authorizedEffect,
      executionRequest: testCase.executionRequest,
      content: testCase.content,
      executionContents: testCase.executionContents || [testCase.content],
      allowedRoots: testCase.allowedRoots,
      setupDirectories: testCase.setupDirectories,
      authorizationDecision: testCase.authorizationDecision,
      blockerLayer: testCase.blockerLayer,
    });
    results.push(result);
  }

  const sentinel = await runSentinelDivergenceCheck();
  const summary = {
    total_cases: results.length,
    total_scenarios: results.length + 1,
    compliant_scenarios_detected: results.filter((item) => item.authorization_decision === 'ALLOW'
      && item.comparison_result === 'IN-BOUNDS').length,
    divergent_scenarios_detected: results.filter((item) => item.final_status === 'DIVERGENT / FAIL').length + (sentinel.scenario_result === 'DIVERGENT' ? 1 : 0),
    classification_counts: {
      in_bounds_core: results.filter((item) => item.comparison_result === 'IN-BOUNDS').length,
      divergent_core: results.filter((item) => item.comparison_result === 'DIVERGENT').length,
      denied_not_executed: results.filter((item) => item.comparison_result === 'DENIED / NOT EXECUTED').length,
      allowed_no_observed_effect: results.filter((item) => item.comparison_result === 'NO OBSERVED EFFECT').length,
      sentinel_divergent: sentinel.comparison_result === 'DIVERGENT' ? 1 : 0,
    },
    scenarios_without_observed_effect: results.filter((item) => Array.isArray(item.observed_effect) && item.observed_effect.length === 0).length,
    denied_without_observed_effect: results.filter((item) => item.authorization_decision === 'DENY'
      && Array.isArray(item.observed_effect) && item.observed_effect.length === 0).length,
    passed: results.filter((item) => item.final_status === 'PASS').length,
    failed: results.filter((item) => item.final_status !== 'PASS').length,
    sentinel_result: sentinel,
    results,
  };

  await saveJsonArtifact('conformance-suite-summary.json', summary);
  return summary;
}
