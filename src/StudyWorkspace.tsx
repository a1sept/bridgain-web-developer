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
  sessionOptions?: { id: string; title: string; programId: string }[];
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
  const [liveSession, setLiveSession] = useState<Session | null>(null);
  const [operatingMode, setOperatingMode] = useState("ongoing"),
    [repeat, setRepeat] = useState(false);
  const [programTab, setProgramTab] = useState("sessions"),
    [editingProgram, setEditingProgram] = useState(false);
  const [organizerForm, setOrganizerForm] = useState(false),
    [deputyIds, setDeputyIds] = useState<string[]>([]);
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
  useEffect(() => {
    setForm(null);
    setSchedulePreview(null);
    setOrganizerForm(false);
    setLiveSession(null);
    setProgramId(null);
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
    if (mutationKey.current.payload !== payload)
      mutationKey.current = { payload, id: crypto.randomUUID() };
    await run(async () => {
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
            hostIds,
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
          <li key={s.id}>
            <div>
              <strong>{s.title}</strong>
              <p>
                {date(s.startsAt)} – {date(s.endsAt)} · {states[s.status]}
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
    return <ProjectChannel projectId={project.id} onOpen={() => {}} />;
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
    <main className="study-workspace">
      <header className="study-heading">
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
            <section className="study-panel">
              <button onClick={() => setForm(null)} disabled={busy}>
                ← 돌아가기
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
              <form
                onSubmit={save}
                onChange={() => setSchedulePreview(null)}
                className="study-form"
                key={editSession?.id ?? form}
              >
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
                {form === "program" ? (
                  <>
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
                    <fieldset
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
                    <fieldset>
                      <legend>프로그램 주최자</legend>
                      {picker("주최자 선택", hostIds, setHostIds)}
                    </fieldset>
                  </>
                ) : (
                  <>
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
                    돌아가기
                  </button>
                  <button className="pw-primary" disabled={busy}>
                    {busy
                      ? "저장 중…"
                      : schedulePreview && form === "session"
                        ? "확인한 일정으로 변경"
                        : "저장하기"}
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
          ) : program ? (
            <section>
              <button onClick={() => setProgramId(null)}>
                ← 프로그램 목록
              </button>
              <div className="study-heading">
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
                <div className="study-actions">
                  {can("programs.manage") && (
                    <>
                      {program.archivedAt ? (
                        <button
                          disabled={busy}
                          onClick={() => programAction("restore")}
                        >
                          복원
                        </button>
                      ) : (
                        <>
                          {program.status === "preparing" && (
                            <button
                              className="pw-primary"
                              disabled={busy}
                              onClick={() => programAction("start")}
                            >
                              프로그램 시작
                            </button>
                          )}
                          {program.status === "active" && (
                            <button
                              disabled={busy}
                              onClick={() => programAction("complete")}
                            >
                              완료
                            </button>
                          )}
                          <button
                            disabled={busy}
                            onClick={() => programAction("archive")}
                          >
                            보관
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
              {!program.archivedAt &&
                (can("programs.manage") ||
                  program.organizers.some(
                    (o) => o.userId === userId && o.role === "host",
                  )) && (
                  <button
                    onClick={() => {
                      setDeputyIds(
                        program.organizers
                          .filter((o) => o.role === "deputy")
                          .map((o) => o.userId),
                      );
                      setOrganizerForm((v) => !v);
                    }}
                  >
                    프로그램 운영진
                  </button>
                )}
              {organizerForm && (
                <section className="study-panel">
                  <h3>프로그램 부관리자</h3>
                  <p>
                    주최자가 자리를 비우면 발표를 이어서 진행할 수 있습니다.
                    공간 전체의 역할은 바뀌지 않습니다.
                  </p>
                  {picker("부관리자 선택", deputyIds, setDeputyIds)}
                  <div className="study-actions">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await workflowApi(
                            `${base}/programs/${program.id}/organizers`,
                            { deputyIds },
                            "PATCH",
                          );
                          setOrganizerForm(false);
                        })
                      }
                    >
                      운영진 저장
                    </button>
                    <button onClick={() => setOrganizerForm(false)}>
                      닫기
                    </button>
                  </div>
                </section>
              )}
              <div className="study-segment" aria-label="프로그램 메뉴">
                {[
                  ["sessions", "회차"],
                  ["materials", "발표 자료"],
                  ["activities", "참여 활동"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={programTab === value}
                    onClick={() => setProgramTab(value)}
                  >
                    {label}
                  </button>
                ))}
                {can("programs.manage") && !program.archivedAt && (
                  <button
                    onClick={() => {
                      setEditingProgram(true);
                      setOperatingMode(
                        program.plannedSessionCount ? "fixed" : "ongoing",
                      );
                      setMode(program.membershipMode);
                      setMemberIds(program.memberIds);
                      setHostIds(
                        program.organizers
                          .filter((o) => o.role === "host")
                          .map((o) => o.userId),
                      );
                      setForm("program");
                    }}
                  >
                    프로그램 설정
                  </button>
                )}
              </div>
              {programTab === "sessions" && (
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
            </section>
          ) : section === "members" ? (
            <section>
              <div className="study-segment">
                <button
                  onClick={() => setMemberTab("members")}
                  aria-pressed={memberTab === "members"}
                >
                  회원 목록
                </button>
                <button
                  onClick={() => setMemberTab("roles")}
                  aria-pressed={memberTab === "roles"}
                >
                  역할·권한
                </button>
              </div>
              {memberTab === "roles" ? (
                <StudyRoles
                  base={base}
                  roles={data.roles}
                  members={data.members}
                  permissions={data.permissions}
                  isOwner={data.isOwner}
                  onChanged={load}
                />
              ) : (
                <>
                  <div className="study-heading">
                    <h2>회원</h2>
                  </div>
                  {can("members.invite") && (
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
                        });
                      }}
                    >
                      <label>
                        회원 초대
                        <input
                          value={inviteQuery}
                          onChange={(e) => setInviteQuery(e.target.value)}
                          placeholder="이름 또는 ID"
                          minLength={2}
                        />
                      </label>
                      <button disabled={busy || inviteQuery.trim().length < 2}>
                        검색
                      </button>
                    </form>
                  )}
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
                  <ul className="study-list">
                    {data.members.map((m) => {
                      const deputy = data.roles.find(
                        (r) => r.name === "부관리자",
                      );
                      const isDeputy =
                        !!deputy && m.roleIds.includes(deputy.id);
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
                          <details className="study-member-menu">
                            <summary aria-label={`${m.displayName} 회원 관리`}>
                              관리
                            </summary>
                            <div>
                              {data.isOwner && m.userId !== userId && (
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
                              {((m.userId === userId && !data.isOwner) ||
                                (can("members.remove") &&
                                  !data.roles.some(
                                    (r) =>
                                      r.name === "관리자" &&
                                      m.roleIds.includes(r.id),
                                  ))) && (
                                <button
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
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
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
            <>
              <StudySettings
                project={project}
                canManage={can("settings.manage")}
                onChanged={onChanged}
              />
              <StudyAttendanceSettings
                base={base}
                canManage={can("settings.manage")}
              />
              <StudyStorage base={base} />
            </>
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
          ) : (
            <section>
              <div className="study-heading">
                <div>
                  <h2>
                    {section === "overview"
                      ? "함께하는 프로그램"
                      : section === "materials"
                        ? "프로그램별 자료"
                        : "프로그램"}
                  </h2>
                  <p>주제별 프로그램을 만들고 회차를 구성하세요.</p>
                </div>
                {can("programs.manage") && (
                  <button
                    className="pw-primary"
                    onClick={() => {
                      setOperatingMode("ongoing");
                      setRepeat(false);
                      setEditingProgram(false);
                      setProgramTab("sessions");
                      setHostIds([userId]);
                      setMemberIds([]);
                      setMode("all");
                      setForm("program");
                    }}
                  >
                    프로그램 만들기
                  </button>
                )}
              </div>
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
              <ul className="study-list">
                {data.programs
                  .filter(
                    (p) =>
                      p.title
                        .toLocaleLowerCase()
                        .includes(query.toLocaleLowerCase()) &&
                      (status.length
                        ? status.includes(p.archivedAt ? "archived" : p.status)
                        : !p.archivedAt),
                  )
                  .map((p) => (
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
              {!data.programs.length && (
                <p className="study-empty">
                  아직 프로그램이 없습니다.
                  {can("programs.manage")
                    ? " 첫 프로그램을 만들어보세요."
                    : " 운영진이 프로그램을 준비하면 여기에 표시됩니다."}
                </p>
              )}
              {section === "overview" && (
                <button onClick={() => onSection("schedule")}>
                  전체 일정 보기 →
                </button>
              )}
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
    <section className="study-panel">
      <h2>스터디 설정</h2>
      <form
        className="study-form"
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
            disabled={!canManage}
          />
        </label>
        <label>
          소개
          <textarea
            name="description"
            defaultValue={project.description}
            maxLength={2000}
            disabled={!canManage}
          />
        </label>
        {canManage && (
          <button className="pw-primary" disabled={busy}>
            저장하기
          </button>
        )}
        {error && <p role="alert">{error}</p>}
        {saved && <p role="status">저장했습니다.</p>}
      </form>
    </section>
  );
}
