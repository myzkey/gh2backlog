import * as http from 'node:http';
import * as https from 'node:https';
import type { BacklogFlowConfig, BacklogIssue, BacklogStatus } from './types';

type RequestOptions = {
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  body?: Record<string, unknown>;
};

export class BacklogClient {
  private baseUrl: string;
  private apiKey: string;
  private maxRetries: number;

  constructor(config: BacklogFlowConfig, maxRetries = 3) {
    this.baseUrl = config.backlog.baseUrl.replace(/\/$/, '');
    this.apiKey = config.backlog.apiKey;
    this.maxRetries = maxRetries;
  }

  private async request<T>(options: RequestOptions, retryCount = 0): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/v2${options.path}`);
    url.searchParams.append('apiKey', this.apiKey);

    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    const requestOptions: https.RequestOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };

    return new Promise((resolve, reject) => {
      const req = httpModule.request(requestOptions, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data) as T);
            } catch {
              resolve(data as unknown as T);
            }
          } else if (res.statusCode === 429 && retryCount < this.maxRetries) {
            const delay = 2 ** retryCount * 1000;
            setTimeout(() => {
              this.request<T>(options, retryCount + 1)
                .then(resolve)
                .catch(reject);
            }, delay);
          } else {
            reject(new Error(`API request failed: ${res.statusCode} - ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        if (retryCount < this.maxRetries) {
          const delay = 2 ** retryCount * 1000;
          setTimeout(() => {
            this.request<T>(options, retryCount + 1)
              .then(resolve)
              .catch(reject);
          }, delay);
        } else {
          reject(error);
        }
      });

      if (options.body && (options.method === 'POST' || options.method === 'PATCH')) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(options.body)) {
          if (value !== undefined && value !== null) {
            params.append(key, String(value));
          }
        }
        req.write(params.toString());
      }

      req.end();
    });
  }

  async getIssue(issueKey: string): Promise<BacklogIssue> {
    return this.request<BacklogIssue>({
      method: 'GET',
      path: `/issues/${issueKey}`,
    });
  }

  async getIssues(issueKeys: string[]): Promise<BacklogIssue[]> {
    const results: BacklogIssue[] = [];

    for (const key of issueKeys) {
      try {
        const issue = await this.getIssue(key);
        results.push(issue);
      } catch (error) {
        console.error(`Failed to fetch issue ${key}:`, error);
      }
    }

    return results;
  }

  async updateIssueStatus(issueKey: string, statusId: number): Promise<BacklogIssue> {
    return this.request<BacklogIssue>({
      method: 'PATCH',
      path: `/issues/${issueKey}`,
      body: { statusId },
    });
  }

  async getStatuses(projectKey: string): Promise<BacklogStatus[]> {
    return this.request<BacklogStatus[]>({
      method: 'GET',
      path: `/projects/${projectKey}/statuses`,
    });
  }
}
