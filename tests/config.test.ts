import { describe, expect, test } from 'bun:test';

interface BacklogFlowConfig {
  backlog: {
    baseUrl: string;
    apiKey: string;
    projectKey: string;
  };
  issueKey: {
    pattern: string;
    sources: Array<'title' | 'body' | 'branch' | 'commits'>;
    requirePrimary: boolean;
  };
  transition: {
    onMerge: { statusId: number };
    onRelease: { statusId: number };
  };
  releaseNotes: {
    grouping: 'issueType' | 'none';
    titleMap: Record<string, string>;
  };
  github: {
    release: { enabled: boolean };
  };
}

function validateConfig(config: BacklogFlowConfig): string[] {
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

  return errors;
}

describe('Config Validation', () => {
  test('validates complete config', () => {
    const config: BacklogFlowConfig = {
      backlog: {
        baseUrl: 'https://test.backlog.com',
        apiKey: 'test-key',
        projectKey: 'TEST',
      },
      issueKey: {
        pattern: '[A-Z]+-[0-9]+',
        sources: ['title', 'body'],
        requirePrimary: false,
      },
      transition: {
        onMerge: { statusId: 3 },
        onRelease: { statusId: 4 },
      },
      releaseNotes: {
        grouping: 'issueType',
        titleMap: {},
      },
      github: {
        release: { enabled: true },
      },
    };

    const errors = validateConfig(config);
    expect(errors.length).toBe(0);
  });

  test('detects missing baseUrl', () => {
    const config: BacklogFlowConfig = {
      backlog: {
        baseUrl: '',
        apiKey: 'test-key',
        projectKey: 'TEST',
      },
      issueKey: {
        pattern: '[A-Z]+-[0-9]+',
        sources: ['title'],
        requirePrimary: false,
      },
      transition: {
        onMerge: { statusId: 3 },
        onRelease: { statusId: 4 },
      },
      releaseNotes: {
        grouping: 'issueType',
        titleMap: {},
      },
      github: {
        release: { enabled: true },
      },
    };

    const errors = validateConfig(config);
    expect(errors).toContain('backlog.baseUrl is required');
  });

  test('detects missing apiKey', () => {
    const config: BacklogFlowConfig = {
      backlog: {
        baseUrl: 'https://test.backlog.com',
        apiKey: '',
        projectKey: 'TEST',
      },
      issueKey: {
        pattern: '[A-Z]+-[0-9]+',
        sources: ['title'],
        requirePrimary: false,
      },
      transition: {
        onMerge: { statusId: 3 },
        onRelease: { statusId: 4 },
      },
      releaseNotes: {
        grouping: 'issueType',
        titleMap: {},
      },
      github: {
        release: { enabled: true },
      },
    };

    const errors = validateConfig(config);
    expect(errors).toContain('backlog.apiKey is required');
  });

  test('detects missing projectKey', () => {
    const config: BacklogFlowConfig = {
      backlog: {
        baseUrl: 'https://test.backlog.com',
        apiKey: 'test-key',
        projectKey: '',
      },
      issueKey: {
        pattern: '[A-Z]+-[0-9]+',
        sources: ['title'],
        requirePrimary: false,
      },
      transition: {
        onMerge: { statusId: 3 },
        onRelease: { statusId: 4 },
      },
      releaseNotes: {
        grouping: 'issueType',
        titleMap: {},
      },
      github: {
        release: { enabled: true },
      },
    };

    const errors = validateConfig(config);
    expect(errors).toContain('backlog.projectKey is required');
  });

  test('detects invalid regex pattern', () => {
    const config: BacklogFlowConfig = {
      backlog: {
        baseUrl: 'https://test.backlog.com',
        apiKey: 'test-key',
        projectKey: 'TEST',
      },
      issueKey: {
        pattern: '[invalid(',
        sources: ['title'],
        requirePrimary: false,
      },
      transition: {
        onMerge: { statusId: 3 },
        onRelease: { statusId: 4 },
      },
      releaseNotes: {
        grouping: 'issueType',
        titleMap: {},
      },
      github: {
        release: { enabled: true },
      },
    };

    const errors = validateConfig(config);
    expect(errors.some((e) => e.includes('Invalid regex pattern'))).toBe(true);
  });

  test('detects multiple errors', () => {
    const config: BacklogFlowConfig = {
      backlog: {
        baseUrl: '',
        apiKey: '',
        projectKey: '',
      },
      issueKey: {
        pattern: '[A-Z]+-[0-9]+',
        sources: ['title'],
        requirePrimary: false,
      },
      transition: {
        onMerge: { statusId: 3 },
        onRelease: { statusId: 4 },
      },
      releaseNotes: {
        grouping: 'issueType',
        titleMap: {},
      },
      github: {
        release: { enabled: true },
      },
    };

    const errors = validateConfig(config);
    expect(errors.length).toBe(3);
  });
});
