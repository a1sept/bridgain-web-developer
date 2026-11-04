import { createLocalId } from "./browser-id";
import ControlIcon from "./components/ControlIcon";
import { studyTimeInput, parseStudyTimeInput } from "./study/time";
import StudyStorage from "./study/StudyStorage";
import ProjectChannel from "./ProjectChannel";
import StudyLive from "./study/StudyLive";
import StudyAttendanceSettings from "./study/StudyAttendanceSettings";
import StudyDecks from "./study/StudyDecks";
import StudyActivities, { type Activity } from "./study/StudyActivities";
import StudyRoles from "./study/StudyRoles";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { workflowApi } from "./Approvals";
import FilterBar from "./components/FilterBar";
import type { ProjectSection } from "./DeveloperShell";
import "./study/study.css";
type Program = {
  plannedSessionCount?: number | null;
  id: string;
  title: string;
  description: string;
  status: string;
  archivedAt: string | null;
  membershipMode: string;
  memberIds: string[];
  organizers: { userId: string; role: string }[];
};
type Session = {
  seriesId?: string | null;
  id: string;
  programId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  status: string;
};
type Snapshot = {
  pagination?: { sessions: string | null; activities: string | null };
  sessionOptions?: (Pick<Session, "id" | "title" | "programId"> & Partial<Pick<Session, "status" | "startsAt" | "endsAt">>)[];
  activities: Activity[];
  permissions: string[];
  isOwner: boolean;
  programs: Program[];
  sessions: Session[];
  members: { userId: string; displayName: string; roleIds: string[] }[];
  roles: { id: string; name: string; permissions: string[] }[];
};
type Props = {
  project: { id: string; name: string; description: string };
  userId: string;
  section: ProjectSection;
  onSection: (s: ProjectSection) => void;
  onChanged: () => Promise<unknown>;
};
const states: Record<string, string> = {
  preparing: "준비 중",
  active: "진행 중",
  completed: "완료",
  scheduled: "예정",
  canceled: "취소",
  ended: "종료",
  live: "진행 중",
};
const date = (s: string) =>
  new Date(s).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const sessionDate = (s: Session) => {
  const day = (value: string) => new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const end = day(s.startsAt) === day(s.endsAt)
    ? new Date(s.endsAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false })
    : date(s.endsAt);
  const start = new Date(s.startsAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${start} – ${end}`;
};
const localDate = studyTimeInput;
export default function StudyWorkspace({
  project,
  userId,
  section,
  onSection,
  onChanged,
}: Props) {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [programId, setProgramId] = useState<string | null>(null),
    [form, setForm] = useState<"program" | "session" | null>(null),
    [editSession, setEditSession] = useState<Session | null>(null);
  const pendingProgram = useRef<{ id: string; tab: string } | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [liveSession, setLiveSession] = useState<Session | null>(null);
  const [operatingMode, setOperatingMode] = useState("ongoing"),
    [repeat, setRepeat] = useState(false);
  const [programTab, setProgramTab] = useState("sessions"),
    [editingProgram, setEditingProgram] = useState(false);
  const [organizerForm, setOrganizerForm] = useState(false),
    [deputyIds, setDeputyIds] = useState<string[]>([]);
  const [settingsNotice, setSettingsNotice] = useState("");
  const [spaceSettingsTab, setSpaceSettingsTab] = useState("basic");
  const moreRef = useRef<HTMLDetailsElement>(null);
  const membersRef = useRef<HTMLElement>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSearched, setInviteSearched] = useState(false);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) moreRef.current.open = false;
      membersRef.current?.querySelectorAll<HTMLDetailsElement>(".study-member-menu[open]").forEach(menu => {
        if (!menu.contains(e.target as Node)) menu.open = false;
      });
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const [memberTab, setMemberTab] = useState("members");
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState<string[]>([]);
  const [mode, setMode] = useState("all"),
    [memberIds, setMemberIds] = useState<string[]>([]),
    [hostIds, setHostIds] = useState<string[]>([userId]);
  const [inviteQuery, setInviteQuery] = useState(""),
    [inviteResults, setInviteResults] = useState<
      { id: string; displayName: string }[]
    >([]);
  const [schedulePreview, setSchedulePreview] = useState<{
    revision: string;
    affected: { id: string; title: string; startsAt: string; endsAt: string }[];
    protectedCount: number;
  } | null>(null);
  useEffect(() => setSchedulePreview(null), [form, editSession?.id]);
  const mutationKey = useRef({ payload: "", id: "" });
  const lock = useRef(false),
    mounted = useRef(true);
  const base = `/projects/${project.id}/study`;
  const loadVersion = useRef(0);
  async function load() {
    const version = ++loadVersion.current;
    const d = await workflowApi<Snapshot>(
      `${base}${programId ? `?programId=${programId}` : ""}`,
    );
    if (mounted.current && version === loadVersion.current) setData(d);
  }
  async function loadMore(kind: "sessions" | "activities") {
    const cursor = data?.pagination?.[kind];
    if (!cursor || busy) return;
    const version = loadVersion.current;
    setBusy(true);
    setError("");
    const query = new URLSearchParams({
      [kind === "sessions" ? "sessionCursor" : "activityCursor"]: cursor,
    });
    if (programId) query.set("programId", programId);
    try {
      const next = await workflowApi<Snapshot>(`${base}?${query}`);
      if (mounted.current && version === loadVersion.current)
        setData((current) =>
          current
            ? {
                ...current,
                [kind]: [
                  ...current[kind],
                  ...next[kind].filter(
                    (row) =>
                      !current[kind].some((existing) => existing.id === row.id),
                  ),
                ],
                pagination: {
                  ...current.pagination!,
                  [kind]: next.pagination?.[kind] ?? null,
                },
              }
            : current,
        );
    } catch (e) {
      if (version === loadVersion.current)
        setError(
          e instanceof Error ? e.message : "목록을 불러오지 못했습니다.",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const moreSessions = () =>
    data?.pagination?.sessions ? (
      <button disabled={busy} onClick={() => void loadMore("sessions")}>
        {busy ? "불러오는 중…" : "다음 회차 더 보기"}
      </button>
    ) : null;
  useEffect(() => {
    mounted.current = true;
    void load().catch((e) => setError(e.message));
    return () => {
      mounted.current = false;
    };
  }, [project.id, programId]);
  useEffect(() => { setSelectedSession(null); }, [project.id, programId, section]);
  useEffect(() => {
    setForm(null);
    setSchedulePreview(null);
    setOrganizerForm(false);
    setSettingsNotice("");
    setLiveSession(null);
    setProgramId(pendingProgram.current?.id ?? null);
    if (pendingProgram.current) setProgramTab(pendingProgram.current.tab);
    pendingProgram.current = null;
    setError("");
  }, [section]);
  async function run(fn: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했습니다.");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const can = (p: string) => !!data?.permissions.includes(`study.${p}`);
  const program = data?.programs.find((p) => p.id === programId);
  const canManageProgram = can("programs.manage");
  const canManageOrganizers = !!program && !program.archivedAt &&
    (canManageProgram || program.organizers.some(o => o.userId === userId && o.role === "host"));
  const filteredPrograms = (data?.programs ?? []).filter(p =>
    p.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) &&
    (status.length ? status.includes(p.archivedAt ? "archived" : p.status) : !p.archivedAt));
  function openProgram(id: string, tab = "sessions") {
    if (section === "overview") {
      pendingProgram.current = { id, tab };
      onSection("programs");
    } else {
      setProgramId(id);
      setProgramTab(tab);
    }
  }
  const activePrograms = (data?.programs ?? []).filter(p => !p.archivedAt && p.status === "active");
  const upcomingSessions = (data?.sessions ?? []).filter(s =>
    activePrograms.some(p => p.id === s.programId) &&
    (s.status === "live" || (s.status === "scheduled" && new Date(s.endsAt).getTime() >= Date.now())))
    .sort((a, b) => Number(b.status === "live") - Number(a.status === "live") || Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const upcomingActivities = (data?.activities ?? []).filter(a =>
    !a.archivedAt && activePrograms.some(p => p.id === a.programId) && Date.parse(a.dueAt) >= Date.now())
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  function createProgram() {
    setOperatingMode("ongoing");
    setRepeat(false);
    setEditingProgram(false);
    setOrganizerForm(false);
    setProgramTab("sessions");
    setHostIds([userId]);
    setMemberIds([]);
    setMode("all");
    setForm("program");
  }
  function openProgramSettings(tab: "basic" | "organizers") {
    if (!program || program.archivedAt) return;
    if (tab === "basic" ? !canManageProgram : !canManageOrganizers) return;
    setSettingsNotice("");
    setError("");
    setHostIds(program.organizers.filter(o => o.role === "host").map(o => o.userId));
    setDeputyIds(program.organizers.filter(o => o.role === "deputy").map(o => o.userId));
    setEditingProgram(true);
    setOperatingMode(program.plannedSessionCount ? "fixed" : "ongoing");
    setMode(program.membershipMode);
    setMemberIds(program.memberIds);
    setOrganizerForm(tab === "organizers");
    setForm(tab === "basic" ? "program" : null);
  }
  function settingsTabs(active: "basic" | "organizers") {
    return <div className="study-segment study-settings-tabs" aria-label="프로그램 설정 항목">
      {canManageProgram && <button type="button" aria-pressed={active === "basic"} disabled={busy}
        onClick={() => active !== "basic" && openProgramSettings("basic")}>기본 정보</button>}
      {canManageOrganizers && <button type="button" aria-pressed={active === "organizers"} disabled={busy}
        onClick={() => active !== "organizers" && openProgramSettings("organizers")}>운영진</button>}
    </div>;
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = JSON.stringify({
      form,
      programId,
      editSession: editSession?.id,
      fields: [...fd.entries()],
      mode,
      memberIds,
      hostIds,
      operatingMode,
      repeat,
    });
    await run(async () => {
      if (mutationKey.current.payload !== payload)
        mutationKey.current = { payload, id: createLocalId() };
      if (form === "program") {
        const p = await workflowApi<Program>(
          `${base}/programs${editingProgram && program ? `/${program.id}` : ""}`,
          {
            requestId: mutationKey.current.id,
            title: fd.get("title"),
            description: fd.get("description"),
            ...(editingProgram && program?.status !== "preparing"
              ? {}
              : { membershipMode: mode, memberIds }),
            ...(!editingProgram ? { hostIds } : {}),
            plannedSessionCount:
              operatingMode === "ongoing"
                ? null
                : Number(fd.get("plannedCount")),
          },
          editingProgram ? "PATCH" : "POST",
        );
        setProgramId(p.id);
        setEditingProgram(false);
      } else if (program) {
        const sessionUrl = `${base}/programs/${program.id}/sessions${editSession ? `/${editSession.id}` : ""}`;
        const sessionBody = {
          requestId: mutationKey.current.id,
          title: fd.get("title"),
          startsAt: parseStudyTimeInput(
            String(fd.get("startsAt")),
          ).toISOString(),
          endsAt: parseStudyTimeInput(String(fd.get("endsAt"))).toISOString(),
          location: fd.get("location"),
          ...(!editSession && repeat
            ? {
                repeatCount: Number(fd.get("repeatCount")),
                repeatEveryDays: Number(fd.get("repeatEveryDays")),
              }
            : {}),
          scope: fd.get("scope") ?? "single",
        };
        if (editSession && sessionBody.scope !== "single") {
          if (!schedulePreview) {
            setSchedulePreview(
              await workflowApi<NonNullable<typeof schedulePreview>>(
                sessionUrl,
                { ...sessionBody, preview: true },
                "PATCH",
              ),
            );
            return;
          }
          await workflowApi(
            sessionUrl,
            {
              ...sessionBody,
              expectedRevision: schedulePreview.revision,
              expectedStartsAt: editSession.startsAt,
              expectedIds: schedulePreview.affected.map((row) => row.id),
            },
            "PATCH",
          );
          setSchedulePreview(null);
        } else
          await workflowApi(
            sessionUrl,
            sessionBody,
            editSession ? "PATCH" : "POST",
          );
      }
      mutationKey.current = { payload: "", id: "" };
      setForm(null);
      setEditSession(null);
      setSchedulePreview(null);
    });
  }
  function picker(
    label: string,
    values: string[],
    change: (v: string[]) => void,
  ) {
    return (
      <FilterBar
        label={label}
        filters={[
          {
            id: label,
            label,
            options: (data?.members ?? []).map((m) => ({
              value: m.userId,
              label: m.displayName,
            })),
            values,
            multiple: true,
            onChange: change,
          },
        ]}
        onClear={() => change([])}
      />
    );
  }
  function programAction(action: string) {
    if (!program) return;
    const text =
      action === "start"
        ? "시작 후에는 새로운 참여자를 추가할 수 없습니다. 프로그램을 시작할까요?"
        : action === "archive"
          ? "보관하면 회차 생성과 자료 변경을 중지합니다. 보관할까요?"
          : action === "complete"
            ? "프로그램을 완료할까요?"
            : "프로그램을 복원할까요?";
    if (window.confirm(text))
      void run(() =>
        workflowApi(`${base}/programs/${program.id}`, { action }, "PATCH"),
      );
  }
  function sessionRows(rows: Session[]) {
    return rows.length ? (
      <ul className="study-list">
        {rows.map((s) => (
          <li key={s.id} className={`study-session-row is-${s.status}`}>
            <span className={`study-session-status is-${s.status}`}>{states[s.status]}</span>
            <div className="study-session-info">
              {program ? <button className="study-session-title" onClick={() => setSelectedSession(s)}>{s.title}</button> : <strong>{s.title}</strong>}
              <p>
                {sessionDate(s)}
              </p>
              {s.location && <p>{s.location}</p>}
            </div>
            <div className="study-actions">
              {data?.programs.some(
                (p) =>
                  p.id === s.programId &&
                  !p.archivedAt &&
                  (p.status === "active" || s.status === "ended"),
              ) &&
                s.status !== "canceled" && (
                  <button onClick={() => setLiveSession(s)}>
                    {s.status === "ended" ? "참여 기록" : "발표실 열기"}
                  </button>
                )}
              {program &&
                s.status === "scheduled" &&
                !program.archivedAt &&
                program.status !== "completed" &&
                (can("sessions.manage") ||
                  program.organizers.some((o) => o.userId === userId)) && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      setEditSession(s);
                      setForm("session");
                    }}
                  >
                    일정 변경
                  </button>
                )}
            </div>
          </li>
        ))}
      </ul>
    ) : (
      <p className="study-empty">등록된 회차가 없습니다.</p>
    );
  }
  if (section === "channel")
    return <ProjectChannel projectId={project.id} study />;
  if (liveSession && data)
    return (
      <main className="study-workspace">
        <StudyLive
          base={base}
          session={liveSession}
          userId={userId}
          canHost={
            can("live.host") ||
            !!data.programs
              .find((p) => p.id === liveSession.programId)
              ?.organizers.some((o) => o.userId === userId)
          }
          onBack={() => {
            setLiveSession(null);
            void load();
          }}
        />
      </main>
    );
  return (
    <main className={`study-workspace ${section === "programs" ? "study-program-workspace" : ""}`}>
      <header className="study-heading study-project-context">
        <div>
          <p className="study-eyebrow">스터디·모임</p>
          <h1>{project.name}</h1>
          <p>{project.description}</p>
        </div>
        <span className="study-badge">
          회원 {data?.members.length ?? "–"}명
        </span>
      </header>
      {error && (
        <div className="study-error" role="alert">
          {error}
          <button disabled={busy} onClick={() => void run(load)}>
            다시 시도
          </button>
        </div>
      )}
      {!data && !error && <p role="status">스터디를 불러오는 중…</p>}
      {data && (
        <>
          {form ? (
            <section className="study-panel study-form-page">
              <button className={form === "program" ? "study-settings-back" : undefined} onClick={() => setForm(null)} disabled={busy}>
                {form === "program" ? <><ControlIcon name="back" /> {editingProgram ? `${program?.title}로` : "프로그램 목록"}</> : "← 돌아가기"}
              </button>
              <h2>
                {form === "program"
                  ? editingProgram
                    ? "프로그램 설정"
                    : "프로그램 만들기"
                  : editSession
                    ? "회차 일정 변경"
                    : "회차 추가"}
              </h2>
              {form === "program" && editingProgram && settingsTabs("basic")}
              <form
                onSubmit={save}
                onChange={() => setSchedulePreview(null)}
                className="study-form"
                key={editSession?.id ?? form}
              >
                <fieldset className="study-form-group">
                  <legend>기본 정보</legend>
                <label>
                  이름
                  <input
                    name="title"
                    required
                    maxLength={120}
                    defaultValue={
                      form === "program" && editingProgram
                        ? program?.title
                        : editSession?.title
                    }
                    placeholder={
                      form === "program"
                        ? "예: 파이썬 책 함께 읽기"
                        : "예: 1주차 · 시작하기"
                    }
                  />
                </label>
                {form === "program" && <>
                    <label>
                      소개
                      <textarea
                        name="description"
                        maxLength={2000}
                        rows={3}
                        defaultValue={
                          editingProgram ? program?.description : ""
                        }
                      />
                    </label>
                </>}
                </fieldset>
                {form === "program" ? (
                  <>
                    <fieldset className="study-form-group">
                    <legend>운영 방식</legend>
                    <label>
                      운영 방식
                      <select
                        value={operatingMode}
                        onChange={(e) => setOperatingMode(e.target.value)}
                      >
                        <option value="ongoing">
                          종료 회차 없이 계속 운영
                        </option>
                        <option value="fixed">계획 회차 수 정하기</option>
                      </select>
                    </label>
                    {operatingMode === "fixed" && (
                      <label>
                        계획 회차 수
                        <input
                          type="number"
                          name="plannedCount"
                          min="1"
                          max="500"
                          required
                          defaultValue={
                            editingProgram
                              ? (program?.plannedSessionCount ?? 12)
                              : 12
                          }
                        />
                        <small>
                          운영 중 변경할 수 있으며 회차를 자동으로 생성하거나
                          종료하지 않습니다.
                        </small>
                      </label>
                    )}
                    </fieldset>
                    <fieldset className="study-form-group"
                      disabled={
                        editingProgram && program?.status !== "preparing"
                      }
                    >
                      <legend>참여 대상</legend>
                      <div className="study-segment">
                        {[
                          ["all", "모든 회원"],
                          ["selected", "회원 지정"],
                        ].map(([v, t]) => (
                          <button
                            type="button"
                            aria-pressed={mode === v}
                            key={v}
                            onClick={() => setMode(v)}
                          >
                            <span className="study-choice-marker" aria-hidden="true"><ControlIcon name="check" /></span>
                            {t}
                          </button>
                        ))}
                      </div>
                      {mode === "selected" &&
                        picker("참여 회원", memberIds, setMemberIds)}
                      <p>
                        {editingProgram && program?.status !== "preparing"
                          ? "시작된 프로그램은 참여 명단이 확정되어 있습니다."
                          : "프로그램을 시작하면 참여 명단이 확정됩니다."}
                      </p>
                    </fieldset>
                    {!editingProgram && <fieldset className="study-form-group">
                      <legend>프로그램 주최자</legend>
                      {picker("주최자 선택", hostIds, setHostIds)}
                    </fieldset>}
                  </>
                ) : (
                  <>
                    <fieldset className="study-form-group">
                    <legend>일정과 장소</legend>
                    <p>일정 입력과 표시는 한국 시간(UTC+9) 기준입니다.</p>
                    <div className="study-time">
                      <label>
                        시작
                        <input
                          type="datetime-local"
                          name="startsAt"
                          required
                          defaultValue={
                            editSession
                              ? localDate(editSession.startsAt)
                              : undefined
                          }
                        />
                      </label>
                      <label>
                        종료
                        <input
                          type="datetime-local"
                          name="endsAt"
                          required
                          defaultValue={
                            editSession
                              ? localDate(editSession.endsAt)
                              : undefined
                          }
                        />
                      </label>
                    </div>
                    {editSession?.seriesId && (
                      <label>
                        변경 범위
                        <select name="scope" defaultValue="single">
                          <option value="single">이번 회차만</option>
                          <option value="following">
                            이번 및 이후 예정 회차
                          </option>
                          <option value="series">전체 예정 회차</option>
                        </select>
                        <span>
                          개별 수정한 다른 회차와 진행·종료·취소 기록은
                          유지합니다. 저장 전에 변경 일정을 확인합니다.
                        </span>
                      </label>
                    )}
                    {!editSession && (
                      <>
                        <label>
                          일정 구성
                          <select
                            value={repeat ? "repeat" : "manual"}
                            onChange={(e) =>
                              setRepeat(e.target.value === "repeat")
                            }
                          >
                            <option value="manual">회차 직접 추가</option>
                            <option value="repeat">
                              반복 일정 한 번에 만들기
                            </option>
                          </select>
                        </label>
                        {repeat && (
                          <div className="study-time">
                            <label>
                              며칠 간격
                              <input
                                name="repeatEveryDays"
                                type="number"
                                required
                                min="1"
                                max="365"
                                defaultValue={7}
                              />
                            </label>
                            <label>
                              만들 회차 수
                              <input
                                name="repeatCount"
                                type="number"
                                required
                                min="1"
                                max="52"
                                defaultValue={4}
                              />
                            </label>
                            <p>
                              각 회차의 날짜·시간은 생성 후 개별 변경할 수
                              있습니다.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                    <label>
                      장소 또는 온라인 링크
                      <input
                        name="location"
                        maxLength={500}
                        defaultValue={editSession?.location}
                      />
                    </label>
                    </fieldset>
                  </>
                )}
                {form === "session" && schedulePreview && (
                  <section aria-label="일정 변경 미리보기">
                    <h3>
                      변경할 예정 회차 {schedulePreview.affected.length}개
                    </h3>
                    <p>
                      개별 수정·진행·종료·취소 등 제외{" "}
                      {schedulePreview.protectedCount}개. 제목은 현재 회차만
                      변경합니다.
                    </p>
                    <div className="study-schedule-preview">
                      <table className="study-table">
                        <thead>
                          <tr>
                            <th>회차</th>
                            <th>변경 후 시작</th>
                            <th>변경 후 종료</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schedulePreview.affected.map((row) => (
                            <tr key={row.id}>
                              <td>{row.title}</td>
                              <td>{date(row.startsAt)}</td>
                              <td>{date(row.endsAt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
                <footer>
                  <button
                    type="button"
                    onClick={() => setForm(null)}
                    disabled={busy}
                  >
                    {form === "program" ? "취소" : "돌아가기"}
                  </button>
                  <button className="pw-primary" disabled={busy}>
                    {busy
                      ? "저장 중…"
                      : schedulePreview && form === "session"
                        ? "확인한 일정으로 변경"
                        : form === "program" ? editingProgram ? "변경사항 저장" : "프로그램 만들기" : "저장하기"}
                  </button>
                </footer>
              </form>
              {form === "session" && editSession && program && (
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm("이 회차를 취소할까요? 기록은 유지됩니다.")
                    )
                      void run(async () => {
                        await workflowApi(
                          `${base}/programs/${program.id}/sessions/${editSession.id}`,
                          { action: "cancel" },
                          "PATCH",
                        );
                        setForm(null);
                      });
                  }}
                >
                  회차 취소
                </button>
              )}
              {form === "program" &&
                editingProgram &&
                program?.status === "preparing" && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "기록이 없는 준비 중 프로그램만 삭제할 수 있습니다. 삭제할까요?",
                        )
                      )
                        void run(async () => {
                          await workflowApi(
                            `${base}/programs/${program.id}`,
                            { action: "delete" },
                            "PATCH",
                          );
                          setForm(null);
                          setProgramId(null);
                        });
                    }}
                  >
                    프로그램 삭제
                  </button>
                )}
            </section>
          ) : organizerForm && program && canManageOrganizers ? (
            <section className="study-panel study-form-page">
              <button className="study-settings-back" disabled={busy} onClick={() => { setOrganizerForm(false); setSettingsNotice(""); }}><ControlIcon name="back" /> {program.title}로</button>
              <h2>프로그램 설정</h2>
              {settingsTabs("organizers")}
              {settingsNotice && <p className="study-settings-notice" role="status">{settingsNotice}</p>}
              <div className="study-organizer-settings">
                <section aria-labelledby="study-hosts-heading">
                  <h3 id="study-hosts-heading">주최자</h3>
                  <p>프로그램을 진행하는 주최자입니다. 한 명 이상 지정해야 합니다.</p>
                  {canManageProgram ? <form className="study-form" onSubmit={e => {
                    e.preventDefault();
                    if (!hostIds.length || busy) return;
                    void run(async () => {
                      setSettingsNotice("");
                      await workflowApi(`${base}/programs/${program.id}`, { hostIds }, "PATCH");
                      setDeputyIds(ids => ids.filter(id => !hostIds.includes(id)));
                      setSettingsNotice("주최자를 저장했어요.");
                    });
                  }}>
                    <fieldset disabled={busy}>{picker("주최자 선택", hostIds, setHostIds)}</fieldset>
                    {!hostIds.length && <p className="study-field-help">주최자를 한 명 이상 선택해주세요.</p>}
                    <footer><button type="submit" disabled={busy || !hostIds.length}>주최자 저장</button></footer>
                  </form> : <>
                    <p>{program.organizers.filter(o => o.role === "host").map(o => data.members.find(m => m.userId === o.userId)?.displayName ?? "탈퇴한 회원").join(", ")}</p>
                    <p>주최자 변경은 프로그램 관리 권한이 있는 회원만 할 수 있어요.</p>
                  </>}
                </section>
                <section aria-labelledby="study-deputies-heading">
                  <h3 id="study-deputies-heading">프로그램 부관리자</h3>
                  <p>주최자가 자리를 비우면 발표를 이어서 진행할 수 있습니다. 공간 전체의 역할은 바뀌지 않습니다.</p>
                  <form className="study-form" onSubmit={e => {
                    e.preventDefault();
                    void run(async () => {
                      setSettingsNotice("");
                      await workflowApi(`${base}/programs/${program.id}/organizers`, { deputyIds }, "PATCH");
                      setDeputyIds(ids => ids.filter(id => !program.organizers.some(o => o.userId === id && o.role === "host")));
                      setSettingsNotice("프로그램 부관리자를 저장했어요.");
                    });
                  }}>
                    <fieldset disabled={busy}>{picker("부관리자 선택", deputyIds, setDeputyIds)}</fieldset>
                    <footer><button type="submit" disabled={busy}>부관리자 저장</button></footer>
                  </form>
                </section>
              </div>
            </section>
          ) : program ? (
            <section className="study-program-detail">
              <button className="study-settings-back" onClick={() => setProgramId(null)}>
                ← 프로그램 목록
              </button>
              <div className="study-heading study-program-hero">
                <div>
                  <h2>{program.title}</h2>
                  <p>{program.description}</p>
                  <span>
                    {program.archivedAt ? "보관됨" : states[program.status]} ·{" "}
                    {program.status === "preparing" &&
                    program.membershipMode === "all"
                      ? "모든 회원"
                      : `${program.memberIds.length}명 참여`}
                  </span>
                </div>
                <div className="study-actions study-program-actions">
                  {canManageProgram && !program.archivedAt && program.status === "preparing" && (
                    <button className="pw-primary" disabled={busy} onClick={() => programAction("start")}>프로그램 시작</button>
                  )}
                  {canManageOrganizers && <button className="study-settings-trigger" aria-label="프로그램 설정" disabled={busy}
                    onClick={() => openProgramSettings(canManageProgram ? "basic" : "organizers")}>
                    <ControlIcon name="settings" size={16} /> 설정
                  </button>}
                  {canManageProgram && <details className="study-program-more" ref={moreRef}
                    onKeyDown={e => { if (e.key === "Escape") { e.currentTarget.open = false; e.currentTarget.querySelector("summary")?.focus(); } }}
                    onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.open = false; }}>
                    <summary aria-label="프로그램 더보기" title="프로그램 더보기" onClick={e => { if (busy) e.preventDefault(); }}>
                      <ControlIcon name="more" size={16} />
                    </summary>
                    <div className="study-program-more-panel" aria-label="프로그램 관리 동작">
                      {(program.archivedAt ? [["restore", "프로그램 복원"]] : [
                        ...(program.status === "active" ? [["complete", "프로그램 완료"]] : []),
                        ["archive", "프로그램 보관"],
                      ]).map(([action, label]) => <button key={action} disabled={busy} onClick={() => {
                        if (moreRef.current) moreRef.current.open = false;
                        programAction(action);
                      }}>{label}</button>)}
                    </div>
                  </details>}
                </div>
              </div>
              <div className="study-segment study-program-tabs" aria-label="프로그램 메뉴">
                {[
                  ["sessions", "회차"],
                  ["materials", "발표 자료"],
                  ["activities", "참여 활동"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={programTab === value}
                    onClick={() => { setProgramTab(value); setSelectedSession(null); }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="study-program-body">
              {programTab === "sessions" && selectedSession && (() => {
                const session = data.sessions.find(s => s.id === selectedSession.id) ?? selectedSession;
                const canEdit = !program.archivedAt && program.status !== "completed" && (can("sessions.manage") || program.organizers.some(o => o.userId === userId));
                return <section className="study-session-detail">
                  <button className="study-settings-back" onClick={() => setSelectedSession(null)}><ControlIcon name="back" /> 회차 목록</button>
                  <header className="study-heading study-session-detail-heading">
                    <div>
                      <span className={`study-session-status is-${session.status}`}>{states[session.status]}</span>
                      <h2>{session.title}</h2>
                      <p>{sessionDate(session)}</p>
                      {session.location && <p>{session.location}</p>}
                    </div>
                    <div className="study-actions">
                      {canEdit && session.status === "scheduled" && <button onClick={() => { setEditSession(session); setForm("session"); }}>일정 변경</button>}
                      {!program.archivedAt && session.status !== "canceled" && (program.status === "active" || session.status === "ended") && <button className="pw-primary" onClick={() => setLiveSession(session)}>{session.status === "ended" ? "참여 기록" : "발표실 입장"}</button>}
                    </div>
                  </header>
                  <section className="study-session-section" aria-label="이번 회차 발표 자료">
                    <StudyDecks key={`decks-${session.id}`} base={`${base}/programs/${program.id}`} members={data.members} sessionId={session.id} />
                  </section>
                  <section className="study-session-section" aria-label="이번 회차 참여 활동">
                    <StudyActivities key={`activities-${session.id}`} base={base} userId={userId} sessionId={session.id}
                      activities={data.activities.filter(a => a.programId === program.id && a.sessionId === session.id)}
                      programs={[{...program, canManage: can("activities.manage") || program.organizers.some(o => o.userId === userId)}]}
                      sessions={[session]} onChanged={load} hasMore={!!data.pagination?.activities} loadingMore={busy} onLoadMore={() => void loadMore("activities")} />
                  </section>
                </section>;
              })()}
              {programTab === "sessions" && !selectedSession && (
                <>
                  <div className="study-heading">
                    <h3>
                      회차{" "}
                      {program.plannedSessionCount
                        ? `· 계획 ${program.plannedSessionCount}회`
                        : "· 계속 운영"}
                    </h3>
                    {!program.archivedAt &&
                      program.status !== "completed" &&
                      (can("sessions.manage") ||
                        program.organizers.some(
                          (o) => o.userId === userId,
                        )) && (
                        <button
                          className="pw-primary"
                          onClick={() => {
                            setEditSession(null);
                            setForm("session");
                          }}
                        >
                          회차 추가
                        </button>
                      )}
                  </div>
                  {sessionRows(
                    data.sessions.filter((s) => s.programId === program.id),
                  )}
                  {moreSessions()}
                </>
              )}
              {programTab === "materials" && (
                <StudyDecks
                  key={program.id}
                  base={`${base}/programs/${program.id}`}
                  members={data.members}
                />
              )}
              {programTab === "activities" && (
                <StudyActivities
                  base={base}
                  userId={userId}
                  activities={data.activities.filter(
                    (a) => a.programId === program.id,
                  )}
                  programs={[
                    {
                      ...program,
                      canManage:
                        can("activities.manage") ||
                        program.organizers.some((o) => o.userId === userId),
                    },
                  ]}
                  hasMore={!!data.pagination?.activities}
                  loadingMore={busy}
                  onLoadMore={() => void loadMore("activities")}
                  sessions={(data.sessionOptions ?? data.sessions).filter(
                    (s) => s.programId === program.id,
                  )}
                  onChanged={load}
                />
              )}
              </div>
            </section>
          ) : section === "members" ? (
            <section className="study-members-page" ref={membersRef}>
              <div className="study-heading"><div><h2>회원</h2><p>함께하는 회원과 역할을 확인하고 관리하세요.</p></div>
                {can("members.invite") && memberTab === "members" && <button className="pw-primary" aria-expanded={inviteOpen} aria-controls="study-member-invite" onClick={() => setInviteOpen(v => !v)}>회원 초대</button>}
              </div>
              <div className="study-space-settings-tabs" role="tablist" aria-label="회원 화면 선택">
                {[["members", "회원 목록"], ["roles", "역할 설정"]].map(([id, label], index, tabs) => (
                  <button type="button" key={id} role="tab" id={`study-member-tab-${id}`}
                    aria-selected={memberTab === id} aria-controls={`study-member-panel-${id}`}
                    tabIndex={memberTab === id ? 0 : -1} onClick={() => setMemberTab(id)}
                    onKeyDown={e => {
                      const next = e.key === "Home" ? 0 : e.key === "End" ? 1
                        : ["ArrowLeft", "ArrowRight"].includes(e.key) ? 1 - index : null;
                      if (next === null) return;
                      e.preventDefault(); setMemberTab(tabs[next][0]);
                      document.getElementById(`study-member-tab-${tabs[next][0]}`)?.focus();
                    }}>{label}</button>
                ))}
              </div>
              <div role="tabpanel" id="study-member-panel-roles" aria-labelledby="study-member-tab-roles" hidden={memberTab !== "roles"}>
                <StudyRoles
                  base={base}
                  roles={data.roles}
                  members={data.members}
                  permissions={data.permissions}
                  isOwner={data.isOwner}
                  onChanged={load}
                />
              </div>
              <div role="tabpanel" id="study-member-panel-members" aria-labelledby="study-member-tab-members" hidden={memberTab !== "members"}>
                  <h3 className="study-members-count">전체 회원 <span>{data.members.length}명</span></h3>
                  {can("members.invite") && inviteOpen && (
                    <div id="study-member-invite" className="study-member-invite">
                    <h3>새 회원 초대</h3><p>가입된 회원을 이름 또는 ID로 검색하세요.</p>
                    <form
                      className="study-search"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          const r = await workflowApi<{
                            users: { id: string; displayName: string }[];
                          }>(
                            `/users?q=${encodeURIComponent(inviteQuery)}&accountType=team`,
                          );
                          setInviteResults(r.users);
                          setInviteSearched(true);
                        });
                      }}
                    >
                      <label>
                        이름 또는 ID
                        <input
                          value={inviteQuery}
                          onChange={(e) => { setInviteQuery(e.target.value); setInviteSearched(false); setInviteResults([]); }}
                          placeholder="이름 또는 ID"
                          minLength={2}
                        />
                      </label>
                      <button disabled={busy || inviteQuery.trim().length < 2}>
                        검색
                      </button>
                    </form>
                    {inviteSearched && !inviteResults.filter(u => !data.members.some(m => m.userId === u.id)).length && <p role="status">초대할 수 있는 검색 결과가 없습니다. 이미 참여한 회원은 제외됩니다.</p>}
                  {inviteResults.length > 0 && (
                    <ul className="study-list">
                      {inviteResults
                        .filter(
                          (u) => !data.members.some((m) => m.userId === u.id),
                        )
                        .map((u) => (
                          <li key={u.id}>
                            {u.displayName}
                            <button
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  await workflowApi(
                                    `/projects/${project.id}/invitations`,
                                    { userId: u.id },
                                  );
                                  setInviteResults((r) =>
                                    r.filter((x) => x.id !== u.id),
                                  );
                                  await onChanged();
                                })
                              }
                            >
                              초대 보내기
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                    </div>
                  )}
                  <ul className="study-list study-members-list" aria-label="회원 목록">
                    {data.members.map((m) => {
                      const deputy = data.roles.find(
                        (r) => r.name === "부관리자",
                      );
                      const isDeputy =
                        !!deputy && m.roleIds.includes(deputy.id);
                      const canDeputy = data.isOwner && m.userId !== userId;
                      const canRemove = (m.userId === userId && !data.isOwner) ||
                        (can("members.remove") && !data.roles.some(r => r.name === "관리자" && m.roleIds.includes(r.id)));
                      return (
                        <li key={m.userId}>
                          <div>
                            <strong>
                              {m.displayName}
                              {m.userId === userId ? " (나)" : ""}
                            </strong>
                            <p>
                              {data.roles
                                .filter((r) => m.roleIds.includes(r.id))
                                .map((r) => r.name)
                                .join(" · ") || "회원"}
                            </p>
                          </div>
                          {(canDeputy || canRemove) && <details className="study-member-menu"
                            onKeyDown={e => { if (e.key === "Escape") { e.currentTarget.open = false; e.currentTarget.querySelector("summary")?.focus(); } }}
                            onToggle={e => { if (e.currentTarget.open) membersRef.current?.querySelectorAll<HTMLDetailsElement>(".study-member-menu[open]").forEach(menu => { if (menu !== e.currentTarget) menu.open = false; }); }}>
                            <summary aria-label={`${m.displayName} 회원 작업`} title={`${m.displayName} 회원 작업`}>
                              <ControlIcon name="more" size={16} />
                            </summary>
                            <div aria-label={`${m.displayName} 회원 작업 목록`} onClick={e => {
                              if ((e.target as HTMLElement).closest("button")) { const menu = e.currentTarget.closest("details"); if (menu) { menu.open = false; menu.querySelector("summary")?.focus(); } }
                            }}>
                              {canDeputy && (
                                <button
                                  disabled={busy}
                                  onClick={() =>
                                    void run(() =>
                                      workflowApi(
                                        `${base}/members/${m.userId}/deputy`,
                                        { deputy: !isDeputy },
                                        "PATCH",
                                      ),
                                    )
                                  }
                                >
                                  {isDeputy
                                    ? "부관리자 해제"
                                    : "부관리자로 지정"}
                                </button>
                              )}
                              {canRemove && (
                                <button className="study-member-danger"
                                  disabled={busy}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        m.userId === userId
                                          ? "공간을 탈퇴하면 프로그램에 더 이상 참여할 수 없습니다. 탈퇴할까요?"
                                          : "이 회원을 공간에서 제거할까요? 기존 제출·출석 기록은 유지됩니다.",
                                      )
                                    )
                                      void run(async () => {
                                        await workflowApi(
                                          `${base}/members/${m.userId}/remove`,
                                          {},
                                        );
                                        await onChanged();
                                      });
                                  }}
                                >
                                  {m.userId === userId
                                    ? "공간 탈퇴"
                                    : "회원 제거"}
                                </button>
                              )}
                            </div>
                          </details>}
                        </li>
                      );
                    })}
                  </ul>
              </div>
            </section>
          ) : section === "studyActivities" ? (
            <StudyActivities
              base={base}
              userId={userId}
              activities={data.activities}
              programs={data.programs.map((p) => ({
                ...p,
                canManage:
                  can("activities.manage") ||
                  p.organizers.some((o) => o.userId === userId),
              }))}
              sessions={data.sessionOptions ?? data.sessions}
              hasMore={!!data.pagination?.activities}
              loadingMore={busy}
              onLoadMore={() => void loadMore("activities")}
              onChanged={load}
            />
          ) : section === "settings" ? (
            <div className="study-space-settings">
              <header className="study-heading"><div><h2>스터디 설정</h2><p>공간 정보와 모임의 기본 출석 기준을 관리하세요.</p></div></header>
              {!can("settings.manage") && <p className="study-settings-readonly">설정을 확인할 수 있습니다. 변경은 설정 관리 권한이 있는 회원에게 요청하세요.</p>}
              <div className="study-space-settings-tabs" role="tablist" aria-label="스터디 설정 항목">
                {[["basic", "기본 정보"], ["attendance", "출석 규칙"], ["storage", "저장 공간"]].map(([id, label], index, tabs) => (
                  <button key={id} type="button" role="tab" id={`space-settings-tab-${id}`}
                    aria-controls={`space-settings-panel-${id}`} aria-selected={spaceSettingsTab === id}
                    tabIndex={spaceSettingsTab === id ? 0 : -1}
                    onClick={() => setSpaceSettingsTab(id)}
                    onKeyDown={(event) => {
                      const next = event.key === "ArrowRight" ? (index + 1) % tabs.length
                        : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length
                        : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
                      if (next === null) return;
                      event.preventDefault();
                      setSpaceSettingsTab(tabs[next][0]);
                      document.getElementById(`space-settings-tab-${tabs[next][0]}`)?.focus();
                    }}>{label}</button>
                ))}
              </div>
              <div id="space-settings-panel-basic" role="tabpanel" aria-labelledby="space-settings-tab-basic" hidden={spaceSettingsTab !== "basic"} tabIndex={0}>
                <StudySettings project={project} canManage={can("settings.manage")} onChanged={onChanged} />
              </div>
              <div id="space-settings-panel-attendance" role="tabpanel" aria-labelledby="space-settings-tab-attendance" hidden={spaceSettingsTab !== "attendance"} tabIndex={0}>
                <StudyAttendanceSettings base={base} canManage={can("settings.manage")} />
              </div>
              <div id="space-settings-panel-storage" role="tabpanel" aria-labelledby="space-settings-tab-storage" hidden={spaceSettingsTab !== "storage"} tabIndex={0}>
                <StudyStorage base={base} />
              </div>
            </div>
          ) : section === "schedule" ? (
            <section>
              <h2>일정</h2>
              {sessionRows(
                data.sessions.filter(
                  (s) =>
                    !data.programs.find((p) => p.id === s.programId)
                      ?.archivedAt,
                ),
              )}
              {moreSessions()}
            </section>
          ) : section === "overview" ? (
            <section aria-label="스터디 개요">
              <div className="study-heading">
                <div><h2>모임 개요</h2><p>예정된 모임과 활동 마감일을 확인하세요.</p></div>
                {canManageProgram && <button className="pw-primary" onClick={createProgram}>프로그램 만들기</button>}
              </div>
              <div className="study-overview-grid">
                <section className="study-overview-panel" aria-labelledby="study-upcoming-sessions">
                  <div className="study-heading"><h3 id="study-upcoming-sessions">다가오는 모임</h3>
                    <button onClick={() => onSection("schedule")}>전체 일정 보기</button></div>
                  {upcomingSessions.length ? <ul className="study-list">
                    {upcomingSessions.slice(0, 3).map(s => <li key={s.id}>
                      <button className="study-row-link" onClick={() => openProgram(s.programId)}>
                        <strong>{s.title}</strong><span>{data.programs.find(p => p.id === s.programId)?.title}</span>
                        <span>{date(s.startsAt)} · {states[s.status]}</span>
                      </button>
                      <button onClick={() => setLiveSession(s)}>발표실 열기</button>
                    </li>)}
                  </ul> : <p className="study-overview-empty">{data.pagination?.sessions ? "이전 회차 이후의 일정을 더 불러와 확인하세요." : "예정된 모임이 없습니다."}</p>}
                  {moreSessions()}
                </section>
                <section className="study-overview-panel" aria-labelledby="study-upcoming-activities">
                  <div className="study-heading"><h3 id="study-upcoming-activities">마감 예정 활동</h3>
                    <button onClick={() => onSection("studyActivities")}>전체 활동 보기</button></div>
                  {upcomingActivities.length ? <ul className="study-list">
                    {upcomingActivities.slice(0, 3).map(a => <li key={a.id}>
                      <button className="study-row-link" onClick={() => openProgram(a.programId, "activities")}>
                        <strong>{a.title}</strong><span>{data.programs.find(p => p.id === a.programId)?.title}</span>
                        <span>{date(a.dueAt)} 마감</span>
                      </button>
                    </li>)}
                  </ul> : <p className="study-overview-empty">{data.pagination?.activities ? "이전 활동 이후의 마감일을 더 불러와 확인하세요." : "마감 예정인 활동이 없습니다."}</p>}
                  {data.pagination?.activities && <button disabled={busy} onClick={() => void loadMore("activities")}>{busy ? "불러오는 중…" : "다음 활동 더 보기"}</button>}
                </section>
              </div>
              <section aria-labelledby="study-active-programs">
                <div className="study-heading"><h3 id="study-active-programs">진행 중 프로그램</h3>
                  <button onClick={() => onSection("programs")}>전체 프로그램 보기</button></div>
                {activePrograms.length ? <ul className="study-list">
                  {activePrograms.slice(0, 3).map(p => <li key={p.id}>
                    <button className="study-row-link" onClick={() => openProgram(p.id)}><strong>{p.title}</strong><span>{p.description || "회차와 활동을 확인하세요."}</span></button>
                    <span className="study-badge">{p.memberIds.length}명 참여</span>
                  </li>)}
                </ul> : <p className="study-overview-empty">{data.programs.length ? "진행 중인 프로그램이 없습니다. 전체 목록에서 준비 중·완료된 프로그램을 확인하세요." : "아직 프로그램이 없습니다. 운영진이 프로그램을 만들면 여기에 표시됩니다."}</p>}
              </section>
            </section>
          ) : (
            <section className={`study-program-catalog ${section === "programs" ? "study-card-catalog" : ""}`}>
              <div className="study-heading">
                <div>
                  <h2>
                    {section === "materials" ? "프로그램별 자료" : "프로그램"}
                  </h2>
                  <p>하나의 주제로 여러 회차와 자료, 참여 활동을 함께 관리합니다.</p>
                </div>
                {can("programs.manage") && (
                  <button
                    className="pw-primary"
                    onClick={createProgram}
                  >
                    프로그램 만들기
                  </button>
                )}
              </div>
              <div className="study-catalog-results">
              <div className="study-search">
                <input
                  aria-label="프로그램 검색"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="프로그램 검색"
                />
                <FilterBar
                  filters={[
                    {
                      id: "status",
                      label: "상태",
                      options: [
                        { value: "preparing", label: "준비 중" },
                        { value: "active", label: "진행 중" },
                        { value: "completed", label: "완료" },
                        { value: "archived", label: "보관됨" },
                      ],
                      values: status,
                      onChange: setStatus,
                    },
                  ]}
                  onClear={() => setStatus([])}
                />
              </div>
              <p className="study-result-count">프로그램 {filteredPrograms.length}개</p>
              {section === "programs" ? <ul className="study-program-grid">
                {filteredPrograms.map(p => {
                  // Paged session rows alone cannot provide accurate program totals.
                  const all = data.sessionOptions ?? (!data.pagination?.sessions ? data.sessions : null);
                  const rows = all?.filter(s => s.programId === p.id);
                  const complete = rows?.every(s => s.status && s.startsAt && s.endsAt);
                  const ended = rows?.filter(s => s.status === "ended").length ?? 0;
                  const next = complete && !p.archivedAt && p.status === "active"
                    ? rows?.filter(s => s.status === "live" || (s.status === "scheduled" && new Date(s.endsAt!).getTime() >= Date.now()))
                      .sort((a, b) => Number(b.status === "live") - Number(a.status === "live") || Date.parse(a.startsAt!) - Date.parse(b.startsAt!))[0]
                    : undefined;
                  return <li key={p.id}>
                    <button className="study-program-card" onClick={() => { setProgramTab("sessions"); setProgramId(p.id); }}>
                      <span className="study-program-card-heading">
                        <strong>{p.title}</strong>
                        <span className="study-badge">{p.archivedAt ? "보관됨" : states[p.status]}</span>
                      </span>
                      <span className="study-program-card-description">{p.description || "회차와 자료, 참여 활동을 함께 관리하는 프로그램입니다."}</span>
                      <span className="study-program-card-summary">
                        <span>{p.plannedSessionCount ? `계획 ${p.plannedSessionCount}회` : "계속 운영"}</span>
                        <span>{rows ? `등록 ${rows.length}회` : "회차 수 확인 필요"}{complete ? ` · 종료 ${ended}회` : ""}</span>
                      </span>
                      <span className="study-program-card-next">
                        <span className="study-program-card-caption">{next?.status === "live" ? "진행 중인 모임" : "다음 모임"}</span>
                        {next ? <><strong>{next.title}</strong><span>{date(next.startsAt!)}</span></>
                          : <span>{p.archivedAt ? "보관된 프로그램입니다." : p.status === "completed" ? "프로그램이 완료되었습니다." : p.status === "preparing" ? "프로그램 시작을 준비하고 있어요." : !complete ? "회차 목록에서 일정을 확인하세요." : "예정된 모임이 없습니다."}</span>}
                      </span>
                      <span className="study-program-card-open">프로그램 열기 <ControlIcon name="arrow" /></span>
                    </button>
                  </li>;
                })}
              </ul> : <>
              <ul className="study-list">
                {filteredPrograms                  .map((p) => (
                    <li key={p.id}>
                      <button
                        className="study-row-link"
                        onClick={() => {
                          setProgramTab(
                            section === "materials" ? "materials" : "sessions",
                          );
                          setProgramId(p.id);
                        }}
                      >
                        <strong>{p.title}</strong>
                        <span>
                          {p.description || "회차와 활동을 함께 준비하세요."}
                        </span>
                      </button>
                      <span className="study-badge">
                        {p.archivedAt ? "보관됨" : states[p.status]}
                      </span>
                    </li>
                  ))}
              </ul>
              </>}
              {!filteredPrograms.length && (
                <div className="study-empty" role="status">
                  {query.trim() || status.length ? <>
                    <p>조건에 맞는 프로그램이 없어요.</p>
                    <button onClick={() => { setQuery(""); setStatus([]); }}>검색·필터 초기화</button>
                  </> : <p>아직 표시할 프로그램이 없습니다.
                    {canManageProgram ? " 새 프로그램을 만들어보세요." : " 운영진이 프로그램을 준비하면 여기에 표시됩니다."}
                  </p>}
                </div>
              )}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
function StudySettings({
  project,
  canManage,
  onChanged,
}: {
  project: Props["project"];
  canManage: boolean;
  onChanged: Props["onChanged"];
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  return (
    <section id="study-space-info" className="study-settings-card" aria-labelledby="study-space-info-title">
      <header><h3 id="study-space-info-title">기본 정보</h3><p>회원에게 표시되는 공간 이름과 소개입니다.</p></header>
      <form
        className="study-form"
        onChange={() => { setSaved(false); setError(""); }}
        aria-busy={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          const fd = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            await workflowApi(
              `/projects/${project.id}`,
              { name: fd.get("name"), description: fd.get("description") },
              "PATCH",
            );
            await onChanged();
            setSaved(true);
          } catch (e) {
            setError(e instanceof Error ? e.message : "저장 실패");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          공간 이름
          <input
            name="name"
            defaultValue={project.name}
            required
            maxLength={120}
            disabled={!canManage || busy}
          />
        </label>
        <label>
          소개
          <textarea
            name="description"
            defaultValue={project.description}
            maxLength={2000}
            disabled={!canManage || busy}
          />
        </label>
        <footer className="study-settings-footer">
          {canManage && <button className="pw-primary" disabled={busy}>{busy ? "저장 중…" : "기본 정보 저장"}</button>}
          {error && <p className="study-settings-error" role="alert">{error}</p>}
          {saved && <p role="status">기본 정보를 저장했습니다.</p>}
        </footer>
      </form>
    </section>
  );
}
