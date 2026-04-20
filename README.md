# gh2backlog

[日本語](./README.ja.md)

A CLI tool that integrates GitHub with Backlog. Automatically update issue statuses on PR merge and generate release notes.

## Features

- Zero external dependencies (Node.js standard modules only)
- Requires Node.js 22+
- Works directly with npm / npx
- GitHub Actions support

## Installation

```bash
npm install -g gh2backlog
```

Or run directly with npx:

```bash
npx gh2backlog --help
```

## Setup

### 1. Create Configuration File

Create `.gh2backlog.yml` in your project root:

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
    statusId: 3   # In Progress
  onRelease:
    statusId: 4   # Closed

releaseNotes:
  grouping: issueType
  titleMap:
    Bug: Bug Fixes
    Task: Tasks

github:
  release:
    enabled: true
```

### 2. Environment Variables (override config file)

```bash
export BACKLOG_BASE_URL=https://your-space.backlog.com
export BACKLOG_API_KEY=your-api-key
export BACKLOG_PROJECT_KEY=YOUR_PROJECT
export GITHUB_TOKEN=your-github-token
```

## Specification

### Issue Key Extraction

| Source | Role | Description |
|--------|------|-------------|
| PR Title | **primary** | Keys here are treated as primary |
| PR Body | supplementary | Related issues |
| Branch Name | supplementary | e.g., `feature/TEST-123` |
| Commits | supplementary | Commit messages |

- **Allowed sources**: `title`, `body`, `branch`, `commits` only (other values cause errors)
- Extracts from all sources and removes duplicates
- `requirePrimary: true` requires key in title

#### Filtering by Project Key

- Only issue keys matching `projectKey` are used (e.g., `projectKey: TEST` → `TEST-123` is used, `ABC-999` is ignored)
- Keys from other projects are silently ignored
- Multiple project support planned via `projectKeys` in future

### Release Notes Target PRs

- **Target branch**: PRs merged to default branch (main/master)
- **Range**: PRs merged between previous tag and current tag
- Issue keys are deduplicated

#### Previous Tag Auto-detection

- Tags are sorted by date descending (equivalent to `git tag --sort=-creatordate`)
- The most recent tag excluding current tag is used as previous tag
- If not found, treats as first release (collects from repository creation)
- Can be explicitly specified with `--previous-tag`

### Exit Codes

| Situation | Exit Code | Note |
|-----------|-----------|------|
| `requirePrimary: true` and no key in title | 1 | Error |
| No keys extracted | 0 | Warning only |
| Some issue updates failed | 1 | Error |
| All succeeded | 0 | - |

## CLI Commands

### extract-keys

Extract Backlog issue keys from PR:

```bash
gh2backlog extract-keys \
  --title "[TEST-123] Fix bug" \
  --body "Related to TEST-456" \
  --branch "feature/TEST-789"
```

### transition

Update issue status:

```bash
# Specify keys directly
gh2backlog transition --keys TEST-123,TEST-456 --on-merge

# Extract from PR info and update
gh2backlog transition --title "[TEST-123] Fix bug" --on-merge

# Add comment to issues
gh2backlog transition --keys TEST-123 --on-merge --comment "Merged via PR #42"
```

### release-notes

Generate release notes:

```bash
gh2backlog release-notes --tag v1.0.0

# Specify previous tag
gh2backlog release-notes --tag v1.0.0 --previous-tag v0.9.0

# Output to file
gh2backlog release-notes --tag v1.0.0 --output notes.md
```

### validate-config

Validate configuration file:

```bash
gh2backlog validate-config
```

## GitHub Actions

### On PR Merge

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
            --on-merge \
            --comment "Merged: ${{ github.event.pull_request.html_url }}"
        env:
          BACKLOG_BASE_URL: ${{ secrets.BACKLOG_BASE_URL }}
          BACKLOG_API_KEY: ${{ secrets.BACKLOG_API_KEY }}
          BACKLOG_PROJECT_KEY: ${{ secrets.BACKLOG_PROJECT_KEY }}
```

### On Release

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

## Configuration Reference

### backlog

| Field | Required | Description |
|-------|----------|-------------|
| baseUrl | Yes | Backlog URL |
| apiKey | Yes | API key |
| projectKey | Yes | Project key |

### issueKey

| Field | Default | Description |
|-------|---------|-------------|
| pattern | `[A-Z]+-[0-9]+` | Issue key regex |
| sources | `[title, body, branch, commits]` | Extraction sources (allowed: `title`, `body`, `branch`, `commits`) |
| requirePrimary | `false` | Require key in title |

### transition

| Field | Default | Description |
|-------|---------|-------------|
| onMerge.statusId | `3` | Status ID on merge |
| onRelease.statusId | `4` | Status ID on release |

### releaseNotes

| Field | Default | Description |
|-------|---------|-------------|
| grouping | `issueType` | Grouping method |
| titleMap | `{}` | Issue type name mapping |

### github

| Field | Default | Description |
|-------|---------|-------------|
| release.enabled | `true` | Update GitHub Release body |

## Development

Requires [Bun](https://bun.sh/) for development (distributable is Node.js compatible).

```bash
# Install dependencies
bun install

# Build (outputs Node.js compatible JS)
bun run build

# Test
bun run test

# Lint
bun run lint

# All checks (typecheck + lint + test)
bun run check
```

## License

MIT
