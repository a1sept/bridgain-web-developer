export const projects = [
  { id: "shop", name: "모아 쇼핑몰 리뉴얼" },
  { id: "brand", name: "브랜드 소개 페이지" },
];
export const requests = [
  { id: "login", projectId: "shop", title: "카카오 로그인 기능 추가" },
  { id: "orders", projectId: "shop", title: "모바일 주문 내역 개선" },
  { id: "video", projectId: "brand", title: "메인 페이지 브랜드 영상 추가" },
];
export const tasks = [
  { id: "login-ui", requestId: "login", area: "frontend", assigneeId: "self", assignee: "이민수" },
  { id: "login-api", requestId: "login", area: "backend", assigneeId: "yujin", assignee: "최유진" },
  { id: "orders-ui", requestId: "orders", area: "design", assigneeId: "soyoung", assignee: "박소영" },
  { id: "video-ui", requestId: "video", area: "frontend", assigneeId: "self", assignee: "이민수" },
];
export type PreviewUser = { id: string; displayName: string };
const previewMembers = [
  { id: "self", displayName: "", projectIds: ["shop", "brand"] },
  { id: "yujin", displayName: "최유진", projectIds: ["shop"] },
  { id: "soyoung", displayName: "박소영", projectIds: ["shop", "brand"] },
  { id: "hyun", displayName: "이현", projectIds: ["shop"] },
  { id: "jiwoo", displayName: "김지우", projectIds: ["shop"] },
  { id: "haein", displayName: "윤해인", projectIds: ["brand"] },
];
export function historyMembers(projectIds: string[], currentUser: PreviewUser) {
  return previewMembers.filter(member => !projectIds.length || member.projectIds.some(id => projectIds.includes(id)))
    .map(member => member.id === "self" ? { ...member, id: currentUser.id, displayName: currentUser.displayName } : { ...member, id: `preview:${member.id}` })
    .sort((a, b) => Number(b.id === currentUser.id) - Number(a.id === currentUser.id) || a.displayName.localeCompare(b.displayName, "ko"));
}
export const eventNames = {
  request_created: "고객 요청 접수", meeting_created: "회의 작성",
  request_linked: "요청 연결", meeting_started: "회의 시작",
  meeting_completed: "회의 마무리", task_assigned: "업무 배정",
};
export type HistoryEvent = {
  id: string; projectId: string; requestIds: string[]; taskId?: string;
  kind: keyof typeof eventNames; title: string; body: string; actor: string; at: string;
};
export type HistoryFilter = { project: string[]; request: string; account: string };
export function filterHistory(events: HistoryEvent[], filter: HistoryFilter, currentUser: PreviewUser) {
  const matchingTasks = tasks.filter(t => filter.account === "all" || (t.assigneeId === "self" ? currentUser.id : `preview:${t.assigneeId}`) === filter.account);
  const requestIds = new Set(matchingTasks.map(t => t.requestId));
  const taskIds = new Set(matchingTasks.map(t => t.id));
  return events.filter(e =>
    (!filter.project.length || filter.project.includes(e.projectId)) &&
    (filter.request === "all" || e.requestIds.includes(filter.request)) &&
    (filter.account === "all" || (e.taskId ? taskIds.has(e.taskId) : e.requestIds.some(id => requestIds.has(id))))
  ).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime() || b.id.localeCompare(a.id));
}
const event = (id: string, projectId: string, requestIds: string[], kind: HistoryEvent["kind"], title: string, body: string, actor: string, time: string, taskId?: string): HistoryEvent =>
  ({ id, projectId, requestIds, kind, title, body, actor, at: `2026-10-26T${time}:00+09:00`, taskId });
export const seedEvents: HistoryEvent[] = [
  event("01", "shop", ["login"], "request_created", "카카오 로그인 기능을 추가해주세요", "회원가입 과정을 줄여 고객이 편하게 로그인할 수 있으면 좋겠어요.", "김지우", "09:00"),
  event("02", "shop", ["orders"], "request_created", "모바일 주문 내역을 개선해주세요", "주문 상태와 배송 정보를 한눈에 보고 싶어요.", "김지우", "09:10"),
  event("03", "shop", ["login", "orders"], "meeting_created", "쇼핑몰 고객 요청 검토 회의", "고객 요청의 구현 범위와 담당 업무를 정하기 위한 회의를 작성했어요.", "이현", "09:30"),
  event("04", "shop", ["login", "orders"], "request_linked", "고객 요청을 회의에 연결했어요", "쇼핑몰 고객 요청 검토 회의에 논의할 요청을 연결했어요.", "이현", "09:35"),
  event("05", "brand", ["video"], "request_created", "메인 페이지에 브랜드 영상을 넣어주세요", "브랜드 이야기를 영상으로 전달하고 싶어요.", "윤해인", "10:00"),
  event("06", "shop", ["login", "orders"], "meeting_started", "쇼핑몰 고객 요청 검토 회의", "참여자들과 요구사항과 구현 방향 논의를 시작했어요.", "이현", "10:30"),
  event("07", "shop", ["login", "orders"], "meeting_completed", "쇼핑몰 고객 요청 검토 회의", "로그인 연동과 주문 내역 개선 방향을 정하고 회의록을 정리했어요.", "이현", "11:20"),
  event("08", "shop", ["login"], "task_assigned", "카카오 로그인 화면 구현", "이민수님에게 프론트엔드 업무를 배정했어요.", "이현", "11:30", "login-ui"),
  event("09", "shop", ["login"], "task_assigned", "카카오 인증 API 연동", "최유진님에게 백엔드 업무를 배정했어요.", "이현", "11:31", "login-api"),
  event("10", "shop", ["orders"], "task_assigned", "주문 내역 화면 디자인", "박소영님에게 디자인 업무를 배정했어요.", "이현", "11:32", "orders-ui"),
  event("11", "brand", ["video"], "meeting_created", "브랜드 영상 적용 회의", "영상 배치와 모바일 재생 방식을 논의할 회의를 작성했어요.", "박소영", "13:00"),
  event("12", "brand", ["video"], "request_linked", "브랜드 영상 요청을 회의에 연결했어요", "브랜드 영상 적용 회의의 안건으로 등록했어요.", "박소영", "13:05"),
  event("13", "brand", ["video"], "meeting_started", "브랜드 영상 적용 회의", "영상 영역과 재생 방식을 함께 검토해요.", "박소영", "14:00"),
  event("14", "brand", ["video"], "meeting_completed", "브랜드 영상 적용 회의", "메인 상단 영상 영역과 수동 재생 방식으로 결정했어요.", "박소영", "14:40"),
  event("15", "brand", ["video"], "task_assigned", "브랜드 영상 영역 구현", "이민수님에게 프론트엔드 업무를 배정했어요.", "박소영", "14:50", "video-ui"),
];
