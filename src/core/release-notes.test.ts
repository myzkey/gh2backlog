import { describe, expect, test } from 'bun:test';
import type { BacklogClient } from './backlog-client';
import { ReleaseNotesGenerator } from './release-notes';
import type { BacklogFlowConfig, BacklogIssue } from './types';

const createConfig = (
  overrides?: Partial<BacklogFlowConfig['releaseNotes']>,
): BacklogFlowConfig => ({
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
    titleMap: {
      バグ: 'Bug Fixes',
      タスク: 'Tasks',
    },
    ...overrides,
  },
  github: {
    release: { enabled: true },
  },
});

const mockIssues: BacklogIssue[] = [
  {
    id: 1,
    issueKey: 'TEST-123',
    summary: 'Fix login bug',
    issueType: { id: 1, name: 'バグ' },
    status: { id: 3, name: '処理済み' },
  },
  {
    id: 2,
    issueKey: 'TEST-456',
    summary: 'Add new feature',
    issueType: { id: 2, name: 'タスク' },
    status: { id: 3, name: '処理済み' },
  },
  {
    id: 3,
    issueKey: 'TEST-789',
    summary: 'Another bug fix',
    issueType: { id: 1, name: 'バグ' },
    status: { id: 3, name: '処理済み' },
  },
];

const createMockClient = (issues: BacklogIssue[]): BacklogClient => {
  return {
    getIssues: async (keys: string[]) => {
      return issues.filter((i) => keys.includes(i.issueKey));
    },
  } as unknown as BacklogClient;
};

describe('ReleaseNotesGenerator', () => {
  test('generates release notes with grouping', async () => {
    const generator = new ReleaseNotesGenerator(createConfig(), createMockClient(mockIssues));
    const result = await generator.generate(['TEST-123', 'TEST-456', 'TEST-789'], 'v1.0.0');

    expect(result.markdown).toContain('# Release v1.0.0');
    expect(result.markdown).toContain('## Bug Fixes');
    expect(result.markdown).toContain('## Tasks');
    expect(result.markdown).toContain('[TEST-123]');
    expect(result.markdown).toContain('[TEST-456]');
    expect(result.markdown).toContain('[TEST-789]');
  });

  test('groups issues by type', async () => {
    const generator = new ReleaseNotesGenerator(createConfig(), createMockClient(mockIssues));
    const result = await generator.generate(['TEST-123', 'TEST-456', 'TEST-789'], 'v1.0.0');

    expect(result.groupedByType.バグ.length).toBe(2);
    expect(result.groupedByType.タスク.length).toBe(1);
  });

  test('handles no grouping', async () => {
    const config = createConfig({ grouping: 'none', titleMap: {} });
    const generator = new ReleaseNotesGenerator(config, createMockClient(mockIssues));
    const result = await generator.generate(['TEST-123', 'TEST-456'], 'v1.0.0');

    expect(result.groupedByType.All).toBeDefined();
    expect(result.groupedByType.All.length).toBe(2);
  });

  test('handles empty issue list', async () => {
    const generator = new ReleaseNotesGenerator(createConfig(), createMockClient(mockIssues));
    const result = await generator.generate([], 'v1.0.0');

    expect(result.issues.length).toBe(0);
    expect(result.markdown).toContain('# Release v1.0.0');
  });

  test('applies title mapping', async () => {
    const generator = new ReleaseNotesGenerator(createConfig(), createMockClient(mockIssues));
    const result = await generator.generate(['TEST-123'], 'v1.0.0');

    expect(result.markdown).toContain('## Bug Fixes');
    expect(result.markdown).not.toContain('## バグ');
  });

  test('includes issue URLs', async () => {
    const generator = new ReleaseNotesGenerator(createConfig(), createMockClient(mockIssues));
    const result = await generator.generate(['TEST-123'], 'v1.0.0');

    expect(result.markdown).toContain('https://test.backlog.com/view/TEST-123');
  });

  test('includes issue summary', async () => {
    const generator = new ReleaseNotesGenerator(createConfig(), createMockClient(mockIssues));
    const result = await generator.generate(['TEST-123'], 'v1.0.0');

    expect(result.markdown).toContain('Fix login bug');
  });

  test('handles unknown issue keys', async () => {
    const generator = new ReleaseNotesGenerator(createConfig(), createMockClient(mockIssues));
    const result = await generator.generate(['TEST-999', 'TEST-123'], 'v1.0.0');

    expect(result.issues.length).toBe(1);
    expect(result.issues[0].issueKey).toBe('TEST-123');
  });

  test('deduplicates issue keys', async () => {
    const generator = new ReleaseNotesGenerator(createConfig(), createMockClient(mockIssues));
    const result = await generator.generate(['TEST-123', 'TEST-123', 'TEST-123'], 'v1.0.0');

    expect(result.issues.length).toBe(1);
  });

  test('preserves issue type name when no mapping exists', async () => {
    const config = createConfig({ titleMap: {} });
    const generator = new ReleaseNotesGenerator(config, createMockClient(mockIssues));
    const result = await generator.generate(['TEST-123'], 'v1.0.0');

    expect(result.markdown).toContain('## バグ');
  });

  test('sorts types alphabetically', async () => {
    const generator = new ReleaseNotesGenerator(createConfig(), createMockClient(mockIssues));
    const result = await generator.generate(['TEST-123', 'TEST-456'], 'v1.0.0');

    const bugIndex = result.markdown.indexOf('## Bug Fixes');
    const taskIndex = result.markdown.indexOf('## Tasks');

    // Both sections should exist
    expect(bugIndex).toBeGreaterThan(-1);
    expect(taskIndex).toBeGreaterThan(-1);

    // Sorted by Japanese key (タスク < バグ in Unicode order)
    expect(taskIndex).toBeLessThan(bugIndex);
  });
});
