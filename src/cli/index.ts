#!/usr/bin/env node

import { extractKeysCommand } from './commands/extract-keys';
import { releaseNotesCommand } from './commands/release-notes';
import { transitionCommand } from './commands/transition';
import { validateConfigCommand } from './commands/validate-config';

function parseArgs(args: string[]): {
  command: string;
  options: Record<string, string | string[] | boolean>;
} {
  const command = args[0] || 'help';
  const options: Record<string, string | string[] | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      if (!nextArg || nextArg.startsWith('--')) {
        options[key] = true;
      } else if (nextArg.includes(',')) {
        options[key] = nextArg.split(',');
        i++;
      } else {
        options[key] = nextArg;
        i++;
      }
    }
  }

  return { command, options };
}

function printHelp(): void {
  console.log(`
gh2backlog - GitHub と Backlog を連携するツール

Usage:
  gh2backlog <command> [options]

Commands:
  extract-keys    PR情報からBacklog課題キーを抽出
  transition      Backlog課題のステータスを更新
  release-notes   リリースノートを生成
  validate-config 設定ファイルを検証
  help            ヘルプを表示

Options (extract-keys):
  --title <title>      PRタイトル
  --body <body>        PR本文
  --branch <branch>    ブランチ名
  --commits <msgs>     コミットメッセージ(カンマ区切り)
  --json               JSON形式で出力

Options (transition):
  --keys <keys>        課題キー(カンマ区切り)
  --status-id <id>     ステータスID
  --title <title>      PRタイトル(キー抽出用)
  --body <body>        PR本文(キー抽出用)
  --branch <branch>    ブランチ名(キー抽出用)
  --on-merge           マージ時のステータスを使用
  --on-release         リリース時のステータスを使用

Options (release-notes):
  --tag <tag>          リリースタグ
  --previous-tag <tag> 前回リリースタグ
  --keys <keys>        課題キー(カンマ区切り)
  --output <file>      出力ファイル

Options (validate-config):
  --config <path>      設定ファイルパス

Environment Variables:
  BACKLOG_BASE_URL     Backlog API URL
  BACKLOG_API_KEY      Backlog API キー
  BACKLOG_PROJECT_KEY  Backlog プロジェクトキー
  GITHUB_TOKEN         GitHub トークン
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, options } = parseArgs(args);

  try {
    switch (command) {
      case 'extract-keys':
        await extractKeysCommand({
          title: options.title as string,
          body: options.body as string,
          branch: options.branch as string,
          commits: options.commits as string[],
          json: options.json as boolean,
        });
        break;

      case 'transition':
        await transitionCommand({
          keys: options.keys as string[],
          statusId: options['status-id'] ? parseInt(options['status-id'] as string, 10) : undefined,
          title: options.title as string,
          body: options.body as string,
          branch: options.branch as string,
          onMerge: options['on-merge'] as boolean,
          onRelease: options['on-release'] as boolean,
        });
        break;

      case 'release-notes':
        await releaseNotesCommand({
          tag: options.tag as string,
          previousTag: options['previous-tag'] as string,
          keys: options.keys as string[],
          output: options.output as string,
        });
        break;

      case 'validate-config':
        await validateConfigCommand({
          config: options.config as string,
        });
        break;
      default:
        printHelp();
        break;
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
