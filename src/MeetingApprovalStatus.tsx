import { useId } from "react";
import "./meeting-approval-status.css";

type Reviewer = { userId: string; displayName: string; status: string; note?: string };
const labels: Record<string, string> = { pending: "승인 대기", approved: "승인 완료", rejected: "반려", cancelled: "요청 취소" };
export default function MeetingApprovalStatus({ status, approvers }: { status: string; approvers: Reviewer[] }) {
  const helpId = useId();
  return <div className="meeting-approval-status" aria-label="최종 승인 현황">
    <span>최종 승인자</span>
    <span className="meeting-approval-help"><button type="button" aria-label="최종 승인자 역할 안내" aria-describedby={helpId}>ⓘ</button><span role="tooltip" id={helpId}>지정된 최종 승인자 전원이 승인하면 실제 업무가 생성됩니다. 업무 결과를 검토하는 작업 승인자와는 별도 역할입니다.</span></span>
    {approvers.map(person => <span className="meeting-approval-person" key={person.userId}>
      <span>{person.displayName}</span><span className={`meeting-approval-badge ${person.status}`}>{labels[person.status] || person.status}</span>
      {person.note && <span className="meeting-approval-note">{person.note}</span>}
    </span>)}
    {!approvers.length && <span>승인자 정보 없음</span>}
    <span className={`meeting-approval-badge meeting-approval-total ${status}`} role="status">업무 생성 {labels[status] || status}</span>
  </div>;
}
