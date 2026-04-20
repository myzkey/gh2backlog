# gh2backlog

[English](./README.md)

GitHubとBacklogを連携するCLIツール。PRマージ時の課題ステータス更新、リリース時のリリースノート自動生成を実現。

## 特徴

- 外部依存ゼロ（Node.js標準モジュールのみ）
- Node.js 22+ で動作
- npm / npx でそのまま使用可能
- GitHub Actions対応

## インストール

```bash
npm install -g gh2backlog
```

または npx で直接実行:

```bash
npx gh2backlog --help
```

## セットアップ

### 1. 設定ファイルの作成

プロジェクトルートに `.gh2backlog.yml` を作成:

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
    statusId: 3   # 処理済み
  onRelease:
    statusId: 4   # 完了

releaseNotes:
  grouping: issueType
  titleMap:
    バグ: Bug Fixes
    タスク: Tasks

github:
  release:
    enabled: true
```

### 2. 環境変数（設定ファイルより優先）

```bash
export BACKLOG_BASE_URL=https://your-space.backlog.com
export BACKLOG_API_KEY=your-api-key
export BACKLOG_PROJECT_KEY=YOUR_PROJECT
export GITHUB_TOKEN=your-github-token
```

## 仕様

### 課題キー抽出

| 抽出元 | 役割 | 説明 |
|--------|------|------|
| PRタイトル | **primary（正）** | ここにあるキーが代表 |
| PR本文 | 補助 | 関連課題の補足 |
| ブランチ名 | 補助 | `feature/TEST-123` など |
| コミット | 補助 | コミットメッセージ |

- **sources の許可値**: `title`, `body`, `branch`, `commits` の4つのみ（他の値はエラー）
- 全ソースから抽出して重複排除
- `requirePrimary: true` でタイトル必須化

#### プロジェクトキーによるフィルタリング

- `projectKey` に一致する課題キーのみ採用（例: `projectKey: TEST` → `TEST-123` は採用、`ABC-999` は除外）
- 他プロジェクトのキーは無視（warning等なし）
- 複数プロジェクト対応は将来 `projectKeys` で拡張予定

### リリースノート対象PR

- **対象ブランチ**: default branch（main/master）へのマージ
- **対象範囲**: 前回タグ〜今回タグの間にマージされたPR
- 課題キーは重複排除

#### 前回タグの自動検出

- `git tag --sort=-creatordate` 相当で全タグを日付降順に並べる
- 現在タグを除いた直近1件を前回タグとする
- 取得できなければ初回リリース扱い（リポジトリ作成時点から収集）
- `--previous-tag` で明示指定も可能

### 終了コード

| 状況 | 終了コード | 備考 |
|------|------------|------|
| `requirePrimary: true` かつ title にキーなし | 1 | エラー終了 |
| 抽出結果が0件 | 0 | warning出力のみ |
| 一部の課題更新に失敗 | 1 | エラー終了 |
| 全て成功 | 0 | - |

## CLIコマンド

### extract-keys

PRからBacklog課題キーを抽出:

```bash
gh2backlog extract-keys \
  --title "[TEST-123] Fix bug" \
  --body "Related to TEST-456" \
  --branch "feature/TEST-789"
```

### transition

課題ステータスを更新:

```bash
# キーを直接指定
gh2backlog transition --keys TEST-123,TEST-456 --on-merge

# PR情報から抽出して更新
gh2backlog transition --title "[TEST-123] Fix bug" --on-merge
```

### release-notes

リリースノートを生成:

```bash
gh2backlog release-notes --tag v1.0.0

# 前回タグを明示
gh2backlog release-notes --tag v1.0.0 --previous-tag v0.9.0

# ファイル出力
gh2backlog release-notes --tag v1.0.0 --output notes.md
```

### validate-config

設定ファイルを検証:

```bash
gh2backlog validate-config
```

## GitHub Actions

### PRマージ時

`.github/workflows/on-pr-merge.yml`:

```yaml
name: Backlog Transition on PR Merge

on:
  pull_request:
    types: [closed]

jobs:
  transition:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Transition Backlog issues
        run: |
          npx gh2backlog transition \
            --title "${{ github.event.pull_request.title }}" \
            --body "${{ github.event.pull_request.body }}" \
            --branch "${{ github.event.pull_request.head.ref }}" \
            --on-merge
        env:
          BACKLOG_BASE_URL: ${{ secrets.BACKLOG_BASE_URL }}
          BACKLOG_API_KEY: ${{ secrets.BACKLOG_API_KEY }}
          BACKLOG_PROJECT_KEY: ${{ secrets.BACKLOG_PROJECT_KEY }}
```

### リリース時

`.github/workflows/on-release.yml`:

```yaml
name: Release Notes on Tag

on:
  push:
    tags: ['v*']

jobs:
  release-notes:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate release notes
        run: |
          npx gh2backlog release-notes \
            --tag "${GITHUB_REF#refs/tags/}" \
            --output notes.md
        env:
          BACKLOG_BASE_URL: ${{ secrets.BACKLOG_BASE_URL }}
          BACKLOG_API_KEY: ${{ secrets.BACKLOG_API_KEY }}
          BACKLOG_PROJECT_KEY: ${{ secrets.BACKLOG_PROJECT_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_REPOSITORY: ${{ github.repository }}

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          body_path: notes.md
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 設定リファレンス

### backlog

| 項目 | 必須 | 説明 |
|------|------|------|
| baseUrl | Yes | Backlog URL |
| apiKey | Yes | APIキー |
| projectKey | Yes | プロジェクトキー |

### issueKey

| 項目 | デフォルト | 説明 |
|------|------------|------|
| pattern | `[A-Z]+-[0-9]+` | 課題キーの正規表現 |
| sources | `[title, body, branch, commits]` | 抽出元（許可値: `title`, `body`, `branch`, `commits`） |
| requirePrimary | `false` | タイトル必須 |

### transition

| 項目 | デフォルト | 説明 |
|------|------------|------|
| onMerge.statusId | `3` | マージ時のステータスID |
| onRelease.statusId | `4` | リリース時のステータスID |

### releaseNotes

| 項目 | デフォルト | 説明 |
|------|------------|------|
| grouping | `issueType` | グルーピング方法 |
| titleMap | `{}` | 種別名マッピング |

### github

| 項目 | デフォルト | 説明 |
|------|------------|------|
| release.enabled | `true` | GitHub Release本文の更新を行うか |

## 開発

開発には [Bun](https://bun.sh/) が必要です（配布物はNode.js互換）。

```bash
# 依存インストール
bun install

# ビルド (Node.js互換のJSを出力)
bun run build

# テスト
bun run test

# lint
bun run lint

# 全チェック (typecheck + lint + test)
bun run check
```

## ライセンス

MIT
