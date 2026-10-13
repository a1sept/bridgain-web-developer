const object = (properties, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
export const tools = [
  {
    name: "list_project_files",
    description: "개발자가 선택한 로컬 프로젝트의 코드·문서 파일 목록",
    inputSchema: object({}),
  },
  {
    name: "read_project_file",
    description: "선택한 로컬 프로젝트의 상대 경로 텍스트 파일 조회",
    inputSchema: object({ path: { type: "string" } }, ["path"]),
  },
  {
    name: "search_project_code",
    description: "선택한 로컬 프로젝트의 코드에서 문자열 검색",
    inputSchema: object({ query: { type: "string" } }, ["query"]),
  },
  {
    name: "get_requests",
    description: "현재 프로젝트 고객 요청 조회",
    inputSchema: object({}),
  },
  {
    name: "get_request",
    description: "현재 프로젝트의 요청 상세 조회",
    inputSchema: object({ requestId: { type: "string" } }, ["requestId"]),
  },
  {
    name: "get_tasks",
    description: "현재 프로젝트 개발 업무 조회",
    inputSchema: object({}),
  },
  {
    name: "get_documents",
    description: "현재 프로젝트 최신 설계 문서 조회",
    inputSchema: object({}),
  },
  {
    name: "save_draft",
    description:
      "조사 메모나 업무/회의/개발 결과/문서 변경 초안 저장. 실제 업무 반영은 개발자가 별도로 확인한다. task payload: title,description,priority,requestIds; meeting: title,notes,scheduledAt(시간대 포함 ISO),durationMinutes,requests; result: taskId,expectedVersion(get_tasks의 version 필수),changeSummary,resultSummary,dbChanges,apiChanges,frontendChanges,verification; document: documentId(기존 수정 시),title,category,content,url,changeSummary,taskId; note: content. 완료된 업무의 result 초안은 기존 내용을 수정하지 않고 후속 기록으로 추가된다. 상태 변경·담당자 지정은 허용되지 않는다.",
    inputSchema: object(
      {
        kind: {
          type: "string",
          enum: ["note", "task", "meeting", "result", "document"],
        },
        title: { type: "string" },
        payload: { type: "object", additionalProperties: true },
      },
      ["kind", "title", "payload"],
    ),
  },
];
export function toolResult(data, error = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    isError: error,
  };
}
