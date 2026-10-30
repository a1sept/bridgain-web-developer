import MeetingApprovalStatus from "./MeetingApprovalStatus";
import MeetingList from "./MeetingList";
import type { RichDocument } from "./editor/document";
import ControlIcon from "./components/ControlIcon";
import MeetingMode, { type MeetingFocus } from "./MeetingMode";
import {
  type StagePlan,
  validStages,
} from "./StagePlanEditor";
import {
  ApproverPicker,
  workflowApi,
  type Approver,
  type Approval,
} from "./Approvals";
import {
  useLayoutEffect,
  useEffect,
  useState,
  useRef,
  type FormEvent,
} from "react";
import "./project-resources.css";
export type ResourceSection = "meetings" | "documents" | "activity";
type Plan = {
  discussionStatus?: "unreviewed" | "discussed" | "deferred";
  stages?: StagePlan[];
  requestId: string;
  planning: string;
  planningDocument?: RichDocument | null;
  uiNotes: string;
  apiNotes: string;
  dbNotes: string;
  priority: string;
  assigneeIds: string[];
  taskId?: string | null;
};
type Meeting = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  finalApproverIds?: string[];
  location: string;
  notes: string;
  notesDocument?: RichDocument | null;
  status: string;
  decisionStatus: "draft" | "pending" | "final";
  requests: Plan[];
};
type Version = {
  id: string;
  title: string;
  content: string;
  category: string;
  url: string | null;
  changeSummary: string;
  taskId: string | null;
  actorName: string;
  createdAt: string;
};
type Document = {
  id: string;
  title: string;
  category: string;
  content: string;
  url: string | null;
  creatorName: string;
  updatedAt: string;
  versions: Version[];
};
type Event = {
  title?: string;
  origin?: string;
  id: string;
  kind: string;
  body: string;
  actorName: string;
  createdAt: string;
};
type Task = { id: string; title: string };
type Request = {
  description?: string;
  priority?: string;
  id: string;
  title: string;
  origin?: string;
  meetingId?: string | null;
  meetingTitle?: string;
  taskId?: string | null;
};
type Member = { userId: string; displayName: string; accountType: string };
const categories: Record<string, string> = {
  plan: "기획 / 요구사항",
  design: "디자인",
  erd: "ERD / DB 설계",
  api: "API 명세",
  frontend: "프론트 설계",
  meeting: "회의록",
  other: "기타",
};

async function api<T>(
  path: string,
  body?: object,
  method = "POST",
): Promise<T> {
  const signal = AbortSignal.timeout(20000);
  const headers: Record<string, string> = {};
  if (body) {
    const r = await fetch("/api/auth/csrf", {
      credentials: "same-origin",
      signal,
    });
    if (!r.ok) throw Error("로그인 상태를 확인해주세요.");
    headers["X-CSRF-Token"] = (await r.json()).csrfToken;
    headers["Content-Type"] = "application/json";
  }
  const r = await fetch(`/api/workspace${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    method: body ? method : "GET",
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.message || "처리하지 못했어요.");
  return data;
}
export default function ProjectResources({
  projectId,
  section,
  refreshKey,
  onChanged,
  members = [],
  onTask,
  onApprovals,
  permissions,
  rolesConfigured,
}: {
  projectId: string;
  permissions?: string[];
  rolesConfigured?: boolean;
  onApprovals?: () => void;
  section: ResourceSection;
  refreshKey?: number;
  onChanged: () => void;
  members?: Member[];
  onTask?: (taskId: string) => void;
}) {
  const [meetings, setMeetings] = useState<Meeting[]>([]),
    [documents, setDocuments] = useState<Document[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [requests, setRequests] = useState<Request[]>([]),
    [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [busy, setBusy] = useState(false);
  const [notesDocument, setNotesDocument] = useState<RichDocument | null>(null);
  const [meetingFocus, setMeetingFocus] = useState<MeetingFocus | null>(null);
  const [meetingMode, setMeetingMode] = useState(false);
  const [approverHelpOpen,setApproverHelpOpen] = useState(false);
  const [savedMeetingDraft, setSavedMeetingDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null),
    [title, setTitle] = useState(""),
    [content, setContent] = useState(""),
    [url, setUrl] = useState(""),
    [category, setCategory] = useState("plan"),
    [when, setWhen] = useState(""),
    [duration, setDuration] = useState(60),
    [location, setLocation] = useState(""),
    [status, setStatus] = useState("scheduled"),
    [plans, setPlans] = useState<Plan[]>([]),
    [summary, setSummary] = useState(""),
    [taskId, setTaskId] = useState("");
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("");
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [workApprovers, setWorkApprovers] = useState<Approver[]>([]);
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);
  const [approversLoadedFor, setApproversLoadedFor] = useState("");
  const defaultedMeetingApprovers = useRef(false);
  const defaultedStageApprovers = useRef(new Set<string>());
  const [approvalItems, setApprovalItems] = useState<Approval[]>([]);
  const [transfers, setTransfers] = useState<Record<string, string>>({});
  const [requestQuery, setRequestQuery] = useState("");
  const [requestPickerOpen, setRequestPickerOpen] = useState(false);
  const [requestInsertIndex, setRequestInsertIndex] = useState(0);
  const [requestConnector, setRequestConnector] = useState("");
  const [requestPickerMode, setRequestPickerMode] = useState<"menu" | "existing">("menu");
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const meetingDraft = JSON.stringify({title,content,notesDocument,when,duration,location,plans,selectedApprovers});
  const meetingDirty = !!editing && section === "meetings" && meetingDraft !== savedMeetingDraft;
  useEffect(() => { if (section === "meetings" && editing) setSavedMeetingDraft(meetingDraft); }, [editing, section]);
  useEffect(() => {
    if (!meetingDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [meetingDirty]);
  const requestPickerRef = useRef<HTMLDivElement>(null);
  const requestPopupRef = useRef<HTMLElement>(null);
  const [requestPopupPosition, setRequestPopupPosition] = useState<{
    left: number;
    top: number;
    maxHeight: number;
    width: number;
  } | null>(null);
  useLayoutEffect(() => {
    if (!requestPickerOpen) return;
    const popup = requestPopupRef.current;
    const trigger = requestTriggerRef.current;
    if (!popup || !trigger) return;
    // Top-layer positioning escapes the meeting sidebar overflow and containment.
    if (!popup.matches(":popover-open")) popup.showPopover();
    let frame = 0;
    const position = () => {
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportWidth =
        viewport?.width ?? document.documentElement.clientWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const margin = 12,
        gap = 8;
      const rect = trigger.getBoundingClientRect();
      const bottom = viewportTop + viewportHeight - margin;
      const top = viewportTop + margin;
      const below = Math.max(0, bottom - rect.bottom - gap);
      const above = Math.max(0, rect.top - gap - top);
      const list = popup.querySelector<HTMLElement>(".pr-request-results");
      const naturalHeight =
        popup.scrollHeight +
        2 -
        (list?.clientHeight ?? 0) +
        Math.min(list?.scrollHeight ?? 0, 320);
      const desiredHeight = Math.min(naturalHeight, 480);
      const opensAbove = below < desiredHeight && above > below;
      const maxHeight = Math.max(0, Math.min(480, opensAbove ? above : below));
      const height = Math.min(desiredHeight, maxHeight);
      const width = Math.min(440, Math.max(0, viewportWidth - margin * 2));
      const left = Math.max(
        viewportLeft + margin,
        Math.min(
          rect.left + rect.width / 2 - width / 2,
          viewportLeft + viewportWidth - margin - width,
        ),
      );
      const next = {
        left,
        top: opensAbove
          ? Math.max(top, rect.top - gap - height)
          : Math.max(top, Math.min(rect.bottom + gap, bottom - height)),
        maxHeight,
        width,
      };
      setRequestPopupPosition((current) =>
        current &&
        Object.keys(next).every(
          (key) =>
            current[key as keyof typeof next] ===
            next[key as keyof typeof next],
        )
          ? current
          : next,
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(position);
    };
    position();
    const observer = new ResizeObserver(schedule);
    observer.observe(popup);
    const results = popup.querySelector(".pr-request-results");
    if (results) observer.observe(results);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [requestPickerOpen, requestConnector, requestQuery, requestPickerMode]);
  const requestTriggerRef = useRef<HTMLButtonElement>(null);
  const closeRequestPicker = () => {
    setRequestPickerOpen(false);
    requestTriggerRef.current?.focus();
  };
  useEffect(() => {
    if (!requestPickerOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!requestPickerRef.current?.contains(event.target as Node))
        setRequestPickerOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [requestPickerOpen]);
  const saveLock = useRef(false);
  const base = `/projects/${projectId}`;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setEditing(null);
    setMeetingMode(false);
    setQuery("");
    setFilter("");
    Promise.all([
      api<{ meetings?: Meeting[]; documents?: Document[]; events?: Event[] }>(
        `${base}/${section}`,
      ),
      section === "activity"
        ? Promise.resolve({ requests: [] as Request[] })
        : api<{ requests: Request[] }>(`${base}/requests`),
      section === "documents"
        ? api<{ tasks: Task[] }>(`${base}/tasks`)
        : Promise.resolve({ tasks: [] as Task[] }),
    ])
      .then(([d, r, t]) => {
        if (active) {
          setMeetings(d.meetings || []);
          if (section === "meetings") {
            const target = window.sessionStorage.getItem(
              "bridgain-open-meeting",
            );
            if (target) {
              window.sessionStorage.removeItem("bridgain-open-meeting");
              const meeting = d.meetings?.find((m) => m.id === target);
              if (meeting) edit(meeting);
              else
                setError("연결된 회의를 찾을 수 없거나 조회 권한이 없습니다.");
            }
          }
          setDocuments(d.documents || []);
          setEvents(d.events || []);
          setRequests(r.requests);
          setTasks(t.tasks);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [base, section, reload, refreshKey]);
  useEffect(() => {
    if (section !== "meetings") return;
    let active = true;
    setApproversLoadedFor("");
    workflowApi<{
      approvers: Approver[];
      workApprovers?: Approver[];
      approvals: Approval[];
    }>(`${base}/approvals`)
      .then((d) => {
        if (!active) return;
        setApprovers(d.approvers);
        setWorkApprovers(d.workApprovers || []);
        setApprovalItems(d.approvals);
        setApproversLoadedFor(base);
      })
      .catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [base, section, reload, refreshKey]);
  const canAssign = !rolesConfigured || !!permissions?.includes("tasks.assign");
  const canCreate = !permissions || permissions.includes(`${section}.create`);
  const canUpdate = !permissions || permissions.includes(`${section}.update`);
  function edit(item?: Meeting | Document, present = false) {
    defaultedMeetingApprovers.current = false;
    defaultedStageApprovers.current = new Set();
    setMeetingFocus(null);
    setMeetingMode(present);
    setRequestQuery("");
    setRequestPickerOpen(false);
    setTransfers({});
    setSelectedApprovers(item && "finalApproverIds" in item ? item.finalApproverIds || [] : []);
    setNewRequestOpen(false);
    setError("");
    setEditing(item?.id || "new");
    setTitle(item?.title || "");
    setNotesDocument(item && "notes" in item ? item.notesDocument ?? null : null);
    setContent(item ? ("notes" in item ? item.notes : item.content) : "");
    setUrl(item && "url" in item ? item.url || "" : "");
    setCategory(item && "category" in item ? item.category : "plan");
    setLocation(item && "location" in item ? item.location : "");
    setStatus(item && "status" in item ? item.status : "scheduled");
    setPlans(
      item && "requests" in item
        ? item.requests.map((p) => ({ ...p, assigneeIds: [...p.assigneeIds] }))
        : [],
    );
    setDuration(item && "durationMinutes" in item ? item.durationMinutes : 60);
    setSummary("");
    setTaskId("");
    const d =
      item && "scheduledAt" in item ? new Date(item.scheduledAt) : new Date();
    setWhen(
      new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16),
    );
  }
  useEffect(() => {
    if (loading || error) return;
    if (section === "documents") {
      const raw = window.sessionStorage.getItem("bridgain-document-version");
      if (raw) {
        window.sessionStorage.removeItem("bridgain-document-version");
        try {
          const target = JSON.parse(raw);
          const item = documents.find((d) => d.id === target.documentId);
          if (item) {
            edit(item);
            setTimeout(
              () =>
                document
                  .getElementById(target.versionId)
                  ?.scrollIntoView({ block: "center" }),
              0,
            );
          }
        } catch {
          /* stale navigation */
        }
      }
    }
    if (section === "meetings") {
      const rid = window.sessionStorage.getItem("bridgain-meeting-request");
      if (rid && requests.some((r) => r.id === rid)) {
        window.sessionStorage.removeItem("bridgain-meeting-request");
        const request = requests.find((r) => r.id === rid)!;
        if (request.taskId) {
          setError("이미 업무화된 요청입니다.");
          return;
        }
        if (
          request.meetingId &&
          !window.confirm(
            `이 요청은 '${request.meetingTitle || request.meetingId}' 회의에 연결되어 있습니다. 기존 회의에서 제외하고 새 회의로 이동할까요?`,
          )
        )
          return;
        edit();
        if (request.meetingId) setTransfers({ [rid]: request.meetingId });
        setPlans([
          {
            requestId: rid,
            planning: "",
            uiNotes: "",
            apiNotes: "",
            dbNotes: "",
            priority: "normal",
            assigneeIds: [],
          },
        ]);
      }
    }
  }, [loading, section, documents, requests]);
  const pendingApproval = approvalItems.find(
    (a) => a.meetingId === editing && a.status === "pending",
  );
  const finalized =
    section === "meetings" &&
    meetings.find((m) => m.id === editing)?.decisionStatus === "final";
  const meetingApproval = pendingApproval || approvalItems.find(a => a.meetingId === editing && a.status === "approved") || approvalItems.find(a => a.meetingId === editing);
  const locked = finalized || !!pendingApproval;
  async function deleteListedMeeting(id: string) {
    if (saveLock.current || !canUpdate) return;
    const meeting = meetings.find(m => m.id === id);
    if (!meeting || !window.confirm(`'${meeting.title}' 회의를 삭제할까요?\n회의 메모와 업무 초안이 삭제되며 복구할 수 없습니다. 연결된 원래 요청은 삭제되지 않습니다.`)) return;
    saveLock.current=true;setBusy(true);setError("");
    try {
      await api(`${base}/meetings/${id}`, {}, "DELETE");
      setMeetings(current=>current.filter(m=>m.id!==id));onChanged?.();
    } catch(cause) { setError(cause instanceof Error ? cause.message : "회의를 삭제하지 못했습니다."); }
    finally {saveLock.current=false;setBusy(false);}
  }
  async function startListedMeeting(id: string) {
    if (saveLock.current || !canUpdate) return;
    const current = meetings.find(m => m.id === id);
    if (!current) return;
    saveLock.current = true; setBusy(true); setError("");
    try {
      const result = await api<{meeting: Meeting}>(`${base}/meetings/${id}/actions`, {action:"start"});
      const updated = {...current,...result.meeting,requests:current.requests};
      setMeetings(items=>items.map(m=>m.id===id?updated:m));
      edit(updated,true); onChanged?.();
    } catch(cause) { setError(cause instanceof Error ? cause.message : "회의를 시작하지 못했습니다."); }
    finally {saveLock.current=false;setBusy(false);}
  }
  async function rescheduleMeeting(id: string, scheduledAt: string) {
    if (saveLock.current || !canUpdate) return false;
    saveLock.current=true;setBusy(true);setError("");
    try {
      const result=await api<{meeting:Meeting}>(`${base}/meetings/${id}`,{scheduledAt},"PATCH");
      setMeetings(items=>items.map(m=>m.id===id?result.meeting:m));onChanged?.();return true;
    } catch(cause) {setError(cause instanceof Error?cause.message:"일정을 변경하지 못했습니다.");return false;}
    finally {saveLock.current=false;setBusy(false);}
  }
  async function changeMeetingState(action: "start" | "complete" | "reopen") {
    if (saveLock.current || !editing || editing === "new") return;
    saveLock.current = true; setBusy(true); setError("");
    try {
      if (meetingDirty && !meetingReadOnly) await persistMeeting();
      const result = await api<{meeting: Meeting}>(`${base}/meetings/${editing}/actions`, { action });
      setStatus(result.meeting.status);
      if (action === "start") setMeetingMode(true);
      setMeetings(current => current.map(m => m.id === editing ? {...m,...result.meeting} : m));
      onChanged?.();
    } catch (cause) {setError(cause instanceof Error ? cause.message : "회의 상태를 변경하지 못했습니다.");}
    finally {saveLock.current = false; setBusy(false);}
  }
  function patchPlan(id: string, change: Partial<Plan>) {
    setPlans((current) =>
      current.map((p) => (p.requestId === id ? { ...p, ...change } : p)),
    );
  }
  const meetingReadOnly = locked || (editing === "new" ? !canCreate : !canUpdate);
  useEffect(() => {
    if (section !== "meetings" || !editing || meetingReadOnly || approversLoadedFor !== base) return;
    // Seed each field once per editing session. Removing everyone must stay empty.
    if (!defaultedMeetingApprovers.current) {
      defaultedMeetingApprovers.current = true;
      setSelectedApprovers(current => current.length ? current : approvers.map(person => person.userId));
    }
    const unseen = new Set(plans.flatMap(plan => (plan.stages || [])
      .filter(stage => !defaultedStageApprovers.current.has(stage.id))
      .map(stage => stage.id)));
    if (!unseen.size) return;
    unseen.forEach(id => defaultedStageApprovers.current.add(id));
    const reviewerIds = workApprovers.map(person => person.userId);
    setPlans(current => current.map(plan => ({
      ...plan,
      stages: plan.stages?.map(stage => unseen.has(stage.id) && !stage.reviewerIds.length
        ? { ...stage, reviewerIds: [...reviewerIds] } : stage),
    })));
  }, [section, editing, meetingReadOnly, approversLoadedFor, base, approvers, workApprovers, plans]);
  const approvalIssues: {label:string;target?:MeetingFocus}[] = [];
  if (!title.trim()) approvalIssues.push({label:"회의 제목을 입력해주세요.",target:{requestId:null,field:"title"}});
  if (!canAssign) approvalIssues.push({label:"업무 배정 권한이 필요합니다. 프로젝트 관리자에게 문의해주세요."});
  if (!plans.length) approvalIssues.push({label:"요청을 연결하고 업무를 추가해주세요.",target:{requestId:null,field:"requests"}});
  for (const [requestIndex, plan] of plans.entries()) {
    const requestName=requests.find(r=>r.id===plan.requestId)?.title || `${requestIndex+1}번째 요청`;
    const target:MeetingFocus={requestId:plan.requestId,field:"tasks"};
    if (!plan.stages?.length) {approvalIssues.push({label:`${requestName}: 업무를 추가해주세요.`,target});continue;}
    const before=approvalIssues.length;
    for (const [stageIndex,stage] of plan.stages.entries()) {
      const missing=[!stage.title.trim()&&"제목",!stage.name.trim()&&"카테고리",!stage.brief.trim()&&"업무 내용",!stage.assigneeIds.length&&"담당자",!stage.reviewerIds.length&&"작업 승인자"].filter(Boolean);
      if (missing.length) approvalIssues.push({label:`${requestName} · ${stage.title.trim() || `${stageIndex+1}번 업무`}: ${missing.join("·")}를 입력해주세요.`,target});
    }
    if(before===approvalIssues.length&&!validStages(plan.stages))approvalIssues.push({label:`${requestName}: 업무 순서와 선행 업무 연결을 확인해주세요.`,target});
  }
  if (!selectedApprovers.length) approvalIssues.push({label:"회의 최종 승인자를 지정해주세요.",target:{requestId:null,field:"approvers"}});
  function focusAssignment(id:string) {
    const meeting=meetings.find(m=>m.id===id);
    if(!meeting || busy)return;
    edit(meeting);
    const plan=meeting.requests.find(p=>!validStages(p.stages)) || meeting.requests[0];
    setMeetingFocus({requestId:plan?.requestId ?? null,field:plan?"tasks":"requests"});
  }
  async function persistMeeting() {
    if (!title.trim() || !when || !Number.isFinite(new Date(when).getTime()) || !Number.isFinite(duration) || duration < 15 || duration > 480) throw Error("회의 제목·시작 일시·소요 시간(15~480분)을 확인해주세요.");
    const saved = await api<{meeting: Meeting}>(`${base}/meetings${editing === "new" ? "" : `/${editing}`}`, {
      title, scheduledAt: new Date(when).toISOString(), durationMinutes: duration, location, notes: content, notesDocument,
      decisionStatus: "draft", transferFromMeetingIds: transfers, finalApproverIds: selectedApprovers,
      requests: plans.map(p => ({...p, stages: p.stages?.length ? p.stages : undefined})),
    }, editing === "new" ? "POST" : "PATCH");
    if (!saved.meeting?.id) throw Error("회의 저장 결과를 확인하지 못했습니다. 목록을 확인해주세요.");
    setMeetings(current => [saved.meeting, ...current.filter(m => m.id !== saved.meeting.id)]);
    setSavedMeetingDraft(meetingDraft);
    setTransfers({});
    setEditing(saved.meeting.id);
    return saved;
  }
  async function saveDuringMeeting() {
    if (saveLock.current || meetingReadOnly) return;
    saveLock.current = true; setBusy(true); setError("");
    try { await persistMeeting(); } catch (cause) { setError(cause instanceof Error ? cause.message : "회의를 저장하지 못했습니다."); }
    finally { saveLock.current = false; setBusy(false); }
  }
  function closeEditor() {
    if (meetingDirty && !window.confirm("저장하지 않은 회의 변경사항이 있습니다. 저장하지 않고 목록으로 돌아갈까요?")) return;
    setMeetingMode(false); setEditing(null);
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    const decision =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "pending"
        ? "pending"
        : "draft";
    if (section === "meetings" && meetingMode && decision === "draft") { await saveDuringMeeting(); return; }
    if (saveLock.current || locked || (section === "meetings" && meetingReadOnly)) return;
    if (section === "meetings" && editing === "new" && decision === "pending") return;
    if (
      section === "meetings" &&
      decision === "pending" &&
      approvalIssues.length > 0
    ) {
      setError(approvalIssues[0].label);
      if(approvalIssues[0].target)setMeetingFocus({...approvalIssues[0].target});
      return;
    }
    saveLock.current = true;
    setBusy(true);
    setError("");
    try {
      const saved: {meeting?: Meeting} = section === "meetings" ? await persistMeeting() : await api(
        `${base}/${section}${editing === "new" ? "" : `/${editing}`}`,
        { title, category, content, url, changeSummary: summary || (editing === "new" ? "최초 작성" : ""), taskId: taskId || null },
        editing === "new" ? "POST" : "PATCH",
      );
      if (section === "meetings" && decision === "pending") {
        const meetingId = editing === "new" ? saved.meeting?.id : editing;
        if (!meetingId)
          throw Error(
            "회의를 저장했지만 승인 요청 ID를 확인하지 못했어요. 목록에서 회의를 다시 열어주세요.",
          );
        setEditing(meetingId);
        await workflowApi(`${base}/approvals`, {
          source: "meeting",
          meetingId,
          approverIds: selectedApprovers,
        });
        window.dispatchEvent(new Event("bridgain:approvals-changed"));
      }
      setEditing(null);
      setReload((v) => v + 1);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      saveLock.current = false;
      setBusy(false);
    }
  }
  const label =
    section === "meetings"
      ? "회의실"
      : section === "documents"
        ? "문서"
        : "활동 기록";
  const currentDocument = documents.find((d) => d.id === editing);
  function renderRequestConnector(
    index: number,
    mode: "empty" | "append" | "gap",
  ) {
    const key = `${mode}-${index}`;
    const active = requestPickerOpen && requestConnector === key;
    return (
      <div
        className={`pr-request-anchor pr-request-${mode === "empty" ? "empty-action" : mode}`}
        ref={active ? requestPickerRef : undefined}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeRequestPicker();
          }
        }}
      >
        <button
          type="button"
          aria-haspopup="dialog"
          aria-controls="meeting-request-picker"
          aria-expanded={active}
          aria-label={
            mode === "gap" ? `${index + 1}번째 위치에 요청 연결` : undefined
          }
          onClick={(event) => {
            requestTriggerRef.current = event.currentTarget;
            setRequestPopupPosition(null);
            setRequestQuery("");
            setRequestPickerMode("menu");
            setRequestInsertIndex(index);
            setRequestConnector(key);
            setRequestPickerOpen(!active);
          }}
        >
          <ControlIcon name="plus" />{mode !== "gap" && "요청 추가하기"}
        </button>
        {active && (
          <section
            className="pr-request-picker"
            popover="manual"
            ref={requestPopupRef}
            style={{
              position: "fixed",
              inset: "auto",
              margin: 0,
              right: "auto",
              transform: "none",
              ...requestPopupPosition,
              visibility: requestPopupPosition ? "visible" : "hidden",
            }}
            id="meeting-request-picker"
            role="dialog"
            aria-label="연결할 요청 선택"
          >
            <div className="pr-section-heading">
              <strong>{requestPickerMode === "menu" ? "요청 추가하기" : "기존 요청 연결"}</strong>
              <button type="button" onClick={closeRequestPicker}>
                닫기
              </button>
            </div>
            {requestPickerMode === "menu" ? <div className="mm-add-menu">
              <button type="button" onClick={() => setRequestPickerMode("existing")}>기존 요청 연결<small>프로젝트에 등록된 요청을 검색합니다.</small></button>
              <button type="button" disabled={!!permissions && !permissions.includes("requests.create")} onClick={() => { closeRequestPicker(); setNewRequestOpen(true); }}>새 요청 작성<small>회의 중 발견한 내용을 새 요청으로 남깁니다.</small></button>
            </div> : <><input
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              aria-label="요청 제목 검색"
              placeholder="요청 제목으로 검색…"
              value={requestQuery}
              onChange={(e) => setRequestQuery(e.target.value)}
            />
            <div className="pr-request-results">
              {requests
                .filter(
                  (r) =>
                    !r.taskId &&
                    !plans.some((p) => p.requestId === r.id) &&
                    r.title
                      .toLocaleLowerCase()
                      .includes(requestQuery.toLocaleLowerCase()),
                )
                .map((r) => (
                  <div className="pr-request-result" key={r.id}>
                    <div>
                      <span>
                        {r.origin === "development" ? "개발 요청" : "고객 요청"}
                      </span>
                      <strong>{r.title}</strong>
                      {r.meetingId && r.meetingId !== editing && (
                        <small>{r.meetingTitle || "다른 회의"}에 연결됨</small>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (r.meetingId && r.meetingId !== editing) {
                          if (
                            !window.confirm(
                              `이 요청은 '${r.meetingTitle || r.meetingId}' 회의에 연결되어 있습니다. 기존 회의에서 제외하고 이 회의로 이동할까요? 승인 대기 중인 회의에서는 먼저 승인을 취소해야 합니다.`,
                            )
                          )
                            return;
                          setTransfers((current) => ({
                            ...current,
                            [r.id]: r.meetingId!,
                          }));
                        }
                        setPlans((current) => [
                          ...current.slice(0, requestInsertIndex),
                          {
                            requestId: r.id,
                            planning: "",
                            uiNotes: "",
                            apiNotes: "",
                            dbNotes: "",
                            priority: r.priority || "normal",
                            assigneeIds: [],
                            stages: [],
                          },
                          ...current.slice(requestInsertIndex),
                        ]);
                        setRequestQuery("");
                        closeRequestPicker();
                      }}
                    >
                      ＋ 연결
                    </button>
                  </div>
                ))}
              {!requests.some(
                (r) =>
                  !r.taskId &&
                  !plans.some((p) => p.requestId === r.id) &&
                  r.title
                    .toLocaleLowerCase()
                    .includes(requestQuery.toLocaleLowerCase()),
              ) && <p>연결할 수 있는 요청이 없어요.</p>}
            </div></>}
          </section>
        )}
      </div>
    );
  }
  async function createMeetingRequest(draft: {title: string; description: string; priority: string; type: string}) {
    if (saveLock.current || meetingReadOnly) return;
    saveLock.current = true; setBusy(true); setError("");
    try {
      const result = await api<{request: Request}>(`${base}/requests`, draft);
      const request = result.request;
      setRequests(current => [...current, request]);
      setPlans(current => [...current.slice(0,requestInsertIndex), {requestId:request.id, planning:"", uiNotes:"",apiNotes:"",dbNotes:"",priority:draft.priority,assigneeIds:[],stages:[]}, ...current.slice(requestInsertIndex)]);
      setNewRequestOpen(false);
    } catch(cause) { setError(cause instanceof Error ? cause.message : "요청을 만들지 못했습니다."); }
    finally { saveLock.current = false; setBusy(false); }
  }
  return (
    <div className={editing && section === "meetings" ? "pr-meeting-tool" : section === "meetings" ? "pr-meetings-page" : "pr-page"}>
      {!(editing && section === "meetings") && <header className="pr-heading">
        <div>
          <span>PROJECT WORKSPACE</span>
          <h1>{label}</h1>
          <p>
            {section === "meetings"
              ? "함께 논의하고, 다음 할 일을 정리하세요."
              : section === "documents"
                ? "최신 설계와 업무별 변경 이력을 관리하세요."
                : "프로젝트의 최근 변경 내역이에요."}
          </p>
        </div>
        {section !== "activity" && !editing && canCreate && (
          <button
            className={section === "meetings" ? "ml-action ml-primary" : "pr-primary"}
            disabled={loading || busy}
            onClick={() => edit()}
          >
            {section === "meetings" ? <><ControlIcon name="plus" />회의 만들기</> : "＋ 새 문서"}
          </button>
        )}
      </header>}
      {section === "meetings" && !editing && onApprovals && approvalItems.some(a=>a.meetingId && a.status === "pending") && (
        <button className="ml-action ml-approval-link" onClick={onApprovals}>
          회의 최종 승인 대기{" "}
          {approvalItems.filter((a) => a.meetingId && a.status === "pending").length}건 →
        </button>
      )}
      {error && !(editing && section === "meetings") && (
        <p className="pr-error" role="alert">
          {error}{" "}
          {!editing && (
            <button onClick={() => setReload((v) => v + 1)}>다시 시도</button>
          )}
        </p>
      )}

      {editing ? (
        <>
          <form className={section === "meetings" ? "mm-form" : "pr-editor"} onSubmit={save}>
            {section !== "meetings" && <>
            <div className="pr-editor-heading"><h2>문서 작성</h2></div>
            <fieldset disabled={busy || (editing === "new" ? !canCreate : !canUpdate)}>
              <label>
                제목
                <input
                  required
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              {(
                <>
                  <div className="pr-form-grid">
                    <label>
                      분류
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        {Object.entries(categories).map(([v, t]) => (
                          <option key={v} value={v}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      참고 링크
                      <input
                        type="url"
                        value={url}
                        maxLength={2000}
                        onChange={(e) => setUrl(e.target.value)}
                      />
                    </label>
                    <label>
                      관련 개발 업무
                      <select
                        value={taskId}
                        onChange={(e) => setTaskId(e.target.value)}
                      >
                        <option value="">연결 없음</option>
                        {tasks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    변경 요약
                    <input
                      required={editing !== "new"}
                      maxLength={1000}
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      placeholder={
                        editing === "new"
                          ? "최초 작성"
                          : "이번 수정으로 바뀐 내용"
                      }
                    />
                  </label>
                </>
              )}
              {(
                <label>
                  문서 내용
                  <textarea
                    rows={10}
                    maxLength={50000}
                    required
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                </label>
              )}
            </fieldset>
            </>}
            {section === "meetings" && <MeetingMode
              presentation={meetingMode} isNew={editing === "new"} focusTarget={meetingFocus}
              newRequestOpen={newRequestOpen} onCancelRequest={() => setNewRequestOpen(false)} onCreateRequest={createMeetingRequest}
              header={<header className="mm-tool-header">
                <div className="mm-title-row">
                  <button type="button" className="mm-action mm-back" disabled={busy} onClick={closeEditor}><ControlIcon name="chevron" />회의 목록으로</button>
                  <h1 className="mm-page-title">{editing === "new" ? "회의 만들기" : status === "in_progress" ? "회의 진행" : status === "completed" || meetingReadOnly ? "회의 상세" : "회의 준비"}</h1>
                  <span className="mm-status">{status === "completed" ? "완료" : status === "in_progress" ? "진행 중" : "예정"}</span>
                  <span className="mm-save-status" role="status">{meetingReadOnly ? "읽기 전용" : busy ? "저장 중…" : meetingDirty ? "미저장" : "저장됨"}</span>
                  <button type="button" className="mm-action" disabled={busy} aria-pressed={meetingMode} onClick={() => {setRequestPickerOpen(false);setMeetingMode(v=>!v);}}>{meetingMode ? "작성 보기로 돌아가기" : "발표 보기"}</button>
                  {!meetingReadOnly && <button type="submit" value="draft" className={`mm-action ${editing === "new" ? "mm-primary" : ""}`} disabled={busy || newRequestOpen || !title.trim()}>{editing === "new" ? "회의 생성하기" : "회의 저장"}</button>}
                  {editing !== "new" && canUpdate && <button type="button" className={`mm-action ${status === "completed" ? "" : "mm-primary"}`} disabled={busy || newRequestOpen} onClick={() => void changeMeetingState(status === "completed" ? "reopen" : status === "in_progress" ? "complete" : "start")}>{status === "completed" ? "완료 취소" : status === "in_progress" ? "회의 완료" : "회의 시작"}</button>}
                </div>
                {(pendingApproval || finalized) && <p className="mm-notice">{pendingApproval ? "최종 승인 대기 중입니다. 수정하려면 승인함에서 승인 요청을 취소해주세요." : "최종 승인되어 업무가 생성된 회의입니다."}</p>}
              </header>}
              overviewInfo={<section className="mm-overview-info" aria-label="회의 기본 정보">
                <label className="mm-overview-title"><span>회의 제목</span>
                  <input className="mm-title-input" aria-label="회의 제목" placeholder="회의 제목을 입력하세요" required maxLength={160} value={title} disabled={busy || meetingReadOnly} onChange={e => setTitle(e.target.value)} />
                </label>
                <div className="mm-metadata">
                  <label>시작 일시<input aria-label="시작 일시" required type="datetime-local" value={when} disabled={busy || meetingReadOnly} onChange={e=>setWhen(e.target.value)} /></label>
                  <label>소요 시간<input aria-label="소요 시간 (분)" type="number" required min={15} max={480} value={duration} disabled={busy || meetingReadOnly} onChange={e=>setDuration(Number(e.target.value))} /><span>분</span></label>
                  <label className="mm-location">장소 / 링크<input aria-label="장소 / 회의 링크" placeholder="장소 또는 회의 링크" maxLength={1000} value={location} disabled={busy || meetingReadOnly} onChange={e=>setLocation(e.target.value)} /></label>
                  <div className="mm-final-approvers">{meetingApproval && locked ? <MeetingApprovalStatus status={meetingApproval.status} approvers={meetingApproval.approvers} /> : <><ApproverPicker label="회의 최종 승인자" disabled={busy || meetingReadOnly} items={approvers} value={selectedApprovers} onChange={setSelectedApprovers} /><div className="mm-tooltip" data-open={approverHelpOpen} onKeyDown={e=>{if(e.key === "Escape") setApproverHelpOpen(false);}}><button type="button" aria-label="회의 최종 승인자 역할 안내" aria-describedby="meeting-approver-help" onClick={()=>setApproverHelpOpen(v=>!v)}>ⓘ</button><span id="meeting-approver-help" role="tooltip">회의에서 정리한 업무의 생성을 승인하는 사람입니다. 회의 최종 승인 요청 후, 지정된 회의 최종 승인자 전원이 승인하면 실제 업무가 생성됩니다. 각 업무의 결과물을 검토하는 작업 승인자와는 별도 역할입니다.</span></div></>}</div>
                </div>
              </section>}
              footer={<footer className="mm-tool-footer"><span>{editing === "new" ? "회의 정보와 업무 초안을 저장합니다." : status === "in_progress" ? "목록으로 돌아가도 진행 중입니다. 회의 완료와 회의 최종 승인은 별개입니다." : "회의 최종 승인자 전원 승인 후 실제 업무가 생성됩니다."}</span><div>
                {onApprovals && pendingApproval && <button type="button" className="mm-action" onClick={onApprovals}>승인 현황 보기</button>}

                {editing !== "new" && !meetingReadOnly && <>
                  <div className="mm-approval-guidance" id="meeting-approval-requirements" aria-live="polite">
                    {approvalIssues.length ? <>{approvalIssues[0].target ? <button type="button" className="mm-approval-fix" disabled={busy} onClick={()=>{setNewRequestOpen(false);setMeetingFocus({...approvalIssues[0].target!});}}>{approvalIssues[0].label}</button> : <span>{approvalIssues[0].label}</span>}{approvalIssues.length>1&&<small>외 {approvalIssues.length-1}개 항목 확인 필요</small>}</> : <span>업무 배정 준비가 완료되었습니다. 승인을 요청하세요.</span>}
                  </div>
                  <button type="submit" className="mm-action mm-primary" value="pending" aria-describedby="meeting-approval-requirements" disabled={busy || newRequestOpen || !!approvalIssues.length}>회의 최종 승인 요청</button>
                </>}
              </div></footer>}
              lifecycleLabel={editing !== "new" && canUpdate ? (status === "completed" ? "완료 취소" : status === "in_progress" ? "회의 완료" : "회의 시작") : undefined}
              onLifecycle={() => void changeMeetingState(status === "completed" ? "reopen" : status === "in_progress" ? "complete" : "start")}
              projectId={projectId} title={title} when={when} location={location} notes={content} notesDocument={notesDocument}
              plans={plans} requests={requests} members={members.filter(m => m.accountType === "team")} reviewers={workApprovers}
              readOnly={meetingReadOnly} busy={busy} dirty={meetingDirty} error={error}
              renderConnector={renderRequestConnector}
              onRemove={id=>{
                const plan = plans.find(p=>p.requestId===id);
                if(plan?.stages?.length && !window.confirm("작성한 업무 초안도 함께 제거됩니다. 요청 연결을 해제할까요?")) return;
                setPlans(current=>current.filter(p=>p.requestId!==id));
                setTransfers(current=>{const next={...current};delete next[id];return next;});
              }} onTask={onTask}
              onMoveRequest={(id, targetId, after) => {
                if (busy || meetingReadOnly) return;
                setPlans(current => {
                  const moved = current.find(p => p.requestId === id);
                  if (!moved || id === targetId || !current.some(p => p.requestId === targetId)) return current;
                  const next = current.filter(p => p.requestId !== id);
                  const target = next.findIndex(p => p.requestId === targetId);
                  next.splice(target + (after ? 1 : 0), 0, moved);
                  return next;
                });
              }}
              onNotes={(text, document) => { setContent(text); setNotesDocument(document); }} onPlan={patchPlan} onSave={() => void saveDuringMeeting()}
              onExit={() => {setRequestPickerOpen(false);setMeetingMode(false);}} />}
            {section !== "meetings" && <footer><button type="button" disabled={busy} onClick={closeEditor}>취소</button><button type="submit" className="pr-primary" disabled={busy || !title.trim() || (editing === "new" ? !canCreate : !canUpdate)}>저장하기</button></footer>}
          </form>
          {locked && (
            <section className="pr-editor">
              <h3>최종안에서 생성된 업무</h3>
              {plans
                .filter((p) => p.taskId)
                .map((p) => (
                  <p key={p.requestId}>
                    <button type="button" onClick={() => onTask?.(p.taskId!)}>
                      {requests.find((r) => r.id === p.requestId)?.title ||
                        "개발 업무"}{" "}
                      열기 →
                    </button>
                  </p>
                ))}
            </section>
          )}
          {currentDocument && (
            <section className="pr-editor">
              <h2>문서 변경 이력</h2>
              {currentDocument.versions.map((v, i) => (
                <details id={v.id} key={v.id} open>
                  <summary>
                    {currentDocument.versions.length - i}번째 기록 ·{" "}
                    {v.changeSummary} · {v.actorName} ·{" "}
                    {new Date(v.createdAt).toLocaleString("ko-KR")}
                  </summary>
                  <h3>{v.title}</h3>
                  <p>{categories[v.category]}</p>
                  {v.taskId && (
                    <button type="button" onClick={() => onTask?.(v.taskId!)}>
                      관련 업무:{" "}
                      {tasks.find((t) => t.id === v.taskId)?.title || v.taskId}
                    </button>
                  )}
                  {v.url && /^https?:\/\//i.test(v.url) && (
                    <a href={v.url} target="_blank" rel="noreferrer">
                      참고 링크
                    </a>
                  )}
                  <pre style={{ whiteSpace: "pre-wrap" }}>{v.content}</pre>
                </details>
              ))}
              {!currentDocument.versions.length && (
                <p>다음 수정부터 이전 버전도 함께 보관합니다.</p>
              )}
            </section>
          )}
        </>
      ) : loading ? (
        <p role="status">불러오는 중…</p>
      ) : (
        (!error || section === "meetings") && (
          <>
            {section === "activity" ? (
              <div className="pr-activity-feed" aria-label="프로젝트 활동 기록">
                <div className="pr-activity-summary">
                  <div><strong>프로젝트의 흐름을 한눈에</strong><p>새로 접수된 요청과 주요 변경 사항을 확인하세요.</p></div>
                  <span>최근 기록 {events.length}개</span>
                </div>
                <ol className="pr-activity-list">
                  {events.map((e) => {
                    const customerRequest = e.kind === "request_created" && e.origin === "customer";
                    const labels: Record<string, string> = {
                      request_created: "새 요청 접수", request_status: "요청 상태 변경",
                      request_assignment: "요청 담당자 변경", request_comment: "요청 댓글",
                      request_attachment: "요청 첨부파일", request_transferred: "요청 회의 이동",
                      task_created: "업무 생성", task_updated: "업무 수정", task_result_added: "작업 결과 등록",
                      meeting_created: "회의 생성", meeting_updated: "회의 수정", meeting_completed: "회의 완료",
                      document_created: "문서 생성", document_updated: "문서 수정",
                    };
                    const label = customerRequest ? "고객 요청 접수" : labels[e.kind] || "프로젝트 활동";
                    return (
                      <li key={`${e.kind}-${e.id}`} className={`pr-activity-item${customerRequest ? " is-customer-request" : ""}`}>
                        <span className="pr-activity-marker" aria-hidden="true">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h14v16H5zM9 8h6M9 12h6M9 16h3" /></svg>
                        </span>
                        <article className="pr-activity-card">
                          <div className="pr-activity-card-top"><span className="pr-activity-badge">{label}</span><time dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>
                          <h2>{e.title || e.body}</h2>
                          {e.title && e.body !== e.title && <p className="pr-activity-description">{e.body}</p>}
                          <div className="pr-activity-person"><span aria-hidden="true">{e.actorName.slice(0, 1)}</span><strong>{e.actorName}</strong><span>{customerRequest ? "고객 · 요청 등록" : "활동 기록"}</span></div>
                        </article>
                      </li>
                    );
                  })}
                </ol>
                {!events.length && <div className="pr-activity-empty"><strong>프로젝트의 첫 소식을 기다리고 있어요</strong><p>고객 요청이 접수되면 이곳에서 확인할 수 있어요.</p></div>}
              </div>
            ) : (
              <>
                {section !== "meetings" && <div className="pr-toolbar">
                  <input
                    aria-label={`${label} 검색`}
                    placeholder="제목 검색"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <select
                    aria-label="분류 필터"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="">전체</option>
                    {section === "documents" ? (
                      Object.entries(categories).map(([v, t]) => (
                        <option key={v} value={v}>
                          {t}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="scheduled">예정</option><option value="in_progress">진행 중</option>
                        <option value="completed">회의 완료</option>
                      </>
                    )}
                  </select>
                </div>}
                {section === "meetings" ? (
                  <MeetingList key={projectId} meetings={meetings} busy={busy} canUpdate={canUpdate}
                    pendingIds={approvalItems.filter(a=>a.status==="pending"&&a.meetingId).map(a=>a.meetingId!)}
                    onOpen={(id,present)=>{const meeting=meetings.find(m=>m.id===id);if(meeting)edit(meeting,present);}}
                    onAssign={focusAssignment} onDelete={id=>void deleteListedMeeting(id)} onStart={id=>void startListedMeeting(id)} onReschedule={rescheduleMeeting} />
                ) : (
                  <div className="pr-documents">
                    {documents
                      .filter(
                        (d) =>
                          d.title.toLowerCase().includes(query.toLowerCase()) &&
                          (!filter || d.category === filter),
                      )
                      .map((d) => (
                        <article className="pr-document" key={d.id}>
                          <div>
                            <button
                              className="pr-document-title"
                              onClick={() => edit(d)}
                            >
                              {d.title}
                            </button>
                            <p>
                              {categories[d.category]} · {d.creatorName} · 이력{" "}
                              {d.versions.length}개
                            </p>
                          </div>
                          {d.url && /^https?:\/\//i.test(d.url) && (
                            <a href={d.url} target="_blank" rel="noreferrer">
                              참고 링크 ↗
                            </a>
                          )}
                        </article>
                      ))}
                  </div>
                )}
              </>
            )}
          </>
        )
      )}
    </div>
  );
}
