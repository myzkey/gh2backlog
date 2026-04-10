import { describe, expect, test } from 'bun:test';
import { validateConfig } from './config';
import type { BacklogFlowConfig } from './types';

const createValidConfig = (overrides?: Partial<BacklogFlowConfig>): BacklogFlowConfig => ({
  backlog: {
    baseUrl: 'https://test.backlog.com',
    apiKey: 'test-key',
    projectKey: 'TEST',
  },
  issueKey: {
    pattern: '[A-Z]+-[0-9]+',
    sources: ['title', 'body', 'branch', 'commits'],
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
  ...overrides,
});

describe('validateConfig', () => {
  test('validates complete config', () => {
    const config = createValidConfig();
    const errors = validateConfig(config);
    expect(errors.length).toBe(0);
  });

  test('detects missing baseUrl', () => {
    const config = createValidConfig({
      backlog: { baseUrl: '', apiKey: 'test-key', projectKey: 'TEST' },
    });
    const errors = validateConfig(config);
    expect(errors).toContain('backlog.baseUrl is required');
  });

  test('detects missing apiKey', () => {
    const config = createValidConfig({
      backlog: { baseUrl: 'https://test.backlog.com', apiKey: '', projectKey: 'TEST' },
    });
    const errors = validateConfig(config);
    expect(errors).toContain('backlog.apiKey is required');
  });

  test('detects missing projectKey', () => {
    const config = createValidConfig({
      backlog: { baseUrl: 'https://test.backlog.com', apiKey: 'test-key', projectKey: '' },
    });
    const errors = validateConfig(config);
    expect(errors).toContain('backlog.projectKey is required');
  });

  test('detects invalid regex pattern', () => {
    const config = createValidConfig({
      issueKey: {
        pattern: '[invalid(',
        sources: ['title'],
        requirePrimary: false,
      },
    });
    const errors = validateConfig(config);
    expect(errors.some((e) => e.includes('Invalid regex pattern'))).toBe(true);
  });

  test('detects multiple errors', () => {
    const config = createValidConfig({
      backlog: { baseUrl: '', apiKey: '', projectKey: '' },
    });
    const errors = validateConfig(config);
    expect(errors.length).toBe(3);
  });

  test('detects invalid source value', () => {
    const config = createValidConfig({
      issueKey: {
        pattern: '[A-Z]+-[0-9]+',
        sources: ['title', 'pr_title' as 'title'],
        requirePrimary: false,
      },
    });
    const errors = validateConfig(config);
    expect(errors.some((e) => e.includes('Invalid source'))).toBe(true);
    expect(errors.some((e) => e.includes('pr_title'))).toBe(true);
  });

  test('accepts all valid source values', () => {
    const config = createValidConfig({
      issueKey: {
        pattern: '[A-Z]+-[0-9]+',
        sources: ['title', 'body', 'branch', 'commits'],
        requirePrimary: false,
      },
    });
    const errors = validateConfig(config);
    expect(errors.length).toBe(0);
  });

  test('detects multiple invalid sources', () => {
    const config = createValidConfig({
      issueKey: {
        pattern: '[A-Z]+-[0-9]+',
        sources: ['pr_title' as 'title', 'pr_body' as 'body'],
        requirePrimary: false,
      },
    });
    const errors = validateConfig(config);
    const sourceErrors = errors.filter((e) => e.includes('Invalid source'));
    expect(sourceErrors.length).toBe(2);
  });
});
