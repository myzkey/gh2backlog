import * as fs from 'node:fs';
import {
  BacklogClient,
  extractPullRequestData,
  extractTagFromRef,
  getPullRequestsForRelease,
  IssueKeyExtractor,
  IssueTransitioner,
  loadConfig,
  parseGitHubContext,
  ReleaseNotesGenerator,
  updateGitHubRelease,
  validateConfig,
} from '../core';

function setOutput(name: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;

  if (outputFile) {
    fs.appendFileSync(outputFile, `${name}=${value}\n`);
  }

  console.log(`::set-output name=${name}::${value}`);
}

function setFailed(message: string): void {
  console.error(`::error::${message}`);
  process.exit(1);
}

async function handlePullRequestMerge(): Promise<void> {
  const context = parseGitHubContext();
  if (!context) {
    setFailed('Failed to parse GitHub context');
    return;
  }

  const prData = extractPullRequestData(context.payload);
  if (!prData) {
    setFailed('Failed to extract PR data');
    return;
  }

  if (!prData.merged) {
    console.log('PR was not merged, skipping');
    return;
  }

  const config = loadConfig();
  const errors = validateConfig(config);
  if (errors.length > 0) {
    setFailed(`Configuration errors: ${errors.join(', ')}`);
    return;
  }

  const extractor = new IssueKeyExtractor(config);
  const extractionResult = extractor.extract(prData);
  const validation = extractor.validate(extractionResult);

  if (!validation.valid) {
    setFailed(validation.error || 'Validation failed');
    return;
  }

  if (extractionResult.keys.length === 0) {
    console.log('No issue keys found in PR');
    setOutput('keys', '');
    return;
  }

  console.log(`Found issue keys: ${extractionResult.keys.join(', ')}`);
  setOutput('keys', extractionResult.keys.join(','));

  const client = new BacklogClient(config);
  const transitioner = new IssueTransitioner(client);
  const statusId = config.transition.onMerge.statusId;

  console.log(`Transitioning issues to status ${statusId}...`);
  const result = await transitioner.transition(extractionResult.keys, statusId);

  setOutput('success', result.success.join(','));
  setOutput('failed', result.failed.map((f) => f.key).join(','));

  if (result.success.length > 0) {
    console.log(`Successfully updated: ${result.success.join(', ')}`);
  }

  if (result.failed.length > 0) {
    const failedDetails = result.failed.map((f) => `${f.key}: ${f.error}`).join('; ');
    setFailed(`Failed to update some issues: ${failedDetails}`);
  }
}

async function handleRelease(): Promise<void> {
  const context = parseGitHubContext();
  if (!context) {
    setFailed('Failed to parse GitHub context');
    return;
  }

  const tag = extractTagFromRef(context.ref);
  if (!tag) {
    setFailed('Could not extract tag from ref');
    return;
  }

  console.log(`Processing release for tag: ${tag}`);

  const config = loadConfig();
  const errors = validateConfig(config);
  if (errors.length > 0) {
    setFailed(`Configuration errors: ${errors.join(', ')}`);
    return;
  }

  console.log('Fetching merged PRs...');
  const prs = await getPullRequestsForRelease(context.owner, context.repo, tag);

  const extractor = new IssueKeyExtractor(config);
  const allKeys: string[] = [];

  for (const pr of prs) {
    const result = extractor.extract(pr);
    allKeys.push(...result.keys);
  }

  const uniqueKeys = [...new Set(allKeys)];
  console.log(`Found ${uniqueKeys.length} unique issue keys from ${prs.length} PRs`);

  if (uniqueKeys.length === 0) {
    console.log('No issue keys found');
    setOutput('keys', '');
    setOutput('release_notes', '');
    return;
  }

  setOutput('keys', uniqueKeys.join(','));

  const client = new BacklogClient(config);
  const generator = new ReleaseNotesGenerator(config, client);

  console.log('Generating release notes...');
  const releaseNotes = await generator.generate(uniqueKeys, tag);

  setOutput('release_notes', releaseNotes.markdown);

  if (config.github.release.enabled) {
    const release = context.payload.release as Record<string, unknown> | undefined;
    if (release?.id) {
      console.log('Updating GitHub release...');
      await updateGitHubRelease(
        context.owner,
        context.repo,
        release.id as number,
        releaseNotes.markdown,
      );
      console.log('GitHub release updated');
    }
  }

  const transitioner = new IssueTransitioner(client);
  const statusId = config.transition.onRelease.statusId;

  console.log(`Transitioning issues to status ${statusId}...`);
  const result = await transitioner.transition(uniqueKeys, statusId);

  if (result.success.length > 0) {
    console.log(`Successfully updated: ${result.success.join(', ')}`);
  }

  if (result.failed.length > 0) {
    console.warn(`Failed to update: ${result.failed.map((f) => f.key).join(', ')}`);
  }
}

async function main(): Promise<void> {
  const context = parseGitHubContext();

  if (!context) {
    setFailed('Not running in GitHub Actions environment');
    return;
  }

  console.log(`Event: ${context.eventName}`);

  try {
    switch (context.eventName) {
      case 'pull_request':
        await handlePullRequestMerge();
        break;

      case 'release':
      case 'push':
        if (context.ref.startsWith('refs/tags/')) {
          await handleRelease();
        } else {
          console.log('Not a tag push, skipping');
        }
        break;

      default:
        console.log(`Unsupported event: ${context.eventName}`);
        break;
    }
  } catch (error) {
    setFailed(error instanceof Error ? error.message : String(error));
  }
}

main();
