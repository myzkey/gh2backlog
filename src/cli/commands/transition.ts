import {
  BacklogClient,
  IssueKeyExtractor,
  IssueTransitioner,
  loadConfig,
  type PullRequestData,
  validateConfig,
} from '../../core';

type TransitionArgs = {
  keys?: string[];
  statusId?: number;
  title?: string;
  body?: string;
  branch?: string;
  onMerge?: boolean;
  onRelease?: boolean;
  comment?: string;
};

export async function transitionCommand(args: TransitionArgs): Promise<void> {
  const config = loadConfig();
  const errors = validateConfig(config);

  if (errors.length > 0) {
    console.error('Configuration errors:');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  let issueKeys: string[] = [];
  if (args.keys) {
    issueKeys = Array.isArray(args.keys) ? args.keys : [args.keys];
  }

  if (issueKeys.length === 0 && (args.title || args.body || args.branch)) {
    const extractor = new IssueKeyExtractor(config);
    const prData: PullRequestData = {
      title: args.title || '',
      body: args.body || '',
      branch: args.branch || '',
      commits: [],
      number: 0,
      merged: false,
    };

    const result = extractor.extract(prData);

    // requirePrimary チェック
    const validation = extractor.validate(result);
    if (!validation.valid) {
      console.error(`Error: ${validation.error}`);
      process.exit(1);
    }

    issueKeys = result.keys;
  }

  if (issueKeys.length === 0) {
    console.warn('Warning: No issue keys to transition');
    return;
  }

  let statusId = args.statusId;
  if (!statusId) {
    if (args.onRelease) {
      statusId = config.transition.onRelease.statusId;
    } else {
      statusId = config.transition.onMerge.statusId;
    }
  }

  console.log(`Transitioning ${issueKeys.length} issues to status ${statusId}...`);
  if (args.comment) {
    console.log(`Adding comment: ${args.comment}`);
  }

  const client = new BacklogClient(config);
  const transitioner = new IssueTransitioner(client);
  const result = await transitioner.transition(issueKeys, statusId, args.comment);

  if (result.success.length > 0) {
    console.log(`\nSuccessfully updated:`);
    for (const key of result.success) {
      console.log(`  - ${key}`);
    }
  }

  if (result.failed.length > 0) {
    console.error(`\nFailed to update:`);
    for (const { key, error } of result.failed) {
      console.error(`  - ${key}: ${error}`);
    }
    process.exit(1);
  }

  console.log('\nTransition complete');
}
