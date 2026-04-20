# リリースフロー

このプロジェクトは [Changesets](https://github.com/changesets/changesets) を使用してバージョン管理と NPM へのリリースを行います。

## 前提条件

### npm OIDC 認証の設定

GitHub Actions から npm へ直接公開するために OIDC 認証を使用します。

1. [npm](https://www.npmjs.com/) で Granular Access Token を作成
   - npm.com > Access Tokens > Generate New Token > Granular Access Token
2. Publishing 設定で GitHub Actions を連携
   - Workflow filename: `release.yml`
   - Environment name: 空欄

これにより `NPM_TOKEN` なしで GitHub Actions から安全に公開できます。

## 開発からリリースまでの流れ

```
feature branch で開発
        ↓
  changeset を作成
        ↓
    PR を作成
        ↓
  main にマージ
        ↓
"Version Packages" PR が自動作成
        ↓
  その PR をマージ
        ↓
   npm に自動公開
```

## 手順詳細

### 1. 変更を加える

通常通り feature ブランチで開発を行います。

### 2. Changeset を作成

変更内容を記録するために changeset を作成します。

```bash
bun run changeset
```

対話形式で以下を入力:

1. **変更の種類を選択**
   - `patch`: バグ修正、軽微な変更 (1.0.0 → 1.0.1)
   - `minor`: 後方互換性のある機能追加 (1.0.0 → 1.1.0)
   - `major`: 破壊的変更 (1.0.0 → 2.0.0)

2. **変更内容の要約を記述**
   - CHANGELOG に記載される内容になります

`.changeset/` に markdown ファイルが生成されます。このファイルをコミットに含めてください。

### 3. PR を作成してマージ

changeset ファイルを含めた PR を作成し、レビュー後に main ブランチへマージします。

### 4. Version Packages PR

main へのマージ後、GitHub Actions が自動で "Version Packages" という PR を作成します。

この PR には以下が含まれます:
- `package.json` のバージョン更新
- `CHANGELOG.md` の更新
- `.changeset/` 内のファイル削除

### 5. リリース

"Version Packages" PR をマージすると、GitHub Actions が自動で:

1. パッケージをビルド
2. npm に公開

## 手動リリース（緊急時）

自動化が動作しない場合の手動手順:

```bash
# バージョン更新
bun run version

# 変更をコミット
git add .
git commit -m "chore: release"
git push

# npm に公開
bun run release
```

## コマンド一覧

| コマンド | 説明 |
|---------|------|
| `bun run changeset` | 新しい changeset を作成 |
| `bun run version` | changeset を適用してバージョン更新 |
| `bun run release` | ビルドして npm に公開 |

## トラブルシューティング

### "Version Packages" PR が作成されない

- `.changeset/` ディレクトリに changeset ファイルが存在するか確認
- GitHub Actions のログを確認

### npm publish が失敗する

- npm の OIDC 設定で workflow filename が `release.yml` になっているか確認
- Granular Access Token の権限が publish を許可しているか確認
- パッケージ名が npm で利用可能か確認: `npm view gh2backlog`
