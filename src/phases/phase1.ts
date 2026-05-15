import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import semver from 'semver';
const { Input } = require('enquirer');
import { logger } from '../utils/logger';
import { FatalError } from '../utils/errors';

export interface PluginMetadata {
  name: string;
  version: string;
  repositoryUrl: string;
}

export async function runPhase1(): Promise<PluginMetadata> {
  // 1. VERSION GATE
  await checkCLIVersion();

  // 2. METADATA EXTRACTION
  const metadata = await validateMetadata();

  // 3. LOCAL BUILD VERIFICATION
  await verifyBuild();

  return metadata;
}

async function checkCLIVersion() {
  const pkgPath = path.join(__dirname, '../../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const currentVersion = pkg.version;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('https://registry.npmjs.org/joplin-plugin/latest', {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Registry responded with ${response.status}`);
    }

    const data = await response.json() as { version: string };
    const latestVersion = data.version;

    if (semver.gt(latestVersion, currentVersion)) {
      throw new FatalError(`❌ Your joplin-plugin CLI is outdated (${currentVersion} → ${latestVersion}). Run: npm install -g joplin-plugin`);
    }
  } catch (error) {
    if (error instanceof FatalError) throw error;
    logger.warn('⚠️ Could not check for CLI updates. Continuing anyway...');
  }
}

async function validateMetadata(): Promise<PluginMetadata> {
  logger.info('Validating metadata...');
  
  const manifestPath = path.join(process.cwd(), 'src/manifest.json');
  const packageJsonPath = path.join(process.cwd(), `package.json`);

  
  if (!fs.existsSync(manifestPath)) {
    throw new FatalError('❌ manifest.json not found in the current directory or src/ folder. Are you in your plugin folder?');
  } else if (!fs.existsSync(packageJsonPath)){
    throw new FatalError('❌ package.json not found in the current directory. Are you in your plugin folder?');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  const { version } = manifest;
  const { name } =  packageJson;
  let repositoryUrl = manifest.repository_url;

  if (!name || !name.startsWith('joplin-plugin-')) {
    throw new FatalError('❌ Plugin ID must start with "joplin-plugin-"');
  }

  if (!version || !semver.valid(version)) {
    throw new FatalError(`❌ Invalid plugin version: "${version}". Must follow semver format.`);
  }

  const cleanUrl = typeof repositoryUrl === 'string' 
    ? repositoryUrl.trim().replace(/\.git$/, '').replace(/\/$/, '') 
    : '';
  const githubPattern = /^https:\/\/github\.com\/[^/]+\/[^/]+$/;
  
  if (!cleanUrl || !githubPattern.test(cleanUrl)) {
    logger.warn('⚠️ Repository URL is missing or malformed in manifest.json.');
    
    let validUrl = false;
    for (let i = 0; i < 3; i++) {
      const prompt = new Input({
        message: 'Enter your GitHub repository URL (e.g. https://github.com/user/repo):',
        initial: ''
      });
      
      const answer = await prompt.run();
      const cleanedAnswer = answer.trim().replace(/\.git$/, '').replace(/\/$/, '');

      if (githubPattern.test(cleanedAnswer)) {
        repositoryUrl = cleanedAnswer;
        validUrl = true;
        break;
      }
      logger.error(`Invalid GitHub URL format (attempt ${i + 1}/3)`);
    }

    if (!validUrl) {
      throw new FatalError('❌ Failed to provide a valid GitHub repository URL.');
    }

    // Write back to manifest.json
    manifest.repository_url = repositoryUrl;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 4), 'utf8');
    logger.success('✅ Updated manifest.json with repository URL');
  }

  logger.success(`✅ Metadata validated: ${name}@${version}`);
  return { name, version, repositoryUrl: cleanUrl };
}

async function verifyBuild() {
  try {
    logger.info('Running "npm run dist"...');
    execSync('npm run dist', { stdio: 'inherit', cwd: process.cwd() });
    logger.success('✅ Build verified');
  } catch (error) {
    throw new FatalError('❌ Build failed. Fix the errors above before publishing.');
  }
}
