type LinkedStage = { id: string; dependsOn: string[] };

export function sequenceStages<T extends LinkedStage>(stages: T[]): T[] {
  return stages.map((stage, index) => ({
    ...stage,
    dependsOn: index ? [stages[index - 1].id] : [],
  }));
}

export function isSequential(stages: LinkedStage[]): boolean {
  return stages.every((stage, index) => index
    ? stage.dependsOn.length === 1 && stage.dependsOn[0] === stages[index - 1].id
    : stage.dependsOn.length === 0);
}

export function moveStage<T extends LinkedStage>(stages: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= stages.length || to >= stages.length) return stages;
  const next = [...stages];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return sequenceStages(next);
}
