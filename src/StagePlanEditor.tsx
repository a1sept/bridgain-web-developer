import { createLocalId } from "./browser-id";
import {
  sequenceStages,
  isSequential as hasSequentialOrder,
  moveStage,
  insertStage,
} from "./stage-order";
import { Fragment, useEffect, useState } from "react";
import "./stage-workflow.css";
import MemberPicker from "./MemberPicker";
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
  id: createLocalId(),
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
  const [types, setTypes] = useState<
    { name: string; completionMode: StagePlan["completionMode"] }[]
  >([]);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [dragged, setDragged] = useState<string | null>(null);
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    setTypes([]);
    fetch(`/api/workspace/projects/${projectId}/stage-settings`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((d) => setTypes(d.stageTypes || []))
      .catch(() => {});
    return () => controller.abort();
  }, [projectId]);
  const categories = types.length
    ? types
    : [
        { name: "기획", completionMode: "document" as const },
        { name: "디자인", completionMode: "design" as const },
        { name: "개발", completionMode: "code" as const },
      ];
  const patch = (id: string, change: Partial<StagePlan>) =>
    onChange(value.map((s) => (s.id === id ? { ...s, ...change } : s)));
  const ordered = sequenceStages<StagePlan>;
  const isSequential = hasSequentialOrder(value);
  const reorder = (from: number, to: number) => {
    if (disabled || from === to || from < 0 || to < 0 || to >= value.length)
      return;
    if (
      !isSequential &&
      !window.confirm(
        "기존 병렬·선행 연결이 있습니다. 변경한 순서대로 한 업무씩 진행하도록 바꿀까요?",
      )
    )
      return;
    onChange(moveStage(value, from, to));
  };
  const addTask = (index: number) => {
    if (disabled) return;
    if (
      !isSequential &&
      index < value.length &&
      !window.confirm(
        "기존 병렬·선행 연결이 있습니다. 새 업무를 삽입하고 표시 순서대로 진행하도록 바꿀까요?",
      )
    )
      return;
    const stage = { ...newStage(""), title: "" };
    setCollapsed(value.map((s) => s.id));
    onChange(insertStage(value, stage, index));
  };
  const insertionPoint = (index: number) => (
    <div className="sw-task-insert">
      <button
        type="button"
        aria-label={`${index + 1}번째 위치에 업무 추가`}
        onClick={() => addTask(index)}
      >
        ＋
      </button>
    </div>
  );
  return (
    <fieldset className="sw-editor sw-task-editor" disabled={disabled}>
      <legend>업무</legend>
      {value.length > 0 && (
        <div
          className="sw-flow"
          aria-label={isSequential ? "업무 순서" : "업무 목록 (기존 연결 유지)"}
        >
          {value.map((s, i) => (
            <span key={s.id}>
              {isSequential && i > 0 && "→ "}
              {i + 1}. {s.title || "새 업무"}
            </span>
          ))}
        </div>
      )}
      {!isSequential && (
        <p>
          기존 병렬·선행 연결을 유지하고 있습니다. 순서를 변경할 때 순차
          진행으로 전환할 수 있습니다.
        </p>
      )}
      {!value.length && <p>업무를 추가하고 담당자와 승인자를 지정하세요.</p>}
      {value.map((s, i) => (
        <Fragment key={s.id}>
          {!disabled && insertionPoint(i)}
          <section
            className="sw-stage"
            key={s.id}
            onDragOver={(e) => {
              if (!disabled) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragged)
                reorder(
                  value.findIndex((v) => v.id === dragged),
                  i,
                );
              setDragged(null);
            }}
          >
            <header>
              <button
                type="button"
                className="sw-drag"
                disabled={disabled}
                draggable={!disabled}
                aria-label={`${i + 1}번 업무 순서 이동`}
                onDragStart={(e) => {
                  setDragged(s.id);
                  e.dataTransfer.setData("text/plain", s.id);
                }}
                onDragEnd={() => setDragged(null)}
              >
                ≡
              </button>
              <strong>
                {i + 1}. {s.title || "새 업무"}
              </strong>
              <span className="sw-category">{s.name || "카테고리 미지정"}</span>
              <button
                type="button"
                disabled={i === 0}
                aria-label={`${i + 1}번 업무 위로`}
                onClick={() => reorder(i, i - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={i === value.length - 1}
                aria-label={`${i + 1}번 업무 아래로`}
                onClick={() => reorder(i, i + 1)}
              >
                ↓
              </button>
              <button
                type="button"
                aria-expanded={!collapsed.includes(s.id)}
                onClick={() =>
                  setCollapsed((v) =>
                    v.includes(s.id)
                      ? v.filter((id) => id !== s.id)
                      : [...v, s.id],
                  )
                }
              >
                {collapsed.includes(s.id) ? "펼치기" : "접기"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    (s.title.trim() ||
                      s.brief.trim() ||
                      s.assigneeIds.length ||
                      s.reviewerIds.length) &&
                    !window.confirm("작성한 업무를 삭제할까요?")
                  )
                    return;
                  const next = value.filter((v) => v.id !== s.id);
                  onChange(
                    isSequential
                      ? ordered(next)
                      : next.map((v) => ({
                          ...v,
                          dependsOn: v.dependsOn.filter((id) => id !== s.id),
                        })),
                  );
                }}
              >
                삭제
              </button>
            </header>
            {collapsed.includes(s.id) ? (
              <p className="sw-help">
                담당:{" "}
                {s.assigneeIds
                  .map(
                    (id) =>
                      members.find((m) => m.userId === id)?.displayName ||
                      "기존 멤버",
                  )
                  .join(", ") || "미지정"}{" "}
                · 승인:{" "}
                {s.reviewerIds
                  .map(
                    (id) =>
                      reviewers.find((m) => m.userId === id)?.displayName ||
                      "기존 멤버",
                  )
                  .join(", ") || "미지정"}
              </p>
            ) : (
              <>
                <div className="sw-people-row">
                  <MemberPicker
                    label="담당자"
                    items={members}
                    value={s.assigneeIds}
                    disabled={disabled}
                    onChange={(ids) => patch(s.id, { assigneeIds: ids })}
                  />
                  <MemberPicker
                    label="작업 승인자"
                    items={reviewers}
                    value={s.reviewerIds}
                    disabled={disabled}
                    onChange={(ids) => patch(s.id, { reviewerIds: ids })}
                  />
                </div>
                <label className="sw-inline-field">
                  <span>업무 제목</span>
                  <input
                    maxLength={160}
                    placeholder="무엇을 할 업무인가요?"
                    value={s.title}
                    onChange={(e) => patch(s.id, { title: e.target.value })}
                  />
                </label>
                <label className="sw-inline-field">
                  <span>카테고리</span>
                  <select
                    value={s.name}
                    onChange={(e) => {
                      const t = categories.find(
                        (t) => t.name === e.target.value,
                      );
                      if (t)
                        patch(s.id, {
                          name: t.name,
                          completionMode: t.completionMode,
                        });
                    }}
                  >
                    <option value="" disabled>
                      선택하세요
                    </option>
                    {!!s.name && !categories.some((t) => t.name === s.name) && (
                      <option value={s.name}>{s.name}</option>
                    )}
                    {categories.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  업무 내용
                  <textarea
                    rows={4}
                    maxLength={10000}
                    placeholder="해야 할 일과 전달할 내용을 작성하세요."
                    value={s.brief}
                    onChange={(e) => patch(s.id, { brief: e.target.value })}
                  />
                </label>
                <div className="sw-actions">
                  <button
                    type="button"
                    onClick={() => setCollapsed((v) => [...v, s.id])}
                  >
                    작성 마치기
                  </button>
                </div>
              </>
            )}
          </section>
        </Fragment>
      ))}
      {!!value.length && !disabled && insertionPoint(value.length)}
      {!disabled && (
        <div className="sw-add-task-row">
          <button
            type="button"
            className="sw-add-task"
            onClick={() => addTask(value.length)}
          >
            ＋ 업무 추가
          </button>
        </div>
      )}
      <p>
        업무를 끌거나 ↑ ↓ 버튼으로 순서를 정하세요. 앞 업무의 작업 승인 후 다음
        업무가 열립니다.
      </p>
    </fieldset>
  );
}
