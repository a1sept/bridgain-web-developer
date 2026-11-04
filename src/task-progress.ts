import type { ProjectTask } from './ProjectTasks';

export type StageColumn = { name: string; completionMode?: string };
export const stageId = (stage: StageColumn) => JSON.stringify([stage.name, stage.completionMode || '']);
export const taskStage = (task: ProjectTask): StageColumn => ({ name: task.stageName || '미분류', completionMode: task.completionMode });
export const taskFinished = (task: ProjectTask) => task.status === 'released' || (task.status === 'done' && !['code', 'deploy'].includes(task.completionMode || ''));
export function progressColumns(tasks: ProjectTask[], configured: StageColumn[]) {
  const columns = new Map(configured.map(stage => [stageId(stage), stage]));
  for (const task of [...tasks].sort((a, b) => (a.stageOrder ?? 999) - (b.stageOrder ?? 999))) {
    const stage = taskStage(task);
    columns.set(stageId(stage), stage);
  }
  return [...columns.values()];
}
export function requestRows(tasks: ProjectTask[], matchingIds: Set<string>) {
  const rows = new Map<string, { id: string; title: string; requestId?: string; tasks: ProjectTask[] }>();
  for (const task of tasks) {
    const links = task.requests.length ? task.requests : [{ id: `internal:${task.id}`, title: task.title }];
    for (const link of links) {
      const row = rows.get(link.id) || { id: link.id, title: link.title, requestId: task.requests.length ? link.id : undefined, tasks: [] };
      row.tasks.push(task);
      rows.set(link.id, row);
    }
  }
  return [...rows.values()].filter(row => row.tasks.some(task => matchingIds.has(task.id)));
}
