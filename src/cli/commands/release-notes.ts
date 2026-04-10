import * as fs from 'node:fs';
import {
  BacklogClient,
  getPullRequestsForRelease,
  IssueKeyExtractor,
  loadConfig,
  ReleaseNotesGenerator,
  updateGitHubReleaseByTag,
  validateConfig,
} from '@/core';

type ReleaseNotesArgs = {
  tag: string;
  previousTag?: string;
  keys?: string[];
  output?: string;
};

export async function releaseNotesCommand(args: ReleaseNotesArgs): Promise<void> {
  const config = loadConfig();
  const errors = validateConfig(config);

  if (errors.length > 0) {
    console.error('Configuration errors:');
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  if (!args.tag) {
    console.error('Error: --tag is required');
    process.exit(1);
  }

  let issueKeys = args.keys || [];

  if (issueKeys.length === 0) {
    const repository = process.env.GITHUB_REPOSITORY;
    if (repository) {
      const [owner, repo] = repository.split('/');
      console.log(`Fetching merged PRs for ${owner}/${repo}...`);

      const prs = await getPullRequestsForRelease(owner, repo, args.tag, args.previousTag);
      const extractor = new IssueKeyExtractor(config);

      for (const pr of prs) {
        const result = extractor.extract(pr);
        issueKeys.push(...result.keys);
      }

      issueKeys = [...new Set(issueKeys)];
      console.log(`Found ${issueKeys.length} unique issue keys from ${prs.length} PRs`);
    }
  }

  if (issueKeys.length === 0) {
    console.log('No issue keys found for release notes');
    return;
  }

  const client = new BacklogClient(config);
  const generator = new ReleaseNotesGenerator(config, client);

  console.log('Generating release notes...');
  const releaseNotes = await generator.generate(issueKeys, args.tag);

  if (args.output) {
    fs.writeFileSync(args.output, releaseNotes.markdown);
    console.log(`Release notes written to ${args.output}`);
  } else {
    console.log(`\n${releaseNotes.markdown}`);
  }

  // GitHub Release本文の更新
  if (config.github.release.enabled) {
    const repository = process.env.GITHUB_REPOSITORY;
    if (repository) {
      const [owner, repo] = repository.split('/');
      try {
        await updateGitHubReleaseByTag(owner, repo, args.tag, releaseNotes.markdown);
        console.log(`GitHub Release updated for ${args.tag}`);
      } catch (error) {
        console.warn(`Warning: Failed to update GitHub Release: ${error}`);
      }
    }
  }
}
