import { useState, useRef, useEffect, type FormEvent } from "react";
import { workflowApi } from "../Approvals";
import StudyRoleMembers from "./StudyRoleMembers";
import ControlIcon from "../components/ControlIcon";
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
    [busy, setBusy] = useState(false);
  const [memberRoleId, setMemberRoleId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const editTrigger = useRef<string>("");
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (editing === undefined && !memberRoleId && !busy && restoreFocus.current) {
      document.getElementById(editTrigger.current)?.focus();
      restoreFocus.current = false;
    }
  }, [editing, busy, memberRoleId]);
  const dirty = editing !== undefined && (name !== (editing?.name ?? "") ||
    [...selected].sort().join() !== [...(editing?.permissions ?? [])].sort().join());
  useEffect(() => { if (editing !== undefined) editorHeading.current?.focus(); }, [editing]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function returnToList() {
    restoreFocus.current = editing !== undefined;
    setEditing(undefined); setError("");
  }
  function cancel() {
    if (busy) return;
    if (dirty && !window.confirm("저장하지 않은 변경 사항을 버리고 역할 목록으로 돌아갈까요?")) return;
    returnToList();
  }
  async function run(fn: () => Promise<unknown>, message = "변경 사항을 적용했습니다.") {
    if (busy) return;
    setBusy(true);
    setError(""); setNotice("");
    try {
      await fn();
      await onChanged();
      returnToList();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  function edit(r: Role | null, trigger: HTMLButtonElement) {
    editTrigger.current = trigger.id;
    setError(""); setNotice("");
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
      `${name} 역할을 저장했습니다.`,
    );
  }
  const canManage = permissions.includes("study.roles.manage"),
    canAssign = permissions.includes("study.roles.assign");
  const canAssignRole = (r: Role) => canAssign && r.name !== "관리자" && (isOwner ||
    (!["부관리자", "회원"].includes(r.name) && r.permissions.every(p => permissions.includes(p) && !["study.roles.manage", "study.roles.assign"].includes(p))));
  if (memberRoleId) {
    const role = roles.find(r => r.id === memberRoleId);
    const back = () => { restoreFocus.current = true; setMemberRoleId(null); };
    if (!role) return <section className="study-roles-page"><button onClick={back}>역할 목록으로</button><p role="status">이 역할이 삭제되었거나 더 이상 조회할 수 없습니다.</p></section>;
    return <StudyRoleMembers base={base} role={role} roles={roles} members={members} permissions={permissions} isOwner={isOwner} onChanged={onChanged} onBack={back} />;
  }
  return (
    <section className="study-roles-page" aria-label="역할 설정">
      {editing === undefined ? <div className="study-heading study-role-heading">
        <div><h3>역할 설정</h3><p>역할별로 할 수 있는 일을 정합니다. 같은 역할의 모든 회원에게 적용됩니다.</p></div>
        {canManage && <button id="study-role-add" className="pw-primary" disabled={busy} onClick={e => edit(null, e.currentTarget)}>역할 추가</button>}
      </div> : <header className="study-role-editor-heading">
        <button className="study-settings-back" disabled={busy} onClick={cancel}><ControlIcon name="back" /> 역할 목록으로</button>
        <h3 ref={editorHeading} tabIndex={-1}>{editing ? `${editing.name} 역할 수정` : "새 역할 만들기"}</h3>
        <p>이 역할을 가진 모든 회원에게 적용됩니다. {dirty ? "저장하지 않은 변경 사항이 있습니다." : "허용할 기능을 선택하세요."}</p>
      </header>}
      {notice && <p className="study-role-notice" role="status">{notice}</p>}
      {!canManage && <p className="study-field-help">역할 목록을 조회할 수 있습니다. 권한 변경에는 역할 설정 관리 권한이 필요합니다.</p>}
      {error && (
        <p role="alert" className="study-error">
          {error}
        </p>
      )}
      {editing !== undefined ? (
        <form onSubmit={submit} className="study-form study-role-editor" aria-busy={busy}>
          <label>
            역할 이름
            <input
              value={name}
              required
              maxLength={60}
              disabled={busy || (!!editing && ["관리자", "부관리자", "회원"].includes(editing.name))}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {editing && ["부관리자", "회원"].includes(editing.name) && <p className="study-field-help">기본 역할의 이름은 변경할 수 없습니다.</p>}
          {[{title: "프로그램 운영", entries: catalog.slice(0, 7)}, {title: "회원·공간 관리", entries: catalog.slice(7)}].map(group => <section key={group.title} className="study-permission-group">
            <h4>{group.title}</h4>
          <ul className="study-list">
            {group.entries.map(([key, label]) => {
              const id = `study.${key}`,
                has = selected.includes(id);
              return (
                <li key={id}>
                  <span>{label}{!isOwner && !permissions.includes(id) && <small className="study-field-help">보유하지 않은 권한은 변경할 수 없습니다.</small>}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={has}
                    aria-label={`${label} 허용`}
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
          </ul></section>)}
          <footer>
            <button type="button" disabled={busy} onClick={cancel}>
              취소
            </button>
            <button className="pw-primary" disabled={busy}>
              {busy ? "저장 중…" : "역할 저장"}
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
                  <div className="study-actions">
                    <button id={`study-role-members-${r.id}`} disabled={busy} aria-label={`${r.name} ${canAssignRole(r) ? "회원 관리" : "회원 보기"}`} onClick={e => { editTrigger.current = e.currentTarget.id; setNotice(""); setError(""); setMemberRoleId(r.id); }}>{canAssignRole(r) ? "회원 관리" : "회원 보기"}</button>
                {canManage && r.name !== "관리자" && (
                  <>
                    <button id={`study-role-edit-${r.id}`} disabled={busy} aria-label={`${r.name} 역할 수정`} onClick={e => edit(r, e.currentTarget)}>권한 수정</button>
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
                  </>
                )}
                  </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
