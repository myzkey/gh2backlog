import type { BacklogClient } from './backlog-client';
import type { BacklogFlowConfig, BacklogIssue, ReleaseNote } from './types';

export class ReleaseNotesGenerator {
  private config: BacklogFlowConfig;
  private client: BacklogClient;

  constructor(config: BacklogFlowConfig, client: BacklogClient) {
    this.config = config;
    this.client = client;
  }

  async generate(issueKeys: string[], tag: string): Promise<ReleaseNote> {
    const uniqueKeys = [...new Set(issueKeys)];
    const issues = await this.client.getIssues(uniqueKeys);

    const groupedByType: Record<string, BacklogIssue[]> = {};

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

    return {
      markdown,
      issues,
      groupedByType,
    };
  }

  private formatMarkdown(tag: string, groupedByType: Record<string, BacklogIssue[]>): string {
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
