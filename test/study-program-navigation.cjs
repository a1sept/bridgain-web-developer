// Real React UI with isolated HTTP fixtures; no production writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.STUDY_PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.STUDY_UI_ORIGIN || 'http://127.0.0.1:15174';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.STUDY_CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    if (process.env.STUDY_KOREAN_FONT) {
      const font = fs.readFileSync(process.env.STUDY_KOREAN_FONT).toString('base64');
      await page.addInitScript(font => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style');
          style.textContent = `@font-face{font-family:StudyTest;src:url(data:font/ttf;base64,${font})}body,body *{font-family:StudyTest,sans-serif!important}`;
          document.head.append(style);
        });
      }, font);
    }
    const errors = [], writes = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => d.accept());
    const pid = '11111111-1111-4111-8111-111111111111', uid = '22222222-2222-4222-8222-222222222222';
    const at = hours => new Date(Date.now() + hours * 3600000).toISOString();
    const permissions = ['programs.manage', 'sessions.manage', 'activities.manage'].map(p => `study.${p}`);
    const program = { id: 'program', title: '파이썬 책 읽기', description: '매주 한 장씩 함께 읽어요.', status: 'active', archivedAt: null, membershipMode: 'all', memberIds: [uid, 'jiwoo'], organizers: [{ userId: uid, role: 'host' }, { userId: 'jiwoo', role: 'deputy' }] };
    const upcoming = { id: 'future', programId: 'program', title: '다음 모임', startsAt: at(24), endsAt: at(25), location: '모임방', status: 'scheduled' };
    const activity = { id: 'activity', programId: 'program', sessionId: null, title: '독서 기록', instructions: '', dueAt: at(48), latePolicy: 'allow' };
    const data = { permissions, isOwner: true, programs: [program], sessions: [upcoming], activities: [activity], members: [{ userId: uid, displayName: '민수', roleIds: [] }, { userId: 'jiwoo', displayName: '지우', roleIds: [] }], roles: [], pagination: { sessions: null, activities: null } };
    let failNext = false;
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url()), method = route.request().method();
      let body = {}, status = 200;
      if (url.pathname === '/api/auth/me') body = { user: { id: uid, displayName: '민수', email: 'test@example.invalid', accountType: 'team' } };
      else if (url.pathname.endsWith('/csrf')) body = { csrfToken: 'test' };
      else if (url.pathname === '/api/workspace') body = { userId: uid, teams: [], projects: [{ id: pid, teamId: pid, kind: 'study', name: '함께 읽는 파이썬', description: '함께 배우는 모임', permissions: data.permissions, members: [], canManage: true }], invitations: [] };
      else if (url.pathname.endsWith('/study')) {
        if (url.searchParams.has('sessionCursor')) { data.sessions = [upcoming]; data.pagination.sessions = null; }
        body = data;
      } else if (url.pathname.endsWith('/decks')) { if (method === 'POST') { writes.push({ path: url.pathname, values: route.request().postDataJSON() }); status = 500; body = { message: '자료 저장 실패 예시' }; } else body = { decks: [{id:'other', title:'다른 회차 자료',sessionId:'other'}], canManage: data.permissions.includes('study.programs.manage') }; }
      else if (method === 'POST' && url.pathname.endsWith('/activities')) {
        const values = route.request().postDataJSON(); writes.push({path:url.pathname,values});
        body = {id:'created-activity',programId:'program',...values}; data.activities.push(body);
      }
      else if (url.pathname.endsWith('/activities/activity')) body = { activity, archived: false, canRead: true, targets: data.members, versions: [] };
      else if (method === 'PATCH') {
        const values = route.request().postDataJSON(); writes.push({ path: url.pathname, values });
        if (failNext) { failNext = false; status = 500; body = { message: '저장 실패 테스트' }; }
        else {
          if (values.title) program.title = values.title;
          if (values.hostIds) program.organizers = [...program.organizers.filter(o => o.role !== 'host' && !values.hostIds.includes(o.userId)), ...values.hostIds.map(userId => ({ userId, role: 'host' }))];
          if (values.deputyIds) program.organizers = [...program.organizers.filter(o => o.role !== 'deputy'), ...values.deputyIds.filter(id => !program.organizers.some(o => o.role === 'host' && o.userId === id)).map(userId => ({ userId, role: 'deputy' }))];
          if (values.action === 'archive') program.archivedAt = at(0);
          if (values.action === 'restore') program.archivedAt = null;
          body = program;
        }
      } else body = { approvals: [], pendingCount: 0, requests: [], tasks: [] };
      await route.fulfill({ status, json: body });
    });
    await page.addInitScript(({ pid }) => history.replaceState({ developerView: 'projects', projectId: pid, projectSection: 'overview' }, '', location.href), { pid });
    const button = name => page.getByRole('button', { name, exact: true });
    const nav = name => page.locator('.ds-project-tabs').getByRole('button', { name, exact: true });
    await page.goto(origin);
    await page.getByRole('heading', { name: '다가오는 모임' }).waitFor();
    await page.getByRole('heading', { name: '마감 예정 활동' }).waitFor();
    assert.equal(await page.getByLabel('프로그램 검색', { exact: true }).count(), 0);
    await page.getByRole('button', { name: /다음 모임 파이썬/ }).click();
    await button('프로그램 설정').waitFor();
    assert.equal(await nav('프로그램').getAttribute('aria-current'), 'page');
    assert.equal(await button('프로그램 운영진').count(), 0);
    await button('프로그램 설정').click();
    await button('기본 정보').waitFor();
    assert.equal(await button('주최자 선택').count(), 0);
    await page.getByRole('textbox', { name: '이름', exact: true }).fill('새 프로그램 이름');
    await button('변경사항 저장').click();
    await button('프로그램 설정').waitFor();
    assert.equal(writes.at(-1).values.title, '새 프로그램 이름');
    assert.equal('hostIds' in writes.at(-1).values, false, 'Basic info must not overwrite organizer roles');
    fs.mkdirSync('/tmp/study-program-review', { recursive: true });
    await page.screenshot({ path: '/tmp/study-program-review/detail.png', fullPage: true });
    await button('프로그램 설정').click(); await button('운영진').click();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `settings overflow at ${width}`);
      await page.screenshot({ path: `/tmp/study-program-review/settings-${width}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await button('주최자 저장').click(); await page.getByText('주최자를 저장했어요.', { exact: true }).waitFor();
    assert.deepEqual(writes.at(-1).values, { hostIds: [uid] });
    failNext = true;
    await button('부관리자 저장').click(); await page.getByRole('alert').filter({ hasText: '저장 실패 테스트' }).waitFor();
    assert.equal(await page.getByRole('heading', { name: '프로그램 부관리자' }).count(), 1);
    await button('부관리자 저장').click(); await page.getByText('프로그램 부관리자를 저장했어요.', { exact: true }).waitFor();
    assert.deepEqual(writes.at(-1).values, { deputyIds: ['jiwoo'] });
    await button('새 프로그램 이름로').click();
    const more = page.getByLabel('프로그램 더보기', { exact: true });
    await more.click(); await button('프로그램 보관').waitFor();
    await more.press('Escape'); assert.equal(await page.locator('.study-program-more').getAttribute('open'), null);
    await more.click(); await page.getByRole('heading', { name: '새 프로그램 이름', exact: true }).click();
    assert.equal(await page.locator('.study-program-more').getAttribute('open'), null);
    await more.click(); await button('프로그램 보관').click();
    await page.getByText('보관됨 · 2명 참여', { exact: true }).waitFor();
    assert.equal(await button('프로그램 설정').count(), 0);
    await more.click(); await button('프로그램 복원').click(); await button('프로그램 설정').waitFor();
    await button('← 프로그램 목록').click();
    await page.getByLabel('프로그램 검색', { exact: true }).fill('없는검색어');
    await page.getByText('조건에 맞는 프로그램이 없어요.').waitFor();
    await button('검색·필터 초기화').click(); await page.getByRole('button', { name: /새 프로그램 이름/ }).waitFor();
    // A host without the project-wide manage permission may edit deputies only.
    data.permissions = []; data.isOwner = false; await page.reload();
    await button('전체 프로그램 보기').click(); await page.getByRole('button', { name: /새 프로그램 이름/ }).click();
    await button('프로그램 설정').click();
    assert.equal(await button('기본 정보').count(), 0); assert.equal(await button('주최자 저장').count(), 0);
    await button('부관리자 저장').click(); await page.getByText('프로그램 부관리자를 저장했어요.', { exact: true }).waitFor();
    // A regular member must not receive management controls.
    program.organizers = [{ userId: 'jiwoo', role: 'host' }]; await page.reload();
    await button('전체 프로그램 보기').click(); await page.getByRole('button', { name: /새 프로그램 이름/ }).click();
    assert.equal(await button('프로그램 설정').count(), 0); assert.equal(await more.count(), 0);
    await button('다음 모임').click(); await page.getByRole('region', {name:'이번 회차 발표 자료'}).waitFor();
    assert.equal(await button('발표 자료 만들기').count(), 0);
    assert.equal(await button('활동 만들기').count(), 0);
    await button('회차 목록').click();
    // A paginated snapshot must not falsely claim there are no upcoming meetings.
    data.sessions = []; data.pagination.sessions = 'older'; await page.reload();
    await page.getByText('이전 회차 이후의 일정을 더 불러와 확인하세요.').waitFor();
    await button('다음 회차 더 보기').click(); await page.getByRole('button', { name: /다음 모임 새 프로그램/ }).waitFor();
    const output = process.env.STUDY_SCREENSHOT_DIR || '/tmp/study-program-review'; fs.mkdirSync(output, { recursive: true });
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${width}`);
      await page.screenshot({ path: `${output}/overview-${width}.png`, fullPage: true });
    }
    // Inspect all program task surfaces at desktop and narrow phone sizes.
    data.permissions = permissions; data.isOwner = true; await page.reload();
    await button('전체 프로그램 보기').click();
    async function capture(name) {
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} overflow at ${width}`);
        await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await capture('catalog');
    // Card totals and upcoming meeting come from complete choices, not a paged slice.
    data.sessions = [];
    data.pagination.sessions = 'older';
    data.sessionOptions = [upcoming, { ...upcoming, id: 'past', title: '지난 회차', status: 'ended', startsAt: at(-48), endsAt: at(-47) }];
    await page.reload(); await button('전체 프로그램 보기').click();
    const card = page.locator('.study-program-card');
    await card.getByText('등록 2회 · 종료 1회', { exact: true }).waitFor();
    await card.getByText('다음 모임', { exact: true }).last().waitFor();
    assert.equal(await page.locator('.study-program-grid').count(), 1);
    data.sessions = [upcoming]; data.pagination.sessions = null;
    delete data.sessionOptions;
    await page.reload(); await button('전체 프로그램 보기').click();
    await button('프로그램 만들기').click(); await capture('create-program'); await button('취소').click();
    await page.getByRole('button', { name: /새 프로그램 이름/ }).click();
    await capture('program');
    await page.locator('.study-session-title').getByText('다음 모임', { exact: true }).click();
    await page.getByRole('region', { name: '이번 회차 발표 자료' }).waitFor();
    assert.equal(await button('다른 회차 자료').count(), 0);
    await capture('session-detail');
    await button('발표 자료 만들기').click(); await page.getByText('자료 저장 실패 예시').waitFor();
    assert.equal(writes.at(-1).values.sessionId, 'future');
    await button('활동 만들기').click();
    assert.equal(await page.locator('select[name="sessionId"]').inputValue(), 'future');
    await page.locator('input[name="title"]').fill('회차 연결 실습');
    await page.locator('input[name="dueAt"]').fill('2027-01-10T18:00');
    await capture('session-activity-form');
    await button('활동 등록').click(); await button('회차 연결 실습').waitFor();
    assert.equal(writes.at(-1).values.sessionId, 'future');
    assert.equal(writes.at(-1).values.dueAt, '2027-01-10T09:00:59.999Z');
    assert.equal(writes.at(-1).values.latePolicy, 'allow');
    await button('회차 목록').click();

    await button('회차 추가').click(); await capture('create-session');
    await page.locator('form').getByRole('button', { name: '돌아가기', exact: true }).click();
    await button('프로그램 설정').click(); await capture('basic-settings'); await button('취소').click();
    await button('발표 자료').click(); await button('다른 회차 자료').waitFor(); await capture('materials-empty');
    await page.locator('.study-program-tabs').getByRole('button', { name: '참여 활동', exact: true }).click();
    await capture('activities');
    await button('활동 만들기').click(); await capture('create-activity'); await button('← 활동 목록').click();
    await button('독서 기록').click(); await page.getByRole('heading', { name: '내 제출', exact: true }).waitFor(); await capture('activity-detail');
    assert.deepEqual(errors, []);
    console.log('PASS overview/navigation, basic-vs-organizer payloads, host/member permissions, save retry, more menu, archive/restore, filtered empty, pagination, responsive layouts');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
