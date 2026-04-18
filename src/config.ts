import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import yaml from 'yaml';
import path from 'path';

export interface PulseliveConfig {
  github?: {
    repo?: string;
    token?: string;
  };
  health?: {
    endpoints?: Array<{
      name: string;
      url: string;
      timeout?: number;
    }>;
  };
  checks?: {
    ci?: boolean;
    deps?: boolean;
    git?: boolean;
    health?: boolean;
    issues?: boolean;
    deploy?: boolean;
  };
}

export class ConfigLoader {
  private configPath: string;
  private config: PulseliveConfig;

  constructor(configPath: string = '.pulselive.yml') {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }

  private loadConfig(): PulseliveConfig {
    try {
      const configContent = readFileSync(this.configPath, 'utf8');
      const parsed = yaml.parse(configContent);
      return (parsed && typeof parsed === 'object') ? parsed as PulseliveConfig : {};
    } catch (error) {
      return {};
    }
  }

  getConfig(): PulseliveConfig {
    return this.config;
  }

  autoDetect(): PulseliveConfig {
    const detectedConfig: PulseliveConfig = JSON.parse(JSON.stringify(this.config || {}));

    // Auto-detect GitHub repo from git remote
    if (!detectedConfig.github?.repo) {
      try {
        const gitRemote = execSync('git remote get-url origin', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
        const match = gitRemote.match(/github\.com[:\/]([^\/]+)\/([^\/]+?)(\.git)?$/);
        if (match) {
          detectedConfig.github = {
            ...detectedConfig.github,
            repo: `${match[1]}/${match[2]}`
          };
        }
      } catch (error) {
        // Git remote not available
      }
    }

    // Auto-detect language from files
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const requirementsPath = path.join(process.cwd(), 'requirements.txt');
    const goModPath = path.join(process.cwd(), 'go.mod');
    if (!detectedConfig.checks) {
      detectedConfig.checks = {};
    }

    // Enable deps check if package manager file exists (only if not explicitly set)
    const fs = require('fs');
    if (detectedConfig.checks.deps === undefined) {
      if (fs.existsSync(packageJsonPath) || fs.existsSync(requirementsPath) || fs.existsSync(goModPath)) {
        detectedConfig.checks.deps = true;
      }
    }

    // Enable git check if .git directory exists (only if not explicitly set)
    if (detectedConfig.checks.git === undefined) {
      if (fs.existsSync(path.join(process.cwd(), '.git'))) {
        detectedConfig.checks.git = true;
      }
    }

    return detectedConfig;
  }
}