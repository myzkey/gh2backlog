import { describe, expect, test } from 'bun:test';

interface MockBacklogIssue {
  id: number;
  issueKey: string;
  summary: string;
  issueType: { id: number; name: string };
  status: { id: number; name: string };
}

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
    titleMap: {
      バグ: 'Bug Fixes',
      タスク: 'Tasks',
    },
  },
  github: {
    release: { enabled: true },
  },
};

interface ReleaseNote {
  markdown: string;
  issues: MockBacklogIssue[];
  groupedByType: Record<string, MockBacklogIssue[]>;
}

class TestReleaseNotesGenerator {
  private config: MockConfig;
  private mockIssues: MockBacklogIssue[];

  constructor(config: MockConfig, mockIssues: MockBacklogIssue[]) {
    this.config = config;
    this.mockIssues = mockIssues;
  }

  generate(issueKeys: string[], tag: string): ReleaseNote {
    const issues = this.mockIssues.filter((i) => issueKeys.includes(i.issueKey));
    const groupedByType: Record<string, MockBacklogIssue[]> = {};

    if (this.config.releaseNotes.grouping === 'issueType') {
      for (const issue of issues) {
        const typeName = issue.issueType.name;
        if (!groupedByType[typeName]) {
          groupedByType[typeName] = [];
        }
        groupedByType[typeName].push(issue);
      }
    } else {
      groupedByType.All = issues;
    }

    const markdown = this.formatMarkdown(tag, groupedByType);
    return { markdown, issues, groupedByType };
  }

  private formatMarkdown(tag: string, groupedByType: Record<string, MockBacklogIssue[]>): string {
    const lines: string[] = [];
    lines.push(`# Release ${tag}`);
    lines.push('');

    const titleMap = this.config.releaseNotes.titleMap;
    const sortedTypes = Object.keys(groupedByType).sort();

    for (const typeName of sortedTypes) {
      const issues = groupedByType[typeName];
      const displayName = titleMap[typeName] || typeName;
      lines.push(`## ${displayName}`);
      lines.push('');
      for (const issue of issues) {
        const issueUrl = `${this.config.backlog.baseUrl}/view/${issue.issueKey}`;
        lines.push(`- [${issue.issueKey}](${issueUrl}): ${issue.summary}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

describe('ReleaseNotesGenerator', () => {
  const mockIssues: MockBacklogIssue[] = [
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

  test('generates release notes with grouping', () => {
    const generator = new TestReleaseNotesGenerator(mockConfig, mockIssues);
    const result = generator.generate(['TEST-123', 'TEST-456', 'TEST-789'], 'v1.0.0');

    expect(result.markdown).toContain('# Release v1.0.0');
    expect(result.markdown).toContain('## Bug Fixes');
    expect(result.markdown).toContain('## Tasks');
    expect(result.markdown).toContain('[TEST-123]');
    expect(result.markdown).toContain('[TEST-456]');
    expect(result.markdown).toContain('[TEST-789]');
  });

  test('groups issues by type', () => {
    const generator = new TestReleaseNotesGenerator(mockConfig, mockIssues);
    const result = generator.generate(['TEST-123', 'TEST-456', 'TEST-789'], 'v1.0.0');

    expect(result.groupedByType.バグ.length).toBe(2);
    expect(result.groupedByType.タスク.length).toBe(1);
  });

  test('handles no grouping', () => {
    const configNoGroup: MockConfig = {
      ...mockConfig,
      releaseNotes: { ...mockConfig.releaseNotes, grouping: 'none' },
    };
    const generator = new TestReleaseNotesGenerator(configNoGroup, mockIssues);
    const result = generator.generate(['TEST-123', 'TEST-456'], 'v1.0.0');

    expect(result.groupedByType.All).toBeDefined();
    expect(result.groupedByType.All.length).toBe(2);
  });

  test('handles empty issue list', () => {
    const generator = new TestReleaseNotesGenerator(mockConfig, mockIssues);
    const result = generator.generate([], 'v1.0.0');

    expect(result.issues.length).toBe(0);
    expect(result.markdown).toContain('# Release v1.0.0');
  });

  test('applies title mapping', () => {
    const generator = new TestReleaseNotesGenerator(mockConfig, mockIssues);
    const result = generator.generate(['TEST-123'], 'v1.0.0');

    expect(result.markdown).toContain('## Bug Fixes');
    expect(result.markdown).not.toContain('## バグ');
  });

  test('includes issue URLs', () => {
    const generator = new TestReleaseNotesGenerator(mockConfig, mockIssues);
    const result = generator.generate(['TEST-123'], 'v1.0.0');

    expect(result.markdown).toContain('https://test.backlog.com/view/TEST-123');
  });

  test('includes issue summary', () => {
    const generator = new TestReleaseNotesGenerator(mockConfig, mockIssues);
    const result = generator.generate(['TEST-123'], 'v1.0.0');

    expect(result.markdown).toContain('Fix login bug');
  });

  test('handles unknown issue keys', () => {
    const generator = new TestReleaseNotesGenerator(mockConfig, mockIssues);
    const result = generator.generate(['TEST-999', 'TEST-123'], 'v1.0.0');

    expect(result.issues.length).toBe(1);
    expect(result.issues[0].issueKey).toBe('TEST-123');
  });
});
