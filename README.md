# PulseTel

**MCP server that detects cross-signal correlations in project health — the thing no individual check can tell you.**

[![npm version](https://img.shields.io/npm/v/pulsetel-cli.svg)](https://www.npmjs.com/package/pulsetel-cli) [![Tests](https://img.shields.io/badge/tests-844%20passing-brightgreen)](https://github.com/siongyuen/pulsetel) [![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## Why This Exists

AI agents can already check CI status with `gh run list` and find vulnerabilities with `npm audit`. What they **can't** do is connect the dots:

> **"CI started failing AND coverage dropped 8% — because of the dependency I added yesterday."**

Individual checks give you isolated signals. PulseTel gives you **causal chains** — why things are breaking, not just that they're breaking.

**Other agents check signals. PulseTel connects them.**

## The Correlation Advantage

```
Agent runs npm audit → 2 critical vulns
Agent runs gh run list → CI green
Agent thinks: "Everything's fine" ❌

Agent runs pulsetel correlate →
  💥 security_scan_gap detected (92% confidence)
  2 critical vulns + CI green = no security scanning in CI
  Chain: no_security_scan_in_ci → vulnerabilities_ship_to_production
  Action: Add 'npm audit --audit-level=high' to CI pipeline ✅
```

An agent with shell access gets the same data points but never thinks to connect them. PulseTel does — and tells the agent exactly what to do.

## Ship Gate

One call. One answer.

```bash
pulsetel gate
```

```
🚫 BLOCK
   2 critical correlation(s) detected — resolve before shipping
   Confidence: 85%
   Proceed if: Resolve all critical correlations and re-run pulsetel_correlate
```

Exit codes: `0` = proceed, `1` = block, `2` = caution. Wire it into CI, pre-commit hooks, or agent decision-making.

## Installation

```bash
npx pulsetel-cli check
# or install globally
npm install -g pulsetel-cli
pulsetel check
```

## Quick Start

### 1. Initialize

```bash
cd your-project
pulsetel init
```

Auto-detects GitHub repo, health endpoints, and creates `.pulsetel.yml`.

### 2. Correlate

```bash
pulsetel correlate        # Detect cross-signal correlations
pulsetel correlate --json # Machine-readable for agents
pulsetel gate             # Ship gate: proceed / caution / block
```

### 3. Check

```bash
pulsetel check            # Full project health check
pulsetel check --quick    # Fast triage (~2s, skips slow checks)
pulsetel check --json     # Machine-readable output
```

### 4. Analyze

```bash
pulsetel trends           # Direction, delta, velocity per check type
pulsetel anomalies        # Statistical anomaly detection (z-score)
pulsetel diff --delta     # Significant changes only (token-efficient)
pulsetel ping             # Lightweight health ping (0-100 score)
```

## Correlation Patterns

These are the patterns PulseTel detects that **no individual check can identify**:

| Pattern | Signals | What It Detects |
|---------|---------|----------------|
| **dependency_cascade** | deps + ci + coverage | Dependency update caused CI failure and coverage drop |
| **security_scan_gap** | deps + ci | Critical vulns present but CI is green — no security scanning |
| **bad_merge** | coverage + ci + git | Recent merge introduced untested code and test instability |
| **coverage_quality_divergence** | coverage + ci | Coverage going up but CI is flaky — new tests are unreliable |
| **deploy_regression** | deploy + sentry + health | Runtime errors after deploy, possibly with latency regression |
| **delivery_bottleneck** | prs + issues + ci | Stale PRs + growing issues despite healthy CI |
| **untested_performance_regression** | health + coverage | Latency spike in untested code paths |

Every correlation returns:
- **Causal chain**: `dependency_update → breaking_api_change → test_failures → ci_degraded`
- **Specific actionable**: "Pin recently added dependencies and check changelogs for breaking changes"
- **Blast radius**: "CI reliability, deployment pipeline, team velocity"
- **Confidence**: 0-1 score based on signal availability and historical confirmation

## MCP Tools for AI Agents

PulseTel exposes 12 MCP tools via stdio transport:

```json
{
  "mcpServers": {
    "pulsetel": {
      "command": "npx",
      "args": ["-y", "pulsetel-cli", "mcp-stdio"]
    }
  }
}
```

| Tool | Purpose | Response Time |
|------|---------|---------------|
| `pulsetel_correlate` | **Cross-signal correlations + ship decision** | ~8s |
| `pulsetel_gate` | **Ship gate: proceed / caution / block** | ~8s |
| `pulsetel_check` | Full health check — all signals | ~8-12s |
| `pulsetel_quick` | Fast triage (~2s) | ~1-2s |
| `pulsetel_trends` | Trend direction, delta, velocity | <1s |
| `pulsetel_anomalies` | Statistical anomaly detection | <1s |
| `pulsetel_diff` | Change intelligence with risk assessment | ~1s |
| `pulsetel_status` | Cached health ping (no API calls) | <10ms |
| `pulsetel_telemetry` | OpenTelemetry export status | <1s |
| `pulsetel_sentry` | Sentry error tracking | ~2s |
| `pulsetel_ci` | CI status + flakiness | ~2s |
| `pulsetel_health` | Endpoint health + latency | ~2s |
| `pulsetel_deps` | Vulnerability + outdated check | ~4s |

Every response includes `actionable`, `severity`, `confidence`, and `context` — no interpretation required.

## Correlation Example

```bash
pulsetel correlate --json
```

```json
{
  "schema_version": "1.0.0",
  "correlations": [
    {
      "pattern": "dependency_cascade",
      "confidence": 0.88,
      "severity": "critical",
      "signals": ["deps", "ci", "coverage"],
      "summary": "2 new deps + 3 outdated → CI failing → coverage dropped 8%",
      "causal_chain": "dependency_update → breaking_api_change → test_failures → ci_degraded + coverage_drop",
      "actionable": "Pin recently added dependencies and check changelogs for breaking changes. The coverage drop suggests tests are failing, not missing.",
      "blast_radius": "CI reliability, deployment pipeline, team velocity",
      "estimated_fix_time": "15-30 min"
    }
  ],
  "ship_decision": {
    "decision": "block",
    "reason": "2 critical correlation(s) detected — resolve before shipping",
    "confidence": 0.85,
    "blocking_issues": [
      "2 new deps + 3 outdated → CI failing → coverage dropped 8%"
    ],
    "proceed_if": "Resolve all critical correlations and re-run pulsetel_correlate"
  }
}
```

## What PulseTel Checks

| Signal | What It Checks | Why It Matters |
|--------|---------------|----------------|
| **CI** | GitHub Actions status, flakiness | Don't commit on red |
| **Dependencies** | Vulnerabilities, outdated packages | Critical vulns block deploys |
| **Coverage** | Test coverage vs threshold | Catch regressions before merge |
| **Git** | Branch status, uncommitted changes, divergence | Know the state before acting |
| **Health** | Endpoint availability, latency | Production health at a glance |
| **Issues** | Open issue counts and trends | Stale issues signal neglect |
| **PRs** | Open pull requests | Merge conflicts and review debt |
| **Deploy** | Recent deployment status | Know what's live |
| **Sentry** | Error tracking, unresolved issues | Runtime health |

Every check returns a single schema: `{status, message, details, severity, confidence, actionable}`. Apples to apples, every time.

## The Opinion

PulseTel refuses to be a monitoring dashboard. It's a correlation engine that gives you:

1. **Causal chains** — not just "things are bad" but *why* they're bad
2. **Ship decisions** — proceed, caution, or block with one reason
3. **Cross-signal intelligence** — patterns no individual check can detect
4. **Structured data agents can act on** — not prose for humans to interpret

If you want dashboards, use Grafana. If you want an agent to know *why* CI is failing and *whether it's safe to ship*, use PulseTel.

## Delta Mode

```bash
pulsetel diff --delta --threshold 5
```

Returns only significant changes with risk assessment. ~90% smaller than full check output — designed for token-efficient agent consumption.

## Schema

Versioned data contract. See [SCHEMA.md](./SCHEMA.md):

```json
{
  "schema_version": "1.0.0",
  "correlations": [
    {
      "pattern": "security_scan_gap",
      "confidence": 0.92,
      "severity": "critical",
      "causal_chain": "no_security_scan_in_ci → vulnerabilities_ship_to_production",
      "actionable": "Add 'npm audit --audit-level=high' to CI pipeline"
    }
  ],
  "ship_decision": {
    "decision": "block",
    "confidence": 0.85
  }
}
```

## Security

- SSRF protection with blocked IP ranges (loopback, RFC1918, cloud metadata)
- DNS rebinding prevention with pinned TLS connections
- Timing-safe API key comparison
- Guard command allowlist (no shell metacharacters, no absolute paths)
- Atomic file writes (write-to-temp-then-rename)

See [SECURITY.md](./SECURITY.md) for full details.

## Documentation

- [SCHEMA.md](./SCHEMA.md) — Versioned data contract
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System design
- [CHANGELOG.md](./CHANGELOG.md) — Release history
- [SECURITY.md](./SECURITY.md) — Security model and SSRF protection

## License

Apache 2.0