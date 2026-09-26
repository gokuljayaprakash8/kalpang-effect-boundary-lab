import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SERVER_ENTRY = new URL('../node_modules/@modelcontextprotocol/server-filesystem/dist/index.js', import.meta.url);
const ARTIFACT_DIR = new URL('../artifacts/', import.meta.url);

function isWithinAuthorizedBoundary(targetPath, allowedRoot) {
  const absTarget = path.resolve(targetPath);
  const absRoot = path.resolve(allowedRoot);
  const relative = path.relative(absRoot, absTarget);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function runSudoCommand(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('sudo', ['-n', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`sudo ${args.join(' ')} failed with exit ${code}: ${stderr || stdout}`));
      }
    });
  });
}

async function ensureSandbox(rootPath) {
  await runSudoCommand(['mkdir', '-p', rootPath]);
  await runSudoCommand(['chmod', '-R', '777', '/sandbox']);
}

async function resetSandbox(rootPath) {
  await runSudoCommand(['rm', '-rf', rootPath]);
  await runSudoCommand(['mkdir', '-p', rootPath]);
  await runSudoCommand(['chmod', '-R', '777', '/sandbox']);
}

async function snapshotDirectory(directoryPath) {
  const entries = {};

  async function walk(currentPath, prefix = '') {
    const names = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of names.sort((a, b) => a.name.localeCompare(b.name))) {
      const fullPath = path.join(currentPath, entry.name);
      const relPath = prefix ? path.join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        entries[relPath] = { type: 'directory', path: fullPath };
        await walk(fullPath, relPath);
      } else {
        const stat = await fs.stat(fullPath);
        entries[relPath] = { type: 'file', path: fullPath, size: stat.size };
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
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  await fs.writeFile(new URL(fileName, ARTIFACT_DIR), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function callOfficialMcpWrite({ pathToWrite, content, allowedRoots }) {
  const serverProcess = spawn('node', [fileURLToPath(SERVER_ENTRY), ...allowedRoots], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env,
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

async function prepareSandbox(allowedRoot) {
  await ensureSandbox(allowedRoot);
  await ensureSandbox('/sandbox/outside');
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
  expectedStatus,
  expectedObservedWithinAuthorization,
}) {
  await prepareSandbox(allowedRoot);
  await fs.rm(path.resolve(executionRequest), { force: true });
  const beforeSnapshot = await snapshotDirectory('/sandbox');

  let mcpResponse = null;
  let observed = [];
  let actualPath = null;

  if (authorizationDecision === 'ALLOW') {
    const executedRoots = allowedRoots || [allowedRoot];
    mcpResponse = await callOfficialMcpWrite({
      pathToWrite: executionRequest,
      content,
      allowedRoots: executedRoots,
    });
    const afterSnapshot = await snapshotDirectory('/sandbox');
    const changedPaths = computeChangedPaths(beforeSnapshot, afterSnapshot);
    observed = changedPaths.map((relativePath) => ({
      path: path.join('/sandbox', relativePath),
      inAuthorizedBoundary: isWithinAuthorizedBoundary(path.join('/sandbox', relativePath), allowedRoot),
    }));
    actualPath = observed.length === 1 ? observed[0].path : null;
  }

  const observedWithinAuthorization = observed.length === 0
    ? authorizationDecision === 'DENY'
    : observed.every((effect) => path.resolve(effect.path) === path.resolve(authorizedEffect));
  const mcpExecutionSucceeded = Boolean(mcpResponse?.toolResult?.result)
    && !mcpResponse.toolResult.error
    && !mcpResponse.toolResult.result.isError;
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
    observed_effect_within_authorization: observedWithinAuthorization,
    blocker_layer: blockerLayer,
    final_status: finalStatus,
    machine_evidence: {
      beforeSnapshot,
      afterSnapshot: await snapshotDirectory('/sandbox'),
      changedPaths: computeChangedPaths(beforeSnapshot, await snapshotDirectory('/sandbox')),
      logs: mcpResponse ? mcpResponse.logs : [],
    },
  };

  await saveJsonArtifact(`${caseId}.json`, caseResult);
  return caseResult;
}

export async function runSentinelDivergenceCheck() {
  const allowedRoot = '/sandbox/allowed';
  const authorizedEffect = '/sandbox/allowed/sentinel.txt';
  const executionRequest = '/sandbox/outside/sentinel-escaped.txt';

  await prepareSandbox(allowedRoot);
  await fs.rm(authorizedEffect, { force: true });
  await fs.rm(executionRequest, { force: true });
  const beforeSnapshot = await snapshotDirectory('/sandbox');

  const authorizationDecision = 'ALLOW';
  const mcpResponse = await callOfficialMcpWrite({
    pathToWrite: executionRequest,
    content: 'sentinel-escaped',
    allowedRoots: ['/sandbox/allowed', '/sandbox/outside'],
  });

  const afterSnapshot = await snapshotDirectory('/sandbox');
  const changedPaths = computeChangedPaths(beforeSnapshot, afterSnapshot);
  const observedEffects = changedPaths.map((relativePath) => ({
    path: path.join('/sandbox', relativePath),
    inAuthorizedBoundary: isWithinAuthorizedBoundary(path.join('/sandbox', relativePath), allowedRoot),
  }));

  const actualObservedEffect = observedEffects.length === 1 ? observedEffects[0].path : observedEffects.map((effect) => effect.path);
  const observedWithinAuthorization = observedEffects.length > 0 && observedEffects.every((effect) => path.resolve(effect.path) === path.resolve(authorizedEffect));
  const mcpExecutionSucceeded = !mcpResponse.toolResult?.error && !mcpResponse.toolResult?.result?.isError;
  const scenarioResult = !observedEffects.length ? 'NO OBSERVED EFFECT' : observedWithinAuthorization ? 'COMPLIANT' : 'DIVERGENT';

  const result = {
    case_id: 'sentinel-divergence-proof',
    requested_action: 'write_file',
    authorized_effect: authorizedEffect,
    execution_request: executionRequest,
    observed_effect: actualObservedEffect,
    authorization_decision: authorizationDecision,
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
  const allowedRoot = '/sandbox/allowed';
  const cases = [
    {
      caseId: 'case-01-authorized-unchanged-execution',
      authorizedEffect: '/sandbox/allowed/authorized.txt',
      executionRequest: '/sandbox/allowed/authorized.txt',
      content: 'case-01',
      allowedRoots: ['/sandbox/allowed'],
      authorizationDecision: 'ALLOW',
      blockerLayer: 'none',
    },
    {
      caseId: 'case-02-obvious-unauthorized-target',
      authorizedEffect: '/sandbox/allowed/inside.txt',
      executionRequest: '/sandbox/outside/blocked.txt',
      content: 'case-02',
      allowedRoots: ['/sandbox/allowed'],
      authorizationDecision: 'DENY',
      blockerLayer: 'authorization boundary',
    },
    {
      caseId: 'case-03-execution-layer-path-substitution',
      authorizedEffect: '/sandbox/allowed/approved.txt',
      executionRequest: '/sandbox/outside/escaped.txt',
      content: 'case-03',
      allowedRoots: ['/sandbox/allowed', '/sandbox/outside'],
      authorizationDecision: 'ALLOW',
      blockerLayer: 'execution layer',
    },
    {
      caseId: 'case-04-filename-substitution',
      authorizedEffect: '/sandbox/allowed/expected.txt',
      executionRequest: '/sandbox/allowed/actual.txt',
      content: 'case-04',
      allowedRoots: ['/sandbox/allowed'],
      authorizationDecision: 'ALLOW',
      blockerLayer: 'execution layer',
    },
    {
      caseId: 'case-05-relative-path-transformation',
      authorizedEffect: '/sandbox/allowed/dir/expected.txt',
      executionRequest: '/sandbox/allowed/dir/../escaped.txt',
      content: 'case-05',
      allowedRoots: ['/sandbox/allowed'],
      authorizationDecision: 'ALLOW',
      blockerLayer: 'execution layer',
    },
    {
      caseId: 'case-06-nested-path-boundary-escape',
      authorizedEffect: '/sandbox/allowed/sub/ok.txt',
      executionRequest: '/sandbox/allowed/sub/../../outside/escaped.txt',
      content: 'case-06',
      allowedRoots: ['/sandbox/allowed', '/sandbox/outside'],
      authorizationDecision: 'ALLOW',
      blockerLayer: 'execution layer',
    },
    {
      caseId: 'case-07-absolute-path-substitution',
      authorizedEffect: '/sandbox/allowed/abs.txt',
      executionRequest: '/sandbox/outside/absolute-escaped.txt',
      content: 'case-07',
      allowedRoots: ['/sandbox/allowed', '/sandbox/outside'],
      authorizationDecision: 'ALLOW',
      blockerLayer: 'execution layer',
    },
    {
      caseId: 'case-08-authorization-execution-parameter-mismatch',
      authorizedEffect: '/sandbox/allowed/approved.txt',
      executionRequest: '/sandbox/allowed/other.txt',
      content: 'case-08',
      allowedRoots: ['/sandbox/allowed'],
      authorizationDecision: 'ALLOW',
      blockerLayer: 'execution layer',
    },
    {
      caseId: 'case-09-denied-execution-with-zero-effect',
      authorizedEffect: '/sandbox/allowed/inside.txt',
      executionRequest: '/sandbox/outside/blocked.txt',
      content: 'case-09',
      allowedRoots: ['/sandbox/allowed'],
      authorizationDecision: 'DENY',
      blockerLayer: 'authorization boundary',
    },
    {
      caseId: 'case-10-repeated-execution-with-independent-verification',
      authorizedEffect: '/sandbox/allowed/repeat.txt',
      executionRequest: '/sandbox/allowed/repeat.txt',
      content: 'case-10',
      allowedRoots: ['/sandbox/allowed'],
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
      allowedRoots: testCase.allowedRoots,
      authorizationDecision: testCase.authorizationDecision,
      blockerLayer: testCase.blockerLayer,
      expectedStatus: null,
      expectedObservedWithinAuthorization: null,
    });
    results.push(result);
  }

  const sentinel = await runSentinelDivergenceCheck();
  const summary = {
    total_cases: results.length,
    total_scenarios: results.length + 1,
    compliant_scenarios_detected: results.filter((item) => item.observed_effect_within_authorization === true).length,
    divergent_scenarios_detected: results.filter((item) => item.final_status === 'DIVERGENT / FAIL').length + (sentinel.scenario_result === 'DIVERGENT' ? 1 : 0),
    scenarios_without_observed_effect: results.filter((item) => Array.isArray(item.observed_effect) && item.observed_effect.length === 0).length,
    passed: results.filter((item) => item.final_status === 'PASS').length,
    failed: results.filter((item) => item.final_status !== 'PASS').length,
    sentinel_result: sentinel,
    results,
  };

  await saveJsonArtifact('conformance-suite-summary.json', summary);
  return summary;
}
