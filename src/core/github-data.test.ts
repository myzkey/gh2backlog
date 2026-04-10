import { describe, expect, test } from 'bun:test';
import { extractPullRequestData, extractTagFromRef } from './github-data';

describe('extractTagFromRef', () => {
  test('extracts tag from refs/tags/ prefix', () => {
    const tag = extractTagFromRef('refs/tags/v1.0.0');
    expect(tag).toBe('v1.0.0');
  });

  test('handles complex tag names', () => {
    const tag = extractTagFromRef('refs/tags/release-2024.01.15');
    expect(tag).toBe('release-2024.01.15');
  });

  test('handles tags with slashes', () => {
    const tag = extractTagFromRef('refs/tags/v1/beta/1');
    expect(tag).toBe('v1/beta/1');
  });

  test('returns null for non-tag refs', () => {
    const tag = extractTagFromRef('refs/heads/main');
    expect(tag).toBeNull();
  });

  test('returns null for invalid refs', () => {
    const tag = extractTagFromRef('v1.0.0');
    expect(tag).toBeNull();
  });

  test('returns null for empty string', () => {
    const tag = extractTagFromRef('');
    expect(tag).toBeNull();
  });
});

describe('extractPullRequestData', () => {
  test('extracts PR data from payload', () => {
    const payload = {
      pull_request: {
        title: '[TEST-123] Fix bug',
        body: 'Description here',
        number: 42,
        merged: true,
        merged_at: '2024-01-15T10:00:00Z',
        head: {
          ref: 'feature/test-branch',
        },
      },
      commits: [{ message: 'Initial commit' }, { message: 'Fix issue' }],
    };

    const result = extractPullRequestData(payload);

    expect(result).not.toBeNull();
    expect(result?.title).toBe('[TEST-123] Fix bug');
    expect(result?.body).toBe('Description here');
    expect(result?.number).toBe(42);
    expect(result?.merged).toBe(true);
    expect(result?.mergedAt).toBe('2024-01-15T10:00:00Z');
    expect(result?.branch).toBe('feature/test-branch');
    expect(result?.commits).toEqual(['Initial commit', 'Fix issue']);
  });

  test('returns null when no pull_request in payload', () => {
    const payload = {
      action: 'push',
    };

    const result = extractPullRequestData(payload);
    expect(result).toBeNull();
  });

  test('handles missing optional fields', () => {
    const payload = {
      pull_request: {
        title: 'Fix bug',
        body: null,
        number: 1,
        merged: false,
        merged_at: null,
        head: {},
      },
    };

    const result = extractPullRequestData(payload);

    expect(result).not.toBeNull();
    expect(result?.title).toBe('Fix bug');
    expect(result?.body).toBe('');
    expect(result?.merged).toBe(false);
    expect(result?.mergedAt).toBeUndefined();
    expect(result?.branch).toBe('');
    expect(result?.commits).toEqual([]);
  });

  test('handles empty commits array', () => {
    const payload = {
      pull_request: {
        title: 'Fix bug',
        body: '',
        number: 1,
        merged: false,
        head: { ref: 'main' },
      },
    };

    const result = extractPullRequestData(payload);
    expect(result?.commits).toEqual([]);
  });

  test('extracts commit messages correctly', () => {
    const payload = {
      pull_request: {
        title: 'Fix bug',
        body: '',
        number: 1,
        merged: false,
        head: { ref: 'main' },
      },
      commits: [
        { message: 'TEST-123 First commit' },
        { message: 'TEST-456 Second commit' },
        { message: '' },
      ],
    };

    const result = extractPullRequestData(payload);
    expect(result?.commits).toEqual(['TEST-123 First commit', 'TEST-456 Second commit', '']);
  });
});
