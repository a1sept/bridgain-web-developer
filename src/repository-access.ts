import { workflowApi } from "./Approvals";
import type { RepositoryAccessResult } from "./desktop";

/** Only repository permission ambiguity is routed; auth/network/local errors stay local. */
export async function requestForRepositoryFailure(
  projectId: string,
  result: RepositoryAccessResult,
): Promise<string> {
  if (
    result.ok ||
    !["permission", "not_found_or_no_access"].includes(result.code)
  )
    return result.message;
  const ambiguous = result.code === "not_found_or_no_access";
  const reason = ambiguous
    ? "저장소를 찾을 수 없거나 접근할 수 없어 주소와 접근 권한 확인을 요청합니다."
    : "저장소 접근이 거부되어 접근 권한 확인을 요청합니다.";
  try {
    const response = await workflowApi<{ duplicate: boolean }>(
      `/projects/${projectId}/repository-access/requests`,
      {
        repositoryUrl: result.repositoryUrl,
        note: reason,
      },
    );
    return `${result.message} ${response.duplicate ? "이미 진행 중인 접근 확인 요청이 있습니다." : "등록자 또는 프로젝트 관리자에게 접근 확인 요청을 기록했습니다."} GitHub 초대를 받으면 수락 후 다시 시도해주세요.`;
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "서버 상태를 확인해주세요.";
    return `${result.message} 접근 확인 요청은 전송하지 못했어요. ${detail}`;
  }
}
