export type MeetingTiming = { status: string; scheduledAt: string };
export type MeetingGroup = 'running' | 'today' | 'overdue' | 'upcoming' | 'completed';
export function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function meetingGroup(meeting: MeetingTiming, now: Date): MeetingGroup {
  if (meeting.status === 'in_progress') return 'running';
  if (meeting.status === 'completed') return 'completed';
  const day = localDay(new Date(meeting.scheduledAt));
  return day === localDay(now) ? 'today' : day < localDay(now) ? 'overdue' : 'upcoming';
}
export function meetingDateHint(meeting: MeetingTiming, now: Date) {
  if (meeting.status === 'completed') return '';
  const scheduled = new Date(meeting.scheduledAt);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate()+1);
  if (localDay(scheduled) === localDay(now)) return '오늘';
  if (meeting.status === 'scheduled' && scheduled < now) return '일정 지남';
  return localDay(scheduled) === localDay(tomorrow) ? '내일' : '';
}
export function toLocalDateTime(value: string) {
  const d = new Date(value);
  return `${localDay(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
