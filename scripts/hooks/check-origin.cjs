const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');

function git(...args) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 60000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function respond(message, blocked = false) {
  const response = blocked
    ? { decision: 'block', reason: message }
    : {
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: message,
        },
      };
  process.stdout.write(JSON.stringify(response) + '\n');
}

try {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  if (event.hook_event_name !== 'UserPromptSubmit') {
    throw new Error('Unexpected hook event');
  }

  git('rev-parse', '--show-toplevel');
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
    upstream = git('symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD');
  }
  if (!upstream.startsWith('origin/')) {
    respond('The current branch tracks ' + upstream + ', not origin. Set an origin upstream before editing.', true);
    process.exit(0);
  }

  git('fetch', '--quiet', '--no-tags', '--prune', 'origin');
  const [ahead, behind] = git('rev-list', '--left-right', '--count', 'HEAD...' + upstream)
    .split(/\s+/)
    .map(Number);

  if (!Number.isInteger(ahead) || !Number.isInteger(behind)) {
    throw new Error('Could not compare the local branch with its upstream');
  }
  if (behind === 0) {
    respond(ahead === 0
      ? 'Origin checked: this branch is current. Continue with the task and preserve any existing local changes.'
      : 'Origin checked: this branch is current and has ' + ahead + ' unpushed local commit(s). Continue with the task.');
  } else if (!branch) {
    respond('This detached checkout is behind ' + upstream + '. Create or switch to a branch before editing.', true);
  } else if (ahead > 0) {
    respond('The branch has diverged from ' + upstream + ' (' + ahead + ' ahead, ' + behind + ' behind). Merge or rebase manually before editing.', true);
  } else if (git('status', '--porcelain', '--untracked-files=normal')) {
    respond('The branch is ' + behind + ' commit(s) behind ' + upstream + ', but this checkout has uncommitted changes. Save or commit them, then retry the task.', true);
  } else {
    git('pull', '--ff-only', 'origin', upstream.slice('origin/'.length));
    respond('Pulled ' + behind + ' commit(s) from ' + upstream + '. Continue with the original task.');
  }
} catch {
  respond('Could not verify or fast-forward origin. Check the network, Git authentication, branch upstream, and checkout state, then retry the task.', true);
}
