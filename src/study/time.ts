/** Study schedules are displayed and entered in Asia/Seoul, stored as UTC instants. */
export function studyTimeInput(value: string) {
  return new Date(+new Date(value) + 9 * 3600000).toISOString().slice(0, 16);
}
export function parseStudyTimeInput(value: string) {
  return new Date(`${value}+09:00`);
}
