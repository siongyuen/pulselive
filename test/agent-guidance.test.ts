import { describe, it, expect } from 'vitest';
import { generateAgentGuidance, AgentGuidance } from '../src/agent-guidance.js';
import { CheckResult } from '../src/scanner.js';

describe('Agent Guidance', () => {
  const mockResults: CheckResult[] = [
    {
      type: 'coverage',
      status: 'error',
      message: 'Coverage below threshold',
      details: { percentage: 59.5, threshold: 80 }
    },
    {
      type: 'ci',
      status: 'warning',
      message: 'CI flaky'
    },
    {
      type: 'deps',
      status: 'warning',
      message: 'Vulnerabilities found',
      details: { vulnerabilities: { critical: 1, high: 2, medium: 5 } }
    }
  ];

  const mockPreviousResults: CheckResult[] = [
    {
      type: 'coverage',
      status: 'success',
      message: 'Coverage good',
      details: { percentage: 75.0, threshold: 80 }
    },
    {
      type: 'ci',
      status: 'success',
      message: 'CI passing'
    },
    {
      type: 'deps',
      status: 'success',
      message: 'No vulnerabilities',
      details: { vulnerabilities: { critical: 0, high: 0, medium: 0 } }
    }
  ];

  it('should generate guidance with observations', () => {
    const guidance = generateAgentGuidance(mockResults, mockPreviousResults);
    
    expect(guidance.observations).toBeDefined();
    expect(guidance.observations.length).toBeGreaterThan(0);
    expect(guidance.confidence).toBeGreaterThan(0);
  });

  it('should detect coverage drop', () => {
    const guidance = generateAgentGuidance(mockResults, mockPreviousResults);
    
    const coverageObservation = guidance.observations.find(o => 
      o.includes('Coverage') && o.includes('dropped')
    );
    expect(coverageObservation).toBeDefined();
  });

  it('should detect new vulnerabilities', () => {
    const guidance = generateAgentGuidance(mockResults, mockPreviousResults);
    
    const vulnObservation = guidance.observations.find(o => 
      o.includes('vulnerabilit')
    );
    expect(vulnObservation).toBeDefined();
  });

  it('should detect correlations', () => {
    const guidance = generateAgentGuidance(mockResults, mockPreviousResults);
    
    expect(guidance.correlations).toBeDefined();
    expect(guidance.correlations.length).toBeGreaterThan(0);
  });

  it('should suggest investigations', () => {
    const guidance = generateAgentGuidance(mockResults, mockPreviousResults);
    
    expect(guidance.investigations).toBeDefined();
    expect(guidance.investigations.length).toBeGreaterThan(0);
    
    // Should prioritize critical vulnerabilities
    const criticalInvestigation = guidance.investigations.find(i => 
      i.priority === 'critical'
    );
    expect(criticalInvestigation).toBeDefined();
  });

  it('should provide decision tree', () => {
    const guidance = generateAgentGuidance(mockResults, mockPreviousResults);
    
    expect(guidance.decision_tree).toBeDefined();
    expect(guidance.decision_tree.observation).toBeDefined();
    expect(guidance.decision_tree.recommendation).toBeDefined();
    expect(guidance.decision_tree.confidence).toBeGreaterThan(0);
  });

  it('should handle empty previous results', () => {
    const guidance = generateAgentGuidance(mockResults, undefined);
    
    expect(guidance.observations).toBeDefined();
    // With no previous data, fewer observations possible
    expect(guidance.confidence).toBeGreaterThan(0);
  });

  it('should handle all passing results', () => {
    const passingResults: CheckResult[] = [
      { type: 'coverage', status: 'success', message: 'Good', details: { percentage: 85 } },
      { type: 'ci', status: 'success', message: 'Passing' }
    ];
    
    const guidance = generateAgentGuidance(passingResults, undefined);
    
    expect(guidance.decision_tree.recommendation).toContain('Proceed');
  });
});
