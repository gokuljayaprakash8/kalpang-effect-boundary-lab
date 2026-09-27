import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const ARTIFACTS = new URL('../artifacts/', import.meta.url);
const PROVENANCE_PATH = new URL('../artifacts/run-provenance.json', import.meta.url);
const REPOSITORY = 'https://github.com/gokuljayaprakash8/kalpang-effect-boundary-lab';
const SOURCE_FILES = [
  'package.json',
  'package-lock.json',
  'README.md',
  '.github/workflows/reproducibility.yml',
  'docs/prior-art.md',
  'src/conformance-suite.js',
  'src/experiment.js',
  'src/github-comment-binding.js',
  'src/authorize-github-comment.js',
  'src/github-rest-observer.js',
  'src/execute-github-comment.js',
  'src/reproduce.js',
  'src/sandbox.js',
  'test/effect-boundary.test.js',
  'test/github-comment.test.js',
];
const EXPECTED_EVIDENCE_FILES = [
  'authorized-experiment.json',
  'case-01-authorized-unchanged-execution.json',
  'case-02-obvious-unauthorized-target.json',
  'case-03-execution-layer-path-substitution.json',
  'case-04-filename-substitution.json',
  'case-05-relative-path-transformation.json',
  'case-06-nested-path-boundary-escape.json',
  'case-07-absolute-path-substitution.json',
  'case-08-authorization-execution-parameter-mismatch.json',
  'case-09-denied-execution-with-zero-effect.json',
  'case-10-repeated-execution-with-independent-verification.json',
  'conformance-suite-summary.json',
  'execution-divergence-experiment.json',
  'experiment-summary.json',
  'sentinel-divergence-proof.json',
  'unauthorized-experiment.json',
].sort();

function run(command, args) {
  return spawnSync(command, args, {
    cwd: fileURLToPath(ROOT),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

const initialStatus = execFileSync('git', ['status', '--porcelain'], {
  cwd: fileURLToPath(ROOT),
  encoding: 'utf8',
});
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: fileURLToPath(ROOT),
  encoding: 'utf8',
}).trim();
const lockfile = await fs.readFile(new URL('../package-lock.json', import.meta.url));

const tests = run(process.execPath, ['--test', '--test-reporter=tap']);
process.stdout.write(tests.stdout || '');
process.stderr.write(tests.stderr || '');
if (tests.status !== 0) {
  process.exit(tests.status ?? 1);
}

const testCount = Number(tests.stdout.match(/^# tests (\d+)$/m)?.[1]);
const testsPassed = Number(tests.stdout.match(/^# pass (\d+)$/m)?.[1]);
const testsFailed = Number(tests.stdout.match(/^# fail (\d+)$/m)?.[1]);
if (![testCount, testsPassed, testsFailed].every(Number.isFinite)) {
  throw new Error('Could not parse Node TAP test totals; provenance was not written.');
}

const standalone = run(process.execPath, ['src/experiment.js']);
if (standalone.status !== 0) {
  process.stdout.write(standalone.stdout || '');
  process.stderr.write(standalone.stderr || '');
  process.exit(standalone.status ?? 1);
}

const suite = JSON.parse(await fs.readFile(new URL('../artifacts/conformance-suite-summary.json', import.meta.url), 'utf8'));
const measuredClassificationCounts = {
  in_bounds_core: suite.results.filter((item) => item.comparison_result === 'IN-BOUNDS').length,
  divergent_core: suite.results.filter((item) => item.comparison_result === 'DIVERGENT').length,
  denied_not_executed: suite.results.filter((item) => item.comparison_result === 'DENIED / NOT EXECUTED').length,
  allowed_no_observed_effect: suite.results.filter((item) => item.comparison_result === 'NO OBSERVED EFFECT').length,
  sentinel_divergent: suite.sentinel_result?.comparison_result === 'DIVERGENT' ? 1 : 0,
};
if (suite.total_cases !== suite.results.length
  || suite.total_scenarios !== suite.total_cases + 1
  || suite.sentinel_result?.scenario_result !== 'DIVERGENT'
  || suite.sentinel_result?.test_result !== 'PASS'
  || JSON.stringify(suite.classification_counts) !== JSON.stringify(measuredClassificationCounts)
  || suite.results.some((item) => item.authorization_decision === 'DENY'
    && (item.execution_performed !== false
      || item.observed_effect.length !== 0
      || item.machine_evidence.changedPaths.length !== 0))
  || suite.results.some((item) => item.authorization_decision === 'ALLOW'
    && item.observed_effect.length === 0 && item.final_status === 'PASS')) {
  throw new Error('Measured scenario outcomes do not agree with the conformance summary.');
}
for (const result of suite.results) {
  const evidence = JSON.parse(await fs.readFile(new URL(`../artifacts/${result.case_id}.json`, import.meta.url), 'utf8'));
  if (JSON.stringify(evidence) !== JSON.stringify(result)) {
    throw new Error(`Case evidence does not match the measured result: ${result.case_id}`);
  }
}
const suiteEvidence = JSON.parse(await fs.readFile(new URL('../artifacts/conformance-suite-summary.json', import.meta.url), 'utf8'));
if (JSON.stringify(suiteEvidence) !== JSON.stringify(suite)) {
  throw new Error('Conformance summary evidence changed during reproduction.');
}
const artifactNames = (await fs.readdir(fileURLToPath(ARTIFACTS)))
  .filter((name) => name.endsWith('.json') && name !== 'run-provenance.json')
  .sort();
if (JSON.stringify(artifactNames) !== JSON.stringify(EXPECTED_EVIDENCE_FILES)) {
  throw new Error(`Unexpected evidence artifact set: ${artifactNames.join(', ')}`);
}
const artifactDigests = {};
for (const name of artifactNames) {
  artifactDigests[name] = sha256(await fs.readFile(new URL(name, ARTIFACTS)));
}
const sourceDigests = {};
for (const name of SOURCE_FILES) {
  sourceDigests[name] = sha256(await fs.readFile(new URL(`../${name}`, import.meta.url)));
}
const npmVersion = run('npm', ['--version']);
if (npmVersion.status !== 0) {
  throw new Error(`npm --version failed: ${npmVersion.stderr}`);
}

const provenance = {
  schema_version: 1,
  repository: REPOSITORY,
  source_commit: sourceCommit,
  source_worktree_clean_at_start: initialStatus.length === 0,
  source_files_sha256: sourceDigests,
  generated_at: new Date().toISOString(),
  runtime: {
    node: process.version,
    npm: npmVersion.stdout.trim(),
  },
  dependency_lock: {
    file: 'package-lock.json',
    sha256: sha256(lockfile),
  },
  reproduction_commands: ['npm ci', 'npm run reproduce'],
  test_result: {
    test_count: testCount,
    passed: testsPassed,
    failed: testsFailed,
  },
  experiment_result: {
    core_cases: suite.total_cases,
    total_scenarios_including_sentinel: suite.total_scenarios,
    allowed_effects_in_bounds: suite.compliant_scenarios_detected,
    allowed_effects_divergent: suite.divergent_scenarios_detected - Number(suite.sentinel_result.scenario_result === 'DIVERGENT'),
    denied_without_observed_effect: suite.denied_without_observed_effect,
    sentinel_scenario: suite.sentinel_result.scenario_result,
    sentinel_test: suite.sentinel_result.test_result,
    classification_counts: measuredClassificationCounts,
  },
  evidence_files_count: artifactNames.length,
  evidence_sha256: artifactDigests,
  known_limitations: [
    'Authorization values are harness fixture inputs; no live authorization service or agent is tested.',
    'Filesystem snapshots run in the same process trust domain and are not an independent or tamper-resistant observer.',
    'The opt-in GitHub comment flow uses a separate REST observation route but the same local runner and credential trust domain; it is not an independently trusted observer.',
    'Authorization artifacts are unsigned local files and do not establish trusted authorization identity, tamper resistance, or replay protection.',
  ],
};

await fs.writeFile(PROVENANCE_PATH, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
console.log(`Reproduction complete: ${testsPassed}/${testCount} tests passed; ${suite.total_scenarios} scenarios; ${artifactNames.length} evidence files.`);
console.log(`Source commit: ${sourceCommit}`);
console.log('Run provenance: artifacts/run-provenance.json');
