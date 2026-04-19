import { PulseliveConfig } from '../config';
import { CheckResult } from '../scanner';
import { GitHubDeps, defaultGitHubDeps } from './github-deps';

export class PRsCheck {
  private config: PulseliveConfig;
  private deps: GitHubDeps;

  constructor(config: PulseliveConfig, deps: GitHubDeps = defaultGitHubDeps) {
    this.config = config;
    this.deps = deps;
  }

  async run(): Promise<CheckResult> {
    try {
      const repo = this.config.github?.repo;
      const token = this.config.github?.token;

      if (!repo) {
        return {
          type: 'prs',
          status: 'warning',
          message: 'No GitHub repository configured'
        };
      }

      if (!token) {
        return {
          type: 'prs',
          status: 'warning',
          message: 'No GitHub token provided, skipping PRs check'
        };
      }

      // Fetch open PRs
      const response = await this.deps.fetch(
        `https://api.github.com/repos/${repo}/pulls?state=open&per_page=100`,
        {
          headers: {
            Authorization: `token ${token}`,
            Accept: 'application/vnd.github.v3+json'
          }
        }
      );

      if (!response.ok) {
        const isAuthFailure = response.status === 401 || response.status === 403;
        return {
          type: 'prs',
          status: isAuthFailure ? 'warning' : 'error',
          message: isAuthFailure ? 'GitHub auth failed. Check your token.' : `GitHub API error: ${response.status}`
        };
      }

      const prs: any[] = (await response.json()) as any[];

      // Get total count via search API for accuracy
      let totalOpen = prs.length;
      try {
        const countResponse = await this.deps.fetch(
          `https://api.github.com/search/issues?q=repo:${repo}+is:pr+is:open`,
          {
            headers: {
              Authorization: `token ${token}`,
              Accept: 'application/vnd.github.v3+json'
            }
          }
        );
        if (countResponse.ok) {
          const countData: any = await countResponse.json();
          totalOpen = countResponse.ok ? (countData.total_count || prs.length) : prs.length;
        }
      } catch {
        // Fall back to page count
      }

      // Categorise PRs
      const needsReview = prs.filter((pr: any) => {
        // PRs with no reviews or only pending review requests
        return pr.requested_reviewers?.length > 0 || pr.review_comments === 0;
      }).length;

      const hasConflicts = prs.filter((pr: any) => pr.mergeable === false).length;
      const draftPRs = prs.filter((pr: any) => pr.draft === true).length;
      const readyPRs = totalOpen - draftPRs;

      // Determine status
      let status: 'success' | 'warning' | 'error' = 'success';
      if (hasConflicts > 0) {
        status = 'error';
      } else if (needsReview > 0 && readyPRs > 3) {
        status = 'warning';
      }

      return {
        type: 'prs',
        status,
        message: `${totalOpen} open PRs (${needsReview} need review, ${hasConflicts} conflicts, ${draftPRs} drafts)`,
        details: {
          total: totalOpen,
          needsReview,
          hasConflicts,
          drafts: draftPRs,
          ready: readyPRs
        }
      };
    } catch (error) {
      return {
        type: 'prs',
        status: 'error',
        message: 'PRs check failed'
      };
    }
  }
}