import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as https from 'node:https';
import type { PullRequestData } from './types';

export type GitHubContext = {
  eventName: string;
  payload: Record<string, unknown>;
  sha: string;
  ref: string;
  repository: string;
  owner: string;
  repo: string;
};

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

async function fetchGitHub<T = unknown>(url: string, token: string): Promise<T> {
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
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data) as T);
          } catch {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        } else {
          reject(new Error(`GitHub API error: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

type GitHubTag = {
  name: string;
  commit: {
    sha: string;
  };
};

type GitHubCommit = {
  sha: string;
  commit: {
    committer: {
      date: string;
    };
  };
};

type GitHubPR = {
  number: number;
  title: string;
  body: string | null;
  merged_at: string | null;
  base: {
    ref: string;
  };
  head: {
    ref: string;
  };
};

type GitHubRepo = {
  default_branch: string;
};

/**
 * 前回タグ以降にdefault branchにマージされたPRを取得
 *
 * 仕様:
 * - 対象: default branch (通常はmain/master) にマージされたPR
 * - 範囲: previousTag以降〜currentTagまで (previousTagがなければ全て)
 * - マージ日時でフィルタリング
 */
export async function getPullRequestsForRelease(
  owner: string,
  repo: string,
  currentTag: string,
  previousTag?: string,
): Promise<PullRequestData[]> {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error('GITHUB_TOKEN is required');
  }

  // リポジトリのdefault branchを取得
  const repoInfo = await fetchGitHub<GitHubRepo>(
    `https://api.github.com/repos/${owner}/${repo}`,
    token,
  );
  const defaultBranch = repoInfo.default_branch;

  // 現在タグの日時を取得
  const currentTagDate = await getTagDate(owner, repo, currentTag, token);

  // 前回タグの日時を取得 (指定がなければnull)
  let previousTagDate: string | null = null;
  if (previousTag) {
    previousTagDate = await getTagDate(owner, repo, previousTag, token);
  } else {
    // 前回タグが指定されていない場合、最新の前のタグを探す
    const latestPreviousTag = await findPreviousTag(owner, repo, currentTag, token);
    if (latestPreviousTag) {
      previousTagDate = await getTagDate(owner, repo, latestPreviousTag, token);
      console.log(`Auto-detected previous tag: ${latestPreviousTag}`);
    }
  }

  console.log(`Fetching PRs merged to ${defaultBranch}`);
  console.log(`  From: ${previousTagDate || '(beginning)'}`);
  console.log(`  To: ${currentTagDate}`);

  // マージ済みPRを取得
  const mergedPRs: PullRequestData[] = [];
  let page = 1;
  const perPage = 100;
  let hasMore = true;

  while (hasMore) {
    const prs = await fetchGitHub<GitHubPR[]>(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&base=${defaultBranch}&sort=updated&direction=desc&per_page=${perPage}&page=${page}`,
      token,
    );

    if (!Array.isArray(prs) || prs.length === 0) {
      hasMore = false;
      break;
    }

    for (const pr of prs) {
      // マージされていないPRはスキップ
      if (!pr.merged_at) continue;

      const mergedAt = new Date(pr.merged_at);

      // 現在タグより後のマージはスキップ
      if (currentTagDate && mergedAt > new Date(currentTagDate)) {
        continue;
      }

      // 前回タグより前のマージはスキップ (これ以降は古いPRなので終了)
      if (previousTagDate && mergedAt <= new Date(previousTagDate)) {
        hasMore = false;
        break;
      }

      mergedPRs.push({
        title: pr.title || '',
        body: pr.body || '',
        branch: pr.head?.ref || '',
        commits: [],
        number: pr.number || 0,
        merged: true,
        mergedAt: pr.merged_at,
      });
    }

    if (prs.length < perPage) {
      hasMore = false;
    } else {
      page++;
    }

    // 安全のため上限を設定
    if (mergedPRs.length >= 500) {
      console.warn('Warning: PR limit (500) reached');
      hasMore = false;
    }
  }

  console.log(`Found ${mergedPRs.length} PRs in range`);

  return mergedPRs;
}

/**
 * タグの日時を取得
 */
async function getTagDate(
  owner: string,
  repo: string,
  tag: string,
  token: string,
): Promise<string> {
  try {
    // タグの参照を取得
    const tagRef = await fetchGitHub<{ object: { sha: string; type: string } }>(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/tags/${tag}`,
      token,
    );

    let commitSha = tagRef.object.sha;

    // annotated tagの場合、実際のcommitを取得
    if (tagRef.object.type === 'tag') {
      const tagObj = await fetchGitHub<{ object: { sha: string } }>(
        `https://api.github.com/repos/${owner}/${repo}/git/tags/${tagRef.object.sha}`,
        token,
      );
      commitSha = tagObj.object.sha;
    }

    // コミットの日時を取得
    const commit = await fetchGitHub<GitHubCommit>(
      `https://api.github.com/repos/${owner}/${repo}/commits/${commitSha}`,
      token,
    );

    return commit.commit.committer.date;
  } catch (error) {
    throw new Error(`Failed to get date for tag ${tag}: ${error}`);
  }
}

/**
 * 現在タグの直前のタグを取得
 *
 * 仕様:
 * - git tag --sort=-creatordate 相当で全タグを日付降順に並べる
 * - 現在タグを除いた直近1件を前回タグとする
 * - 取得できなければ初回リリース扱い
 */
async function findPreviousTag(
  owner: string,
  repo: string,
  currentTag: string,
  token: string,
): Promise<string | null> {
  try {
    const tags = await fetchGitHub<GitHubTag[]>(
      `https://api.github.com/repos/${owner}/${repo}/tags?per_page=100`,
      token,
    );

    // 各タグの日時を取得してソート
    const tagsWithDates: Array<{ name: string; date: string }> = [];
    for (const tag of tags) {
      try {
        const date = await getTagDate(owner, repo, tag.name, token);
        tagsWithDates.push({ name: tag.name, date });
      } catch {
        // 日時取得に失敗したタグはスキップ
      }
    }

    // 日時降順でソート（新しい順）
    tagsWithDates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // 現在タグのインデックスを探す
    const currentIndex = tagsWithDates.findIndex((t) => t.name === currentTag);

    if (currentIndex === -1 || currentIndex >= tagsWithDates.length - 1) {
      return null;
    }

    // 次のタグ(古い方)を返す
    return tagsWithDates[currentIndex + 1].name;
  } catch {
    return null;
  }
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

type GitHubRelease = {
  id: number;
  tag_name: string;
};

/**
 * タグ名からGitHub Releaseを検索して本文を更新
 */
export async function updateGitHubReleaseByTag(
  owner: string,
  repo: string,
  tag: string,
  body: string,
): Promise<void> {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    throw new Error('GITHUB_TOKEN is required');
  }

  // タグに対応するリリースを取得
  const release = await fetchGitHub<GitHubRelease>(
    `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`,
    token,
  );

  // リリース本文を更新
  await updateGitHubRelease(owner, repo, release.id, body);
}
