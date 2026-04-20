import * as fs from 'node:fs';
import * as path from 'node:path';
import type { BacklogFlowConfig } from './types';

const DEFAULT_CONFIG: BacklogFlowConfig = {
  backlog: {
    baseUrl: '',
    apiKey: '',
    projectKey: '',
  },
  issueKey: {
    pattern: '[A-Z]+-[0-9]+',
    sources: ['title', 'body', 'branch', 'commits'],
    requirePrimary: false,
  },
  transition: {
    onMerge: {
      statusId: 3,
    },
    onRelease: {
      statusId: 4,
    },
  },
  releaseNotes: {
    grouping: 'issueType',
    titleMap: {},
  },
  github: {
    release: {
      enabled: true,
    },
  },
};

function parseYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');
  const stack: Array<{ indent: number; obj: Record<string, unknown> }> = [
    { indent: -1, obj: result },
  ];

  for (const line of lines) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const match = line.match(/^(\s*)([^:]+):\s*(.*)$/);
    if (!match) continue;

    const indent = match[1].length;
    const key = match[2].trim();
    let value: unknown = match[3].trim();

    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;

    if (value === '') {
      const newObj: Record<string, unknown> = {};
      parent[key] = newObj;
      stack.push({ indent, obj: newObj });
    } else {
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (/^-?\d+$/.test(value as string)) value = parseInt(value as string, 10);
      else if (/^-?\d+\.\d+$/.test(value as string)) value = parseFloat(value as string);
      else if ((value as string).startsWith('[') && (value as string).endsWith(']')) {
        value = (value as string)
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/['"]/g, ''));
      } else if ((value as string).startsWith('"') || (value as string).startsWith("'")) {
        value = (value as string).slice(1, -1);
      }
      parent[key] = value;
    }
  }

  return result;
}

function deepMerge(target: BacklogFlowConfig, source: Record<string, unknown>): BacklogFlowConfig {
  const result = JSON.parse(JSON.stringify(target)) as BacklogFlowConfig;

  function mergeObject(
    targetObj: Record<string, unknown>,
    sourceObj: Record<string, unknown>,
  ): void {
    for (const key of Object.keys(sourceObj)) {
      const sourceVal = sourceObj[key];
      const targetVal = targetObj[key];

      if (
        sourceVal &&
        typeof sourceVal === 'object' &&
        !Array.isArray(sourceVal) &&
        targetVal &&
        typeof targetVal === 'object' &&
        !Array.isArray(targetVal)
      ) {
        mergeObject(targetVal as Record<string, unknown>, sourceVal as Record<string, unknown>);
      } else if (sourceVal !== undefined) {
        targetObj[key] = sourceVal;
      }
    }
  }

  mergeObject(result as unknown as Record<string, unknown>, source);
  return result;
}

export function loadConfig(configPath?: string): BacklogFlowConfig {
  const filePath = configPath || path.join(process.cwd(), '.gh2backlog.yml');

  if (!fs.existsSync(filePath)) {
    return applyEnvOverrides(DEFAULT_CONFIG);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseYaml(content);
  const merged = deepMerge(DEFAULT_CONFIG, parsed);

  return applyEnvOverrides(merged);
}

function applyEnvOverrides(config: BacklogFlowConfig): BacklogFlowConfig {
  const result = { ...config };

  if (process.env.BACKLOG_BASE_URL) {
    result.backlog = { ...result.backlog, baseUrl: process.env.BACKLOG_BASE_URL };
  }
  if (process.env.BACKLOG_API_KEY) {
    result.backlog = { ...result.backlog, apiKey: process.env.BACKLOG_API_KEY };
  }
  if (process.env.BACKLOG_PROJECT_KEY) {
    result.backlog = { ...result.backlog, projectKey: process.env.BACKLOG_PROJECT_KEY };
  }

  return result;
}

const VALID_SOURCES = ['title', 'body', 'branch', 'commits'] as const;

export function validateConfig(config: BacklogFlowConfig): string[] {
  const errors: string[] = [];

  if (!config.backlog.baseUrl) {
    errors.push('backlog.baseUrl is required');
  }
  if (!config.backlog.apiKey) {
    errors.push('backlog.apiKey is required');
  }
  if (!config.backlog.projectKey) {
    errors.push('backlog.projectKey is required');
  }

  try {
    new RegExp(config.issueKey.pattern);
  } catch {
    errors.push(`Invalid regex pattern: ${config.issueKey.pattern}`);
  }

  // sources の許可値チェック
  for (const source of config.issueKey.sources) {
    if (!VALID_SOURCES.includes(source)) {
      errors.push(`Invalid source: "${source}". Allowed values: ${VALID_SOURCES.join(', ')}`);
    }
  }

  return errors;
}
