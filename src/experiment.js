import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import {
  ALLOWED_ROOT,
  OUTSIDE_ROOT,
  SANDBOX_ROOT,
  assertSandboxPath,
  isWithinAuthorizedBoundary,
  prepareSandbox,
  resetSandbox,
} from './sandbox.js';

const THIS_FILE = fileURLToPath(import.meta.url);
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
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const filePath = new URL(fileName, ARTIFACT_DIR);
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

      if (!line) {
        continue;
      }

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

  sendJson({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  });

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

  const closePromise = new Promise((resolve) => {
    serverProcess.on('exit', (code, signal) => {
      resolve({ code, signal });
    });
  });

  serverProcess.stdin.end();
  const exitInfo = await closePromise;

  return {
    toolResult,
    exitInfo,
    logs: logEntries,
  };
}

export async function runAuthorizedCheck({ allowedRoot, requestedPath, content, caseId = 'authorized-unchanged-execution' }) {
  await assertSandboxPath(allowedRoot, 'Authorized root');
  await assertSandboxPath(requestedPath, 'Requested path');
  await prepareSandbox();
  if (!isWithinAuthorizedBoundary(requestedPath, SANDBOX_ROOT)) {
    throw new Error(`Requested path is outside the private sandbox: ${requestedPath}`);
  }
  await fs.rm(path.resolve(requestedPath), { force: true });

  const beforeSnapshot = await snapshotDirectory(SANDBOX_ROOT);
  const authorizedCheck = isWithinAuthorizedBoundary(requestedPath, allowedRoot);
  const mcpResponse = await callOfficialMcpWrite({
    pathToWrite: requestedPath,
    content,
    allowedRoots: [allowedRoot],
  });
  const afterSnapshot = await snapshotDirectory(SANDBOX_ROOT);
  const changedPaths = computeChangedPaths(beforeSnapshot, afterSnapshot);

  const observedEffects = changedPaths.map((relativePath) => ({
    path: path.join(SANDBOX_ROOT, relativePath),
    inAuthorizedBoundary: isWithinAuthorizedBoundary(path.join(SANDBOX_ROOT, relativePath), allowedRoot),
  }));
  const mcpExecutionSucceeded = Boolean(mcpResponse.toolResult?.result)
    && !mcpResponse.toolResult.error
    && !mcpResponse.toolResult.result.isError;
  const requestedEffectObserved = observedEffects.length === 1
    && path.resolve(observedEffects[0].path) === path.resolve(requestedPath);

  const report = {
    case_id: caseId,
    requestedAction: 'write_file',
    authorizedResource: allowedRoot,
    requestedEffectResource: requestedPath,
    authorizationDecision: authorizedCheck ? 'allow' : 'deny',
    execution_performed: true,
    observedEffects,
    criterion: 'ObservedEffect ⊆ AuthorizedEffect',
    finalResult: mcpExecutionSucceeded && requestedEffectObserved ? 'PASS' : 'FAIL',
    serverResult: mcpResponse.toolResult,
    rawEvidence: {
      beforeSnapshot,
      afterSnapshot,
      changedPaths,
      logs: mcpResponse.logs,
    },
  };

  await saveJsonArtifact('authorized-experiment.json', report);
  return report;
}

export async function runUnauthorizedCheck({ allowedRoot, requestedPath, content, caseId = 'obvious-unauthorized-target' }) {
  await assertSandboxPath(allowedRoot, 'Authorized root');
  await assertSandboxPath(requestedPath, 'Requested path');
  await prepareSandbox();
  const beforeSnapshot = await snapshotDirectory(SANDBOX_ROOT);
  const requestedWithinBoundary = isWithinAuthorizedBoundary(requestedPath, allowedRoot);

  const report = {
    case_id: caseId,
    requestedAction: 'write_file',
    authorizedResource: allowedRoot,
    requestedEffectResource: requestedPath,
    authorizationDecision: requestedWithinBoundary ? 'allow' : 'deny',
    execution_performed: false,
    observedEffects: [],
    criterion: 'ObservedEffect ⊆ AuthorizedEffect',
    finalResult: requestedWithinBoundary ? 'FAIL' : 'PASS',
    blocker: requestedWithinBoundary ? 'server' : 'authorization boundary',
    serverBlocker: requestedWithinBoundary ? 'not reached' : 'not reached',
    rawEvidence: {
      beforeSnapshot,
      afterSnapshot: await snapshotDirectory(SANDBOX_ROOT),
      changedPaths: [],
      logs: [],
    },
  };

  if (!requestedWithinBoundary) {
    const afterSnapshot = await snapshotDirectory(SANDBOX_ROOT);
    const changedPaths = computeChangedPaths(beforeSnapshot, afterSnapshot);
    report.observedEffects = changedPaths.map((relativePath) => ({
      path: path.join(SANDBOX_ROOT, relativePath),
      inAuthorizedBoundary: isWithinAuthorizedBoundary(path.join(SANDBOX_ROOT, relativePath), allowedRoot),
    }));
    report.finalResult = changedPaths.length === 0 ? 'PASS' : 'FAIL';
    report.rawEvidence = {
      beforeSnapshot,
      afterSnapshot,
      changedPaths,
      logs: [],
    };
    await saveJsonArtifact('unauthorized-experiment.json', report);
    return report;
  }

  const mcpResponse = await callOfficialMcpWrite({
    pathToWrite: requestedPath,
    content,
    allowedRoots: [allowedRoot],
  });
  report.execution_performed = true;
  const afterSnapshot = await snapshotDirectory(SANDBOX_ROOT);
  const changedPaths = computeChangedPaths(beforeSnapshot, afterSnapshot);

  report.observedEffects = changedPaths.map((relativePath) => ({
    path: path.join(SANDBOX_ROOT, relativePath),
    inAuthorizedBoundary: isWithinAuthorizedBoundary(path.join(SANDBOX_ROOT, relativePath), allowedRoot),
  }));
  report.finalResult = report.observedEffects.length === 1
    && path.resolve(report.observedEffects[0].path) === path.resolve(requestedPath)
    && Boolean(mcpResponse.toolResult?.result)
    && !mcpResponse.toolResult.error
    && !mcpResponse.toolResult.result.isError ? 'PASS' : 'FAIL';
  report.blocker = 'official MCP Filesystem server';
  report.serverBlocker = 'official MCP Filesystem server rejected the write';
  report.rawEvidence = {
    beforeSnapshot,
    afterSnapshot,
    changedPaths,
    logs: mcpResponse.logs,
  };

  await saveJsonArtifact('unauthorized-experiment.json', report);
  return report;
}

export async function runExecutionDivergenceCheck({ allowedRoot, authorizedTarget, actualTarget, content, caseId = 'execution-divergence' }) {
  await assertSandboxPath(allowedRoot, 'Authorized root');
  await assertSandboxPath(authorizedTarget, 'Authorized target');
  await assertSandboxPath(actualTarget, 'Actual target');
  await prepareSandbox();
  if (!isWithinAuthorizedBoundary(actualTarget, SANDBOX_ROOT)) {
    throw new Error(`Actual target is outside the private sandbox: ${actualTarget}`);
  }
  await fs.rm(path.resolve(actualTarget), { force: true });
  const beforeSnapshot = await snapshotDirectory(SANDBOX_ROOT);

  const authorizationApproved = isWithinAuthorizedBoundary(authorizedTarget, allowedRoot);
  const report = {
    case_id: caseId,
    requestedAction: 'write_file',
    authorizedResource: allowedRoot,
    authorizedEffect: authorizedTarget,
    actualFilesystemEffect: actualTarget,
    authorizationDecision: authorizationApproved ? 'ALLOW' : 'DENY',
    execution_performed: false,
    observedEffects: [],
    observableInvariant: 'ObservedEffect ⊆ AuthorizedEffect',
    invariantResult: false,
    finalResult: 'DIVERGENT / FAIL',
    divergenceNote: 'Authorization approves one target while the execution layer writes a different target.',
    rawEvidence: {
      beforeSnapshot,
      afterSnapshot: beforeSnapshot,
      changedPaths: [],
      logs: [],
    },
  };

  if (!authorizationApproved) {
    await saveJsonArtifact('execution-divergence-experiment.json', report);
    return report;
  }

  const mcpResponse = await callOfficialMcpWrite({
    pathToWrite: actualTarget,
    content,
    allowedRoots: [allowedRoot, OUTSIDE_ROOT],
  });
  report.execution_performed = true;

  const afterSnapshot = await snapshotDirectory(SANDBOX_ROOT);
  const changedPaths = computeChangedPaths(beforeSnapshot, afterSnapshot);
  const observedEffects = changedPaths.map((relativePath) => ({
    path: path.join(SANDBOX_ROOT, relativePath),
    inAuthorizedBoundary: isWithinAuthorizedBoundary(path.join(SANDBOX_ROOT, relativePath), allowedRoot),
  }));

  report.observedEffects = observedEffects;
  report.rawEvidence = {
    beforeSnapshot,
    afterSnapshot,
    changedPaths,
    logs: mcpResponse.logs,
  };
  const mcpExecutionSucceeded = Boolean(mcpResponse.toolResult?.result)
    && !mcpResponse.toolResult.error
    && !mcpResponse.toolResult.result.isError;
  report.invariantResult = observedEffects.length > 0
    && observedEffects.every((effect) => path.resolve(effect.path) === path.resolve(authorizedTarget));
  report.finalResult = !mcpExecutionSucceeded ? 'EXECUTION ERROR / FAIL'
    : observedEffects.length === 0 ? 'NO OBSERVED EFFECT / FAIL'
      : report.invariantResult ? 'PASS' : 'DIVERGENT / FAIL';
  report.actualFilesystemEffect = observedEffects.length === 1
    ? observedEffects[0].path
    : observedEffects.map((effect) => effect.path);

  await saveJsonArtifact('execution-divergence-experiment.json', report);
  return report;
}

async function runFullExperiment() {
  const authorizedRoot = ALLOWED_ROOT;
  const allowedPath = path.join(ALLOWED_ROOT, 'agent-write.txt');
  const blockedPath = path.join(OUTSIDE_ROOT, 'blocked.txt');

  await resetSandbox();

  const authorizedResult = await runAuthorizedCheck({
    allowedRoot: authorizedRoot,
    requestedPath: allowedPath,
    content: 'authorized payload',
  });

  const unauthorizedResult = await runUnauthorizedCheck({
    allowedRoot: authorizedRoot,
    requestedPath: blockedPath,
    content: 'should be blocked',
  });

  const divergenceResult = await runExecutionDivergenceCheck({
    allowedRoot: authorizedRoot,
    authorizedTarget: allowedPath,
    actualTarget: path.join(OUTSIDE_ROOT, 'escaped.txt'),
    content: 'escaped payload',
  });

  const summary = {
    experiment: 'KALPANG Effect Boundary Lab v0.1',
    requestedAction: 'write_file',
    authorizedResource: authorizedRoot,
    requestedEffectResource: allowedPath,
    observedEffects: authorizedResult.observedEffects,
    pass: authorizedResult.finalResult === 'PASS',
    unauthorized: unauthorizedResult,
    divergence: divergenceResult,
    invariant: 'ObservedEffect ⊆ AuthorizedEffect',
  };

  await saveJsonArtifact('experiment-summary.json', summary);
  return { authorizedResult, unauthorizedResult, divergenceResult, summary };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { authorizedResult, unauthorizedResult, summary } = await runFullExperiment();
    console.log(JSON.stringify({ authorizedResult, unauthorizedResult, summary }, null, 2));
  } finally {
    await import('./sandbox.js').then(({ cleanupSandbox }) => cleanupSandbox());
  }
}
