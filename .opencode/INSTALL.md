# Installing understand for OpenCode

Add the package to the `plugin` array in your `opencode.json`:

```json
{
  "plugin": ["@juriruegger/understand"]
}
```

Restart OpenCode.

The package exposes the `understand_git` tool and is intended to make the bundled `understand` skill available to OpenCode.

Invoke it explicitly:

```text
/understand
```

or

```text
Use understand to explain the important changes in my current branch.
```
