import { IssueKeyExtractor, loadConfig, type PullRequestData } from '../../core';

interface ExtractKeysArgs {
  title?: string;
  body?: string;
  branch?: string;
  commits?: string[];
  json?: boolean;
}

export async function extractKeysCommand(args: ExtractKeysArgs): Promise<void> {
  const config = loadConfig();

  const extractor = new IssueKeyExtractor(config);

  const prData: PullRequestData = {
    title: args.title || '',
    body: args.body || '',
    branch: args.branch || '',
    commits: args.commits || [],
    number: 0,
    merged: false,
  };

  const result = extractor.extract(prData);
  const validation = extractor.validate(result);

  if (args.json) {
    console.log(JSON.stringify({ ...result, validation }, null, 2));
  } else {
    if (result.keys.length === 0) {
      console.log('No issue keys found');
    } else {
      console.log('Found issue keys:');
      for (const key of result.keys) {
        const isPrimary = key === result.primary ? ' (primary)' : '';
        console.log(`  - ${key}${isPrimary}`);
      }

      console.log('\nSources:');
      for (const [source, keys] of Object.entries(result.sources)) {
        console.log(`  ${source}: ${keys.join(', ')}`);
      }
    }

    if (!validation.valid) {
      console.error(`\nValidation error: ${validation.error}`);
      process.exit(1);
    }
  }
}
