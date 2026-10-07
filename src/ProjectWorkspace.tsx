import CreateProjectPage from "./CreateProjectPage";
import MobileProjectAction from "./MobileProjectAction";
import { useEffect, useRef, useState } from "react";
import "./project-workspace.css";

type Role = "client" | "team";
export type ProjectWorkspaceProps = {
  role: Role;
  displayName: string;
  userId: string;
  onExit: () => void;
};
type Person = { id: string; name: string; title: string; role: Role };
type Project = {
  id: number;
  name: string;
  description: string;
  status: "진행 중" | "준비 중" | "완료";
  color: string;
  members: Person[];
  date: string;
};
type Invitation = {
  id: number;
  project: string;
  description: string;
  from: string;
  status: "대기 중" | "수락함" | "거절함";
};
const people: Person[] = [
  { id: "TEAM-MINSU", name: "이민수", title: "개발자", role: "team" },
  { id: "TEAM-SOYOUNG", name: "박소영", title: "디자이너", role: "team" },
  { id: "TEAM-HYUN", name: "이현", title: "기획자", role: "team" },
  { id: "CLIENT-JIWOO", name: "김지우", title: "의뢰자", role: "client" },
  { id: "TEAM-YUJIN", name: "최유진", title: "개발자", role: "team" },
  { id: "CLIENT-HAEIN", name: "윤해인", title: "의뢰자", role: "client" },
];
const seed: Project[] = [
  {
    id: 1,
    name: "모아 쇼핑몰 리뉴얼",
    description:
      "더 편리한 쇼핑 경험을 함께 만들어요. 브랜드의 새로운 시작을 위한 웹사이트 리뉴얼 프로젝트입니다.",
    status: "진행 중",
    color: "blue",
    members: people.slice(0, 4),
    date: "2026.09.13",
  },
  {
    id: 2,
    name: "브랜드 소개 페이지",
    description: "우리의 이야기를 담은 브랜드 소개 페이지를 준비합니다.",
    status: "준비 중",
    color: "peach",
    members: [people[0], people[1], people[3]],
    date: "2026.09.11",
  },
];
function Avatar({ person }: { person: Person }) {
  return (
    <span
      className={`pw-avatar ${person.role === "client" ? "peach" : ""}`}
      title={person.name}
    >
      {person.name.slice(-2)}
    </span>
  );
}
export default function ProjectWorkspace({
  role,
  displayName,
  userId,
  onExit,
}: ProjectWorkspaceProps) {
  const [creating, setCreating] = useState(
    window.location.pathname === "/preview/projects/new",
  );
  useEffect(() => {
    const onPop = () =>
      setCreating(window.location.pathname === "/preview/projects/new");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  function leaveCreate() {
    window.history.replaceState({}, "", "/preview");
    setCreating(false);
  }
  const [projects, setProjects] = useState<Project[]>(seed);
  const [page, setPage] = useState<"projects" | "invitations">("projects");
  const [selected, setSelected] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("전체 상태");
  const [modal, setModal] = useState<"create" | "invite" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lookup, setLookup] = useState("");
  const [found, setFound] = useState<Person | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sent, setSent] = useState<
    { id: number; project: number; person: Person }[]
  >([]);
  const [invitations, setInvitations] = useState<Invitation[]>([
    {
      id: 1,
      project: "오브제 브랜드 웹사이트",
      description: "새로운 브랜드의 첫 웹사이트를 함께 준비해요.",
      from: "서준 · 오브제 스튜디오",
      status: "대기 중",
    },
  ]);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const project = projects.find((p) => p.id === selected);
  const filtered = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "전체 상태" || p.status === filter),
  );
  const pending = invitations.filter((i) => i.status === "대기 중").length;
  const openModal = (value: "create" | "invite") => {
    if (value === "create") {
      window.history.pushState({}, "", "/preview/projects/new");
      setCreating(true);
      window.scrollTo(0, 0);
      return;
    }
    setName("");
    setDescription("");
    setLookup("");
    setFound(null);
    setError("");
    setModal(value);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(userId);
      setNotice("내 사용자 ID를 복사했어요.");
    } catch {
      setNotice(`복사하지 못했어요. 사용자 ID를 직접 복사해주세요: ${userId}`);
    }
  };
  const respond = (inv: Invitation, accept: boolean) => {
    setInvitations((items) =>
      items.map((i) =>
        i.id === inv.id ? { ...i, status: accept ? "수락함" : "거절함" } : i,
      ),
    );
    if (accept)
      setProjects((items) => [
        ...items,
        {
          id: Date.now(),
          name: inv.project,
          description: inv.description,
          status: "준비 중",
          color: "mint",
          members: [
            {
              id: "TEAM-SEOJUN",
              name: "한서준",
              title: "기획자 · 프로젝트 관리자",
              role: "team",
            },
            {
              id: userId,
              name: displayName,
              title: role === "client" ? "의뢰자" : "개발자",
              role,
            },
          ],
          date: "2026.09.13",
        },
      ]);
    setNotice(
      accept
        ? "초대를 수락했어요. 프로젝트 목록에서 확인할 수 있어요."
        : "초대를 거절했어요.",
    );
  };
  if (creating && role === "team")
    return (
      <CreateProjectPage
        preview
        user={{ id: userId, displayName, accountType: role }}
        teams={[]}
        onBack={leaveCreate}
        onSearch={async (query, type) => people
          .filter(p => p.role === type && (p.name.toLowerCase().includes(query.toLowerCase()) || p.id.toLowerCase() === query.toLowerCase()))
          .map(p => ({id: p.id, displayName: p.name, accountType: p.role}))}
        onLookup={async (id) => {
          const person = people.find((p) => p.id === id.toUpperCase());
          if (!person)
            throw new Error(
              "샘플 ID를 입력해주세요: TEAM-YUJIN / CLIENT-HAEIN",
            );
          return {
            id: person.id,
            displayName: person.name,
            accountType: person.role,
          };
        }}
        onCreate={async (values) => {
          const id = Date.now();
          setProjects((items) => [
            ...items,
            {
              id,
              name: values.name,
              description: values.description,
              status: "준비 중",
              color: "mint",
              members: [
                { id: userId, name: displayName, title: "개발자", role },
              ],
              date: new Date().toLocaleDateString("ko-KR"),
            },
          ]);
          setSent((items) => [
            ...items,
            ...values.inviteeIds.map((uid, index) => ({
              id: id + index,
              project: id,
              person: people.find((p) => p.id === uid)!,
            })),
          ]);
          setSelected(id);
          setPage("projects");
          leaveCreate();
          setNotice("샘플 프로젝트를 만들었어요.");
        }}
      />
    );
  return (
    <div className="pw-shell">
      <aside className="pw-sidebar">
        <a className="pw-brand" href="/preview">
          <span className="pw-brand-icon">b</span> bridgain
          <span className="pw-brand-dot">.</span>
        </a>
        <div className="pw-workspace">
          <span className="pw-workspace-icon">
            {role === "team" ? "B" : "J"}
          </span>
          <div>
            <strong>
              {role === "team" ? "Bridgain 스튜디오" : "나의 워크스페이스"}
            </strong>
            <small>{role === "team" ? "개발팀 공간" : "의뢰자 공간"}</small>
          </div>
        </div>
        <div className="pw-nav-label">WORKSPACE</div>
        <nav aria-label="주 메뉴">
          <button
            className={`pw-nav ${page === "projects" && !project ? "active" : ""}`}
            onClick={() => {
              setPage("projects");
              setSelected(null);
            }}
          >
            <span>▦</span> 프로젝트 <small>{projects.length}</small>
          </button>
          <button
            className={`pw-nav ${page === "invitations" ? "active" : ""}`}
            onClick={() => {
              setPage("invitations");
              setSelected(null);
            }}
          >
            <span>✉</span> 받은 초대{" "}
            {pending > 0 && <small className="pw-count">{pending}</small>}
          </button>
        </nav>
        <div className="pw-nav-label pw-project-label">
          내 프로젝트{" "}
          {role === "team" && (
            <button
              aria-label="프로젝트 만들기"
              onClick={() => openModal("create")}
            >
              ＋
            </button>
          )}
        </div>
        <div className="pw-project-tree">
          {projects.map((p) => (
            <button
              key={p.id}
              className={
                selected === p.id && page === "projects" ? "selected" : ""
              }
              onClick={() => {
                setSelected(p.id);
                setPage("projects");
              }}
            >
              <span className={`pw-dot ${p.color}`} />
              {p.name}
            </button>
          ))}
        </div>
        <div className="pw-id-card">
          <span>함께할 사람에게 알려주세요</span>
          <strong>내 사용자 ID</strong>
          <div>
            <code>{userId}</code>
            <button aria-label="내 사용자 ID 복사" onClick={copy}>
              복사
            </button>
          </div>
        </div>
        <div className="pw-profile">
          <span className="pw-avatar">{displayName.slice(-2)}</span>
          <div>
            <strong>{displayName}</strong>
            <small>{role === "team" ? "개발팀 계정" : "의뢰자 계정"}</small>
          </div>
          <button onClick={onExit}>나가기</button>
        </div>
      </aside>
      <div className="pw-body">
        <header className="pw-topbar">
          <div>
            <span className="pw-breadcrumb">워크스페이스</span>
            <span className="pw-slash">/</span>
            <strong>
              {page === "invitations"
                ? "받은 초대"
                : project
                  ? project.name
                  : "프로젝트"}
            </strong>
          </div>
          <span className="pw-demo-badge">● 프론트 미리보기</span>
        </header>
        <div className="pw-demo-note">
          샘플 계정과 프로젝트로 체험하는 화면이에요. 변경은 새로고침하면
          초기화되며, 두 클라이언트 간에는 동기화되지 않습니다.
        </div>
        <main className="pw-main">
          {page === "projects" && !project && (
            <>
              <div className="pw-heading">
                <div>
                  <p className="pw-eyebrow">YOUR PROJECTS</p>
                  <h1>
                    함께 만드는 프로젝트<span>.</span>
                  </h1>
                  <p>
                    {role === "team"
                      ? "아이디어부터 완성까지, 팀과 고객을 한곳에서 연결하세요."
                      : "함께하는 개발팀과 프로젝트의 새로운 소식을 확인하세요."}
                  </p>
                </div>
                {role === "team" && (
                  <button
                    className="pw-primary pw-desktop-create"
                    onClick={() => openModal("create")}
                  >
                    ＋ 프로젝트 만들기
                  </button>
                )}
              </div>
              <div className="pw-overview">
                <div className="pw-overview-copy">
                  <span className="pw-pill">
                    {role === "team"
                      ? "LET’S BUILD TOGETHER"
                      : "BETTER, TOGETHER"}
                  </span>
                  <h2>
                    {role === "team"
                      ? "좋은 협업의 시작은,\n하나의 연결에서."
                      : "내 프로젝트의 시작과 끝,\n이제 한곳에서."}
                  </h2>
                  <p>
                    {role === "team"
                      ? "프로젝트를 만들고, 함께할 팀원과 의뢰자를 초대해보세요."
                      : "받은 초대를 수락하면 개발팀과의 협업을 시작할 수 있어요."}
                  </p>
                </div>
                <div className="pw-mini-tree" aria-hidden="true">
                  <div className="pw-tree-root">
                    ▦ &nbsp; 함께 만드는 프로젝트 <span>진행 중</span>
                  </div>
                  <div className="pw-tree-leaf">
                    <i>기</i> 기획자 <b>요구사항 정리</b>
                  </div>
                  <div className="pw-tree-leaf">
                    <i>디</i> 디자이너 <b>경험을 디자인</b>
                  </div>
                  <div className="pw-tree-leaf">
                    <i>개</i> 개발자 <b>아이디어를 현실로</b>
                  </div>
                </div>
              </div>
              <div className="pw-list-title">
                <h2>
                  내 프로젝트 <span>{projects.length}</span>
                </h2>
                <div className="pw-toolbar">
                  <label className="pw-search">
                    <span>⌕</span>
                    <input
                      aria-label="프로젝트 검색"
                      placeholder="프로젝트 검색"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <select
                    aria-label="프로젝트 상태 필터"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    {["전체 상태", "진행 중", "준비 중", "완료"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="pw-cards">
                {filtered.map((p) => (
                  <button
                    className="pw-project-card"
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                  >
                    <div className="pw-card-top">
                      <span className={`pw-project-icon ${p.color}`}>▦</span>
                      <span
                        className={`pw-status ${p.status === "진행 중" ? "working" : ""}`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <h3>{p.name}</h3>
                    <p>{p.description}</p>
                    <div className="pw-card-bottom">
                      <div className="pw-avatar-stack">
                        {p.members.slice(0, 4).map((m) => (
                          <Avatar key={m.id} person={m} />
                        ))}
                        <small>{p.members.length}명 참여</small>
                      </div>
                      <span>↗</span>
                    </div>
                  </button>
                ))}
                {role === "team" && !query && filter === "전체 상태" && (
                  <button
                    className="pw-create-card"
                    onClick={() => openModal("create")}
                  >
                    <span>＋</span>
                    <strong>새로운 프로젝트</strong>
                    <p>함께할 다음 이야기를 시작하세요</p>
                  </button>
                )}
              </div>
              {filtered.length === 0 && (
                <div className="pw-empty">
                  <h3>조건에 맞는 프로젝트가 없어요</h3>
                  <p>검색어나 상태 필터를 바꿔보세요.</p>
                </div>
              )}
              <div className="pw-bottom-hint">
                <span>✧</span>
                <div>
                  <strong>초대는 사용자 ID로 간단하게</strong>
                  <p>
                    {role === "team"
                      ? "Bridgain에 가입한 팀원과 의뢰자만 초대할 수 있어요."
                      : "개발팀에게 내 사용자 ID를 전달하고 프로젝트 초대를 받아보세요."}
                  </p>
                </div>
                <button
                  className="pw-text-button"
                  onClick={() => {
                    setPage("invitations");
                    setSelected(null);
                  }}
                >
                  받은 초대 확인 →
                </button>
              </div>
            </>
          )}
          {page === "projects" && project && (
            <>
              <button className="pw-back" onClick={() => setSelected(null)}>
                ← 모든 프로젝트
              </button>
              <div className="pw-heading">
                <div>
                  <p className="pw-eyebrow">PROJECT OVERVIEW</p>
                  <h1>{project.name}</h1>
                  <p>{project.description}</p>
                </div>
                {role === "team" && (
                  <button
                    className="pw-primary"
                    onClick={() => openModal("invite")}
                  >
                    ＋ 참여자 초대
                  </button>
                )}
              </div>
              <div className="pw-detail-grid">
                <section className="pw-panel">
                  <div className="pw-panel-title">
                    <h2>
                      함께하는 사람들 <span>{project.members.length}</span>
                    </h2>
                    <span className="pw-muted">팀과 고객이 만나는 공간</span>
                  </div>
                  {(["team", "client"] as Role[]).map((group) => (
                    <div className="pw-member-group" key={group}>
                      <h3>
                        {group === "team" ? "개발팀" : "의뢰자"}{" "}
                        <span>
                          {
                            project.members.filter((m) => m.role === group)
                              .length
                          }
                        </span>
                      </h3>
                      {project.members
                        .filter((m) => m.role === group)
                        .map((m) => (
                          <div className="pw-member" key={m.id}>
                            <Avatar person={m} />
                            <div>
                              <strong>
                                {m.name}
                                {m.id === userId && <small> 나</small>}
                              </strong>
                              <p>{m.id}</p>
                            </div>
                            <span className="pw-member-role">{m.title}</span>
                          </div>
                        ))}
                      {project.members.every((m) => m.role !== group) && (
                        <p className="pw-muted">
                          아직 참여한 {group === "team" ? "팀원이" : "의뢰자가"}{" "}
                          없어요.
                        </p>
                      )}
                    </div>
                  ))}
                </section>
                <aside className="pw-panel pw-project-info">
                  <h2>프로젝트 정보</h2>
                  <dl>
                    <div>
                      <dt>상태</dt>
                      <dd>
                        <span className="pw-status working">
                          {project.status}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt>생성일</dt>
                      <dd>{project.date}</dd>
                    </div>
                    <div>
                      <dt>참여자</dt>
                      <dd>{project.members.length}명</dd>
                    </div>
                  </dl>
                  <div className="pw-info-note">
                    초대를 수락한 사람만 프로젝트에 참여할 수 있어요.
                  </div>
                </aside>
              </div>
              {role === "team" && (
                <section className="pw-panel pw-sent">
                  <div className="pw-panel-title">
                    <h2>
                      보낸 초대{" "}
                      <span>
                        {sent.filter((s) => s.project === project.id).length}
                      </span>
                    </h2>
                    <span className="pw-muted">수락 대기 중</span>
                  </div>
                  {sent
                    .filter((s) => s.project === project.id)
                    .map((s) => (
                      <div key={s.id} className="pw-member">
                        <Avatar person={s.person} />
                        <div>
                          <strong>{s.person.name}</strong>
                          <p>
                            {s.person.id} · {s.person.title}
                          </p>
                        </div>
                        <span className="pw-status">대기 중</span>
                        <button
                          className="pw-secondary"
                          onClick={() => {
                            setSent((items) =>
                              items.filter((i) => i.id !== s.id),
                            );
                            setNotice("초대를 취소했어요.");
                          }}
                        >
                          초대 취소
                        </button>
                      </div>
                    ))}
                  {!sent.some((s) => s.project === project.id) && (
                    <p className="pw-muted">
                      대기 중인 초대가 없어요. 함께할 사람을 초대해보세요.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
          {page === "invitations" && (
            <>
              <div className="pw-heading">
                <div>
                  <p className="pw-eyebrow">INVITATIONS</p>
                  <h1>
                    새로운 협업이 기다려요<span>.</span>
                  </h1>
                  <p>프로젝트 초대를 확인하고 함께 시작해보세요.</p>
                </div>
                <span className="pw-invite-count">수락 대기 {pending}개</span>
              </div>
              <div className="pw-invitations">
                {invitations.map((inv) => (
                  <article className="pw-panel pw-invitation" key={inv.id}>
                    <span className="pw-project-icon mint">✉</span>
                    <div className="pw-invitation-copy">
                      <span className="pw-eyebrow">프로젝트 참여 초대</span>
                      <h2>{inv.project}</h2>
                      <p>{inv.description}</p>
                      <small>{inv.from} 님이 초대했어요 · 샘플 초대</small>
                    </div>
                    {inv.status === "대기 중" ? (
                      <div className="pw-invitation-actions">
                        <button
                          className="pw-secondary"
                          onClick={() => respond(inv, false)}
                        >
                          거절
                        </button>
                        <button
                          className="pw-primary"
                          onClick={() => respond(inv, true)}
                        >
                          초대 수락
                        </button>
                      </div>
                    ) : (
                      <span className="pw-status">{inv.status}</span>
                    )}
                  </article>
                ))}
              </div>
              <div className="pw-bottom-hint">
                <span>↗</span>
                <div>
                  <strong>초대받을 때는 내 사용자 ID를 알려주세요</strong>
                  <p>{userId}</p>
                </div>
                <button className="pw-text-button" onClick={copy}>
                  ID 복사
                </button>
              </div>
            </>
          )}
        </main>
      </div>
      {notice && (
        <div className="pw-toast" role="status">
          {notice}
        </div>
      )}
      {role === "team" && page === "projects" && !project && !modal && (
        <MobileProjectAction onCreate={() => openModal("create")} />
      )}
      <dialog
        ref={dialog}
        className="pw-dialog"
        aria-label={modal === "create" ? "프로젝트 만들기" : "참여자 초대"}
        onCancel={() => setModal(null)}
      >
        <button
          className="pw-dialog-close"
          aria-label="닫기"
          onClick={() => setModal(null)}
        >
          ×
        </button>
        {modal === "create" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) {
                setError("프로젝트명을 입력해주세요.");
                return;
              }
              const id = Date.now();
              setProjects((items) => [
                ...items,
                {
                  id,
                  name: name.trim(),
                  description:
                    description.trim() ||
                    "새로운 프로젝트의 이야기를 함께 채워보세요.",
                  status: "준비 중",
                  color: "mint",
                  members: [
                    { id: userId, name: displayName, title: "개발자", role },
                  ],
                  date: "2026.09.13",
                },
              ]);
              setSelected(id);
              setPage("projects");
              setModal(null);
              setNotice("프로젝트를 만들었어요. 이제 참여자를 초대해보세요.");
            }}
          >
            <span className="pw-project-icon blue">＋</span>
            <h2>새로운 프로젝트 만들기</h2>
            <p>함께할 팀과 고객을 위한 공간을 만들어보세요.</p>
            <label>
              프로젝트명{" "}
              <input
                autoFocus
                maxLength={60}
                required
                value={name}
                placeholder="예: 모아 쇼핑몰 리뉴얼"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              프로젝트 소개 <span>선택</span>
              <textarea
                maxLength={300}
                rows={3}
                value={description}
                placeholder="어떤 프로젝트인지 간단하게 알려주세요."
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            {error && (
              <p className="pw-error" role="alert">
                {error}
              </p>
            )}
            <div className="pw-dialog-footer">
              <button
                type="button"
                className="pw-secondary"
                onClick={() => setModal(null)}
              >
                취소
              </button>
              <button className="pw-primary" type="submit">
                프로젝트 만들기
              </button>
            </div>
          </form>
        )}
        {modal === "invite" && project && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const person = people.find(
                (p) => p.id.toUpperCase() === lookup.trim().toUpperCase(),
              );
              setFound(null);
              if (!person) {
                setError(
                  "가입된 샘플 계정을 찾지 못했어요. 아래 ID를 사용해주세요.",
                );
                return;
              }
              if (project.members.some((m) => m.id === person.id)) {
                setError("이미 프로젝트에 참여한 계정이에요.");
                return;
              }
              if (
                sent.some(
                  (s) => s.project === project.id && s.person.id === person.id,
                )
              ) {
                setError("이미 초대를 보냈어요. 수락을 기다려주세요.");
                return;
              }
              setError("");
              setFound(person);
            }}
          >
            <span className="pw-project-icon blue">✉</span>
            <h2>함께할 사람 초대하기</h2>
            <p>가입한 사용자 ID로 팀원 또는 의뢰자를 찾아보세요.</p>
            <label>
              사용자 ID
              <div className="pw-lookup">
                <input
                  autoFocus
                  value={lookup}
                  onChange={(e) => {
                    setLookup(e.target.value);
                    setFound(null);
                    setError("");
                  }}
                  placeholder="사용자 ID 입력"
                />
                <button className="pw-secondary" type="submit">
                  계정 확인
                </button>
              </div>
            </label>
            <div className="pw-sample-ids">
              체험 가능한 샘플 계정
              <br />
              <button
                type="button"
                onClick={() => {
                  setLookup("TEAM-YUJIN");
                  setFound(null);
                  setError("");
                }}
              >
                TEAM-YUJIN · 개발자
              </button>
              <button
                type="button"
                onClick={() => {
                  setLookup("CLIENT-HAEIN");
                  setFound(null);
                  setError("");
                }}
              >
                CLIENT-HAEIN · 의뢰자
              </button>
            </div>
            {error && (
              <p className="pw-error" role="alert">
                {error}
              </p>
            )}
            {found && (
              <div className="pw-member pw-found">
                <Avatar person={found} />
                <div>
                  <strong>{found.name}</strong>
                  <p>{found.id}</p>
                </div>
                <span className="pw-member-role">{found.title}</span>
              </div>
            )}
            <div className="pw-dialog-footer">
              <button
                type="button"
                className="pw-secondary"
                onClick={() => setModal(null)}
              >
                취소
              </button>
              <button
                type="button"
                disabled={!found}
                className="pw-primary"
                onClick={() => {
                  if (!found) return;
                  setSent((items) => [
                    ...items,
                    { id: Date.now(), project: project.id, person: found },
                  ]);
                  setModal(null);
                  setNotice(
                    "샘플 초대를 보냈어요. 실제 계정에는 전달되지 않습니다.",
                  );
                }}
              >
                초대 보내기
              </button>
            </div>
          </form>
        )}
      </dialog>
    </div>
  );
}
