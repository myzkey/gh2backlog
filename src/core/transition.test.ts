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
  updateDelay?: number;
}): BacklogClient => {
  const { failKeys = [], updateDelay = 0 } = options || {};

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
});
