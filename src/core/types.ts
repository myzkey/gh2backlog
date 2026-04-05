export interface BacklogFlowConfig {
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
    onMerge: {
      statusId: number;
    };
    onRelease: {
      statusId: number;
    };
  };
  releaseNotes: {
    grouping: 'issueType' | 'none';
    titleMap: Record<string, string>;
  };
  github: {
    release: {
      enabled: boolean;
    };
  };
}

export interface PullRequestData {
  title: string;
  body: string;
  branch: string;
  commits: string[];
  number: number;
  merged: boolean;
  mergedAt?: string;
}

export interface BacklogIssue {
  id: number;
  issueKey: string;
  summary: string;
  issueType: {
    id: number;
    name: string;
  };
  status: {
    id: number;
    name: string;
  };
  description?: string;
}

export interface BacklogStatus {
  id: number;
  name: string;
}

export interface ExtractionResult {
  keys: string[];
  sources: Record<string, string[]>;
  primary: string | null;
}

export interface TransitionResult {
  success: string[];
  failed: Array<{ key: string; error: string }>;
}

export interface ReleaseNotesOptions {
  tag: string;
  previousTag?: string;
  pullRequests: PullRequestData[];
}

export interface ReleaseNote {
  markdown: string;
  issues: BacklogIssue[];
  groupedByType: Record<string, BacklogIssue[]>;
}
