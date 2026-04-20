import type { BacklogClient } from './backlog-client';
import type { TransitionResult } from './types';

export class IssueTransitioner {
  private client: BacklogClient;

  constructor(client: BacklogClient) {
    this.client = client;
  }

  async transition(
    issueKeys: string[],
    statusId: number,
    comment?: string,
  ): Promise<TransitionResult> {
    const result: TransitionResult = {
      success: [],
      failed: [],
    };

    for (const key of issueKeys) {
      try {
        await this.client.updateIssueStatus(key, statusId);
        if (comment) {
          await this.client.addComment(key, comment);
        }
        result.success.push(key);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.failed.push({ key, error: errorMessage });
      }
    }

    return result;
  }
}
