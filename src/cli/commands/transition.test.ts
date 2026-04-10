import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { transitionCommand } from './transition';

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

let mockValidateErrors: string[] = [];
let mockTransitionResult = {
  success: ['TEST-123'],
  failed: [] as Array<{ key: string; error: string }>,
};

mock.module('@/core', () => ({
  loadConfig: () => mockConfig,
  validateConfig: () => mockValidateErrors,
  BacklogClient: class {},
  IssueKeyExtractor: class {
    extract(pr: { title: string }) {
      const keys = pr.title.match(/TEST-\d+/g) || [];
      return { keys, sources: {}, primary: keys[0] || null };
    }
    validate() {
      return { valid: true };
    }
  },
  IssueTransitioner: class {
    async transition() {
      return mockTransitionResult;
    }
  },
  ReleaseNotesGenerator: class {},
  GitHubContext: {},
  extractPullRequestData: () => null,
  extractTagFromRef: () => null,
  getPullRequestsForRelease: async () => [],
  parseGitHubContext: () => null,
  updateGitHubRelease: async () => {},
  updateGitHubReleaseByTag: async () => {},
}));

describe('transitionCommand', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let consoleWarnSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    processExitSpy = spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockValidateErrors = [];
    mockTransitionResult = { success: ['TEST-123'], failed: [] };
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  test('transitions issues with direct keys', async () => {
    await transitionCommand({ keys: ['TEST-123'] });

    expect(consoleLogSpy).toHaveBeenCalledWith('Transitioning 1 issues to status 3...');
    expect(consoleLogSpy).toHaveBeenCalledWith('\nTransition complete');
  });

  test('uses onMerge status by default', async () => {
    await transitionCommand({ keys: ['TEST-123'] });

    expect(consoleLogSpy).toHaveBeenCalledWith('Transitioning 1 issues to status 3...');
  });

  test('uses onRelease status when flag is set', async () => {
    await transitionCommand({ keys: ['TEST-123'], onRelease: true });

    expect(consoleLogSpy).toHaveBeenCalledWith('Transitioning 1 issues to status 4...');
  });

  test('extracts keys from title when no keys provided', async () => {
    await transitionCommand({ title: '[TEST-123] Fix bug' });

    expect(consoleLogSpy).toHaveBeenCalledWith('Transitioning 1 issues to status 3...');
  });

  test('shows warning when no keys found', async () => {
    await transitionCommand({ title: 'Fix bug without key' });

    expect(consoleWarnSpy).toHaveBeenCalledWith('Warning: No issue keys to transition');
  });

  test('exits with error on config validation failure', async () => {
    mockValidateErrors = ['backlog.apiKey is required'];

    await transitionCommand({ keys: ['TEST-123'] });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Configuration errors:');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  test('exits with error on partial failure', async () => {
    mockTransitionResult = {
      success: ['TEST-123'],
      failed: [{ key: 'TEST-456', error: 'Not found' }],
    };

    await transitionCommand({ keys: ['TEST-123', 'TEST-456'] });

    expect(consoleErrorSpy).toHaveBeenCalledWith('\nFailed to update:');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  test('shows success message for each updated issue', async () => {
    mockTransitionResult = { success: ['TEST-123', 'TEST-456'], failed: [] };

    await transitionCommand({ keys: ['TEST-123', 'TEST-456'] });

    expect(consoleLogSpy).toHaveBeenCalledWith('\nSuccessfully updated:');
    expect(consoleLogSpy).toHaveBeenCalledWith('  - TEST-123');
    expect(consoleLogSpy).toHaveBeenCalledWith('  - TEST-456');
  });
});
