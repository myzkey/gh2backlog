import { describe, expect, test } from 'bun:test';

interface MockConfig {
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

const mockConfig: MockConfig = {
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
};

interface PullRequestData {
  title: string;
  body: string;
  branch: string;
  commits: string[];
}

interface ExtractionResult {
  keys: string[];
  sources: Record<string, string[]>;
  primary: string | null;
}

class TestIssueKeyExtractor {
  private pattern: RegExp;
  private sources: Array<'title' | 'body' | 'branch' | 'commits'>;
  private requirePrimary: boolean;
  private projectKey?: string;

  constructor(config: MockConfig) {
    this.pattern = new RegExp(config.issueKey.pattern, 'g');
    this.sources = [...config.issueKey.sources];
    this.requirePrimary = config.issueKey.requirePrimary;
    this.projectKey = config.backlog.projectKey;
  }

  extract(pr: PullRequestData): ExtractionResult {
    const allKeys: string[] = [];
    const sources: Record<string, string[]> = {};
    let primary: string | null = null;

    for (const source of this.sources) {
      const text = this.getTextForSource(pr, source);
      const keys = this.extractFromText(text);

      if (keys.length > 0) {
        sources[source] = keys;
        allKeys.push(...keys);

        if (source === 'title' && keys.length > 0 && !primary) {
          primary = keys[0];
        }
      }
    }

    const uniqueKeys = [...new Set(allKeys)];

    if (!primary && uniqueKeys.length > 0) {
      primary = uniqueKeys[0];
    }

    return { keys: uniqueKeys, sources, primary };
  }

  extractFromText(text: string): string[] {
    if (!text) return [];
    this.pattern.lastIndex = 0;
    const matches: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = this.pattern.exec(text)) !== null) {
      matches.push(match[0]);
    }

    const filtered = this.projectKey
      ? matches.filter((key) => key.startsWith(`${this.projectKey}-`))
      : matches;
    return [...new Set(filtered)];
  }

  private getTextForSource(
    pr: PullRequestData,
    source: 'title' | 'body' | 'branch' | 'commits',
  ): string {
    switch (source) {
      case 'title':
        return pr.title;
      case 'body':
        return pr.body;
      case 'branch':
        return pr.branch;
      case 'commits':
        return pr.commits.join('\n');
      default:
        return '';
    }
  }

  validate(result: ExtractionResult): { valid: boolean; error?: string } {
    if (this.requirePrimary && (!result.sources.title || result.sources.title.length === 0)) {
      return { valid: false, error: 'Issue key is required in PR title but not found' };
    }
    return { valid: true };
  }
}

describe('IssueKeyExtractor', () => {
  test('extracts keys from title', () => {
    const extractor = new TestIssueKeyExtractor(mockConfig);
    const result = extractor.extract({
      title: '[TEST-123] Fix bug',
      body: '',
      branch: '',
      commits: [],
    });

    expect(result.keys).toEqual(['TEST-123']);
    expect(result.primary).toBe('TEST-123');
  });

  test('extracts multiple keys from different sources', () => {
    const extractor = new TestIssueKeyExtractor(mockConfig);
    const result = extractor.extract({
      title: '[TEST-123] Fix bug',
      body: 'Related to TEST-456',
      branch: 'feature/TEST-789',
      commits: ['TEST-123 initial commit'],
    });

    expect(result.keys.sort()).toEqual(['TEST-123', 'TEST-456', 'TEST-789']);
    expect(result.primary).toBe('TEST-123');
  });

  test('removes duplicates', () => {
    const extractor = new TestIssueKeyExtractor(mockConfig);
    const result = extractor.extract({
      title: 'TEST-123 Fix bug',
      body: 'TEST-123 details',
      branch: 'feature/TEST-123',
      commits: [],
    });

    expect(result.keys).toEqual(['TEST-123']);
  });

  test('validates requirePrimary', () => {
    const configWithRequire: MockConfig = {
      ...mockConfig,
      issueKey: { ...mockConfig.issueKey, requirePrimary: true },
    };
    const extractor = new TestIssueKeyExtractor(configWithRequire);

    const result1 = extractor.extract({
      title: '[TEST-123] Fix bug',
      body: '',
      branch: '',
      commits: [],
    });
    expect(extractor.validate(result1).valid).toBe(true);

    const result2 = extractor.extract({
      title: 'Fix bug',
      body: 'TEST-123',
      branch: '',
      commits: [],
    });
    expect(extractor.validate(result2).valid).toBe(false);
  });

  test('filters by project key', () => {
    const extractor = new TestIssueKeyExtractor(mockConfig);
    const result = extractor.extract({
      title: 'TEST-123 OTHER-456 Fix bug',
      body: '',
      branch: '',
      commits: [],
    });

    expect(result.keys).toEqual(['TEST-123']);
  });

  test('handles empty input', () => {
    const extractor = new TestIssueKeyExtractor(mockConfig);
    const result = extractor.extract({
      title: '',
      body: '',
      branch: '',
      commits: [],
    });

    expect(result.keys).toEqual([]);
    expect(result.primary).toBeNull();
  });

  test('extracts multiple keys from same source', () => {
    const extractor = new TestIssueKeyExtractor(mockConfig);
    const result = extractor.extract({
      title: 'TEST-123 TEST-456 Fix bugs',
      body: '',
      branch: '',
      commits: [],
    });

    expect(result.keys.sort()).toEqual(['TEST-123', 'TEST-456']);
    expect(result.primary).toBe('TEST-123');
  });

  test('handles commits array', () => {
    const extractor = new TestIssueKeyExtractor(mockConfig);
    const result = extractor.extract({
      title: 'Fix bug',
      body: '',
      branch: '',
      commits: ['TEST-123 first commit', 'TEST-456 second commit'],
    });

    expect(result.keys.sort()).toEqual(['TEST-123', 'TEST-456']);
  });
});
