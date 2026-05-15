import chalk from 'chalk';

export const logger = {
  info: (msg: string) => console.log(msg),
  success: (msg: string) => console.log(chalk.green(msg)),
  warn: (msg: string) => console.log(chalk.yellow(msg)),
  error: (msg: string) => console.log(chalk.red(msg)),
  step: (step: number, total: number, msg: string) => {
    console.log(chalk.cyan(`[${step}/${total}] ${msg}`));
  }
};
