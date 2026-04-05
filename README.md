# backlog-github

GitHubとBacklogを連携するOSSツール。GitHubのPRやリリースイベントをトリガーとして、Backlogの課題ステータス更新およびリリースノート生成を自動化します。

## 特徴

- GitHub PRからBacklog課題キーを自動抽出
- PRマージ時にBacklog課題ステータスを自動更新
- リリース時にBacklogベースのリリースノートを自動生成
- GitHub Releaseへの反映
- 複数リポジトリで再利用可能
- 設定ファイルで挙動をカスタマイズ可能

## インストール

```bash
npm install -g backlog-github
```

## セットアップ

### 1. 設定ファイルの作成

プロジェクトルートに `.backlog-flow.yml` を作成します。

```yaml
backlog:
  baseUrl: https://your-space.backlog.com
  apiKey: your-api-key
  projectKey: YOUR_PROJECT

issueKey:
  pattern: "[A-Z]+-[0-9]+"
  sources: [title, body, branch, commits]
  requirePrimary: false

transition:
  onMerge:
    statusId: 3
  onRelease:
    statusId: 4

releaseNotes:
  grouping: issueType
  titleMap:
    バグ: Bug Fixes
    タスク: Tasks
    要望: Features

github:
  release:
    enabled: true
```

### 2. 環境変数の設定

設定ファイルの代わりに環境変数でも設定可能です。

```bash
export BACKLOG_BASE_URL=https://your-space.backlog.com
export BACKLOG_API_KEY=your-api-key
export BACKLOG_PROJECT_KEY=YOUR_PROJECT
export GITHUB_TOKEN=your-github-token
```

## CLIコマンド

### 課題キー抽出

PRの情報からBacklog課題キーを抽出します。

```bash
backlog-github extract-keys \
  --title "[TEST-123] Fix bug" \
  --body "Related to TEST-456" \
  --branch "feature/TEST-789"
```

オプション:
- `--title` PRタイトル
- `--body` PR本文
- `--branch` ブランチ名
- `--commits` コミットメッセージ（カンマ区切り）
- `--json` JSON形式で出力

### ステータス更新

Backlog課題のステータスを更新します。

```bash
# 課題キーを直接指定
backlog-github transition --keys TEST-123,TEST-456 --on-merge

# PR情報から課題キーを抽出して更新
backlog-github transition \
  --title "[TEST-123] Fix bug" \
  --on-merge
```

オプション:
- `--keys` 課題キー（カンマ区切り）
- `--status-id` ステータスID
- `--title` PRタイトル（キー抽出用）
- `--body` PR本文（キー抽出用）
- `--branch` ブランチ名（キー抽出用）
- `--on-merge` マージ時のステータスを使用
- `--on-release` リリース時のステータスを使用

### リリースノート生成

マージ済みPRからBacklog課題を収集し、リリースノートを生成します。

```bash
backlog-github release-notes \
  --tag v1.0.0 \
  --output release-notes.md
```

オプション:
- `--tag` リリースタグ（必須）
- `--previous-tag` 前回リリースタグ
- `--keys` 課題キー（カンマ区切り）
- `--output` 出力ファイル

### 設定検証

設定ファイルを検証します。

```bash
backlog-github validate-config
```

オプション:
- `--config` 設定ファイルパス

## GitHub Actions

### PRマージ時の課題ステータス更新

`.github/workflows/on-pr-merge.yml`:

```yaml
name: Backlog Issue Transition on PR Merge

on:
  pull_request:
    types: [closed]

jobs:
  transition:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install backlog-github
        run: npm install -g backlog-github

      - name: Run transition
        env:
          BACKLOG_BASE_URL: ${{ secrets.BACKLOG_BASE_URL }}
          BACKLOG_API_KEY: ${{ secrets.BACKLOG_API_KEY }}
          BACKLOG_PROJECT_KEY: ${{ secrets.BACKLOG_PROJECT_KEY }}
        run: |
          backlog-github transition \
            --title "${{ github.event.pull_request.title }}" \
            --body "${{ github.event.pull_request.body }}" \
            --branch "${{ github.event.pull_request.head.ref }}" \
            --on-merge
```

### タグプッシュ時のリリースノート生成

`.github/workflows/on-release.yml`:

```yaml
name: Generate Release Notes on Tag

on:
  push:
    tags:
      - 'v*'

jobs:
  release-notes:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install backlog-github
        run: npm install -g backlog-github

      - name: Extract tag name
        id: tag
        run: echo "TAG_NAME=${GITHUB_REF#refs/tags/}" >> $GITHUB_OUTPUT

      - name: Generate release notes
        env:
          BACKLOG_BASE_URL: ${{ secrets.BACKLOG_BASE_URL }}
          BACKLOG_API_KEY: ${{ secrets.BACKLOG_API_KEY }}
          BACKLOG_PROJECT_KEY: ${{ secrets.BACKLOG_PROJECT_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPOSITORY: ${{ github.repository }}
        run: |
          backlog-github release-notes \
            --tag "${{ steps.tag.outputs.TAG_NAME }}" \
            --output release-notes.md

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          body_path: release-notes.md
          tag_name: ${{ steps.tag.outputs.TAG_NAME }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 設定ファイル詳細

### backlog

| 項目 | 説明 | 必須 |
|------|------|------|
| baseUrl | Backlog APIのURL | Yes |
| apiKey | Backlog APIキー | Yes |
| projectKey | プロジェクトキー | Yes |

### issueKey

| 項目 | 説明 | デフォルト |
|------|------|------------|
| pattern | 課題キーの正規表現 | `[A-Z]+-[0-9]+` |
| sources | 抽出元の優先順位 | `[title, body, branch, commits]` |
| requirePrimary | タイトルに課題キー必須 | `false` |

### transition

| 項目 | 説明 | デフォルト |
|------|------|------------|
| onMerge.statusId | マージ時のステータスID | `3` |
| onRelease.statusId | リリース時のステータスID | `4` |

### releaseNotes

| 項目 | 説明 | デフォルト |
|------|------|------------|
| grouping | グルーピング方法 | `issueType` |
| titleMap | タイトルマッピング | `{}` |

### github

| 項目 | 説明 | デフォルト |
|------|------|------------|
| release.enabled | GitHub Release更新 | `true` |

## 開発

```bash
# 依存関係のインストール
npm install

# ビルド
npm run build

# テスト
npm test
```

## ライセンス

MIT
