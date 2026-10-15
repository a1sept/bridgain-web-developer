# Codex project connection

When Codex is enabled, the developer desktop synchronizes manageable Bridgain
projects using the installed Codex app-server experimental project RPCs. The
renderer triggers a sync after workspace project IDs/names change; folder changes,
Codex sign-in completion, manual retry and chat execution also trigger a sync.
Changes made elsewhere are picked up when the workspace is refreshed.

Each server/user/project has an idempotency key. Only projects whose ownership
metadata matches that key are updated. Project names and selected local folders
are sent to the engine. New Codex chats receive that project ID, and known local
Codex chats are attached after verification. Existing unrelated projects are not
renamed. No project deletion is propagated.

Authentication stays in the per-server/per-user Codex home. Conversation and
project SQLite storage uses the local user's `~/.codex` through the `sqlite_home`
CLI override. Consequently, these conversations are visible to the local Codex
installation; this is a local integration, not cross-device cloud synchronization.
Historical conversations stored only in an older private database are not
automatically migrated or edited. Their connection errors are displayed.

## Current desktop limitation

Verified with installed CLI 0.162.0-alpha.17.2: `project/create`, `project/update`,
and `thread/metadata/update` succeed. However, the current desktop app's project
listing does not expose the new engine project IDs, and its move-to-project tool
rejects them as unavailable. Engine synchronization must not be presented as
successful sidebar synchronization. The UI labels this experimental and provides
**Codex에서 열기** for the same conversation via `codex://threads/<id>`.

The app must support this registry before automatic matching sidebar names can
be considered complete. Codex-side messages are also not imported back into
Bridgain's server message table by this feature.

Validation: `npm run desktop:test`, `npm run desktop:check`, `npm run build`.
