# gh2backlog

## 0.0.6

### Patch Changes

- 44ddb6b: - Combine status update and comment into single API request
  - Extract issue keys from Backlog URLs (e.g., `https://xxx.backlog.com/view/KEY-123`)
  - Fix GitHub Actions workflows to use `npx --yes`
  - Add automatic git tag creation on release

## 0.0.5

### Patch Changes

- 6bfc252: Fix transition command parsing single key as individual characters

## 0.0.4

### Patch Changes

- 2d0055a: Fix comment API by adding Content-Length header to ensure request body is sent correctly

## 0.0.3

### Patch Changes

- df90fa1: transition コマンドに--comment オプションを追加。課題ステータス更新時に Backlog 課題へコメントを追加可能に。

## 0.0.2

### Patch Changes

- cd9856f: Fix ESM module resolution issue
