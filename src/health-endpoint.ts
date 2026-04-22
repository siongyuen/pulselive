import { VERSION } from './version';

interface RequestMetrics {
  total: number;
  success: number;
  errors: number;
  avgDuration: number;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  requests: RequestMetrics;
  queueDepth: number;
  errorRate: number;
}

// In-memory metrics (lost on restart — acceptable for self-health)
const metrics = {
  startTime: Date.now(),
  totalRequests: 0,
  successRequests: 0,
  errorRequests: 0,
  totalDuration: 0,
  queueDepth: 0
};

/**
 * Record a request for health tracking.
 */
export function recordRequest(statusCode: number, durationMs: number): void {
  metrics.totalRequests++;
  metrics.totalDuration += durationMs;
  
  if (statusCode >= 200 && statusCode < 400) {
    metrics.successRequests++;
  } else {
    metrics.errorRequests++;
  }
}

/**
 * Update the current webhook queue depth.
 */
export function setQueueDepth(depth: number): void {
  metrics.queueDepth = depth;
}

/**
 * Get current health status of the MCP server.
 */
export function getHealthStatus(): HealthStatus {
  const uptime = Date.now() - metrics.startTime;
  const errorRate = metrics.totalRequests > 0 
    ? metrics.errorRequests / metrics.totalRequests 
    : 0;
  
  const avgDuration = metrics.totalRequests > 0 
    ? Math.round(metrics.totalDuration / metrics.totalRequests) 
    : 0;
  
  // Determine health status
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (errorRate > 0.5) {
    status = 'unhealthy';
  } else if (errorRate > 0.2 || metrics.queueDepth > 100) {
    status = 'degraded';
  }
  
  return {
    status,
    timestamp: new Date().toISOString(),
    version: VERSION,
    uptime,
    requests: {
      total: metrics.totalRequests,
      success: metrics.successRequests,
      errors: metrics.errorRequests,
      avgDuration
    },
    queueDepth: metrics.queueDepth,
    errorRate
  };
}
