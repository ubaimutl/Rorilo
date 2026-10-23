# Preparing a release

The next prepared release is **v0.2.1**. Its notes are in [releases/v0.2.1.md](../releases/v0.2.1.md).

## Before tagging

1. Keep the version identical in `package.json`, both root version entries in `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and the `rorilo` package in `src-tauri/Cargo.lock`.
2. Add the release notes at `releases/<tag>.md`, for example `releases/v0.2.1.md`.
3. Use Node 22 and run:

   ```sh
   npm ci
   npm run release:check
   npx prisma generate
   npm test
   npx tsc --noEmit
   npm run build
   npm run desktop:bundle-server
   npm run desktop:prepare-node
   npm run desktop:test-database
   ```

4. Merge the preparation changes into `main`. Run the **Desktop release** workflow manually on `main` and verify all four platform builds succeed. A manual run builds artifacts without creating a release.
5. Inspect the installers and smoke-test startup, existing database upgrades, job discovery, and document export on the target platforms.

## Create a draft release

After verifying the exact release commit, tag that commit and push the tag:

```sh
git tag -a v0.2.1 <verified-commit-sha> -m "Rorilo v0.2.1"
git push origin v0.2.1
```

The tag triggers the **Desktop release** workflow. All four builds must succeed before it creates a **draft** GitHub release with the notes from `releases/v0.2.1.md` and the desktop artifacts. Inspect the draft and its downloads before publishing it.

The **Publish desktop release** workflow can upload artifacts from an existing successful run. When using it, ensure the artifacts, target commit, tag, and embedded application version all match. That recovery workflow uses a generic release description, so copy the prepared release notes into its draft before publishing.
