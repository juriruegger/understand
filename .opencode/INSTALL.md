# Installing understand for OpenCode

Add the package to the `plugin` array in your `opencode.json`:

```json
{
  "plugin": ["@juriruegger/understand"]
}
```

Restart OpenCode.

The plugin will register the bundled `understand` skill automatically.

Invoke it explicitly:

```text
/understand
```

or

```text
Use understand to explain the important changes in my current branch.
```
