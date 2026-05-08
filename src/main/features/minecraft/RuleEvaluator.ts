import os from 'os';

export interface Rule {
  action: 'allow' | 'disallow';
  os?: { name?: string; version?: string; arch?: string };
  features?: Record<string, boolean>;
}

export interface RuleContext {
  osName: 'windows' | 'osx' | 'linux';
  osVersion: string;
  arch: string;
  features: Record<string, boolean>;
}

export class RuleEvaluator {
  static currentContext(features: Record<string, boolean> = {}): RuleContext {
    return {
      osName: RuleEvaluator.osName(),
      osVersion: os.release(),
      arch: process.arch === 'x64' ? 'x86_64' : process.arch,
      features,
    };
  }

  static osName(): 'windows' | 'osx' | 'linux' {
    if (process.platform === 'win32') return 'windows';
    if (process.platform === 'darwin') return 'osx';
    return 'linux';
  }

  static evaluate(rules: Rule[] | undefined, ctx: RuleContext): boolean {
    if (!rules || rules.length === 0) return true;
    let allow = false;
    for (const rule of rules) {
      if (RuleEvaluator.matches(rule, ctx)) {
        allow = rule.action === 'allow';
      }
    }
    return allow;
  }

  private static matches(rule: Rule, ctx: RuleContext): boolean {
    if (rule.os) {
      if (rule.os.name && rule.os.name !== ctx.osName) return false;
      if (rule.os.arch && rule.os.arch !== ctx.arch) return false;
      if (rule.os.version) {
        try {
          if (!new RegExp(rule.os.version).test(ctx.osVersion)) return false;
        } catch {
          return false;
        }
      }
    }
    if (rule.features) {
      for (const [feature, expected] of Object.entries(rule.features)) {
        if ((ctx.features[feature] ?? false) !== expected) return false;
      }
    }
    return true;
  }
}
