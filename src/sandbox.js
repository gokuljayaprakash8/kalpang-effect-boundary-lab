import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const SANDBOX_ROOT = await fs.mkdtemp(path.join(os.tmpdir(), 'kalpang-effect-boundary-'));
export const ALLOWED_ROOT = path.join(SANDBOX_ROOT, 'allowed');
export const OUTSIDE_ROOT = path.join(SANDBOX_ROOT, 'outside');

export function isWithinAuthorizedBoundary(targetPath, allowedRoot) {
  const absTarget = path.resolve(targetPath);
  const absRoot = path.resolve(allowedRoot);
  const relative = path.relative(absRoot, absTarget);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export async function assertSandboxPath(targetPath, description) {
  const absoluteSandbox = await fs.realpath(SANDBOX_ROOT);
  const absoluteTarget = path.resolve(targetPath);
  if (!isWithinAuthorizedBoundary(absoluteTarget, absoluteSandbox)) {
    throw new Error(`${description} is outside the private sandbox: ${targetPath}`);
  }

  let existingAncestor = absoluteTarget;
  while (true) {
    try {
      const ancestorStat = await fs.lstat(existingAncestor);
      if (ancestorStat.isSymbolicLink()) {
        const linkTarget = await fs.readlink(existingAncestor);
        const resolvedLink = path.resolve(path.dirname(existingAncestor), linkTarget);
        if (!isWithinAuthorizedBoundary(resolvedLink, absoluteSandbox)) {
          throw new Error(`${description} resolves outside the private sandbox: ${targetPath}`);
        }
      }
      const realAncestor = await fs.realpath(existingAncestor);
      if (!isWithinAuthorizedBoundary(realAncestor, absoluteSandbox)) {
        throw new Error(`${description} resolves outside the private sandbox: ${targetPath}`);
      }
      return;
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        throw error;
      }
      const parent = path.dirname(existingAncestor);
      if (parent === existingAncestor) {
        throw error;
      }
      existingAncestor = parent;
    }
  }
}

export async function prepareSandbox() {
  await fs.mkdir(ALLOWED_ROOT, { recursive: true });
  await fs.mkdir(OUTSIDE_ROOT, { recursive: true });
}

export async function resetSandbox() {
  await fs.rm(SANDBOX_ROOT, { recursive: true, force: true });
  await prepareSandbox();
}

export async function cleanupSandbox() {
  await fs.rm(SANDBOX_ROOT, { recursive: true, force: true });
}
