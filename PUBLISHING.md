# Publishing destato-cli to npm

This package is published **publicly** to the npm registry so users can run
`npx destato-cli` with no setup. Publishing to npm is independent of GitHub — the
registry is what `npx` resolves the name from.

## Before the first publish (one-time)

1. **License** — MIT, in the `LICENSE` file and `package.json`.

2. **Claim the name.** Confirm `destato-cli` is free:

   ```bash
   npm view destato-cli
   ```

   A "404 / not found" means it's available. If it's taken, switch to a scoped
   name like `@destato/cli` (create the `destato` org on npm first) and update
   `name` in `package.json`; the command becomes `npx @destato/cli`.

3. **Create an npm account / org** at npmjs.com and make sure you can log in.

## Manual publish

```bash
npm login                 # once per machine
npm run build             # also runs automatically via prepublishOnly
npm publish               # unscoped public by default
# For a scoped package, the first publish needs:
# npm publish --access public
```

The `prepare` script builds `dist/` for you (it runs before publish, on git
installs, and on a local `npm install`), and `files` in `package.json` limits the
tarball to `dist/` (plus the always-included `package.json`/`README`/`LICENSE`).
Verify what will ship before publishing:

```bash
npm pack --dry-run
```

## Releasing a new version

```bash
npm version patch     # or minor / major — bumps package.json and tags the commit
git push --follow-tags
```

If you wire up the GitHub Action below, pushing the tag publishes automatically.

## Automated publish (GitHub Action)

`.github/workflows/publish.yml` publishes on any pushed `v*` tag. To enable it:

1. Create an **automation** access token at npmjs.com
   (Account → Access Tokens → Granular/Automation).
2. Add it to the GitHub repo as a secret named **`NPM_TOKEN`**
   (Settings → Secrets and variables → Actions).
3. Push a version tag (`npm version patch && git push --follow-tags`).

The workflow builds and runs `npm publish` with that token.
