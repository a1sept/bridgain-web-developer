import { useEffect, useRef, useState } from "react";
import { workflowApi } from "../Approvals";
import ControlIcon from "../components/ControlIcon";
import FilterBar from "../components/FilterBar";
type Role = { id: string; name: string; permissions: string[] };
type Member = { userId: string; displayName: string; roleIds: string[] };
export default function StudyRoleMembers({ base, role, roles, members, permissions, isOwner, onChanged, onBack }: {
  base: string; role: Role; roles: Role[]; members: Member[]; permissions: string[]; isOwner: boolean;
  onChanged: () => Promise<unknown>; onBack: () => void;
}) {
  const [filter, setFilter] = useState<string[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const lock = useRef(false);
  useEffect(() => { heading.current?.focus(); }, []);
  const canAssign = permissions.includes("study.roles.assign") && role.name !== "관리자" &&
    (isOwner || (!["부관리자", "회원"].includes(role.name) && role.permissions.every(p => permissions.includes(p) && !["study.roles.manage", "study.roles.assign"].includes(p))));
  const ownerRoleId = roles.find(r => r.name === "관리자")?.id;
  const visible = members.filter(m => !filter.length || filter.includes(m.userId));
  const assigned = visible.filter(m => m.roleIds.includes(role.id));
  const available = visible.filter(m => !m.roleIds.includes(role.id) && !m.roleIds.includes(ownerRoleId ?? ""));
  async function change(member: Member, grant: boolean) {
    if (lock.current) return;
    if (!grant && !window.confirm(`${member.displayName}님의 ${role.name} 역할을 해제할까요? 다른 역할과 공간 참여는 유지됩니다.`)) return;
    lock.current = true; setPending(member.userId); setError(""); setNotice("");
    let applied = false;
    try {
      // Refresh membership before changing one role so other assigned roles are preserved.
      const latest = await workflowApi<{ members: Member[] }>(base);
      const current = latest.members.find(m => m.userId === member.userId);
      if (!current) throw new Error("이 회원은 더 이상 공간에 참여하고 있지 않습니다. 목록을 다시 불러오세요.");
      const roleIds = grant ? [...new Set([...current.roleIds, role.id])] : current.roleIds.filter(id => id !== role.id);
      await workflowApi(`${base}/members/${member.userId}/roles`, { roleIds }, "PATCH");
      applied = true;
      await onChanged();
      setNotice(`${member.displayName}님의 ${role.name} 역할을 ${grant ? "부여" : "해제"}했습니다.`);
      heading.current?.focus({ preventScroll: true });
    } catch (e) {
      setError(applied ? "역할은 변경되었지만 목록을 갱신하지 못했습니다. 목록 새로고침을 눌러 확인하세요." : e instanceof Error ? e.message : "역할을 변경하지 못했습니다. 다시 시도하세요.");
    } finally { lock.current = false; setPending(null); }
  }
  return <section className="study-roles-page study-role-members" aria-busy={pending !== null}>
    <header className="study-role-editor-heading">
      <button className="study-settings-back" disabled={pending !== null} onClick={onBack}><ControlIcon name="back" /> 역할 목록으로</button>
      <h3 ref={heading} tabIndex={-1}>{role.name} · 회원</h3>
      <p>이 역할을 가진 회원을 확인하고 부여·해제합니다. 다른 역할은 그대로 유지됩니다.</p>
    </header>
    {!canAssign && <p className="study-field-help">{role.name === "관리자" ? "공간을 만든 관리자의 역할은 부여하거나 해제할 수 없습니다." : "이 역할을 부여·해제할 권한이 없어 조회만 가능합니다."}</p>}
    {notice && <p className="study-role-notice" role="status">{notice}</p>}
    {error && <div className="study-error" role="alert"><p>{error}</p><button disabled={pending !== null} onClick={async () => { try { await onChanged(); setError(""); } catch { setError("목록을 갱신하지 못했습니다. 다시 시도하세요."); } }}>목록 새로고침</button></div>}
    <FilterBar label="역할 회원 검색" filters={[{id:"member",label:"회원 검색",trigger:"search",options:members.map(m=>({value:m.userId,label:m.displayName})),values:filter,onChange:setFilter}]} onClear={()=>setFilter([])} />
    {[{title:"이 역할을 가진 회원",rows:assigned,grant:false}, ...(canAssign ? [{title:"역할을 부여할 회원",rows:available,grant:true}] : [])].map(group => <section className="study-role-member-group" key={group.title}>
      <h4>{group.title} <span>{group.rows.length}명</span></h4>
      {group.rows.length ? <ul className="study-list">{group.rows.map(m => <li key={m.userId}>
        <div><strong>{m.displayName}</strong><p>{roles.filter(r=>m.roleIds.includes(r.id)).map(r=>r.name).join(" · ") || "지정된 역할 없음"}</p></div>
        {canAssign && !m.roleIds.includes(ownerRoleId ?? "") ? <button className={group.grant ? "study-role-grant" : "study-role-revoke"} disabled={pending !== null} aria-label={`${m.displayName} ${role.name} ${group.grant ? "부여" : "해제"}`} onClick={()=>void change(m,group.grant)}>{pending === m.userId ? "적용 중…" : group.grant ? "역할 부여" : "역할 해제"}</button> : <span className="study-badge">{m.roleIds.includes(ownerRoleId ?? "") ? "관리자 · 변경 불가" : "조회 전용"}</span>}
      </li>)}</ul> : <p className="study-role-members-empty">{filter.length ? "선택한 회원이 이 목록에 없습니다." : group.grant ? "추가로 역할을 부여할 회원이 없습니다." : "아직 이 역할을 가진 회원이 없습니다."}</p>}
    </section>)}
  </section>;
}
