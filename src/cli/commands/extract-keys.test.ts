import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { extractKeysCommand } from './extract-keys';

const mockConfig = {
  backlog: {
    baseUrl: 'https://test.backlog.com',
    apiKey: 'test-key',
    projectKey: 'TEST',
  },
  issueKey: {
    pattern: '[A-Z]+-[0-9]+',
    sources: ['title', 'body', 'branch', 'commits'] as const,
    requirePrimary: false,
  },
  transition: {
    onMerge: { statusId: 3 },
    onRelease: { statusId: 4 },
  },
  releaseNotes: {
    grouping: 'issueType' as const,
    titleMap: {},
  },
  github: {
    release: { enabled: true },
  },
};

mock.module('@/core', () => ({
  loadConfig: () => mockConfig,
  validateConfig: () => [],
  IssueKeyExtractor: class {
    extract(pr: { title: string }) {
      const keys = pr.title.match(/TEST-\d+/g) || [];
      return {
        keys,
        sources: keys.length > 0 ? { title: keys } : {},
        primary: keys[0] || null,
      };
    }
    validate(_result: { keys: string[] }) {
      return { valid: true };
    }
  },
  BacklogClient: class {},
  IssueTransitioner: class {},
  ReleaseNotesGenerator: class {},
  GitHubContext: {},
  extractPullRequestData: () => null,
  extractTagFromRef: () => null,
  getPullRequestsForRelease: async () => [],
  parseGitHubContext: () => null,
  updateGitHubRelease: async () => {},
  updateGitHubReleaseByTag: async () => {},
}));

describe('extractKeysCommand', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('extracts keys from title', async () => {
    await extractKeysCommand({ title: '[TEST-123] Fix bug' });

    expect(consoleLogSpy).toHaveBeenCalledWith('Found issue keys:');
    expect(consoleLogSpy).toHaveBeenCalledWith('  - TEST-123 (primary)');
  });

  test('outputs JSON when json flag is set', async () => {
    await extractKeysCommand({ title: '[TEST-123] Fix bug', json: true });

    const calls = consoleLogSpy.mock.calls;
    const jsonOutput = calls.find((call: unknown[]) => {
      try {
        JSON.parse(call[0] as string);
        return true;
      } catch {
        return false;
      }
    });

    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput![0] as string);
    expect(parsed.keys).toContain('TEST-123');
  });

  test('shows no keys message when none found', async () => {
    await extractKeysCommand({ title: 'Fix bug without key' });

    expect(consoleLogSpy).toHaveBeenCalledWith('No issue keys found');
  });

  test('handles empty arguments', async () => {
    await extractKeysCommand({});

    expect(consoleLogSpy).toHaveBeenCalledWith('No issue keys found');
  });
});
