---
name: understand
description: Explain the important code changes in the current checked-out branch or uncommitted working tree so the user can understand what they are about to merge without opening an IDE. Use when Codex needs to ask whether to analyze uncommitted changes or the current branch, suggest likely target branches with the default branch first, inspect git-backed change manifests from the `understand_git` tool, produce an architecture-first walkthrough with exact cited excerpts and explicit inference labels, or offer an optional active-recall quiz about the important behavior and architecture changes.
---

# Understand

## Overview

Explain the behaviorally important parts of a change set with enough evidence that the user can understand what they are about to merge without walking the diff manually. Keep the output focused on important code paths, exact citations, and architecture-level consequences.

## Intake

- If the user already specified `uncommitted changes` or `current branch`, skip the scope question.
- Otherwise use `ask_user` for one short choice question with these options:
  - `Understand uncommitted changes`
  - `Understand the current branch`

- Ask only for missing information.

If the user chose `current branch` and did not already provide a target branch:

- Call `understand_git` with action `targets` and `refresh: true`.
- Present the returned options with `ask_user`, with the default branch first.
- Allow the user to type their own branch name or ref.
- If the tool reports stale refs, mention that the branch list may be slightly stale.

## Gather Manifest

Use the `understand_git` tool as the source of truth for git state. Do not reconstruct branch targets or merge-bases yourself.

Use these actions:

- `targets`
  - Use only to propose likely target branches.
- `branch-manifest`
  - Use after the user picked a branch target.
  - Pass the user-selected target branch or ref.
- `uncommitted-manifest`
  - Use for staged, unstaged, and untracked local work.

If the manifest tool fails because the current directory is not a git repository, say so plainly and stop.

## Read Code

Use the manifest to decide what to read next.

Before doing your own deep reads, launch an `explore` subagent for a first-pass repo scan of the important changed areas.

- Use the subagent to identify the most behaviorally important files, entry points, data-flow edges, interface changes, and any surrounding unchanged code that is likely required for understanding.
- Ask the subagent to return a concise prioritized reading list with brief reasons and file paths.
- Then do the final deep reads yourself from the subagent's prioritized results.
- If the change set is very small and already obvious from the manifest, you may skip the subagent.

Prioritize files and areas that change:

- runtime behavior
- interfaces and contracts
- data flow or control flow
- schemas, auth, security, or permission checks
- build, deploy, or environment behavior

De-prioritize formatting-only edits, generated files, snapshots, lockfiles, and large mechanical rewrites unless they change behavior or an interface.

For files you explain deeply:

- Prefer exact excerpts from the changed region.
- Read only the minimal unchanged context needed to make the change understandable.
- Pull in unchanged supporting code only when the diff alone would be misleading.

## Output Contract

Explain the change set. Do not turn this into a review or defect list.

Structure the response like this when practical:

1. Scope and intent
2. Architecture areas that matter most
3. Deep explanation of the single most important area when the scope is large
4. What to expand next

When the change set is large:

- Summarize first.
- Expand only one important area deeply in the current response.
- End with the next likely area or areas to continue with.

Use these evidence rules:

- Cite every important claim with file references and exact excerpts when possible.
- Label any conclusion that goes beyond the literal code as `Inference:`.
- If something is ambiguous, investigate further before concluding.
- If it remains ambiguous, say what is unclear and what evidence would resolve it.

Keep focus on important files and areas. Do not add a file-by-file omissions ledger.

## Quiz

After the explanation, offer an optional short quiz using `ask_user`.

- Default to no quiz unless the user opts in.
- Ask 3-7 questions.
- Prefer open-ended short-answer prompts.
- Use multiple-choice only when the change is broad enough that open-ended would be noisy or unfair.
- Test active recall of architecture, data flow, interfaces, and behavior changes.
- Do not ask trivia about file counts, branch names, or cosmetic edits.

When asking quiz questions:

- Use `ask_user` for each question.
- For open-ended prompts, allow the user to type their own answer.
