import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as https from 'node:https';
import type { PullRequestData } from './types';

export interface GitHubContext {
  eventName: string;
  payload: Record<string, unknown>;
  sha: string;
  ref: string;
  repository: string;
  owner: string;
  repo: string;
}

export function parseGitHubContext(): GitHubContext | null {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const eventName = process.env.GITHUB_EVENT_NAME;
  const repository = process.env.GITHUB_REPOSITORY;

  if (!eventPath || !eventName || !repository) {
    return null;
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(fs.readFileSync(eventPath, 'utf-8'));
  } catch {
    return null;
  }

  const [owner, repo] = repository.split('/');

  return {
    eventName,
    payload,
    sha: process.env.GITHUB_SHA || '',
    ref: process.env.GITHUB_REF || '',
    repository,
    owner,
    repo,
  };
}

export function extractPullRequestData(payload: Record<string, unknown>): PullRequestData | null {
  const pr = payload.pull_request as Record<string, unknown> | undefined;

  if (!pr) {
    return null;
  }

  const head = pr.head as Record<string, unknown> | undefined;
  const commits = (payload.commits as Array<Record<string, unknown>>) || [];

  return {
    title: (pr.title as string) || '',
    body: (pr.body as string) || '',
    branch: (head?.ref as string) || '',
    commits: commits.map((c) => (c.message as string) || ''),
    number: (pr.number as number) || 0,
    merged: (pr.merged as boolean) || false,
    mergedAt: (pr.merged_at as string) || undefined,
  };
}

export function extractTagFromRef(ref: string): string | null {
  const match = ref.match(/^refs\/tags\/(.+)$/);
  return match ? match[1] : null;
}

async function fetchGitHub(url: string, token: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);

    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'backlog-github',
      },
    };

    const req = https.request(options, (res: http.IncomingMessage) => {
      let data = '';

      res.on('data', (chunk: Buffer) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

export async function getPullRequestsForRelease(
  owner: string,
  repo: string,
  _currentTag: string,
  _previousTag?: string,
): Promise<PullRequestData[]> {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error('GITHUB_TOKEN is required');
  }

  const mergedPRs: PullRequestData[] = [];

  let page = 1;
  const perPage = 100;
  let hasMore = true;

  while (hasMore) {
    const response = await fetchGitHub(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${perPage}&page=${page}`,
      token,
    );

    if (!Array.isArray(response) || response.length === 0) {
      hasMore = false;
      break;
    }

    for (const pr of response) {
      if (!pr.merged_at) continue;

      const prData: PullRequestData = {
        title: pr.title || '',
        body: pr.body || '',
        branch: pr.head?.ref || '',
        commits: [],
        number: pr.number || 0,
        merged: true,
        mergedAt: pr.merged_at,
      };

      mergedPRs.push(prData);
    }

    if (response.length < perPage) {
      hasMore = false;
    } else {
      page++;
    }

    if (mergedPRs.length >= 500) {
      hasMore = false;
    }
  }

  return mergedPRs;
}

export async function updateGitHubRelease(
  owner: string,
  repo: string,
  releaseId: number,
  body: string,
): Promise<void> {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error('GITHUB_TOKEN is required');
  }

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ body });

    const options: https.RequestOptions = {
      hostname: 'api.github.com',
      path: `/repos/${owner}/${repo}/releases/${releaseId}`,
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'backlog-github',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res: http.IncomingMessage) => {
      let data = '';

      res.on('data', (chunk: Buffer) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Failed to update release: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}
