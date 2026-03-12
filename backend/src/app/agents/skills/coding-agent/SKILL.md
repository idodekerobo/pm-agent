---
name: coding-agent
description: Spawn an autonomous coding agent to implement features or code changes in a GitHub repository. Use this when the user wants to build, fix, or refactor code.
---

# Coding Agent

You have a direct tool called `tool_spawn_code_task` that kicks off an autonomous Claude Code agent in the background. It clones the user's repository, implements the spec you write, and opens a GitHub PR when complete. Progress updates appear in this chat thread throughout.

Call this tool directly — do not delegate to `execution_agent`.

---

## Prerequisites

Both of the following integrations must be connected before spawning a coding task:
- **Claude Code** — Anthropic API key (used to run the coding agent)
- **GitHub** — used to clone the repo and push the feature branch

If either is missing, tell the user which one to connect in their integrations settings before proceeding.

---

## When to use

Use `tool_spawn_code_task` when the user asks to build, fix, or change code in a repository. Do not use it for reading code or answering questions — use `researcher_agent` for those.

---

## Step 1 — Resolve the repo URL

Before spawning, confirm the GitHub repo URL. Check in this order:

1. `context/product.md` or similar context files — look for `github_repo`, `repository`, `repo_url`
2. `memory/memory.md`
3. If still not found, use `researcher_agent` to look it up via the GitHub skill:
   ```
   gh repo list --json name,url,isPrivate --limit 100
   ```
   Match the result against what the user described. If exactly one repo matches, use it.
   If multiple repos match the name, show the user the options and ask which one.
4. Only ask the user directly if GitHub lookup fails or returns no matches.

Once confirmed, save the full URL via `learning_agent` so you don't need to ask again.

If the user says there is no repo yet, ask them to create one on GitHub first then share the URL.

---

## Step 2 — Gather context

Use `researcher_agent` to read relevant context before writing the spec:
- `context/product.md` for tech stack, framework, conventions
- Any files the user references directly

If the user's request is vague, ask one clarifying message to establish: what problem is being solved, what done looks like, and any hard constraints.

---

## Step 3 — Write a PRD (for non-trivial features)

For anything beyond a small bug fix or minor change:
1. Call `execution_agent` to write a PRD to `prds/{feature-name}.md` using the PRD template
2. Read it with `fs_read` to confirm it's solid
3. Include the full PRD content in your spec — the coding agent does not have access to the workspace filesystem

---

## Step 4 — Write the spec

The spec is the only instruction the coding agent receives. It cannot ask questions mid-run.

Write it as a clear, direct brief to a senior engineer — goal, acceptance criteria, and enough context to make good decisions without you. If you have a PRD, include its content in full. If you know relevant file paths or existing patterns to follow, include them.

The coding agent handles its own git workflow (commits, branching) and produces a summary when done. You do not need to instruct it on those.

---

## Step 5 — Spawn the task

Call `tool_spawn_code_task`:
- `repo_url` — full HTTPS GitHub URL, e.g. `https://github.com/owner/repo`
- `spec` — your feature brief including any PRD content
- `base_branch` — default is `main`; confirm with user if different

After spawning, tell the user the task has started, that they'll see updates here, and that a PR will be opened for review when done.

---

## Multiple repos

If a feature spans multiple repos, write a separate spec for each and call `tool_spawn_code_task` once per repo. Each spec should be independently implementable without knowledge of the other.
