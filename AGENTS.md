<!-- BEGIN KOMMIT AGENT POLICY v1 -->
## KommitAI shared agent policy

- Default to one agent and one writer. Delegate only independent, read-heavy work that materially reduces elapsed time.
- Use at most two direct children, keep them read-only unless explicitly designated otherwise, and never recursively delegate.
- Search exact symbols and paths before opening broad documentation trees or large groups of files.
- Run focused validation while iterating; run broad validation at most once near the requested delivery boundary.
- Treat Ultra reasoning and provider Fast mode as explicit, task-local escalations, never as defaults combined with fan-out.
- Respect the requested lifecycle boundary. Do not continue into review, deployment, merging, or follow-up work unless asked.
- Preserve repository-specific guidance outside this managed block.
<!-- END KOMMIT AGENT POLICY v1 -->

# kommit-cli agent guidance

- Read the repository README and existing local instructions before editing.
- Keep CLI changes narrow and preserve behavior in `bin/`, `src/`, and `legacy/`.
- Validate with focused tests, `npm run typecheck`, and `npm run build` as needed.
