import { logger } from './logger';

export class FatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalError';
  }
}

export function handleFatalError(err: unknown) {
  if (err instanceof FatalError) {
    logger.error(err.message);
  } else if (err instanceof Error) {
    logger.error(`An unexpected error occurred: ${err.message}`);
  } else {
    logger.error(`An unknown error occurred: ${String(err)}`);
  }
  process.exit(1);
}
