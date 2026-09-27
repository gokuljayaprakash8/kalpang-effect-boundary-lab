import fs from 'node:fs/promises';
import { createGitHubCommentAuthorization } from './github-comment-binding.js';

const [requestPath, authorizationPath, decision] = process.argv.slice(2);
if (!requestPath || !authorizationPath || !decision) {
  throw new Error('Usage: node src/authorize-github-comment.js <request.json> <authorization.json> <ALLOW|DENY>');
}

const request = JSON.parse(await fs.readFile(requestPath, 'utf8'));
const authorization = createGitHubCommentAuthorization(request, decision.toUpperCase());
await fs.writeFile(authorizationPath, `${JSON.stringify(authorization, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  decision: authorization.decision,
  canonical_request_sha256: authorization.canonical_request_sha256,
  authorization_artifact: authorizationPath,
}, null, 2));