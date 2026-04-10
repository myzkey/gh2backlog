import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { releaseNotesCommand } from './release-notes';

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
    release: { enabled: false },
  },
};

let mockValidateErrors: string[] = [];
const mockReleaseNotes = {
  markdown: '# Release v1.0.0\n\n## Tasks\n\n- [TEST-123]: Fix bug',
  issues: [],
  groupedByType: {},
};

mock.module('@/core', () => ({
  loadConfig: () => mockConfig,
  validateConfig: () => mockValidateErrors,
  BacklogClient: class {},
  IssueKeyExtractor: class {
    extract() {
      return { keys: [], sources: {}, primary: null };
    }
  },
  IssueTransitioner: class {},
  ReleaseNotesGenerator: class {
    async generate() {
      return mockReleaseNotes;
    }
  },
  GitHubContext: {},
  extractPullRequestData: () => null,
  extractTagFromRef: () => null,
  getPullRequestsForRelease: async () => [],
  parseGitHubContext: () => null,
  updateGitHubRelease: async () => {},
  updateGitHubReleaseByTag: async () => {},
}));

describe('releaseNotesCommand', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockValidateErrors = [];
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  test('generates release notes with provided keys', async () => {
    await releaseNotesCommand({ tag: 'v1.0.0', keys: ['TEST-123'] });

    expect(consoleLogSpy).toHaveBeenCalledWith('Generating release notes...');
    expect(consoleLogSpy).toHaveBeenCalledWith(`\n${mockReleaseNotes.markdown}`);
  });

  test('exits with error when tag is missing', async () => {
    await releaseNotesCommand({ tag: '' });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error: --tag is required');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  test('exits with error on config validation failure', async () => {
    mockValidateErrors = ['backlog.apiKey is required'];

    await releaseNotesCommand({ tag: 'v1.0.0', keys: ['TEST-123'] });

    expect(consoleErrorSpy).toHaveBeenCalledWith('Configuration errors:');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  test('shows message when no keys found', async () => {
    await releaseNotesCommand({ tag: 'v1.0.0' });

    expect(consoleLogSpy).toHaveBeenCalledWith('No issue keys found for release notes');
  });
});
