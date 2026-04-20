/**
 * Agent Guidance Module
 * 
 * Provides structured reasoning assistance for AI agents analyzing project health.
 * The framework supplies observations, correlations, and investigation prompts.
 * The agent supplies interpretation and action.
 */

import { CheckResult } from './scanner.js';

export interface AgentGuidance {
  /** Observations the agent should consider */
  observations: string[];
  
  /** Correlations detected across multiple signals */
  correlations: CorrelationHint[];
  
  /** Suggested investigation paths */
  investigations: InvestigationSuggestion[];
  
  /** Decision heuristics for this context */
  decision_tree: DecisionNode;
  
  /** Confidence in the guidance (0-1) */
  confidence: number;
}

export interface CorrelationHint {
  /** Which checks are correlated */
  checks: string[];
  
  /** Type of correlation */
  type: 'concurrent_change' | 'causal_suspected' | 'historical_pattern';
  
  /** Description of the correlation */
  description: string;
  
  /** How strongly correlated (0-1) */
  strength: number;
  
  /** Prompt for agent to investigate */
  investigation_prompt: string;
}

export interface InvestigationSuggestion {
  /** What to investigate */
  target: string;
  
  /** Why this matters */
  rationale: string;
  
  /** How to investigate */
  suggested_action: string;
  
  /** Expected time to investigate */
  estimated_time: string;
  
  /** Priority level */
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface DecisionNode {
  /** Current observation */
  observation: string;
  
  /** Condition being evaluated */
  condition: string;
  
  /** Recommended action if condition met */
  recommendation: string;
  
  /** Confidence in recommendation */
  confidence: number;
  
  /** Alternative actions to consider */
  alternatives?: string[];
}

/**
 * Generate agent guidance based on check results and historical context.
 */
export function generateAgentGuidance(
  results: CheckResult[],
  previousResults?: CheckResult[],
  historicalContext?: {
    avgCoverage?: number;
    ciFlakinessScore?: number;
    commonFailurePatterns?: string[];
  }
): AgentGuidance {
  const guidance: AgentGuidance = {
    observations: [],
    correlations: [],
    investigations: [],
    decision_tree: {
      observation: '',
      condition: '',
      recommendation: '',
      confidence: 0
    },
    confidence: 0
  };

  // Build result map for easy access
  const resultMap = new Map(results.map(r => [r.type, r]));
  const prevMap = previousResults ? new Map(previousResults.map(r => [r.type, r])) : new Map();

  // Generate observations
  guidance.observations = generateObservations(resultMap, prevMap, historicalContext);
  
  // Detect correlations
  guidance.correlations = detectCorrelations(resultMap, prevMap);
  
  // Suggest investigations
  guidance.investigations = suggestInvestigations(resultMap, prevMap, guidance.correlations);
  
  // Build decision tree
  guidance.decision_tree = buildDecisionTree(resultMap, prevMap, guidance.correlations);
  
  // Calculate overall confidence
  guidance.confidence = calculateGuidanceConfidence(guidance);

  return guidance;
}

function generateObservations(
  results: Map<string, CheckResult>,
  previous: Map<string, CheckResult>,
  context?: {
    avgCoverage?: number;
    ciFlakinessScore?: number;
    commonFailurePatterns?: string[];
  }
): string[] {
  const observations: string[] = [];

  // Coverage observation
  const coverage = results.get('coverage');
  const prevCoverage = previous.get('coverage');
  if (coverage && prevCoverage) {
    const current = coverage.details?.percentage || 0;
    const previous = prevCoverage.details?.percentage || 0;
    const delta = current - previous;
    
    if (Math.abs(delta) > 5) {
      observations.push(
        `Coverage ${delta > 0 ? 'improved' : 'dropped'} by ${Math.abs(delta).toFixed(1)}% (${previous.toFixed(1)}% → ${current.toFixed(1)}%)`
      );
    }
    
    if (context?.avgCoverage && current < context.avgCoverage * 0.9) {
      observations.push(`Coverage is ${((context.avgCoverage - current) / context.avgCoverage * 100).toFixed(1)}% below historical average`);
    }
  }

  // CI observation
  const ci = results.get('ci');
  const prevCI = previous.get('ci');
  if (ci && prevCI) {
    if (ci.status === 'error' && prevCI.status !== 'error') {
      observations.push('CI started failing — this is a new degradation');
    }
    
    if (context?.ciFlakinessScore && context.ciFlakinessScore > 0.3) {
      observations.push(`CI is flaky (${(context.ciFlakinessScore * 100).toFixed(0)}% failure rate) — failures may not indicate real issues`);
    }
  }

  // Dependencies observation
  const deps = results.get('deps');
  const prevDeps = previous.get('deps');
  if (deps && prevDeps) {
    const currentVulns = deps.details?.vulnerabilities || {};
    const prevVulns = prevDeps.details?.vulnerabilities || {};
    
    const newCritical = (currentVulns.critical || 0) - (prevVulns.critical || 0);
    const newHigh = (currentVulns.high || 0) - (prevVulns.high || 0);
    
    if (newCritical > 0) {
      observations.push(`${newCritical} new critical vulnerabilities introduced`);
    }
    if (newHigh > 0) {
      observations.push(`${newHigh} new high-severity vulnerabilities introduced`);
    }
  }

  // Health observation
  const health = results.get('health');
  const prevHealth = previous.get('health');
  if (health && prevHealth) {
    const currentLatency = health.details?.avgLatency || health.details?.latency;
    const prevLatency = prevHealth.details?.avgLatency || prevHealth.details?.latency;
    
    if (currentLatency && prevLatency && currentLatency > prevLatency * 2) {
      observations.push(`Endpoint latency increased ${(currentLatency / prevLatency).toFixed(1)}x (${prevLatency}ms → ${currentLatency}ms)`);
    }
  }

  // Issues/PRs observation
  const issues = results.get('issues');
  const prevIssues = previous.get('issues');
  if (issues && prevIssues) {
    const current = issues.details?.total || issues.details?.count || 0;
    const prev = prevIssues.details?.total || prevIssues.details?.count || 0;
    const delta = current - prev;
    
    if (Math.abs(delta) >= 10) {
      observations.push(`Issues ${delta > 0 ? 'increased' : 'decreased'} by ${Math.abs(delta)} (${prev} → ${current})`);
    }
  }

  return observations;
}

function detectCorrelations(
  results: Map<string, CheckResult>,
  previous: Map<string, CheckResult>
): CorrelationHint[] {
  const correlations: CorrelationHint[] = [];

  // Pattern: Coverage drop + dependency update = breaking changes
  const coverage = results.get('coverage');
  const deps = results.get('deps');
  const prevCoverage = previous.get('coverage');
  const prevDeps = previous.get('deps');
  
  if (coverage && deps && prevCoverage && prevDeps) {
    const coverageDelta = (coverage.details?.percentage || 0) - (prevCoverage.details?.percentage || 0);
    const depsChanged = JSON.stringify(deps.details) !== JSON.stringify(prevDeps.details);
    
    if (coverageDelta < -5 && depsChanged) {
      correlations.push({
        checks: ['coverage', 'deps'],
        type: 'causal_suspected',
        description: 'Coverage dropped significantly after dependency changes',
        strength: 0.75,
        investigation_prompt: 'Check if dependency updates introduced breaking changes that caused test failures'
      });
    }
  }

  // Pattern: CI failing + recent git activity = suspect race condition
  const ci = results.get('ci');
  const git = results.get('git');
  const prevCI = previous.get('ci');
  
  if (ci && git && prevCI) {
    if (ci.status === 'error' && prevCI.status !== 'error') {
      const recentCommits = git.details?.recentCommits || 0;
      if (recentCommits > 5) {
        correlations.push({
          checks: ['ci', 'git'],
          type: 'causal_suspected',
          description: 'CI started failing after significant git activity',
          strength: 0.6,
          investigation_prompt: 'Review recent commits for potential race conditions, timing issues, or test interdependencies'
        });
      }
    }
  }

  // Pattern: Health latency + coverage = performance regression
  const health = results.get('health');
  if (health && coverage) {
    const latency = health.details?.avgLatency || health.details?.latency;
    const coveragePct = coverage.details?.percentage;
    
    if (latency && latency > 1000 && coveragePct && coveragePct < 60) {
      correlations.push({
        checks: ['health', 'coverage'],
        type: 'concurrent_change',
        description: 'Both endpoint latency and coverage are degraded',
        strength: 0.5,
        investigation_prompt: 'Consider if code changes affecting both test coverage and runtime performance'
      });
    }
  }

  // Pattern: Security + CI = urgent fix needed
  if (deps && ci) {
    const vulns = deps.details?.vulnerabilities || {};
    const totalVulns = (vulns.critical || 0) + (vulns.high || 0);
    
    if (totalVulns > 0 && ci.status === 'success') {
      correlations.push({
        checks: ['deps', 'ci'],
        type: 'historical_pattern',
        description: 'Security vulnerabilities present but CI passing — may indicate missing security scanning in CI',
        strength: 0.7,
        investigation_prompt: 'Verify CI pipeline includes security scanning (npm audit, Snyk, etc.)'
      });
    }
  }

  return correlations;
}

function suggestInvestigations(
  results: Map<string, CheckResult>,
  previous: Map<string, CheckResult>,
  correlations: CorrelationHint[]
): InvestigationSuggestion[] {
  const investigations: InvestigationSuggestion[] = [];

  // Priority 1: Critical vulnerabilities
  const deps = results.get('deps');
  if (deps) {
    const vulns = deps.details?.vulnerabilities || {};
    const criticalVulns = vulns.critical || 0;
    
    if (criticalVulns > 0) {
      investigations.push({
        target: 'Critical security vulnerabilities',
        rationale: `${criticalVulns} critical vulnerabilities require immediate attention`,
        suggested_action: 'Run npm audit fix or review dependencies for updates',
        estimated_time: '5-15 minutes',
        priority: 'critical'
      });
    }
  }

  // Priority 2: Coverage + deps correlation
  const coverageDepsCorrelation = correlations.find(c => 
    c.checks.includes('coverage') && c.checks.includes('deps')
  );
  
  if (coverageDepsCorrelation) {
    investigations.push({
      target: 'Dependency-related test failures',
      rationale: coverageDepsCorrelation.description,
      suggested_action: 'Review dependency changelog, check for breaking changes, consider rollback',
      estimated_time: '10-20 minutes',
      priority: 'high'
    });
  }

  // Priority 3: CI flakiness
  const ci = results.get('ci');
  if (ci && ci.status === 'error') {
    investigations.push({
      target: 'CI failure root cause',
      rationale: 'CI is failing — need to determine if this is a real issue or infrastructure problem',
      suggested_action: 'Review CI logs, check if error is consistent across runs, verify environment',
      estimated_time: '5-10 minutes',
      priority: 'high'
    });
  }

  // Priority 4: Performance regression
  const health = results.get('health');
  const prevHealth = previous.get('health');
  if (health && prevHealth) {
    const currentLatency = health.details?.avgLatency || health.details?.latency;
    const prevLatency = prevHealth.details?.avgLatency || prevHealth.details?.latency;
    
    if (currentLatency && prevLatency && currentLatency > prevLatency * 1.5) {
      investigations.push({
        target: 'Performance regression',
        rationale: `Endpoint latency increased ${(currentLatency / prevLatency).toFixed(1)}x`,
        suggested_action: 'Profile recent changes, check database queries, review async operations',
        estimated_time: '15-30 minutes',
        priority: 'medium'
      });
    }
  }

  // Priority 5: Missing tests
  const coverage = results.get('coverage');
  if (coverage) {
    const pct = coverage.details?.percentage || 0;
    const threshold = coverage.details?.threshold || 80;
    
    if (pct < threshold * 0.9) {
      investigations.push({
        target: 'Test coverage gaps',
        rationale: `Coverage is ${((threshold - pct) / threshold * 100).toFixed(1)}% below threshold`,
        suggested_action: 'Identify uncovered code paths, add tests for critical functions',
        estimated_time: '20-60 minutes',
        priority: 'medium'
      });
    }
  }

  return investigations;
}

function buildDecisionTree(
  results: Map<string, CheckResult>,
  previous: Map<string, CheckResult>,
  correlations: CorrelationHint[]
): DecisionNode {
  // Find the highest priority issue
  const criticalVulns = results.get('deps')?.details?.vulnerabilities?.critical || 0;
  const ciStatus = results.get('ci')?.status;
  const coverage = results.get('coverage')?.details?.percentage || 0;
  const coverageThreshold = results.get('coverage')?.details?.threshold || 80;

  // Decision: Critical security issues
  if (criticalVulns > 0) {
    return {
      observation: `${criticalVulns} critical security vulnerabilities detected`,
      condition: 'critical_vulns_present',
      recommendation: 'Address security vulnerabilities immediately before any other work',
      confidence: 0.95,
      alternatives: [
        'If vulnerabilities are in dev dependencies, evaluate actual risk',
        'If fix requires major version upgrade, plan migration carefully'
      ]
    };
  }

  // Decision: CI failing
  if (ciStatus === 'error') {
    const hasCorrelation = correlations.some(c => c.checks.includes('ci'));
    
    return {
      observation: 'CI is failing',
      condition: 'ci_failure',
      recommendation: hasCorrelation 
        ? 'Investigate correlated changes first (see correlations)'
        : 'Review CI logs and fix failing tests before proceeding',
      confidence: 0.9,
      alternatives: [
        'If CI is flaky, consider retrying',
        'If failure is infrastructure-related, wait for resolution'
      ]
    };
  }

  // Decision: Coverage below threshold
  if (coverage < coverageThreshold) {
    return {
      observation: `Coverage (${coverage.toFixed(1)}%) is below threshold (${coverageThreshold}%)`,
      condition: 'coverage_below_threshold',
      recommendation: 'Add tests to restore coverage before next deployment',
      confidence: 0.8,
      alternatives: [
        'If coverage drop is from deleted code, update threshold',
        'If new code is hard to test, evaluate testability'
      ]
    };
  }

  // Decision: All clear
  return {
    observation: 'All checks are passing',
    condition: 'all_checks_pass',
    recommendation: 'Proceed with confidence — no blockers detected',
    confidence: 0.85
  };
}

function calculateGuidanceConfidence(guidance: AgentGuidance): number {
  // Confidence is based on:
  // - Number of observations (more data = higher confidence)
  // - Correlation strength
  // - Investigation clarity
  
  let confidence = 0.5; // base
  
  // More observations increase confidence
  confidence += Math.min(guidance.observations.length * 0.05, 0.2);
  
  // Strong correlations increase confidence
  const avgCorrelationStrength = guidance.correlations.reduce((sum, c) => sum + c.strength, 0) / 
    (guidance.correlations.length || 1);
  confidence += avgCorrelationStrength * 0.2;
  
  // More investigations increase confidence
  confidence += Math.min(guidance.investigations.length * 0.05, 0.1);
  
  return Math.min(confidence, 0.95);
}
