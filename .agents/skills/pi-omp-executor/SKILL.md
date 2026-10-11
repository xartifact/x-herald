---
name: pi-omp-executor
description: Plan repository work, delegate all execution to the installed Pi or OMP coding runtime, and independently review the evidence. Use when the user requests Pi/OMP execution or asks the current agent to plan and coordinate while an executor performs the work.
---

# Pi / OMP Task Execution

The current agent is the **coordinator**, not the implementer. Pi or OMP is the **executor**. Keep this division throughout the task, including follow-up fixes and verification.

## Role detection — prevent recursive delegation

These coordination rules apply to the agent receiving the user's request, not to an already assigned Pi/OMP executor. A process given a concrete executor assignment must perform that assignment directly with its own tools, including investigation, edits, tests, builds, and authorized board operations. It must not load this skill and reinterpret itself as a coordinator, launch a replacement executor, or delegate the same assignment again. Only an explicit assignment to coordinate sub-executors changes that role.

Every handoff must identify the recipient as the executor and state that the coordinator's delegation-only restriction does not apply to the recipient's execution tools.

## Execution boundary

The coordinator may:
- Clarify scope, set acceptance criteria, plan work, and communicate progress.
- Discover the runtime and its CLI syntax; prepare delegation prompts and temporary handoff files.
- Launch, monitor, resume, or stop executor processes and read their logs, diffs, and other evidence.
- Independently assess results and assign corrections or additional verification.

Delegate all task execution to the executor, including repository discovery commands, source or document edits, formatting, tests, builds, browser checks, debugging, and x-cart operations. Have the executor produce the repository status and diff needed for review. A read-only command is still task execution when it performs project investigation or verification.

**Do not take over even for a small fix, a quick test, or a failed executor run.** Request a focused follow-up from the executor. Independent review means evaluating evidence yourself; it does not require personally running the checks.

A user's explicit instruction to perform a particular operation personally overrides this boundary **only for that operation**. For example, “edit this skill yourself” permits the skill edit and its validation, but does not authorize directly modifying the product or running its tests. Never infer an exception from urgency, convenience, or a tool failure.

## Workflow

1. **Establish context through the executor.** Have it read applicable `AGENTS.md` files, inspect the branch and working tree, and report relevant code and constraints. Reuse current evidence instead of repeating discovery. Require preservation of existing changes, including untracked files.
2. **Apply x-cart management once.** Reuse the user's previous answer. If unanswered, ask whether to use x-cart while the executor performs read-only discovery. If accepted or already managed, delegate live board inspection, registration, and the `in_progress` transition before implementation. Every transition needs `--reason`. An existing task covering the scope may be reused; do not create duplicates. The coordinator decides when results are accepted; the executor applies the corresponding board updates afterward.
3. **Present a concise plan.** State the outcome, bounded tasks, affected areas, dependencies, and required verification. Do not create a summary document. Split execution only where file ownership and dependencies allow it.
4. **Choose and launch the runtime.** Respect the user's runtime choice. Otherwise prefer Pi for bounded work and OMP when its planning/task features help. Check availability and installed `--help` syntax. Use the configured model unless the user chooses one. Use non-interactive execution for a bounded task, with implementation enabled rather than a read-only plan.
5. **Hand off a concrete task.** Supply the repository, existing branch and dirty-worktree context, relevant instructions, scope, acceptance criteria, authorized external operations, required checks, and evidence destinations. Include any known failures and prior successful checks so the executor can avoid redundant work.
6. **Monitor without competing writes.** Record session/process identifiers and capture output and exit status. Keep the user informed with observed progress. After an interruption, check whether the existing process is still active before starting another. Continue or follow up in the same session where supported. Never run overlapping writers against the same files.
7. **Review evidence independently.** Require status/diff relative to the start of the run, actual command logs and exit codes, and screenshots when visual verification matters. Check scope, preserved work, behavior, and acceptance criteria. An executor's summary alone is insufficient. Delegate any missing checks or corrections; do not fix them yourself.
8. **Close the loop.** After accepting the result, delegate the authorized x-cart status update and inspect its response. Report the outcome, relevant files, verification actually completed, and unresolved issues. Do not claim completion while required checks fail or have not run.

## Failure and retry

- If startup fails before useful work, inspect the error and correct the invocation once when there is a concrete diagnosis. Preserve configured authentication and provider integrations; do not disable extensions or overwrite configuration as a generic workaround.
- Do not expose credentials, silently change a user-selected runtime/model, or fall back to personal implementation. If authentication or availability remains blocked, report the specific blocker. When no runtime was explicitly required, explain a proposed available alternative before using it within the authorized scope.
- For implementation or test failures, send the evidence and a bounded correction task to the executor. Retain the prior logs; do not weaken tests or hide errors to produce a successful report.
- Do not blindly retry unchanged failures. Seek missing information or report the limitation when another run has no reasonable prospect of progress.

## Executor prompt template

Adapt this template; include relevant context only, without secrets.

```text
Repository: <absolute path>
Existing branch and working tree: <known state; inspect and preserve all existing changes>
Role: You are the assigned executor, not the coordinator. Perform this task directly with your tools.
Do not recursively delegate or launch another executor. The delegation-only restriction applies to your parent coordinator.
The coordinator plans, reviews your evidence, and requests follow-ups.

Read applicable AGENTS.md and relevant skills before editing.
Outcome: <specific result>
Scope and file ownership: <bounded files/behaviors>
Acceptance criteria: <observable checks>
Known evidence: <existing failures, successful checks, logs, pending processes>

Project management: <user's x-cart decision, project/story/task IDs, required operations>
If x-cart applies, inspect the live board and register/claim work before implementation.
Do not mark work done until the coordinator accepts it and requests that transition.

Constraints:
- Preserve pre-existing edits and untracked files; stay on the specified branch.
- Do not broaden scope or start additional writers without assignment.
- Do not commit, push, deploy, or modify external systems except operations explicitly authorized above.
- Do not change credentials or disclose secrets.
- Report blockers rather than inventing requirements or weakening checks.

Verification: <required commands, targeted tests, browser scenarios>
Run checks appropriate to the final changes. Capture each command, its exit code, and its log path.
Do not suppress failures or report an older successful run as validating newer changes.

Return: changed files relative to your starting point, reviewable diff/status, decisions and root causes,
verification evidence, and unresolved issues. Keep reports outside the repository unless requested.
```

## Runtime notes

- Pi supports `pi --print`; OMP supports `omp --print`. Confirm session/resume and other flags using installed help rather than assuming compatibility between them.
- Follow-up runs must be sequential when they share a session or files. A parent turn interruption does not prove that the executor stopped.
- Prefer a prompt file for long handoffs and capture logs outside the repository. Treat command text as shell code; do not interpolate unescaped prompts or secrets.
- Preserve default model/provider configuration. If an OMP planning mode is used, ensure the run actually proceeds to implementation under the intended configuration.
