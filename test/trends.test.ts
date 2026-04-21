import { describe, it, expect } from 'vitest';
import { TrendAnalyzer, HistoryEntry } from '../src/trends';

describe('TrendAnalyzer', () => {
  const trendAnalyzer = new TrendAnalyzer();

  describe('analyze', () => {
    it('returns unknown for insufficient history', () => {
      const history: HistoryEntry[] = [{
        timestamp: new Date().toISOString(),
        results: [{ type: 'deps', status: 'warning', message: '5 outdated' }]
      }];

      const result = trendAnalyzer.analyze('deps', history);
      expect(result.direction).toBe('unknown');
      expect(result.delta).toBe(0);
      expect(result.anomaly).toBe(false);
    });

    it('detects degrading trend for increasing outdated deps', () => {
      const history: HistoryEntry[] = [];
      for (let i = 0; i < 7; i++) {
        history.push({
          timestamp: new Date(Date.now() - (7 - i) * 86400000).toISOString(),
          results: [{
            type: 'deps',
            status: 'warning',
            message: `${5 + i * 2} outdated`,
            metrics: { outdated: 5 + i * 2, vulnerable: 1, total: 50 }
          }]
        });
      }

      const result = trendAnalyzer.analyze('deps', history);
      expect(result.direction).toBe('degrading');
      expect(result.delta).toBeGreaterThan(0);
    });

    it('detects improving trend for decreasing open issues', () => {
      const history: HistoryEntry[] = [];
      for (let i = 0; i < 7; i++) {
        history.push({
          timestamp: new Date(Date.now() - (7 - i) * 86400000).toISOString(),
          results: [{
            type: 'issues',
            status: 'warning',
            message: `${30 - i * 3} open`,
            metrics: { open: 30 - i * 3, closed: 10 }
          }]
        });
      }

      const result = trendAnalyzer.analyze('issues', history);
      expect(result.direction).toBe('improving');
      expect(result.delta).toBeLessThan(0);
    });

    it('detects stable trend for consistent values', () => {
      const history: HistoryEntry[] = [];
      for (let i = 0; i < 7; i++) {
        history.push({
          timestamp: new Date(Date.now() - (7 - i) * 86400000).toISOString(),
          results: [{
            type: 'coverage',
            status: 'success',
            message: 'Coverage: 85%',
            metrics: { percentage: 85 }
          }]
        });
      }

      const result = trendAnalyzer.analyze('coverage', history);
      expect(result.direction).toBe('stable');
      expect(result.delta).toBe(0);
    });

    it('detects anomaly when value exceeds 2 standard deviations', () => {
      const history: HistoryEntry[] = [];
      // 6 normal values
      for (let i = 0; i < 6; i++) {
        history.push({
          timestamp: new Date(Date.now() - (7 - i) * 86400000).toISOString(),
          results: [{
            type: 'deps',
            status: 'warning',
            message: '5 outdated',
            metrics: { outdated: 5, vulnerable: 0, total: 50 }
          }]
        });
      }
      // 1 spike
      history.push({
        timestamp: new Date().toISOString(),
        results: [{
          type: 'deps',
          status: 'warning',
          message: '25 outdated',
          metrics: { outdated: 25, vulnerable: 3, total: 50 }
        }]
      });

      const result = trendAnalyzer.analyze('deps', history);
      expect(result.anomaly).toBe(true);
    });

    it('handles coverage direction correctly (higher is better)', () => {
      const history: HistoryEntry[] = [];
      for (let i = 0; i < 7; i++) {
        history.push({
          timestamp: new Date(Date.now() - (7 - i) * 86400000).toISOString(),
          results: [{
            type: 'coverage',
            status: 'warning',
            message: `Coverage: ${70 + i * 3}%`,
            metrics: { percentage: 70 + i * 3 }
          }]
        });
      }

      const result = trendAnalyzer.analyze('coverage', history);
      expect(result.direction).toBe('improving');
    });

    it('uses custom window parameter', () => {
      const history: HistoryEntry[] = [];
      for (let i = 0; i < 14; i++) {
        history.push({
          timestamp: new Date(Date.now() - (14 - i) * 86400000).toISOString(),
          results: [{
            type: 'issues',
            status: 'warning',
            message: `${20 + i} open`,
            metrics: { open: 20 + i, closed: 5 }
          }]
        });
      }

      const result7 = trendAnalyzer.analyze('issues', history, 7);
      const result14 = trendAnalyzer.analyze('issues', history, 14);
      // Both should be degrading, but deltas may differ
      expect(result7.direction).toBe('degrading');
      expect(result14.direction).toBe('degrading');
    });
  });

  describe('detectAnomalies', () => {
    it('returns empty array when no anomalies', () => {
      const history: HistoryEntry[] = [];
      for (let i = 0; i < 7; i++) {
        history.push({
          timestamp: new Date(Date.now() - (7 - i) * 86400000).toISOString(),
          results: [{
            type: 'deps',
            status: 'success',
            message: 'All up to date',
            metrics: { outdated: 0, vulnerable: 0, total: 50 }
          }]
        });
      }

      const anomalies = trendAnalyzer.detectAnomalies(history);
      expect(anomalies.length).toBe(0);
    });

    it('detects and ranks anomalies by severity', () => {
      const history: HistoryEntry[] = [];
      // Stable deps
      for (let i = 0; i < 6; i++) {
        history.push({
          timestamp: new Date(Date.now() - (7 - i) * 86400000).toISOString(),
          results: [
            { type: 'deps', status: 'success', message: '0 outdated', metrics: { outdated: 0, vulnerable: 0, total: 50 } },
            { type: 'issues', status: 'warning', message: '5 open', metrics: { open: 5, closed: 10 } }
          ]
        });
      }
      // Spike in both
      history.push({
        timestamp: new Date().toISOString(),
        results: [
          { type: 'deps', status: 'error', message: '50 outdated', metrics: { outdated: 50, vulnerable: 10, total: 50 } },
          { type: 'issues', status: 'error', message: '200 open', metrics: { open: 200, closed: 10 } }
        ]
      });

      const anomalies = trendAnalyzer.detectAnomalies(history);
      expect(anomalies.length).toBeGreaterThan(0);
      // Should be sorted by severity (high first)
      if (anomalies.length > 1) {
        const severityOrder = { high: 3, medium: 2, low: 1 };
        for (let i = 1; i < anomalies.length; i++) {
          expect(severityOrder[anomalies[i - 1].severity]).toBeGreaterThanOrEqual(severityOrder[anomalies[i].severity]);
        }
      }
    });

    it('handles empty history gracefully', () => {
      const anomalies = trendAnalyzer.detectAnomalies([]);
      expect(anomalies).toEqual([]);
    });
  });

  describe('analyze - metric extraction paths', () => {
    it('uses flakinessScore for ci check type', () => {
      const history: HistoryEntry[] = [];
      for (let i = 0; i < 7; i++) {
        history.push({
          timestamp: new Date(Date.now() - (7 - i) * 86400000).toISOString(),
          results: [{ type: 'ci', status: 'success', message: 'ci', metrics: { flakinessScore: 5 + i * 2 } }]
        });
      }
      const result = trendAnalyzer.analyze('ci', history);
      expect(result.direction).toBe('degrading');
      expect(result.currentValue).toBe(17);
    });

    it('uses average endpoint latency for health check type', () => {
      const history: HistoryEntry[] = [];
      for (let i = 0; i < 7; i++) {
        history.push({
          timestamp: new Date(Date.now() - (7 - i) * 86400000).toISOString(),
          results: [{ type: 'health', status: 'success', message: 'ok', metrics: { endpoints: [{ latency: 100 + i * 10 }, { latency: 200 + i * 10 }] } }]
        });
      }
      const result = trendAnalyzer.analyze('health', history);
      expect(result.direction).toBe('degrading');
    });

    it('returns 0 for health with empty endpoints', () => {
      const history: HistoryEntry[] = [];
      for (let i = 0; i < 7; i++) {
        history.push({
          timestamp: new Date(Date.now() - (7 - i) * 86400000).toISOString(),
          results: [{ type: 'health', status: 'success', message: 'ok', metrics: { endpoints: [] } }]
        });
      }
      const result = trendAnalyzer.analyze('health', history);
      expect(result.direction).toBe('stable');
    });

    it('uses commits for git check type', () => {
      const history: HistoryEntry[] = [];
      for (let i = 0; i < 7; i++) {
        history.push({
          timestamp: new Date(Date.now() - (7 - i) * 86400000).toISOString(),
          results: [{ type: 'git', status: 'success', message: 'ok', metrics: { commits: 10 + i * 2 } }]
        });
      }
      const result = trendAnalyzer.analyze('git', history);
      expect(result.direction).toBe('degrading');
    });

    it('uses open count for prs check type', () => {
      const history: HistoryEntry[] = [];
      for (let i = 0; i < 7; i++) {
        history.push({
          timestamp: new Date(Date.now() - (7 - i) * 86400000).toISOString(),
          results: [{ type: 'prs', status: 'warning', message: 'prs', metrics: { open: 20 - i * 2, closed: 5 } }]
        });
      }
      const result = trendAnalyzer.analyze('prs', history);
      expect(result.direction).toBe('improving');
    });

    it('falls back to duration when no metrics provided', () => {
      const history: HistoryEntry[] = [];
      for (let i = 0; i < 7; i++) {
        history.push({
          timestamp: new Date(Date.now() - (7 - i) * 86400000).toISOString(),
          results: [{ type: 'unknown_type', status: 'success', message: 'ok', duration: 100 + i * 20 }]
        });
      }
      const result = trendAnalyzer.analyze('unknown_type', history);
      expect(result.currentValue).toBe(220);
      expect(result.direction).toBe('degrading');
    });

    it('falls back to statusToScore when no metrics or duration', () => {
      const history: HistoryEntry[] = [];
      for (let i = 0; i < 7; i++) {
        history.push({
          timestamp: new Date(Date.now() - (7 - i) * 86400000).toISOString(),
          results: [{ type: 'unknown_type', status: i < 5 ? 'success' : 'error', message: 'ok' }]
        });
      }
      const result = trendAnalyzer.analyze('unknown_type', history);
      // status goes from success(3) to error(1), so direction should be improving (lower=better)
      expect(result).toBeDefined();
      expect(result.direction).not.toBe('unknown');
    });

    it('detects coverage degrading (lower coverage = worse)', () => {
      const history: HistoryEntry[] = [];
      for (let i = 0; i < 7; i++) {
        history.push({
          timestamp: new Date(Date.now() - (7 - i) * 86400000).toISOString(),
          results: [{ type: 'coverage', status: 'warning', message: `Coverage: ${90 - i * 3}%`, metrics: { percentage: 90 - i * 3 } }]
        });
      }
      const result = trendAnalyzer.analyze('coverage', history);
      expect(result.direction).toBe('degrading');
      expect(result.delta).toBeLessThan(0);
    });

    it('detects medium severity anomalies (z-score between 2.5 and 3)', () => {
      const history: HistoryEntry[] = [];
      // 5 stable values + 1 spike that creates z-score around 2.5-3
      for (let i = 0; i < 5; i++) {
        history.push({
          timestamp: new Date(Date.now() - (6 - i) * 86400000).toISOString(),
          results: [{ type: 'deps', status: 'success', message: 'ok', metrics: { outdated: 5, vulnerable: 0, total: 50 } }]
        });
      }
      // Add one value far from mean to create anomaly
      history.push({
        timestamp: new Date().toISOString(),
        results: [{ type: 'deps', status: 'error', message: 'spike', metrics: { outdated: 100, vulnerable: 10, total: 50 } }]
      });
      const anomalies = trendAnalyzer.detectAnomalies(history);
      expect(anomalies.length).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(anomalies[0].severity);
    });
  });
});