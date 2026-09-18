const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

function git(...args) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 60000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

class Blocked extends Error {}

function respond(message) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: message,
    },
  }) + '\n');
}

function main() {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  if (event.hook_event_name !== 'UserPromptSubmit') {
    throw new Blocked('Unexpected hook event');
  }
  if (typeof event.session_id !== 'string' || !event.session_id) {
    throw new Blocked('Hook input is missing a session ID.');
  }

  const root = git('rev-parse', '--show-toplevel');
  const marker = join(tmpdir(), 'elorus-origin-check-' + createHash('sha256')
    .update(root + '\0' + event.session_id)
    .digest('hex'));
  if (existsSync(marker)) return;

  let branch;
  try {
    branch = git('symbolic-ref', '--quiet', '--short', 'HEAD');
  } catch {
    branch = null;
  }
  let upstream;
  try {
    upstream = branch && git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}');
  } catch {
    upstream = null;
  }
  if (!upstream) {
    try {
      upstream = git('symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD');
    } catch {
      throw new Blocked('No upstream is configured for this branch, and origin/HEAD is unavailable. Set an origin upstream before editing.');
    }
  }
  if (!upstream.startsWith('origin/')) {
    throw new Blocked('The current branch tracks ' + upstream + ', not origin. Set an origin upstream before editing.');
  }

  git('fetch', '--quiet', '--no-tags', '--prune', 'origin');
  const [ahead, behind] = git('rev-list', '--left-right', '--count', 'HEAD...' + upstream)
    .split(/\s+/)
    .map(Number);

  if (!Number.isInteger(ahead) || !Number.isInteger(behind)) {
    throw new Error('Could not compare the local branch with its upstream');
  }
  let message;
  if (behind === 0) {
    message = ahead === 0
      ? 'Origin checked: this branch is current. Continue with the task and preserve any existing local changes.'
      : 'Origin checked: this branch is current and has ' + ahead + ' unpushed local commit(s). Continue with the task.';
  } else if (!branch) {
    throw new Blocked('This detached checkout is behind ' + upstream + '. Create or switch to a branch before editing.');
  } else if (ahead > 0) {
    throw new Blocked('The branch has diverged from ' + upstream + ' (' + ahead + ' ahead, ' + behind + ' behind). Merge or rebase manually before editing.');
  } else if (git('status', '--porcelain', '--untracked-files=normal')) {
    throw new Blocked('The branch is ' + behind + ' commit(s) behind ' + upstream + ', but this checkout has uncommitted changes. Save or commit them, then retry the task.');
  } else {
    git('merge', '--ff-only', upstream);
    message = 'Fast-forwarded ' + behind + ' commit(s) from ' + upstream + '. Continue with the original task.';
  }

  // A successful check is sufficient for this session. A blocked prompt is retried.
  try {
    writeFileSync(marker, '', { flag: 'wx' });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
  respond(message);
}

try {
  main();
} catch (error) {
  process.stderr.write((error instanceof Blocked
    ? error.message
    : 'Could not verify or fast-forward origin. Check the network, Git authentication, branch upstream, and checkout state, then retry the task.') + '\n');
  process.exitCode = 2;
}
