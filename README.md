# understand

`understand` is an open source OpenCode plugin that helps explain the important code changes in your current branch or uncommitted working tree before you merge.

It is built for situations where the diff is too large to read line-by-line, but you still want a grounded explanation with exact citations and architecture-level context.

## Install

Add the plugin package name to the `plugin` array in your OpenCode config:

```json
{
  "plugin": ["@juriruegger/understand"]
}
```

Restart OpenCode after updating the config.

## Use
`/understand`


The skill will:

- ask whether to inspect uncommitted changes or the current branch
- suggest likely target branches with the default branch first
- explain the important architecture and behavior changes with citations
- optionally quiz you on the important changes for active recall

## Development

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run build
```

Type-check:

```bash
npm run check
```

Validate the bundled skill:

```bash
python3 /home/juri/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/understand
```

The package also exposes a helper CLI for smoke-testing the git manifest logic:

```bash
node dist/cli.js targets --cwd /path/to/repo
node dist/cli.js branch-manifest --cwd /path/to/repo --target main
node dist/cli.js uncommitted-manifest --cwd /path/to/repo
```

## Releases

This repo can publish to npm automatically from GitHub Actions when you push a version tag.

### Publishing a release

1. Update the package version:

```bash
npm version patch
```

2. Push the commit and tag:

```bash
git push --follow-tags
```

The workflow publishes only when the pushed tag matches `v<package.json version>`.

## License

MIT
