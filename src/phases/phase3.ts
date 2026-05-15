import fs from 'fs';
import path from 'path';
import os from 'os';
import open from 'open';
import { logger } from '../utils/logger';
import { FatalError } from '../utils/errors';

interface Credentials {
  token: string;
  expires_at: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.config', 'joplin-plugin');
const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json');
const CLIENT_ID = process.env.JOPLIN_GITHUB_CLIENT_ID;

export async function runPhase3(): Promise<string> {
  if (!CLIENT_ID) {
    throw new FatalError('❌ JOPLIN_GITHUB_CLIENT_ID environment variable is not set.');
  }

  // 1. TOKEN CACHE CHECK
  const cachedToken = getCachedToken();
  if (cachedToken) {
    logger.success('✅ Using cached GitHub credentials');
    return cachedToken;
  }

  // 2. DEVICE FLOW INITIATION
  const deviceCodeResponse = await initiateDeviceFlow();
  const { device_code, user_code, verification_uri, interval } = deviceCodeResponse;

  console.log(`
  🔐 GitHub Authentication Required
  1. Your browser will open: ${verification_uri}
  2. Enter this code when prompted: ${user_code}

  Waiting for authorization...`);

  await open(verification_uri);

  // 3. POLLING
  const accessToken = await pollForToken(device_code, interval);

  // 4. TOKEN STORAGE
  saveToken(accessToken);
  logger.success('✅ Authenticated successfully');

  return accessToken;
}

function getCachedToken(): string | null {
  if (fs.existsSync(CREDENTIALS_PATH)) {
    try {
      const creds: Credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
      const expiresAt = new Date(creds.expires_at);
      const oneHourFromNow = new Date();
      oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);

      if (expiresAt > oneHourFromNow) {
        return creds.token;
      }
    } catch (error) {
      // Ignore parsing errors and proceed to auth
    }
  }
  return null;
}

async function initiateDeviceFlow() {
  const response = await fetch('https://github.com/login/device/code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      scope: 'public_repo'
    })
  });

  if (!response.ok) {
    throw new FatalError(`❌ Failed to initiate device flow: ${response.statusText}`);
  }

  return await response.json() as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  };
}

async function pollForToken(deviceCode: string, initialInterval: number): Promise<string> {
  let interval = initialInterval;
  
  while (true) {
    await new Promise(resolve => setTimeout(resolve, interval * 1000));
    process.stdout.write('.');

    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    });

    if (!response.ok) {
        throw new FatalError(`❌ Polling failed: ${response.statusText}`);
    }

    const data = await response.json() as any;

    if (data.access_token) {
      process.stdout.write('\n');
      return data.access_token;
    }

    if (data.error) {
      switch (data.error) {
        case 'authorization_pending':
          continue;
        case 'slow_down':
          interval += 5;
          continue;
        case 'expired_token':
          throw new FatalError('\n❌ Authentication timed out. Run the command again.');
        case 'access_denied':
          throw new FatalError('\n❌ Authentication was denied.');
        default:
          throw new FatalError(`\n❌ Authentication error: ${data.error_description || data.error}`);
      }
    }
  }
}

function saveToken(token: string) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 8);

  const creds: Credentials = {
    token,
    expires_at: expiresAt.toISOString()
  };

  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), {
    mode: 0o600,
    encoding: 'utf8'
  });
}
