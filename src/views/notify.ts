import * as vscode from 'vscode';
import type { RateLimitNotice } from '../api/client';
import { AuthError, GraphQLError, RateLimitError } from '../api/client';
import { NotSignedInError } from '../auth/githubAuth';

const log = vscode.window.createOutputChannel('GitHub Projects', { log: true });

export function getLog(): vscode.LogOutputChannel {
  return log;
}

let lastRateLimitMessage: vscode.Disposable | undefined;

/** Status bar notice while the client waits for the rate limit; also logged. */
export function notifyRateLimit(notice: RateLimitNotice): void {
  const seconds = Math.ceil(notice.waitMs / 1000);
  const what = notice.reason === 'transient' ? 'GitHub unavailable' : 'GitHub rate limit';
  log.warn(`${what}: retry ${notice.attempt} in ${seconds}s`);
  lastRateLimitMessage?.dispose();
  lastRateLimitMessage = vscode.window.setStatusBarMessage(
    `$(watch) ${what} — retrying in ${seconds}s`,
    notice.waitMs,
  );
  rateLimitListeners.forEach((l) => l(notice));
}

type RateLimitListener = (notice: RateLimitNotice) => void;
const rateLimitListeners = new Set<RateLimitListener>();

/** Lets webviews show their own banner while waiting. */
export function onRateLimit(listener: RateLimitListener): vscode.Disposable {
  rateLimitListeners.add(listener);
  return new vscode.Disposable(() => rateLimitListeners.delete(listener));
}

/** Human message for an API error. Never includes request details. */
export function describeError(err: unknown): string {
  if (err instanceof NotSignedInError) return 'Sign in to GitHub to see your projects.';
  if (err instanceof AuthError) return err.message;
  if (err instanceof RateLimitError) {
    const when = err.resetAt ? ` It resets at ${new Date(err.resetAt).toLocaleTimeString()}.` : '';
    return `${err.message}${when}`;
  }
  if (err instanceof GraphQLError && err.types.includes('INSUFFICIENT_SCOPES')) {
    return 'Your GitHub session is missing a scope this action needs. Sign in again to grant it.';
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export function reportError(context: string, err: unknown): string {
  const message = describeError(err);
  log.error(`${context}: ${message}`);
  return message;
}
