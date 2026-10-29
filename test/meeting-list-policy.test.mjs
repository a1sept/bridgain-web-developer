import {test} from 'node:test';
import assert from 'node:assert/strict';
import {meetingGroup,meetingDateHint,toLocalDateTime} from '../src/meeting-list-policy.ts';
process.env.TZ='Asia/Seoul';
const now=new Date('2026-10-29T16:30:00+09:00');
const meeting=(scheduledAt,status='scheduled')=>({scheduledAt,status});
test('today and overdue are date hints, never automatic lifecycle transitions',()=>{
 assert.equal(meetingGroup(meeting('2026-10-29T09:00:00+09:00'),now),'today');
 assert.equal(meetingGroup(meeting('2026-10-28T23:59:00+09:00'),now),'overdue');
 assert.equal(meetingDateHint(meeting('2026-10-29T17:00:00+09:00'),now),'오늘');
 assert.equal(meetingDateHint(meeting('2026-10-30T00:00:00+09:00'),now),'내일');
 assert.equal(meetingGroup(meeting('2026-10-28T10:00:00+09:00','in_progress'),now),'running');
 assert.equal(meetingGroup(meeting('2026-10-29T10:00:00+09:00','completed'),now),'completed');
 assert.equal(meetingDateHint(meeting('2026-10-28T10:00:00+09:00','completed'),now),'');
});
test('local midnight and month boundary use local calendar days',()=>{
 const midnight=new Date('2026-11-01T00:00:00+09:00');
 assert.equal(meetingGroup(meeting('2026-10-31T23:59:00+09:00'),midnight),'overdue');
 assert.equal(meetingDateHint(meeting('2026-11-02T00:00:00+09:00'),midnight),'내일');
 assert.equal(toLocalDateTime('2026-10-29T08:30:00Z'),'2026-10-29T17:30');
});
