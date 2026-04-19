import fetch from 'node-fetch';

/**
 * Dependency injection interface for GitHub API-based checks.
 * All checks that call the GitHub API share this interface.
 * Inject fetch for testability without vi.mock('node-fetch').
 */
export interface GitHubDeps {
  fetch: (url: string, init?: RequestInit) => Promise<any>;
}

/**
 * Default implementation that uses the real node-fetch.
 */
export const defaultGitHubDeps: GitHubDeps = {
  fetch: fetch as any,
};