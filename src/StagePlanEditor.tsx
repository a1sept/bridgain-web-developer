import { useEffect, useState } from "react";
import "./stage-workflow.css";
export type StagePlan = {
  id: string;
  name: string;
  title: string;
  brief: string;
  completionMode: "document" | "design" | "code" | "test" | "deploy";
  assigneeIds: string[];
  reviewerIds: string[];
  dependsOn: string[];
};
type Person = {
  userId: string;
  displayName: string;
};
export const newStage = (
  name = "개발",
  completionMode: StagePlan["completionMode"] = "code",
): StagePlan => ({
  id: crypto.randomUUID(),
  name,
  title: name,
  brief: "",
  completionMode,
  assigneeIds: [],
  reviewerIds: [],
  dependsOn: [],
});
export function validStages(stages: StagePlan[] | undefined): boolean {
  if (
    !stages?.length ||
    stages.some(
      (s) =>
        !s.name.trim() ||
        !s.title.trim() ||
        !s.brief.trim() ||
        !s.assigneeIds.length ||
        !s.reviewerIds.length,
    )
  )
    return false;
  const keys = new Set(stages.map((s) => s.id));
  if (
    keys.size !== stages.length ||
    stages.some((s) => s.dependsOn.some((id) => !keys.has(id) || id === s.id))
  )
    return false;
  const done = new Set<string>(),
    active = new Set<string>();
  const visit = (id: string): boolean => {
    if (active.has(id)) return false;
    if (done.has(id)) return true;
    active.add(id);
    const s = stages.find((s) => s.id === id)!;
    if (!s.dependsOn.every(visit)) return false;
    active.delete(id);
    done.add(id);
    return true;
  };
  return stages.every((s) => visit(s.id));
}

export default function StagePlanEditor({
  value,
  onChange,
  members,
  reviewers = members,
  disabled = false,
  projectId,
}: {
  projectId?: string;
  value: StagePlan[];
  onChange: (stages: StagePlan[]) => void;
  members: Person[];
  reviewers?: Person[];
  disabled?: boolean;
}) {
  const [settings, setSettings] = useState<{
    stageTypes: {
      id: string;
      name: string;
      completionMode: StagePlan["completionMode"];
    }[];
    presets: {
      id: string;
      name: string;
      stages: Pick<StagePlan, "id" | "name" | "completionMode" | "dependsOn">[];
    }[];
  }>({ stageTypes: [], presets: [] });
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    fetch(`/api/workspace/projects/${projectId}/stage-settings`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setSettings)
      .catch(() => {});
    return () => controller.abort();
  }, [projectId]);
  const applyPreset = (id: string) => {
    const p = settings.presets.find((p) => p.id === id);
    if (!p) return;
    const ids = Object.fromEntries(
      p.stages.map((s) => [s.id, crypto.randomUUID()]),
    );
    onChange(
      p.stages.map((s) => ({
        ...newStage(s.name, s.completionMode),
        id: ids[s.id],
        dependsOn: s.dependsOn.map((id) => ids[id]),
      })),
    );
  };
  const patch = (id: string, change: Partial<StagePlan>) =>
    onChange(value.map((s) => (s.id === id ? { ...s, ...change } : s)));
  const preset = () => {
    const a = newStage("기획", "document"),
      b = newStage("디자인", "design"),
      c = newStage();
    b.dependsOn = [a.id];
    c.dependsOn = [b.id];
    onChange([a, b, c]);
  };
  return (
    <fieldset className="sw-editor" disabled={disabled}>
      <legend>단계별 업무 계획</legend>
      <p>
        담당자 전원 작업 완료 후 지정 승인자 전원이 승인합니다. 선행 업무가
        끝나면 다음 단계가 열립니다.
      </p>
      {!validStages(value) && (
        <p role="status">
          승인 요청에는 각 단계의 범위·담당자·승인자가 필요하며, 선행 업무를
          순환 연결할 수 없습니다.
        </p>
      )}
      <div className="sw-actions">
        <button type="button" onClick={() => onChange([...value, newStage()])}>
          단계 추가
        </button>
        <button type="button" onClick={preset}>
          기획 → 디자인 → 개발 구성
        </button>
        {settings.presets.map((p) => (
          <button type="button" key={p.id} onClick={() => applyPreset(p.id)}>
            {p.name} 구성
          </button>
        ))}
        {settings.stageTypes.length > 0 && (
          <select
            aria-label="단계 유형 추가"
            value=""
            onChange={(e) => {
              const t = settings.stageTypes.find(
                (t) => t.id === e.target.value,
              );
              if (t) onChange([...value, newStage(t.name, t.completionMode)]);
            }}
          >
            <option value="">단계 유형에서 추가</option>
            {settings.stageTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {value.map((s, i) => (
        <section className="sw-stage" key={s.id}>
          <header>
            <strong>
              {i + 1}. {s.name || "새 단계"}
            </strong>
            <button
              type="button"
              disabled={i === 0}
              onClick={() => {
                const next = [...value];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                onChange(next);
              }}
            >
              위로
            </button>
            <button
              type="button"
              disabled={i === value.length - 1}
              onClick={() => {
                const next = [...value];
                [next[i], next[i + 1]] = [next[i + 1], next[i]];
                onChange(next);
              }}
            >
              아래로
            </button>
            <button
              type="button"
              onClick={() =>
                onChange(
                  value
                    .filter((v) => v.id !== s.id)
                    .map((v) => ({
                      ...v,
                      dependsOn: v.dependsOn.filter((id) => id !== s.id),
                    })),
                )
              }
            >
              삭제
            </button>
          </header>
          <div className="sw-grid">
            <label>
              단계 이름
              <input
                maxLength={60}
                value={s.name}
                onChange={(e) => patch(s.id, { name: e.target.value })}
              />
            </label>
            <label>
              업무 제목
              <input
                maxLength={160}
                value={s.title}
                onChange={(e) => patch(s.id, { title: e.target.value })}
              />
            </label>
            <label>
              완료 방식
              <select
                value={s.completionMode}
                onChange={(e) =>
                  patch(s.id, {
                    completionMode: e.target
                      .value as StagePlan["completionMode"],
                  })
                }
              >
                {Object.entries({
                  document: "문서",
                  design: "디자인",
                  code: "코드 · 배포",
                  test: "테스트",
                  deploy: "배포 작업",
                }).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            작업 범위 · 완료 기준
            <textarea
              value={s.brief}
              onChange={(e) => patch(s.id, { brief: e.target.value })}
            />
          </label>
          {(["assigneeIds", "reviewerIds"] as const).map((key) => (
            <fieldset key={key}>
              <legend>
                {key === "assigneeIds"
                  ? "담당자 (1명 이상)"
                  : "작업 승인자 (전원 승인)"}
              </legend>
              {(key === "assigneeIds" ? members : reviewers).map((m) => (
                <label className="sw-check" key={m.userId}>
                  <input
                    type="checkbox"
                    checked={s[key].includes(m.userId)}
                    onChange={(e) =>
                      patch(s.id, {
                        [key]: e.target.checked
                          ? [...s[key], m.userId]
                          : s[key].filter((id) => id !== m.userId),
                      })
                    }
                  />
                  {m.displayName}
                </label>
              ))}
            </fieldset>
          ))}
          <fieldset>
            <legend>선행 업무 · 병렬 작업은 선택하지 않음</legend>
            {value
              .filter((v) => v.id !== s.id)
              .map((v) => (
                <label className="sw-check" key={v.id}>
                  <input
                    type="checkbox"
                    checked={s.dependsOn.includes(v.id)}
                    onChange={(e) =>
                      patch(s.id, {
                        dependsOn: e.target.checked
                          ? [...s.dependsOn, v.id]
                          : s.dependsOn.filter((id) => id !== v.id),
                      })
                    }
                  />
                  {v.name} · {v.title}
                </label>
              ))}
          </fieldset>
        </section>
      ))}
    </fieldset>
  );
}
