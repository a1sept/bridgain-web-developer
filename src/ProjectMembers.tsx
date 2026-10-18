import { useEffect, useState, type CSSProperties } from "react";
import { workflowApi } from "./Approvals";
import "./project-members.css";

type Role = { id: string; name: string; color?: string; permissions: string[] };
type Permission = { id: string; label: string; group: string };
type Member = {
  userId: string;
  displayName: string;
  accountType: string;
  permissionRole?: string;
  accessRole?: string;
};
type MemberInvitation = {
  id: string;
  inviteeId: string;
  inviteeName: string;
  inviteeAccountType?: string | null;
  status: string;
  createdAt?: string;
};
const invitationStatus: Record<string, string> = {
  pending: "초대 대기",
  accepted: "수락 완료",
  declined: "초대 거절",
  canceled: "초대 취소",
  cancelled: "초대 취소",
};
type RoleData = {
  roles: Role[];
  catalog: Permission[];
  members: {
    userId: string;
    roleIds: string[];
    permissions: string[];
    isOwner?: boolean;
    rolesConfigured?: boolean;
  }[];
  canManageRoles: boolean;
  canManageMembers: boolean;
};
const roleColors = [
  "#2D63ED",
  "#7C3AED",
  "#0891B2",
  "#059669",
  "#D97706",
  "#DC2626",
  "#DB2777",
  "#64748B",
];
function roleStyle(value = roleColors[0]): CSSProperties {
  const color = /^#[0-9a-f]{6}$/i.test(value) ? value : roleColors[0];
  const channels = [1, 3, 5]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return {
    "--role-color": color,
    "--role-tint": `${color}14`,
    "--role-ink": luminance > 0.179 ? "#000000" : "#FFFFFF",
  } as CSSProperties;
}
export default function ProjectMembers({
  projectId,
  members,
  userId,
  onChanged,
  invitations = [],
  canManageInvitations = false,
  invitationBusy = false,
  onCancelInvitation,
}: {
  projectId: string;
  members: Member[];
  userId: string;
  onChanged: () => Promise<void>;
  invitations?: MemberInvitation[];
  canManageInvitations?: boolean;
  invitationBusy?: boolean;
  onCancelInvitation?: (id: string) => void;
}) {
  const [tab, setTab] = useState("members");
  const [data, setData] = useState<RoleData>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState(roleColors[0]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [dirty, setDirty] = useState(false);
  const [retry, setRetry] = useState(0);
  async function load() {
    const next = await workflowApi<RoleData>(`/projects/${projectId}/roles`);
    setData(next);
    setAssignments(
      Object.fromEntries(next.members.map((m) => [m.userId, m.roleIds])),
    );
  }
  useEffect(() => {
    let active = true;
    setError("");
    void workflowApi<RoleData>(`/projects/${projectId}/roles`)
      .then((next) => {
        if (!active) return;
        setData(next);
        setAssignments(
          Object.fromEntries(next.members.map((m) => [m.userId, m.roleIds])),
        );
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof TypeError || e instanceof SyntaxError
              ? "서버에 연결하지 못했어요. 잠시 후 다시 불러와주세요."
              : e.message,
          );
      });
    return () => {
      active = false;
    };
  }, [projectId, retry]);
  function select(role?: Role) {
    if (
      dirty &&
      !window.confirm("저장하지 않은 역할 변경을 버리고 이동할까요?")
    )
      return;
    setSelected(role?.id || null);
    setName(role?.name || "");
    setColor(
      role?.color || roleColors[(data?.roles.length || 0) % roleColors.length],
    );
    setPermissions(role?.permissions || []);
    setDirty(false);
    setNotice("");
  }
  async function save(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await load();
      await onChanged();
      setNotice("저장했어요.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className="pw-panel">
        <p role={error ? "alert" : "status"}>
          {error || "참여자와 역할을 불러오고 있어요."}
        </p>
        {error && (
          <button
            className="pw-secondary"
            onClick={() => setRetry((v) => v + 1)}
          >
            다시 불러오기
          </button>
        )}
      </section>
    );
  const latestInvitations = new Map<string, MemberInvitation>();
  for (const invite of [...invitations].sort((a, b) =>
    (b.createdAt || "").localeCompare(a.createdAt || ""),
  )) {
    if (!latestInvitations.has(invite.inviteeId))
      latestInvitations.set(invite.inviteeId, invite);
  }
  const unjoinedInvitations = [...latestInvitations.values()].filter(
    (i) =>
      i.status !== "accepted" && !members.some((m) => m.userId === i.inviteeId),
  );
  const groups = [...new Set(data.catalog.map((p) => p.group))];
  return (
    <section className="pm-root">
      <div className="pm-tabs" role="tablist" aria-label="참여자 관리">
        <button
          role="tab"
          aria-selected={tab === "members"}
          onClick={() => {
            if (
              dirty &&
              !window.confirm("저장하지 않은 역할 변경을 버리고 이동할까요?")
            )
              return;
            setTab("members");
            setDirty(false);
          }}
        >
          참여자 <span>{members.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === "roles"}
          onClick={() => setTab("roles")}
        >
          역할·권한 <span>{data.roles.length}</span>
        </button>
      </div>
      {error && (
        <p className="pm-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="pm-notice" role="status">
          {notice}
        </p>
      )}
      {tab === "members" ? (
        <div className="pm-member-cards">
          {(["team", "client"] as const).map((type) => (
            <section
              key={type}
              className={`pw-panel pm-member-card pm-member-card-${type}`}
              aria-label={type === "team" ? "개발팀 참여자" : "의뢰자 참여자"}
            >
              <div className="pm-member-card-heading">
                <h2>{type === "team" ? "개발팀" : "의뢰자"}</h2>
                <span>
                  {members.filter((m) => m.accountType === type).length}명
                  {unjoinedInvitations.some(
                    (i) =>
                      i.inviteeAccountType === type && i.status === "pending",
                  ) &&
                    ` · 초대 대기 ${unjoinedInvitations.filter((i) => i.inviteeAccountType === type && i.status === "pending").length}명`}
                </span>
              </div>
              <p className="pw-muted">
                {type === "team"
                  ? "역할을 복수로 부여할 수 있어요. 권한은 이 프로젝트에만 적용됩니다."
                  : "이 프로젝트에 참여한 의뢰자입니다."}
              </p>
              {members
                .filter((m) => m.accountType === type)
                .map((member) => {
                  const state = data.members.find(
                    (m) => m.userId === member.userId,
                  );
                  const owner = !!state?.isOwner;
                  const ids = assignments[member.userId] || [];
                  const changed =
                    JSON.stringify([...ids].sort()) !==
                    JSON.stringify([...(state?.roleIds || [])].sort());
                  return (
                    <article className="pm-member" key={member.userId}>
                      <div className="pm-person">
                        <span className="pw-avatar">
                          {member.displayName.slice(0, 1)}
                        </span>
                        <div>
                          <strong>
                            {member.displayName}
                            {member.userId === userId && " · 나"}
                          </strong>
                          <p>
                            {type === "client"
                              ? "의뢰자"
                              : owner
                                ? "프로젝트 소유자 · 전체 권한"
                                : "개발팀 참여자"}
                          </p>
                        </div>
                      </div>
                      {type === "team" && (
                        <>
                          <div className="pm-assignment">
                            <div
                              className="pm-chip-list"
                              aria-label={`${member.displayName} 역할`}
                            >
                              {data.roles.map((role) => (
                                <button
                                  key={role.id}
                                  style={roleStyle(role.color)}
                                  className={`pm-chip ${ids.includes(role.id) ? "is-selected" : ""}`}
                                  aria-pressed={ids.includes(role.id)}
                                  disabled={
                                    !data.canManageRoles || busy || owner
                                  }
                                  onClick={() =>
                                    setAssignments((v) => ({
                                      ...v,
                                      [member.userId]: ids.includes(role.id)
                                        ? ids.filter((id) => id !== role.id)
                                        : [...ids, role.id],
                                    }))
                                  }
                                >
                                  <span aria-hidden="true">
                                    {ids.includes(role.id)
                                      ? "✓"
                                      : role.name.slice(0, 1)}
                                  </span>
                                  {role.name}
                                </button>
                              ))}
                              {!data.roles.length && (
                                <p className="pw-muted">
                                  역할·권한 탭에서 역할을 만들어주세요.
                                </p>
                              )}
                            </div>
                            {data.canManageRoles && !owner && (
                              <button
                                className="pw-secondary"
                                disabled={busy || !changed}
                                onClick={() =>
                                  void save(() =>
                                    workflowApi(
                                      `/projects/${projectId}/member-roles/${member.userId}`,
                                      { roleIds: ids },
                                      "PATCH",
                                    ),
                                  )
                                }
                              >
                                저장
                              </button>
                            )}
                          </div>
                          <p className="pm-effective">
                            {state &&
                              !state.rolesConfigured &&
                              !owner &&
                              "기존 참여 권한 적용 중 · 역할 저장 시 선택한 역할의 권한으로 전환됩니다. "}
                            {owner
                              ? "소유자는 프로젝트의 모든 권한을 유지합니다."
                              : state?.permissions.length
                                ? `적용 권한: ${state.permissions.map((id) => data.catalog.find((p) => p.id === id)?.label || id).join(" · ")}`
                                : "부여된 권한이 없습니다."}
                          </p>
                        </>
                      )}
                    </article>
                  );
                })}
              {unjoinedInvitations
                .filter((i) => i.inviteeAccountType === type)
                .map((invite) => (
                  <article
                    className="pm-member pm-invited-member"
                    key={invite.id}
                  >
                    <div className="pm-person">
                      <span className="pw-avatar pm-invite-avatar">
                        {invite.inviteeName.slice(0, 1)}
                      </span>
                      <div>
                        <strong>{invite.inviteeName}</strong>
                        <p>{type === "team" ? "개발팀 초대" : "의뢰자 초대"}</p>
                      </div>
                      <span
                        className={`pm-join-status ${invite.status === "accepted" ? "is-accepted" : "is-waiting"}`}
                      >
                        {invitationStatus[invite.status] || "초대 상태 확인 중"}
                      </span>
                    </div>
                    {invite.status === "pending" && (
                      <div className="pm-invite-actions">
                        <p className="pw-muted">
                          초대를 수락하면 프로젝트에 참여할 수 있어요.
                        </p>
                        {canManageInvitations && onCancelInvitation && (
                          <button
                            className="pw-secondary"
                            disabled={invitationBusy}
                            onClick={() => onCancelInvitation(invite.id)}
                          >
                            초대 취소
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              {!members.some((m) => m.accountType === type) &&
                !unjoinedInvitations.some(
                  (i) => i.inviteeAccountType === type,
                ) && <p className="pw-muted">아직 참여자가 없어요.</p>}
            </section>
          ))}
        </div>
      ) : (
        <div className="pw-panel">
          <div className="pm-role-heading">
            <div>
              <h2>역할·권한</h2>
              <p className="pw-muted">
                역할 이름과 허용할 기능을 정한 뒤 참여자에게 부여하세요.
              </p>
            </div>
            {data.canManageRoles && (
              <button
                className="pw-secondary"
                disabled={busy}
                onClick={() => select()}
              >
                ＋ 역할 만들기
              </button>
            )}
          </div>
          <div className="pm-role-rail" aria-label="역할 선택">
            {data.roles.map((role) => (
              <button
                key={role.id}
                style={roleStyle(role.color)}
                className={`pm-chip ${selected === role.id ? "is-selected" : ""}`}
                aria-pressed={selected === role.id}
                disabled={busy}
                onClick={() => select(role)}
              >
                <span aria-hidden="true">{role.name.slice(0, 1)}</span>
                {role.name}
              </button>
            ))}
            {!data.roles.length && (
              <p className="pw-muted">
                첫 역할을 만들어보세요. 예: 기획, 디자인, 개발
              </p>
            )}
          </div>
          <form
            className="pm-role-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save(async () => {
                const result = await workflowApi<{ role: Role }>(
                  `/projects/${projectId}/roles${selected ? `/${selected}` : ""}`,
                  { name: name.trim(), color, permissions },
                  selected ? "PATCH" : "POST",
                );
                setSelected(result.role.id);
                setName(result.role.name);
                setColor(result.role.color || roleColors[0]);
                setPermissions(result.role.permissions);
                setDirty(false);
              });
            }}
          >
            <label className="pm-name">
              역할 이름
              <input
                value={name}
                maxLength={50}
                required
                placeholder="예: 기획, 디자인, 개발"
                disabled={!data.canManageRoles || busy}
                onChange={(e) => {
                  setName(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
            <fieldset
              className="pm-colors"
              disabled={!data.canManageRoles || busy}
            >
              <legend>역할 색상</legend>
              <div className="pm-color-options">
                {roleColors.map((value, i) => (
                  <button
                    key={value}
                    type="button"
                    className="pm-color-swatch"
                    aria-label={`${["파랑", "보라", "청록", "초록", "주황", "빨강", "분홍", "회색"][i]} 역할 색상`}
                    aria-pressed={color.toUpperCase() === value}
                    style={{ ...roleStyle(value), backgroundColor: value }}
                    onClick={() => {
                      setColor(value);
                      setDirty(true);
                    }}
                  >
                    {color.toUpperCase() === value ? "✓" : ""}
                  </button>
                ))}
                <label className="pm-custom-color">
                  <input
                    type="color"
                    aria-label="사용자 지정 역할 색상"
                    value={color}
                    onChange={(e) => {
                      setColor(e.target.value.toUpperCase());
                      setDirty(true);
                    }}
                  />
                  직접 선택
                </label>
                <code>{color}</code>
              </div>
              <div className="pm-color-preview">
                <small>미리보기</small>
                <span className="pm-chip is-selected" style={roleStyle(color)}>
                  <span aria-hidden="true">
                    {name.trim().slice(0, 1) || "역"}
                  </span>
                  {name.trim() || "역할 이름"}
                </span>
              </div>
            </fieldset>
            <div className="pm-permission-heading">
              <h3>허용할 권한</h3>
              <label>
                <input
                  type="checkbox"
                  disabled={!data.canManageRoles || busy}
                  checked={
                    data.catalog.length > 0 &&
                    data.catalog.every((p) => permissions.includes(p.id))
                  }
                  onChange={(e) => {
                    setPermissions(
                      e.target.checked ? data.catalog.map((p) => p.id) : [],
                    );
                    setDirty(true);
                  }}
                />
                전체 선택
              </label>
            </div>
            <p className="pw-muted">
              작성·수정·승인 권한을 선택하면 필요한 조회 권한도 함께 적용됩니다.
            </p>
            <div className="pm-permission-grid">
              {groups.map((group) => (
                <fieldset key={group}>
                  <legend>
                    <label className="pm-group-toggle">
                      <input
                        type="checkbox"
                        aria-label={`${group} 권한 전체 선택`}
                        disabled={!data.canManageRoles || busy}
                        checked={data.catalog
                          .filter((p) => p.group === group)
                          .every((p) => permissions.includes(p.id))}
                        ref={(node) => {
                          if (!node) return;
                          const groupIds = data.catalog
                            .filter((p) => p.group === group)
                            .map((p) => p.id);
                          const count = groupIds.filter((id) =>
                            permissions.includes(id),
                          ).length;
                          node.indeterminate =
                            count > 0 && count < groupIds.length;
                        }}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          const groupIds = data.catalog
                            .filter((p) => p.group === group)
                            .map((p) => p.id);
                          setPermissions((current) =>
                            checked
                              ? [...new Set([...current, ...groupIds])]
                              : current.filter((id) => !groupIds.includes(id)),
                          );
                          setDirty(true);
                        }}
                      />
                      {group}
                    </label>
                  </legend>
                  {data.catalog
                    .filter((p) => p.group === group)
                    .map((p) => (
                      <label key={p.id}>
                        <input
                          type="checkbox"
                          disabled={!data.canManageRoles || busy}
                          checked={permissions.includes(p.id)}
                          onChange={(e) => {
                            setPermissions((v) =>
                              e.target.checked
                                ? [...v, p.id]
                                : v.filter((id) => id !== p.id),
                            );
                            setDirty(true);
                          }}
                        />
                        {p.label}
                      </label>
                    ))}
                </fieldset>
              ))}
            </div>
            <div className="pm-form-footer">
              <p className="pw-muted">
                역할 변경은 해당 역할을 가진 모든 프로젝트 참여자에게
                적용됩니다.
              </p>
              {data.canManageRoles && (
                <button
                  className="pw-primary"
                  disabled={busy || !name.trim() || (!!selected && !dirty)}
                >
                  {busy ? "저장 중…" : selected ? "역할 저장" : "역할 만들기"}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
