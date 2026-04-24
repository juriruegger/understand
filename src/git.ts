import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';

export type UnderstandGitAction = 'targets' | 'branch-manifest' | 'uncommitted-manifest';

export interface UnderstandGitInput {
  action: UnderstandGitAction;
  cwd?: string;
  target?: string;
  refresh?: boolean;
}

export interface FetchStatus {
  attempted: boolean;
  success: boolean;
  stale: boolean;
  error?: string;
}

export interface HunkRange {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}

export interface FileChange {
  path: string;
  previousPath?: string;
  status: string;
  additions: number | null;
  deletions: number | null;
  binary: boolean;
  hunks: HunkRange[];
}

export interface TargetOption {
  name: string;
  displayName: string;
  ref: string;
  remote: string | null;
  reason: 'default' | 'recent-remote' | 'recent-local' | 'fallback';
  lastCommitAt?: string;
}

export interface TargetsResult {
  action: 'targets';
  cwd: string;
  currentBranch: string | null;
  defaultRemote: string | null;
  defaultTarget: TargetOption | null;
  options: TargetOption[];
  manualEntryAllowed: true;
  fetch: FetchStatus;
}

export interface BranchManifestResult {
  action: 'branch-manifest';
  cwd: string;
  currentBranch: string | null;
  headSha: string;
  target: TargetOption;
  mergeBaseSha: string;
  commitCount: number;
  commits: Array<{ sha: string; subject: string }>;
  changedFiles: FileChange[];
  totals: {
    files: number;
    additions: number;
    deletions: number;
  };
  fetch: FetchStatus;
  warnings: string[];
}

export interface UntrackedFile {
  path: string;
  size: number | null;
}

export interface ChangeSection {
  files: FileChange[];
  totals: {
    files: number;
    additions: number;
    deletions: number;
  };
}

export interface UncommittedManifestResult {
  action: 'uncommitted-manifest';
  cwd: string;
  currentBranch: string | null;
  staged: ChangeSection;
  unstaged: ChangeSection;
  untracked: {
    files: UntrackedFile[];
    totals: {
      files: number;
    };
  };
  isDirty: boolean;
  warnings: string[];
}

export type UnderstandGitResult = TargetsResult | BranchManifestResult | UncommittedManifestResult;

interface CommandResult {
  status: number;
  stdout: string;
  stderr: string;
}

interface ParsedStatus {
  path: string;
  previousPath?: string;
  status: string;
}

interface RemoteBranch {
  name: string;
  ref: string;
  remote: string;
  lastCommitAt?: string;
}

class UnderstandGitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnderstandGitError';
  }
}

export function runUnderstandGit(input: UnderstandGitInput): UnderstandGitResult {
  const repoRoot = resolveRepoRoot(input.cwd ?? process.cwd());

  switch (input.action) {
    case 'targets':
      return getTargets(repoRoot, input.refresh ?? true);
    case 'branch-manifest':
      if (!input.target) {
        throw new UnderstandGitError('target is required for branch-manifest');
      }
      return getBranchManifest(repoRoot, input.target, input.refresh ?? true);
    case 'uncommitted-manifest':
      return getUncommittedManifest(repoRoot);
    default:
      throw new UnderstandGitError(`unsupported action: ${String(input.action)}`);
  }
}

function resolveRepoRoot(cwd: string): string {
  return gitText(cwd, ['rev-parse', '--show-toplevel']);
}

function getTargets(repoRoot: string, refresh: boolean): TargetsResult {
  const warnings: string[] = [];
  const fetch = maybeFetch(repoRoot, refresh);
  if (fetch.error) {
    warnings.push(`Remote refs may be stale: ${fetch.error}`);
  }

  const currentBranch = getCurrentBranch(repoRoot);
  const upstream = getUpstream(repoRoot);
  const remotes = getRemotes(repoRoot);
  const defaultRemote = pickDefaultRemote(remotes, upstream);
  const remoteBranches = getRemoteBranches(repoRoot);
  const localBranches = getLocalBranches(repoRoot);
  const defaultTarget = defaultRemote ? makeDefaultTarget(repoRoot, defaultRemote, remoteBranches) : null;
  const options = buildTargetOptions({
    currentBranch,
    upstream,
    defaultTarget,
    defaultRemote,
    remoteBranches,
    localBranches
  });

  return {
    action: 'targets',
    cwd: repoRoot,
    currentBranch,
    defaultRemote,
    defaultTarget,
    options,
    manualEntryAllowed: true,
    fetch
  };
}

function getBranchManifest(repoRoot: string, targetInput: string, refresh: boolean): BranchManifestResult {
  const warnings: string[] = [];
  const fetch = maybeFetch(repoRoot, refresh);
  if (fetch.error) {
    warnings.push(`Remote refs may be stale: ${fetch.error}`);
  }

  const currentBranch = getCurrentBranch(repoRoot);
  const upstream = getUpstream(repoRoot);
  const remotes = getRemotes(repoRoot);
  const defaultRemote = pickDefaultRemote(remotes, upstream);
  const remoteBranches = getRemoteBranches(repoRoot);
  const localBranches = getLocalBranches(repoRoot);
  const defaultTarget = defaultRemote ? makeDefaultTarget(repoRoot, defaultRemote, remoteBranches) : null;
  const target = resolveTargetOption({
    repoRoot,
    targetInput,
    defaultRemote,
    defaultTarget,
    remoteBranches,
    localBranches
  });

  const mergeBaseSha = gitText(repoRoot, ['merge-base', 'HEAD', target.ref]);
  const headSha = gitText(repoRoot, ['rev-parse', 'HEAD']);
  const commits = parseCommits(gitText(repoRoot, ['log', '--format=%H%x09%s', `${mergeBaseSha}..HEAD`]));
  const changedFiles = getDiffSection(repoRoot, [mergeBaseSha, 'HEAD']);
  const totals = summarizeChanges(changedFiles);

  if (commits.length === 0 && changedFiles.length === 0) {
    warnings.push('No commits or file changes were found between the merge base and HEAD.');
  }

  return {
    action: 'branch-manifest',
    cwd: repoRoot,
    currentBranch,
    headSha,
    target,
    mergeBaseSha,
    commitCount: commits.length,
    commits,
    changedFiles,
    totals,
    fetch,
    warnings
  };
}

function getUncommittedManifest(repoRoot: string): UncommittedManifestResult {
  const currentBranch = getCurrentBranch(repoRoot);
  const stagedFiles = getDiffSection(repoRoot, ['--cached']);
  const unstagedFiles = getDiffSection(repoRoot, []);
  const untrackedFiles = getUntrackedFiles(repoRoot);

  return {
    action: 'uncommitted-manifest',
    cwd: repoRoot,
    currentBranch,
    staged: {
      files: stagedFiles,
      totals: summarizeChanges(stagedFiles)
    },
    unstaged: {
      files: unstagedFiles,
      totals: summarizeChanges(unstagedFiles)
    },
    untracked: {
      files: untrackedFiles,
      totals: {
        files: untrackedFiles.length
      }
    },
    isDirty: stagedFiles.length > 0 || unstagedFiles.length > 0 || untrackedFiles.length > 0,
    warnings: []
  };
}

function maybeFetch(repoRoot: string, refresh: boolean): FetchStatus {
  const remotes = getRemotes(repoRoot);
  if (!refresh || remotes.length === 0) {
    return {
      attempted: false,
      success: true,
      stale: false
    };
  }

  const result = git(repoRoot, ['fetch', '--all', '--prune', '--quiet', '--no-tags'], true);
  if (result.status === 0) {
    return {
      attempted: true,
      success: true,
      stale: false
    };
  }

  return {
    attempted: true,
    success: false,
    stale: true,
    error: summarizeGitError(result)
  };
}

function getDiffSection(repoRoot: string, rangeArgs: string[]): FileChange[] {
  const statusOutput = gitText(repoRoot, ['diff', '--name-status', '-M', ...rangeArgs], true);
  const patchOutput = gitText(repoRoot, ['diff', '--no-color', '--unified=0', '-M', ...rangeArgs], true);
  const statuses = parseNameStatus(statusOutput);
  return applyPatchMetadata(statuses, patchOutput);
}

function getUntrackedFiles(repoRoot: string): UntrackedFile[] {
  const output = gitText(repoRoot, ['ls-files', '--others', '--exclude-standard'], true);
  return splitLines(output).map((filePath) => {
    const absolutePath = path.join(repoRoot, filePath);
    let size: number | null = null;
    try {
      size = statSync(absolutePath).size;
    } catch {
      size = null;
    }
    return {
      path: filePath,
      size
    };
  });
}

function summarizeChanges(files: FileChange[]): { files: number; additions: number; deletions: number } {
  return files.reduce(
    (totals, file) => {
      totals.files += 1;
      totals.additions += file.additions ?? 0;
      totals.deletions += file.deletions ?? 0;
      return totals;
    },
    { files: 0, additions: 0, deletions: 0 }
  );
}

function getCurrentBranch(repoRoot: string): string | null {
  const result = git(repoRoot, ['symbolic-ref', '--quiet', '--short', 'HEAD'], true);
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim() || null;
}

function getUpstream(repoRoot: string): string | null {
  const result = git(repoRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], true);
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim() || null;
}

function getRemotes(repoRoot: string): string[] {
  return splitLines(gitText(repoRoot, ['remote'], true));
}

function pickDefaultRemote(remotes: string[], upstream: string | null): string | null {
  const upstreamRemote = upstream ? upstream.split('/')[0] : null;
  if (upstreamRemote && remotes.includes(upstreamRemote)) {
    return upstreamRemote;
  }
  if (remotes.includes('origin')) {
    return 'origin';
  }
  return remotes[0] ?? null;
}

function makeDefaultTarget(repoRoot: string, defaultRemote: string, remoteBranches: RemoteBranch[]): TargetOption | null {
  const defaultBranchName = getDefaultBranchName(repoRoot, defaultRemote, remoteBranches);
  if (!defaultBranchName) {
    return null;
  }

  const ref = `${defaultRemote}/${defaultBranchName}`;
  const branch = remoteBranches.find((entry) => entry.ref === ref);
  return {
    name: defaultBranchName,
    displayName: defaultBranchName,
    ref,
    remote: defaultRemote,
    reason: 'default',
    lastCommitAt: branch?.lastCommitAt
  };
}

function getDefaultBranchName(repoRoot: string, remote: string, remoteBranches: RemoteBranch[]): string | null {
  const symbolic = git(repoRoot, ['symbolic-ref', '--quiet', '--short', `refs/remotes/${remote}/HEAD`], true);
  if (symbolic.status === 0) {
    const ref = symbolic.stdout.trim();
    if (ref.startsWith(`${remote}/`)) {
      return ref.slice(remote.length + 1);
    }
  }

  const fallbackNames = ['main', 'master', 'develop'];
  for (const name of fallbackNames) {
    if (remoteBranches.some((branch) => branch.ref === `${remote}/${name}`)) {
      return name;
    }
  }

  const firstRemoteBranch = remoteBranches.find((branch) => branch.remote === remote);
  return firstRemoteBranch?.name ?? null;
}

function getRemoteBranches(repoRoot: string): RemoteBranch[] {
  const output = gitText(
    repoRoot,
    ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)%09%(committerdate:iso8601-strict)', 'refs/remotes'],
    true
  );

  const branches: RemoteBranch[] = [];
  for (const line of splitLines(output)) {
    const [ref, lastCommitAt = ''] = line.split('\t');
    if (!ref || ref.endsWith('/HEAD')) {
      continue;
    }
    const slash = ref.indexOf('/');
    if (slash === -1) {
      continue;
    }
    branches.push({
      ref,
      remote: ref.slice(0, slash),
      name: ref.slice(slash + 1),
      lastCommitAt: lastCommitAt || undefined
    });
  }
  return branches;
}

function getLocalBranches(repoRoot: string): TargetOption[] {
  const output = gitText(
    repoRoot,
    ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)%09%(committerdate:iso8601-strict)', 'refs/heads'],
    true
  );

  const branches: TargetOption[] = [];
  for (const line of splitLines(output)) {
    const [name, lastCommitAt = ''] = line.split('\t');
    if (!name) {
      continue;
    }
    branches.push({
      name,
      displayName: name,
      ref: name,
      remote: null,
      reason: 'recent-local',
      lastCommitAt: lastCommitAt || undefined
    });
  }
  return branches;
}

function buildTargetOptions(input: {
  currentBranch: string | null;
  upstream: string | null;
  defaultTarget: TargetOption | null;
  defaultRemote: string | null;
  remoteBranches: RemoteBranch[];
  localBranches: TargetOption[];
}): TargetOption[] {
  const options: TargetOption[] = [];
  const seen = new Set<string>();

  const add = (option: TargetOption | null) => {
    if (!option || seen.has(option.name)) {
      return;
    }
    if (input.currentBranch && option.name === input.currentBranch) {
      return;
    }
    if (input.upstream && option.ref === input.upstream) {
      return;
    }
    seen.add(option.name);
    options.push(option);
  };

  add(input.defaultTarget);

  for (const branch of input.remoteBranches) {
    add({
      name: branch.name,
      displayName: branch.name,
      ref: branch.ref,
      remote: branch.remote,
      reason: 'recent-remote',
      lastCommitAt: branch.lastCommitAt
    });
    if (options.length >= 6) {
      return options;
    }
  }

  for (const branch of input.localBranches) {
    add(branch);
    if (options.length >= 6) {
      break;
    }
  }

  return options;
}

function resolveTargetOption(input: {
  repoRoot: string;
  targetInput: string;
  defaultRemote: string | null;
  defaultTarget: TargetOption | null;
  remoteBranches: RemoteBranch[];
  localBranches: TargetOption[];
}): TargetOption {
  const raw = input.targetInput.trim();
  if (!raw) {
    throw new UnderstandGitError('target cannot be empty');
  }

  const directRemote = input.remoteBranches.find((branch) => branch.ref === raw);
  if (directRemote) {
    return toRemoteTarget(directRemote, directRemote.ref === input.defaultTarget?.ref ? 'default' : 'recent-remote');
  }

  if (input.defaultRemote) {
    const preferredRef = `${input.defaultRemote}/${raw}`;
    const preferredRemote = input.remoteBranches.find((branch) => branch.ref === preferredRef);
    if (preferredRemote) {
      return toRemoteTarget(preferredRemote, preferredRemote.ref === input.defaultTarget?.ref ? 'default' : 'recent-remote');
    }
  }

  const byName = input.remoteBranches.find((branch) => branch.name === raw);
  if (byName) {
    return toRemoteTarget(byName, byName.ref === input.defaultTarget?.ref ? 'default' : 'recent-remote');
  }

  const local = input.localBranches.find((branch) => branch.name === raw || branch.ref === raw);
  if (local) {
    return {
      ...local,
      reason: 'fallback'
    };
  }

  const exactRef = git(input.repoRoot, ['rev-parse', '--verify', '--quiet', raw], true);
  if (exactRef.status === 0) {
    return {
      name: raw,
      displayName: raw,
      ref: raw,
      remote: null,
      reason: 'fallback'
    };
  }

  throw new UnderstandGitError(`could not resolve target branch or ref: ${raw}`);
}

function toRemoteTarget(branch: RemoteBranch, reason: TargetOption['reason']): TargetOption {
  return {
    name: branch.name,
    displayName: branch.name,
    ref: branch.ref,
    remote: branch.remote,
    reason,
    lastCommitAt: branch.lastCommitAt
  };
}

function parseCommits(output: string): Array<{ sha: string; subject: string }> {
  return splitLines(output).map((line) => {
    const [sha, subject = ''] = line.split('\t');
    return {
      sha,
      subject
    };
  });
}

function parseNameStatus(output: string): ParsedStatus[] {
  return splitLines(output)
    .map((line) => {
      const parts = line.split('\t');
      if (parts.length < 2) {
        return null;
      }
      const statusToken = parts[0] ?? '';
      const status = statusToken.charAt(0) || statusToken;
      if ((status === 'R' || status === 'C') && parts.length >= 3) {
        return {
          status,
          previousPath: parts[1],
          path: parts[2]
        };
      }
      return {
        status,
        path: parts[1]
      };
    })
    .filter((entry): entry is ParsedStatus => entry !== null);
}

function applyPatchMetadata(statuses: ParsedStatus[], patchText: string): FileChange[] {
  const changes = statuses.map<FileChange>((status) => ({
    path: status.path,
    previousPath: status.previousPath,
    status: status.status,
    additions: 0,
    deletions: 0,
    binary: false,
    hunks: []
  }));

  if (!patchText.trim()) {
    return changes;
  }

  const lines = patchText.split('\n');
  let current: FileChange | undefined;
  let currentIndex = -1;

  for (const line of lines) {
    if (line.startsWith('diff --git ')) {
      currentIndex += 1;
      current = changes[currentIndex];
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith('Binary files ') || line === 'GIT binary patch' || line.startsWith('Submodule ')) {
      current.binary = true;
      current.additions = null;
      current.deletions = null;
      continue;
    }

    const hunk = parseHunk(line);
    if (hunk) {
      current.hunks.push(hunk);
      continue;
    }

    if (current.additions !== null && line.startsWith('+') && !line.startsWith('+++')) {
      current.additions += 1;
    }

    if (current.deletions !== null && line.startsWith('-') && !line.startsWith('---')) {
      current.deletions += 1;
    }
  }

  return changes;
}

function parseHunk(line: string): HunkRange | null {
  const match = /^@@ -(?<oldStart>\d+)(?:,(?<oldLines>\d+))? \+(?<newStart>\d+)(?:,(?<newLines>\d+))? @@/.exec(line);
  if (!match?.groups) {
    return null;
  }

  return {
    oldStart: Number(match.groups.oldStart),
    oldLines: Number(match.groups.oldLines ?? '1'),
    newStart: Number(match.groups.newStart),
    newLines: Number(match.groups.newLines ?? '1')
  };
}

function gitText(cwd: string, args: string[], allowFailure = false): string {
  const result = git(cwd, args, allowFailure);
  if (result.status !== 0) {
    return '';
  }
  return result.stdout.trim();
}

function git(cwd: string, args: string[], allowFailure = false): CommandResult {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8'
  });

  if (result.error) {
    throw new UnderstandGitError(result.error.message);
  }

  const commandResult: CommandResult = {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };

  if (!allowFailure && commandResult.status !== 0) {
    throw new UnderstandGitError(summarizeGitError(commandResult, args));
  }

  return commandResult;
}

function summarizeGitError(result: CommandResult, args: string[] = []): string {
  const stderr = result.stderr.trim();
  if (stderr) {
    return stderr;
  }
  const stdout = result.stdout.trim();
  if (stdout) {
    return stdout;
  }
  return `git ${args.join(' ')} exited with status ${result.status}`;
}

function splitLines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}
