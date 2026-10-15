// Uses Codex's experimental project RPCs; never edits its storage directly.
export async function syncCodexProjects({ provider, owner, projects, assertOwner, save }) {
  const errors = [];
  let synced = 0;
  const check = () => assertOwner(owner.key);
  const rpc = async (method, params) => {
    await check();
    const result = await provider.rpc(method, params);
    await check();
    return result;
  };
  try {
    await check();
    await provider.start();
    await check();
  } catch (error) {
    return { synced, error: error.message };
  }
  owner.settings.codexProjects ??= {};
  const seen = new Set();
  for (const project of projects) {
    if (project.canManage !== true || !project.id || seen.has(project.id)) continue;
    seen.add(project.id);
    try {
      await check();
      const pid = project.id;
      const mapping = owner.settings.codexProjects[pid];
      const roots = owner.settings.folders?.[pid] ? [{ path: owner.settings.folders[pid] }] : [];
      let linked;
      if (mapping?.projectId) {
        // A failed read may mean permissions, connectivity, or incompatible APIs.
        // Do not silently create another project after an ambiguous failure.
        ({ project: linked } = await rpc("project/read", { projectId: mapping.projectId }));
      } else {
        ({ project: linked } = await rpc("project/create", {
          name: project.name,
          roots,
          metadata: { bridgainProjectId: pid, bridgainOwnerKey: owner.key },
          idempotencyKey: `bridgain:${owner.key}:${pid}`,
        }));
      }
      if (!linked?.id || linked.metadata?.bridgainProjectId !== pid || linked.metadata?.bridgainOwnerKey !== owner.key)
        throw Error("Codex 프로젝트의 브릿게인 계정 연결 정보가 일치하지 않습니다.");
      if (linked.name !== project.name || JSON.stringify(linked.roots) !== JSON.stringify(roots)) {
        await rpc("project/update", { projectId: linked.id, name: project.name, roots });
      }
      const previous = owner.settings.codexProjects[pid];
      const entry = { ...previous, projectId: linked.id, name: project.name, roots };
      owner.settings.codexProjects[pid] = entry;
      try { await save(); } catch (error) {
        if (previous) owner.settings.codexProjects[pid] = previous;
        else delete owner.settings.codexProjects[pid];
        throw error;
      }
      for (const session of Object.values(owner.settings.localSessions ?? {})) {
        if (session.pid !== pid || !session.localId || (session.provider && session.provider !== "codex")) continue;
        try {
          // A read confirms it is a real Codex thread. Check on every sync so
          // externally moved threads can be put back in their linked project.
          const { thread } = await rpc("thread/read", { threadId: session.localId, includeTurns: false });
          if (thread?.id !== session.localId) throw Error("Codex 채팅 연결 정보를 확인할 수 없습니다.");
          if (thread.projectId !== linked.id)
            await rpc("thread/metadata/update", { threadId: thread.id, projectId: linked.id });
        } catch (error) {
          errors.push(`${project.name} 채팅: ${error.message}`);
        }
      }
      synced++;
    } catch (error) {
      errors.push(`${project.name ?? project.id}: ${error.message}`);
    }
  }
  return { synced, ...(errors.length ? { error: errors.join("\n") } : {}) };
}
