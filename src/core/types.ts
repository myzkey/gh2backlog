export type BacklogFlowConfig = {
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
};

export type PullRequestData = {
  title: string;
  body: string;
  branch: string;
  commits: string[];
  number: number;
  merged: boolean;
  mergedAt?: string;
};

export type BacklogIssue = {
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
};

export type BacklogStatus = {
  id: number;
  name: string;
};

export type ExtractionResult = {
  keys: string[];
  sources: Record<string, string[]>;
  primary: string | null;
};

export type TransitionResult = {
  success: string[];
  failed: Array<{ key: string; error: string }>;
};

export type ReleaseNotesOptions = {
  tag: string;
  previousTag?: string;
  pullRequests: PullRequestData[];
};

export type ReleaseNote = {
  markdown: string;
  issues: BacklogIssue[];
  groupedByType: Record<string, BacklogIssue[]>;
};
