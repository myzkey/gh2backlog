import type { BacklogFlowConfig, ExtractionResult, PullRequestData } from './types';

export class IssueKeyExtractor {
  private pattern: RegExp;
  private sources: Array<'title' | 'body' | 'branch' | 'commits'>;
  private requirePrimary: boolean;
  private projectKey?: string;

  constructor(config: BacklogFlowConfig) {
    this.pattern = new RegExp(config.issueKey.pattern, 'g');
    this.sources = config.issueKey.sources;
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

    return {
      keys: uniqueKeys,
      sources,
      primary,
    };
  }

  extractFromText(text: string): string[] {
    if (!text) return [];

    const matches: string[] = [];

    // Extract from Backlog URLs: https://*.backlog.com/view/KEY-123 or https://*.backlog.jp/view/KEY-123
    const urlPattern = /https?:\/\/[^/]+\.backlog\.(?:com|jp)\/view\/([A-Z_]+-\d+)/g;
    let urlMatch: RegExpExecArray | null;
    while ((urlMatch = urlPattern.exec(text)) !== null) {
      matches.push(urlMatch[1]);
    }

    // Extract from plain text pattern
    this.pattern.lastIndex = 0;
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
      return {
        valid: false,
        error: 'Issue key is required in PR title but not found',
      };
    }

    return { valid: true };
  }
}
