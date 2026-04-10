import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { validateConfigCommand } from './validate-config';

const validConfig = {
  backlog: {
    baseUrl: 'https://test.backlog.com',
    apiKey: 'test-api-key',
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

let mockLoadConfig = () => validConfig;
let mockValidateConfig = () => [] as string[];

mock.module('@/core', () => ({
  loadConfig: () => mockLoadConfig(),
  validateConfig: () => mockValidateConfig(),
  BacklogClient: class {},
  IssueKeyExtractor: class {},
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

describe('validateConfigCommand', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockLoadConfig = () => validConfig;
    mockValidateConfig = () => [];
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  test('shows success message for valid config', async () => {
    await validateConfigCommand({});

    expect(consoleLogSpy).toHaveBeenCalledWith('Configuration is valid');
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  test('masks API key in output', async () => {
    await validateConfigCommand({});

    const calls = consoleLogSpy.mock.calls;
    const jsonCall = calls.find((call: unknown[]) => {
      const str = call[0] as string;
      return str.includes('baseUrl') && str.includes('projectKey');
    });

    expect(jsonCall).toBeDefined();
    expect(jsonCall![0]).toContain('********');
    expect(jsonCall![0]).not.toContain('test-api-key');
  });

  test('shows errors for invalid config', async () => {
    mockValidateConfig = () => ['backlog.baseUrl is required', 'backlog.apiKey is required'];

    await validateConfigCommand({});

    expect(consoleErrorSpy).toHaveBeenCalledWith('Configuration errors:');
    expect(consoleErrorSpy).toHaveBeenCalledWith('  - backlog.baseUrl is required');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  test('handles config load failure', async () => {
    mockLoadConfig = () => {
      throw new Error('File not found');
    };

    await validateConfigCommand({});

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
