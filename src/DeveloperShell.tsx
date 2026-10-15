import { useEffect } from "react";
import { useAi } from "./ai/AiWorkspace";
import { useState, type ReactNode } from "react";
import "./developer-shell.css";
export type DeveloperView = "dashboard" | "projects" | "invitations" | "teams";
export type ProjectSection =
  | "overview"
  | "requests"
  | "tasks"
  | "meetings"
  | "documents"
  | "activity"
  | "members"
  | "settings";
type Props = {
  children: ReactNode;
  active: DeveloperView;
  userName: string;
  projects: { id: string; name: string }[];
  selectedId?: string;
  section?: ProjectSection;
  pending: number;
  onNavigate: (view: DeveloperView) => void;
  onProject: (id: string) => void;
  onSection: (section: ProjectSection) => void;
  onLogout: () => void;
};
const labels = {
  dashboard: "대시보드",
  projects: "프로젝트",
  invitations: "받은 초대",
  teams: "팀 관리",
};
function Icon({ name }: { name: DeveloperView }) {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "dashboard" ? (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </>
      ) : name === "projects" ? (
        <path d="M3 7V5a2 2 0 0 1 2-2h5l3 4h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      ) : name === "invitations" ? (
        <>
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="m3 7 9 6 9-6" />
        </>
      ) : (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" />
        </>
      )}
    </svg>
  );
}
export default function DeveloperShell(p: Props) {
  const ai = useAi();
  useEffect(() => {
    const project = p.projects.find((x) => x.id === p.selectedId);
    if (project) ai.setProject(project);
  }, [p.selectedId, p.projects]);
  const [open, setOpen] = useState(false);
  const selected = p.projects.find((x) => x.id === p.selectedId);
  const act = (fn: () => void) => {
    fn();
    setOpen(false);
  };
  return (
    <div
      className={`ds-shell ${open ? "ds-menu-open" : ""} ${p.active === "projects" ? "ds-with-context" : ""}`}
    >
      <header className="ds-mobile-bar">
        <button
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          ☰
        </button>
        <strong>{selected?.name || labels[p.active]}</strong>
        <span>bridgain.</span>
      </header>
      {open && (
        <button
          className="ds-scrim"
          aria-label="메뉴 닫기"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className="ds-rail">
        <button
          className="ds-logo"
          aria-label="Bridgain 대시보드"
          onClick={() => act(() => p.onNavigate("dashboard"))}
        >
          b
        </button>
        <nav aria-label="개발자 전역 메뉴">
          {(Object.keys(labels) as DeveloperView[]).map((v) => (
            <button
              key={v}
              title={labels[v]}
              aria-current={p.active === v ? "page" : undefined}
              onClick={() => act(() => p.onNavigate(v))}
            >
              <Icon name={v} />
              <span>{labels[v]}</span>
              {v === "invitations" && p.pending > 0 && <i>{p.pending}</i>}
            </button>
          ))}
        </nav>
        <div className="ds-account">
          <span className="ds-avatar">{p.userName.slice(0, 1)}</span>
          <strong title={p.userName}>{p.userName}</strong>
          <div className="ds-profile-actions">
            <button onClick={ai.openSettings}>AI 연결 설정</button>
            <button onClick={ai.openPanel}>AI 채팅 열기</button>
            <button onClick={p.onLogout}>로그아웃</button>
          </div>
        </div>
      </aside>
      {p.active === "projects" && (
        <aside className="ds-context">
          <div className="ds-context-heading">
            <small>WORKSPACE</small>
            <strong>프로젝트</strong>
          </div>
          <button
            className="ds-context-back"
            aria-current={!selected ? "page" : undefined}
            onClick={() => act(() => p.onNavigate("projects"))}
          >
            모든 프로젝트 <span>{p.projects.length}</span>
          </button>
          <nav aria-label="프로젝트 바로가기">
            {p.projects.map((project) => (
              <button key={project.id}
                aria-current={selected?.id === project.id ? "page" : undefined}
                onClick={() => act(() => p.onProject(project.id))}>
                <span aria-hidden="true">▱ </span>{project.name}
              </button>
            ))}
          </nav>
          {!p.projects.length && <p className="ds-context-empty">프로젝트를 만들면 여기에 표시돼요.</p>}
        </aside>
      )}
      <div className="ds-content">
        {p.active === "projects" && selected && (
          <nav className="ds-project-tabs" aria-label="프로젝트 메뉴">
            {([
              ["overview", "개요"],
              ["requests", "고객 요청"],
              ["tasks", "업무"],
              ["meetings", "회의실"],
              ["documents", "문서"],
              ["activity", "활동 기록"],
              ["members", "참여자 · 프로젝트 관리"],
              ["settings", "설정"],
            ] as const).map(([key, label]) => (
              <button key={key} aria-current={p.section === key ? "page" : undefined}
                onClick={() => act(() => p.onSection(key))}>{label}</button>
            ))}
            <button className="ds-project-refresh" onClick={() => window.location.reload()}>새로고침</button>
          </nav>
        )}
        {p.children}
      </div>
    </div>
  );
}
