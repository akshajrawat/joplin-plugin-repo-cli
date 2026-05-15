import { logger } from '../utils/logger';
import { FatalError } from '../utils/errors';
import { PluginMetadata } from './phase1';

export async function runPhase4(metadata: PluginMetadata, commitHash: string, token: string): Promise<void> {
  const issueTitle = `[Plugin Submission] ${metadata.name} v${metadata.version}`;
  const issueBody = `\`\`\`json
{
  "version": "${metadata.version}",
  "repository_url": "${metadata.repositoryUrl}",
  "commit_hash": "${commitHash}"
}
\`\`\``;

  logger.info('Submitting to Joplin registry...');

  const response = await fetch('https://api.github.com/repos/joplin/plugins/issues', {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      title: issueTitle,
      body: issueBody
    })
  });

  if (response.status !== 201) {
    const errorBody = await response.text();
    console.error(`Status: ${response.status}`);
    console.error(`Response: ${errorBody}`);
    throw new FatalError('❌ Submission failed. See the error above.');
  }

  const issue = await response.json() as any;

  console.log(`
🚀 Submission Successful!

Track your submission here:
${issue.html_url}

The automated security scan will begin shortly.
Your plugin will appear in the registry once a maintainer approves it.
`);
}
