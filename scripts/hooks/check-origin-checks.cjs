const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');

const hookScript = join(__dirname, 'check-origin.cjs');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'elorus-hook-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const origin = join(dir, 'origin.git');
  const seed = join(dir, 'seed');
  const local = join(dir, 'local');
  const peer = join(dir, 'peer');
  const markers = join(dir, 'markers');
  mkdirSync(markers);

  git(dir, 'init', '--bare', '--initial-branch=main', origin);
  git(dir, 'init', '--initial-branch=main', seed);
  git(seed, 'config', 'user.name', 'Hook Test');
  git(seed, 'config', 'user.email', 'hook@example.test');
  writeFileSync(join(seed, 'README.md'), 'initial\n');
  git(seed, 'add', '.');
  git(seed, 'commit', '-m', 'initial');
  git(seed, 'remote', 'add', 'origin', origin);
  git(seed, 'push', '-u', 'origin', 'main');
  git(dir, 'clone', origin, local);
  git(dir, 'clone', origin, peer);
  for (const repo of [local, peer]) {
    git(repo, 'config', 'user.name', 'Hook Test');
    git(repo, 'config', 'user.email', 'hook@example.test');
  }

  let commitNumber = 0;
  function advance(repo) {
    commitNumber += 1;
    writeFileSync(join(repo, `change-${commitNumber}.txt`), `change ${commitNumber}\n`);
    git(repo, 'add', '.');
    git(repo, 'commit', '-m', `change ${commitNumber}`);
  }
  function run(sessionId) {
    return spawnSync(process.execPath, [hookScript], {
      cwd: local,
      env: { ...process.env, TMPDIR: markers },
      input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: sessionId }),
      encoding: 'utf8',
      timeout: 10000,
    });
  }
  return { dir, origin, local, peer, advance, run };
}

test('checks once per session and fast-forwards on the next session', (t) => {
  const { local, peer, advance, run } = fixture(t);
  const initial = git(local, 'rev-parse', 'HEAD');
  const first = run('session-one');
  assert.equal(first.status, 0);
  assert.match(JSON.parse(first.stdout).hookSpecificOutput.additionalContext, /branch is current/);

  advance(peer);
  git(peer, 'push', 'origin', 'main');
  const repeat = run('session-one');
  assert.equal(repeat.status, 0);
  assert.equal(repeat.stdout, '');
  assert.equal(git(local, 'rev-parse', 'HEAD'), initial);

  const next = run('session-two');
  assert.equal(next.status, 0);
  assert.match(JSON.parse(next.stdout).hookSpecificOutput.additionalContext, /Fast-forwarded 1 commit/);
  assert.equal(git(local, 'rev-parse', 'HEAD'), git(peer, 'rev-parse', 'HEAD'));
});

test('blocks a dirty checkout behind origin, then retries the same session', (t) => {
  const { local, peer, advance, run } = fixture(t);
  advance(peer);
  git(peer, 'push', 'origin', 'main');
  writeFileSync(join(local, 'untracked.txt'), 'local work\n');

  const blocked = run('dirty-session');
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /uncommitted changes/);
  rmSync(join(local, 'untracked.txt'));

  const retried = run('dirty-session');
  assert.equal(retried.status, 0);
  assert.equal(git(local, 'rev-parse', 'HEAD'), git(peer, 'rev-parse', 'HEAD'));
});

test('blocks a diverged branch with exit code 2', (t) => {
  const { local, peer, advance, run } = fixture(t);
  advance(local);
  advance(peer);
  git(peer, 'push', 'origin', 'main');

  const blocked = run('diverged-session');
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /has diverged/);
});

test('blocks a detached checkout behind origin', (t) => {
  const { local, peer, advance, run } = fixture(t);
  git(local, 'checkout', '--detach');
  advance(peer);
  git(peer, 'push', 'origin', 'main');

  const blocked = run('detached-session');
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /detached checkout is behind/);
});

test('explains when neither an upstream nor origin/HEAD exists', (t) => {
  const { local, run } = fixture(t);
  git(local, 'branch', '--unset-upstream');
  git(local, 'remote', 'set-head', 'origin', '-d');

  const blocked = run('missing-upstream-session');
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /No upstream is configured/);
  assert.doesNotMatch(blocked.stderr, /Check the network/);
});

test('blocks a branch tracking a remote other than origin', (t) => {
  const { local, origin, run } = fixture(t);
  git(local, 'remote', 'add', 'alternate', origin);
  git(local, 'push', '-u', 'alternate', 'main');

  const blocked = run('alternate-remote-session');
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /tracks alternate\/main, not origin/);
});
