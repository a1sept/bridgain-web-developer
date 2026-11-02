import { useState, type FormEvent } from "react";
import { workflowApi } from "../Approvals";
import FilterBar from "../components/FilterBar";
type Role = {
  id: string;
  name: string;
  permissions: string[];
  defaultPermissions?: string[] | null;
};
type Member = { userId: string; displayName: string; roleIds: string[] };
const catalog = [
  ["programs.manage", "프로그램 관리"],
  ["sessions.manage", "회차 관리"],
  ["activities.manage", "참여 활동 관리"],
  ["materials.manage", "운영 자료 편집"],
  ["submissions.read", "제출물 조회"],
  ["attendance.read", "출석 조회"],
  ["live.host", "라이브 진행"],
  ["members.invite", "회원 초대"],
  ["members.remove", "회원 제거"],
  ["roles.manage", "역할 설정 관리"],
  ["roles.assign", "회원 역할 지정"],
  ["settings.manage", "공간·출석 설정"],
  ["attendance.adjust", "출석 보정"],
];
export default function StudyRoles({
  base,
  roles,
  members,
  permissions,
  isOwner,
  onChanged,
}: {
  base: string;
  roles: Role[];
  members: Member[];
  permissions: string[];
  isOwner: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState<Role | null | undefined>(undefined),
    [name, setName] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [target, setTarget] = useState(""),
    [assigned, setAssigned] = useState<string[]>([]);
  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
      await onChanged();
      setEditing(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  function edit(r: Role | null) {
    setEditing(r);
    setName(r?.name ?? "");
    setSelected(r?.permissions ?? []);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    void run(() =>
      workflowApi(
        `${base}/roles${editing ? `/${editing.id}` : ""}`,
        { name, permissions: selected },
        editing ? "PATCH" : "POST",
      ),
    );
  }
  const canManage = permissions.includes("study.roles.manage"),
    canAssign = permissions.includes("study.roles.assign");
  return (
    <section className="study-panel">
      <h3>역할·권한</h3>
      <p>
        회원은 여러 역할을 함께 가질 수 있습니다. 각 역할의 허용 권한이
        합산됩니다.
      </p>
      {error && (
        <p role="alert" className="study-error">
          {error}
        </p>
      )}
      {editing !== undefined ? (
        <form onSubmit={submit} className="study-form">
          <label>
            역할 이름
            <input
              value={name}
              required
              maxLength={60}
              disabled={
                !!editing &&
                ["관리자", "부관리자", "회원"].includes(editing.name)
              }
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <ul className="study-list">
            {catalog.map(([key, label]) => {
              const id = `study.${key}`,
                has = selected.includes(id);
              return (
                <li key={id}>
                  <span>{label}</span>
                  <button
                    type="button"
                    aria-pressed={has}
                    disabled={busy || (!isOwner && !permissions.includes(id))}
                    onClick={() =>
                      setSelected((v) =>
                        has ? v.filter((x) => x !== id) : [...v, id],
                      )
                    }
                  >
                    {has ? "허용" : "허용 안 함"}
                  </button>
                </li>
              );
            })}
          </ul>
          <p>이 역할을 가진 모든 회원에게 변경 사항이 적용됩니다.</p>
          <footer>
            <button type="button" onClick={() => setEditing(undefined)}>
              취소
            </button>
            <button className="pw-primary" disabled={busy}>
              저장
            </button>
          </footer>
        </form>
      ) : (
        <>
          <ul className="study-list">
            {roles.map((r) => (
              <li key={r.id}>
                <div>
                  <strong>{r.name}</strong>
                  <p>
                    {r.permissions.length}개 권한 ·{" "}
                    {members.filter((m) => m.roleIds.includes(r.id)).length}명
                  </p>
                </div>
                {canManage && r.name !== "관리자" && (
                  <div className="study-actions">
                    <button onClick={() => edit(r)}>수정</button>
                    {["부관리자", "회원"].includes(r.name) ? (
                      isOwner && (
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                `${r.name} 역할의 권한을 생성 당시 기본값으로 되돌릴까요?\n추가: ${
                                  catalog
                                    .filter(
                                      ([key]) =>
                                        r.defaultPermissions?.includes(
                                          `study.${key}`,
                                        ) &&
                                        !r.permissions.includes(`study.${key}`),
                                    )
                                    .map(([, label]) => label)
                                    .join(", ") || "없음"
                                }\n제거: ${
                                  catalog
                                    .filter(
                                      ([key]) =>
                                        r.permissions.includes(
                                          `study.${key}`,
                                        ) &&
                                        !r.defaultPermissions?.includes(
                                          `study.${key}`,
                                        ),
                                    )
                                    .map(([, label]) => label)
                                    .join(", ") || "없음"
                                }\n회원의 역할 지정과 기록은 유지됩니다.`,
                              )
                            )
                              void run(() =>
                                workflowApi(
                                  `${base}/roles/${r.id}`,
                                  { action: "reset" },
                                  "PATCH",
                                ),
                              );
                          }}
                        >
                          기본값 복원
                        </button>
                      )
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `${r.name} 역할을 삭제할까요? 이 역할을 가진 회원은 해당 권한을 잃습니다.`,
                            )
                          )
                            void run(() =>
                              workflowApi(
                                `${base}/roles/${r.id}`,
                                { action: "delete" },
                                "PATCH",
                              ),
                            );
                        }}
                      >
                        삭제
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {canManage && <button onClick={() => edit(null)}>역할 추가</button>}
          {canAssign && (
            <div className="study-form">
              <h3>회원 역할 지정</h3>
              <label>
                회원
                <select
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    setAssigned(
                      members.find((m) => m.userId === e.target.value)
                        ?.roleIds ?? [],
                    );
                  }}
                >
                  <option value="">회원 선택</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.displayName}
                    </option>
                  ))}
                </select>
              </label>
              {target && (
                <>
                  <FilterBar
                    filters={[
                      {
                        id: "roles",
                        label: "역할",
                        options: roles.map((r) => ({
                          value: r.id,
                          label: r.name,
                        })),
                        values: assigned,
                        multiple: true,
                        onChange: setAssigned,
                      },
                    ]}
                    onClear={() => setAssigned([])}
                  />
                  <p>다른 역할의 권한도 함께 적용됩니다.</p>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        workflowApi(
                          `${base}/members/${target}/roles`,
                          { roleIds: assigned },
                          "PATCH",
                        ),
                      )
                    }
                  >
                    역할 적용
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
