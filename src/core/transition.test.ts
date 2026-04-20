import { describe, expect, test } from 'bun:test';
import type { BacklogClient } from './backlog-client';
import { IssueTransitioner } from './transition';
import type { BacklogIssue } from './types';

const createMockIssue = (key: string): BacklogIssue => ({
  id: 1,
  issueKey: key,
  summary: 'Test issue',
  issueType: { id: 1, name: 'タスク' },
  status: { id: 3, name: '処理済み' },
});

const createMockClient = (options?: {
  failKeys?: string[];
  failCommentKeys?: string[];
  updateDelay?: number;
  onAddComment?: (issueKey: string, content: string) => void;
}): BacklogClient => {
  const { failKeys = [], failCommentKeys = [], updateDelay = 0, onAddComment } = options || {};

  return {
    updateIssueStatus: async (issueKey: string, _statusId: number) => {
      if (updateDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, updateDelay));
      }

      if (failKeys.includes(issueKey)) {
        throw new Error(`Failed to update ${issueKey}`);
      }

      return createMockIssue(issueKey);
    },
    addComment: async (issueKey: string, content: string) => {
      if (failCommentKeys.includes(issueKey)) {
        throw new Error(`Failed to add comment to ${issueKey}`);
      }
      onAddComment?.(issueKey, content);
    },
  } as unknown as BacklogClient;
};

describe('IssueTransitioner', () => {
  test('transitions single issue', async () => {
    const transitioner = new IssueTransitioner(createMockClient());
    const result = await transitioner.transition(['TEST-123'], 3);

    expect(result.success).toEqual(['TEST-123']);
    expect(result.failed).toEqual([]);
  });

  test('transitions multiple issues', async () => {
    const transitioner = new IssueTransitioner(createMockClient());
    const result = await transitioner.transition(['TEST-123', 'TEST-456', 'TEST-789'], 3);

    expect(result.success.sort()).toEqual(['TEST-123', 'TEST-456', 'TEST-789']);
    expect(result.failed).toEqual([]);
  });

  test('handles partial failure', async () => {
    const transitioner = new IssueTransitioner(
      createMockClient({
        failKeys: ['TEST-456'],
      }),
    );
    const result = await transitioner.transition(['TEST-123', 'TEST-456', 'TEST-789'], 3);

    expect(result.success.sort()).toEqual(['TEST-123', 'TEST-789']);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0].key).toBe('TEST-456');
    expect(result.failed[0].error).toContain('Failed to update');
  });

  test('handles all failures', async () => {
    const transitioner = new IssueTransitioner(
      createMockClient({
        failKeys: ['TEST-123', 'TEST-456'],
      }),
    );
    const result = await transitioner.transition(['TEST-123', 'TEST-456'], 3);

    expect(result.success).toEqual([]);
    expect(result.failed.length).toBe(2);
  });

  test('handles empty key list', async () => {
    const transitioner = new IssueTransitioner(createMockClient());
    const result = await transitioner.transition([], 3);

    expect(result.success).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  test('captures error messages', async () => {
    const transitioner = new IssueTransitioner(
      createMockClient({
        failKeys: ['TEST-123'],
      }),
    );
    const result = await transitioner.transition(['TEST-123'], 3);

    expect(result.failed[0].error).toBeTruthy();
    expect(typeof result.failed[0].error).toBe('string');
  });

  test('adds comment when provided', async () => {
    const comments: Array<{ key: string; content: string }> = [];
    const transitioner = new IssueTransitioner(
      createMockClient({
        onAddComment: (key, content) => comments.push({ key, content }),
      }),
    );
    const result = await transitioner.transition(['TEST-123'], 3, 'PR: https://example.com');

    expect(result.success).toEqual(['TEST-123']);
    expect(comments).toEqual([{ key: 'TEST-123', content: 'PR: https://example.com' }]);
  });

  test('adds comment to multiple issues', async () => {
    const comments: Array<{ key: string; content: string }> = [];
    const transitioner = new IssueTransitioner(
      createMockClient({
        onAddComment: (key, content) => comments.push({ key, content }),
      }),
    );
    const result = await transitioner.transition(['TEST-123', 'TEST-456'], 3, 'Merged to main');

    expect(result.success.sort()).toEqual(['TEST-123', 'TEST-456']);
    expect(comments.length).toBe(2);
    expect(comments.every((c) => c.content === 'Merged to main')).toBe(true);
  });

  test('does not add comment when not provided', async () => {
    const comments: Array<{ key: string; content: string }> = [];
    const transitioner = new IssueTransitioner(
      createMockClient({
        onAddComment: (key, content) => comments.push({ key, content }),
      }),
    );
    const result = await transitioner.transition(['TEST-123'], 3);

    expect(result.success).toEqual(['TEST-123']);
    expect(comments).toEqual([]);
  });

  test('handles comment failure', async () => {
    const transitioner = new IssueTransitioner(
      createMockClient({
        failCommentKeys: ['TEST-123'],
      }),
    );
    const result = await transitioner.transition(['TEST-123'], 3, 'Comment');

    expect(result.success).toEqual([]);
    expect(result.failed.length).toBe(1);
    expect(result.failed[0].error).toContain('Failed to add comment');
  });
});
