#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { runPhase1 } from './phases/phase1';
import { runPhase2 } from './phases/phase2';
import { runPhase3 } from './phases/phase3';
import { runPhase4 } from './phases/phase4';
import { handleFatalError } from './utils/errors';
import { logger } from './utils/logger';

const program = new Command();

program
  .name('joplin-plugin')
  .description('Publishing CLI for Joplin plugins')
  .version('0.1.0');

program
  .command('publish')
  .description('Publish your plugin to the Joplin registry')
  .action(async () => {
    try {
      logger.info(chalk.cyan.bold('\n🚀 Starting Joplin Plugin Publication\n'));

      logger.info(chalk.blue.bold('Phase 1: Metadata & Build Verification'));
      const metadata = await runPhase1();
      console.log(chalk.gray('\n--------------------------------------------------'));

      logger.info(chalk.blue.bold('Phase 2: Git State Validation'));
      const commitHash = await runPhase2();
      console.log(chalk.gray('\n--------------------------------------------------'));

      logger.info(chalk.blue.bold('Phase 3: GitHub Authentication'));
      const token = await runPhase3();
      console.log(chalk.gray('\n--------------------------------------------------'));

      logger.info(chalk.blue.bold('Phase 4: Submission'));
      await runPhase4(metadata, commitHash, token);
      
    } catch (err) {
      handleFatalError(err);
    }
  });

program.parseAsync(process.argv).catch(handleFatalError);
