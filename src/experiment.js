import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const SERVER_ENTRY = new URL('../node_modules/@modelcontextprotocol/server-filesystem/dist/index.js', import.meta.url);
const ARTIFACT_DIR = new URL('../artifacts/', import.meta.url);

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

function isWithinAuthorizedBoundary(targetPath, allowedRoot) {
  const absTarget = path.resolve(targetPath);
  const absRoot = path.resolve(allowedRoot);
  const relative = path.relative(absRoot, absTarget);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
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
  const filePath = new URL(fileName, ARTIFACT_DIR);
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

async function prepareSandbox(allowedRoot) {
  await ensureSandbox(allowedRoot);
  await ensureSandbox('/sandbox/outside');
}

export async function runAuthorizedCheck({ allowedRoot, requestedPath, content, caseId = 'authorized-unchanged-execution' }) {
  await prepareSandbox(allowedRoot);
  await fs.rm(requestedPath, { force: true });

  const beforeSnapshot = await snapshotDirectory(allowedRoot);
  const authorizedCheck = isWithinAuthorizedBoundary(requestedPath, allowedRoot);
  const mcpResponse = await callOfficialMcpWrite({
    pathToWrite: requestedPath,
    content,
    allowedRoots: [allowedRoot],
  });
  const afterSnapshot = await snapshotDirectory(allowedRoot);
  const changedPaths = computeChangedPaths(beforeSnapshot, afterSnapshot);

  const observedEffects = changedPaths.map((relativePath) => ({
    path: path.join(allowedRoot, relativePath),
    inAuthorizedBoundary: isWithinAuthorizedBoundary(path.join(allowedRoot, relativePath), allowedRoot),
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
  await prepareSandbox(allowedRoot);
  const beforeSnapshot = await snapshotDirectory(allowedRoot);
  const requestedWithinBoundary = isWithinAuthorizedBoundary(requestedPath, allowedRoot);

  const report = {
    case_id: caseId,
    requestedAction: 'write_file',
    authorizedResource: allowedRoot,
    requestedEffectResource: requestedPath,
    authorizationDecision: requestedWithinBoundary ? 'allow' : 'deny',
    observedEffects: [],
    criterion: 'ObservedEffect ⊆ AuthorizedEffect',
    finalResult: 'FAIL',
    blocker: requestedWithinBoundary ? 'server' : 'authorization boundary',
    serverBlocker: requestedWithinBoundary ? 'not reached' : 'not reached',
    rawEvidence: {
      beforeSnapshot,
      afterSnapshot: beforeSnapshot,
      changedPaths: [],
      logs: [],
    },
  };

  if (!requestedWithinBoundary) {
    await saveJsonArtifact('unauthorized-experiment.json', report);
    return report;
  }

  const mcpResponse = await callOfficialMcpWrite({
    pathToWrite: requestedPath,
    content,
    allowedRoots: [allowedRoot],
  });
  const afterSnapshot = await snapshotDirectory(allowedRoot);
  const changedPaths = computeChangedPaths(beforeSnapshot, afterSnapshot);

  report.observedEffects = changedPaths.map((relativePath) => ({
    path: path.join(allowedRoot, relativePath),
    inAuthorizedBoundary: isWithinAuthorizedBoundary(path.join(allowedRoot, relativePath), allowedRoot),
  }));
  report.finalResult = report.observedEffects.every((effect) => effect.inAuthorizedBoundary) ? 'PASS' : 'FAIL';
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
  await prepareSandbox(allowedRoot);
  await fs.rm(actualTarget, { force: true });
  const beforeSnapshot = await snapshotDirectory('/sandbox');

  const authorizationApproved = isWithinAuthorizedBoundary(authorizedTarget, allowedRoot);
  const report = {
    case_id: caseId,
    requestedAction: 'write_file',
    authorizedResource: allowedRoot,
    authorizedEffect: authorizedTarget,
    actualFilesystemEffect: actualTarget,
    authorizationDecision: authorizationApproved ? 'ALLOW' : 'DENY',
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
    allowedRoots: [allowedRoot, '/sandbox/outside'],
  });

  const afterSnapshot = await snapshotDirectory('/sandbox');
  const changedPaths = computeChangedPaths(beforeSnapshot, afterSnapshot);
  const observedEffects = changedPaths.map((relativePath) => ({
    path: path.join('/sandbox', relativePath),
    inAuthorizedBoundary: isWithinAuthorizedBoundary(path.join('/sandbox', relativePath), allowedRoot),
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
  const authorizedRoot = '/sandbox/allowed';
  const allowedPath = '/sandbox/allowed/agent-write.txt';
  const blockedPath = '/sandbox/outside/blocked.txt';

  await resetSandbox('/sandbox/allowed');
  await resetSandbox('/sandbox/outside');

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
    actualTarget: '/sandbox/outside/escaped.txt',
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
  const { authorizedResult, unauthorizedResult, summary } = await runFullExperiment();
  console.log(JSON.stringify({ authorizedResult, unauthorizedResult, summary }, null, 2));
}
