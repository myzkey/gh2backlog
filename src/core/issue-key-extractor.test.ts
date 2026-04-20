import { describe, expect, test } from 'bun:test';
import { IssueKeyExtractor } from './issue-key-extractor';
import type { BacklogFlowConfig, PullRequestData } from './types';

const createConfig = (overrides?: Partial<BacklogFlowConfig['issueKey']>): BacklogFlowConfig => ({
  backlog: {
    baseUrl: 'https://test.backlog.com',
    apiKey: 'test-key',
    projectKey: 'TEST',
  },
  issueKey: {
    pattern: '[A-Z]+-[0-9]+',
    sources: ['title', 'body', 'branch', 'commits'],
    requirePrimary: false,
    ...overrides,
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
});

const createPRData = (overrides?: Partial<PullRequestData>): PullRequestData => ({
  title: '',
  body: '',
  branch: '',
  commits: [],
  number: 1,
  merged: false,
  ...overrides,
});

describe('IssueKeyExtractor', () => {
  test('extracts keys from title', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const result = extractor.extract(
      createPRData({
        title: '[TEST-123] Fix bug',
      }),
    );

    expect(result.keys).toEqual(['TEST-123']);
    expect(result.primary).toBe('TEST-123');
    expect(result.sources.title).toEqual(['TEST-123']);
  });

  test('extracts keys from body', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const result = extractor.extract(
      createPRData({
        body: 'Related to TEST-456',
      }),
    );

    expect(result.keys).toEqual(['TEST-456']);
    expect(result.sources.body).toEqual(['TEST-456']);
  });

  test('extracts keys from branch', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const result = extractor.extract(
      createPRData({
        branch: 'feature/TEST-789',
      }),
    );

    expect(result.keys).toEqual(['TEST-789']);
    expect(result.sources.branch).toEqual(['TEST-789']);
  });

  test('extracts keys from commits', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const result = extractor.extract(
      createPRData({
        commits: ['TEST-111 first commit', 'TEST-222 second commit'],
      }),
    );

    expect(result.keys.sort()).toEqual(['TEST-111', 'TEST-222']);
    expect(result.sources.commits?.sort()).toEqual(['TEST-111', 'TEST-222']);
  });

  test('extracts multiple keys from different sources', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const result = extractor.extract(
      createPRData({
        title: '[TEST-123] Fix bug',
        body: 'Related to TEST-456',
        branch: 'feature/TEST-789',
        commits: ['TEST-123 initial commit'],
      }),
    );

    expect(result.keys.sort()).toEqual(['TEST-123', 'TEST-456', 'TEST-789']);
    expect(result.primary).toBe('TEST-123');
  });

  test('removes duplicates', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const result = extractor.extract(
      createPRData({
        title: 'TEST-123 Fix bug',
        body: 'TEST-123 details',
        branch: 'feature/TEST-123',
      }),
    );

    expect(result.keys).toEqual(['TEST-123']);
  });

  test('filters by project key', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const result = extractor.extract(
      createPRData({
        title: 'TEST-123 OTHER-456 Fix bug',
      }),
    );

    expect(result.keys).toEqual(['TEST-123']);
    expect(result.keys).not.toContain('OTHER-456');
  });

  test('handles empty input', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const result = extractor.extract(createPRData());

    expect(result.keys).toEqual([]);
    expect(result.primary).toBeNull();
  });

  test('extracts multiple keys from same source', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const result = extractor.extract(
      createPRData({
        title: 'TEST-123 TEST-456 Fix bugs',
      }),
    );

    expect(result.keys.sort()).toEqual(['TEST-123', 'TEST-456']);
    expect(result.primary).toBe('TEST-123');
  });

  test('sets primary from title when available', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const result = extractor.extract(
      createPRData({
        title: '[TEST-999] Title key',
        body: 'TEST-111 first in body',
      }),
    );

    expect(result.primary).toBe('TEST-999');
  });

  test('sets primary from first found when no title key', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const result = extractor.extract(
      createPRData({
        title: 'No key here',
        body: 'TEST-111 in body',
      }),
    );

    expect(result.primary).toBe('TEST-111');
  });

  test('respects sources config', () => {
    const extractor = new IssueKeyExtractor(
      createConfig({
        sources: ['title'],
      }),
    );
    const result = extractor.extract(
      createPRData({
        title: 'TEST-123 in title',
        body: 'TEST-456 in body',
      }),
    );

    expect(result.keys).toEqual(['TEST-123']);
    expect(result.sources.body).toBeUndefined();
  });
});

describe('IssueKeyExtractor.validate', () => {
  test('passes when requirePrimary is false', () => {
    const extractor = new IssueKeyExtractor(createConfig({ requirePrimary: false }));
    const result = extractor.extract(
      createPRData({
        body: 'TEST-123 in body only',
      }),
    );

    const validation = extractor.validate(result);
    expect(validation.valid).toBe(true);
  });

  test('passes when requirePrimary is true and title has key', () => {
    const extractor = new IssueKeyExtractor(createConfig({ requirePrimary: true }));
    const result = extractor.extract(
      createPRData({
        title: '[TEST-123] Fix bug',
      }),
    );

    const validation = extractor.validate(result);
    expect(validation.valid).toBe(true);
  });

  test('fails when requirePrimary is true and title has no key', () => {
    const extractor = new IssueKeyExtractor(createConfig({ requirePrimary: true }));
    const result = extractor.extract(
      createPRData({
        title: 'Fix bug without key',
        body: 'TEST-123 in body',
      }),
    );

    const validation = extractor.validate(result);
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('required in PR title');
  });

  test('fails when requirePrimary is true and no keys found', () => {
    const extractor = new IssueKeyExtractor(createConfig({ requirePrimary: true }));
    const result = extractor.extract(
      createPRData({
        title: 'No keys anywhere',
        body: 'Still no keys',
      }),
    );

    const validation = extractor.validate(result);
    expect(validation.valid).toBe(false);
  });
});

describe('IssueKeyExtractor.extractFromText', () => {
  test('extracts keys from plain text', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const keys = extractor.extractFromText('TEST-123 and TEST-456');

    expect(keys.sort()).toEqual(['TEST-123', 'TEST-456']);
  });

  test('handles empty text', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const keys = extractor.extractFromText('');

    expect(keys).toEqual([]);
  });

  test('handles null-ish text', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const keys = extractor.extractFromText(null as unknown as string);

    expect(keys).toEqual([]);
  });

  test('removes duplicates within text', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const keys = extractor.extractFromText('TEST-123 TEST-123 TEST-123');

    expect(keys).toEqual(['TEST-123']);
  });

  test('filters by project key', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const keys = extractor.extractFromText('TEST-123 OTHER-456 ABC-789');

    expect(keys).toEqual(['TEST-123']);
  });

  test('extracts keys from Backlog URLs (.com)', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const keys = extractor.extractFromText(
      'See https://example.backlog.com/view/TEST-123 for details',
    );

    expect(keys).toEqual(['TEST-123']);
  });

  test('extracts keys from Backlog URLs (.jp)', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const keys = extractor.extractFromText('Related: https://example.backlog.jp/view/TEST-456');

    expect(keys).toEqual(['TEST-456']);
  });

  test('extracts keys from multiple Backlog URLs', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const keys = extractor.extractFromText(
      'Issues: https://a.backlog.com/view/TEST-111 and https://b.backlog.jp/view/TEST-222',
    );

    expect(keys.sort()).toEqual(['TEST-111', 'TEST-222']);
  });

  test('extracts keys from both URLs and plain text', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const keys = extractor.extractFromText(
      'TEST-123 and https://example.backlog.com/view/TEST-456',
    );

    expect(keys.sort()).toEqual(['TEST-123', 'TEST-456']);
  });

  test('filters Backlog URL keys by project key', () => {
    const extractor = new IssueKeyExtractor(createConfig());
    const keys = extractor.extractFromText(
      'https://a.backlog.com/view/TEST-123 https://b.backlog.com/view/OTHER-456',
    );

    expect(keys).toEqual(['TEST-123']);
  });

  test('extracts keys with underscore in project key from URL', () => {
    const config = createConfig();
    config.backlog.projectKey = 'CORPORATE_WEBSITE';
    config.issueKey.pattern = '[A-Z_]+-[0-9]+';
    const extractor = new IssueKeyExtractor(config);
    const keys = extractor.extractFromText('https://anx-sys.backlog.com/view/CORPORATE_WEBSITE-13');

    expect(keys).toEqual(['CORPORATE_WEBSITE-13']);
  });
});
