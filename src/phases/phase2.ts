import { execSync } from 'child_process';
import { logger } from '../utils/logger';
import { FatalError } from '../utils/errors';

export async function runPhase2(): Promise<string> {
  const runGit = (command: string, errorMessage: string): string => {
    try {
      return execSync(command, { encoding: 'utf8', cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch (error) {
      if (command.includes('git rev-parse --is-inside-work-tree')) {
        throw new FatalError('❌ The current directory is not a git repository or git is not installed.');
      }
      if (command.includes('git remote get-url origin')) {
        throw new FatalError('❌ No remote named \'origin\' found.\nMake sure your plugin repository is hosted on GitHub.');
      }
      throw new FatalError(`${errorMessage}\n${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Initial check
  runGit('git rev-parse --is-inside-work-tree', '❌ Git check failed.');

  // 1. CLEAN WORKING TREE CHECK
  const status = runGit('git status --porcelain', '❌ Failed to check git status.');
  if (status !== '') {
    throw new FatalError('❌ You have uncommitted changes. Please commit or stash them before publishing.\nRun: git status to see what\'s changed.');
  }
  logger.success('✅ Working tree is clean');

  // 2. COMMIT HASH EXTRACTION
  const commitHash = runGit('git rev-parse HEAD', '❌ Failed to extract commit hash.');
  if (commitHash.length !== 40) {
    throw new FatalError('❌ Failed to extract a valid commit hash.');
  }
  logger.success(`✅ Commit hash: ${commitHash}`);

  // 3. REMOTE SYNC CHECK
  runGit('git remote get-url origin', '❌ No remote named \'origin\' found.');

  const remoteHeadLine = runGit('git ls-remote origin HEAD', '❌ Could not retrieve remote HEAD. Make sure you have pushed your changes and have an internet connection.');
  if (!remoteHeadLine) {
    throw new FatalError('❌ Remote HEAD is empty. Make sure you have pushed your changes.');
  }

  const remoteHash = remoteHeadLine.split(/\s+/)[0];
  if (remoteHash !== commitHash) {
    throw new FatalError('❌ Your local commit has not been pushed to GitHub.\nRun: git push then try publishing again.');
  }
  logger.success('✅ Local commit is synced with remote');

  return commitHash;
}
