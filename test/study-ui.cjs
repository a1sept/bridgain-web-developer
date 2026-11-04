// Browser integration against mocked HTTP responses. Run the real Vite UI first; see docs/planning/study-mode.md.
const Y = require("../node_modules/yjs");
const { chromium } = require(
  process.env.STUDY_PLAYWRIGHT_MODULE || "playwright",
);
(async () => {
  const font = process.env.STUDY_TEST_FONT
    ? require("node:fs")
        .readFileSync(process.env.STUDY_TEST_FONT)
        .toString("base64")
    : "";
  const origin = process.env.STUDY_UI_ORIGIN || "http://127.0.0.1:15184";
  const screenshots =
    process.env.STUDY_SCREENSHOT_DIR || require("node:os").tmpdir();
  require("node:fs").mkdirSync(screenshots, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.STUDY_CHROME_PATH || "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext();
  if (process.env.STUDY_TEST_WITHOUT_RANDOM_UUID === "1") {
    await context.addInitScript(() => {
      Object.defineProperty(globalThis.crypto, "randomUUID", { value: undefined, configurable: true });
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const id = "11111111-1111-4111-8111-111111111111",
    uid = "22222222-2222-4222-8222-222222222222";
  const perms = [
    "programs.manage",
    "sessions.manage",
    "activities.manage",
    "materials.manage",
    "submissions.read",
    "attendance.read",
    "live.host",
    "members.invite",
    "roles.manage",
    "roles.assign",
    "settings.manage",
  ].map((x) => "study." + x);
  const project = {
    id,
    teamId: id,
    kind: "study",
    name: "함께 읽는 파이썬",
    description: "매주 함께 읽고 이야기해요.",
    status: "preparing",
    canManage: true,
    permissions: perms,
    members: [],
  };
  const doc = new Y.Doc();
  const pageId = "33333333-3333-4333-8333-333333333333";
  doc.getArray("pages").push([pageId]);
  doc.getText(`title:${pageId}`).insert(0, "함께 읽는 첫 장");
  let room = null;
  const deck = {
    currentUserId: uid,
    id: "deck",
    title: "함께 읽는 자료",
    epoch: 1,
    canEdit: true,
    canManage: true,
    editorIds: [],
    presence: [],
  };
  let data = {
    permissions: perms,
    isOwner: true,
    programs: [],
    sessions: [],
    activities: [],
    members: [{ userId: uid, displayName: "민수", roleIds: ["admin"] }],
    roles: [
      { id: "admin", name: "관리자", permissions: perms },
      { id: "deputy", name: "부관리자", permissions: [] },
      { id: "member", name: "회원", permissions: [] },
    ],
  };
  await page.context().route("**/api/**", async (route) => {
    const u = new URL(route.request().url());
    let body = {};
    if (u.pathname === "/api/auth/me")
      body = {
        user: {
          id: uid,
          email: "test@example.invalid",
          displayName: "민수",
          accountType: "team",
        },
      };
    else if (u.pathname === "/api/auth/csrf") body = { csrfToken: "token" };
    else if (u.pathname === "/api/workspace")
      body = { userId: uid, teams: [], projects: [project], invitations: [] };
    else if (u.pathname.endsWith("/study")) body = data;
    else if (u.pathname.endsWith("/decks"))
      body =
        route.request().method() === "POST"
          ? {
              ...deck,
              state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
            }
          : { decks: [deck], canManage: true };
    else if (u.pathname.endsWith("/decks/deck")) {
      if (route.request().method() === "PATCH")
        Y.applyUpdate(
          doc,
          Buffer.from(route.request().postDataJSON().update, "base64"),
        );
      body = {
        ...deck,
        state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
      };
    } else if (u.pathname.endsWith("/presence")) body = { ok: true };
    else if (
      u.pathname.includes("/study/programs/") &&
      u.pathname.endsWith("/sessions") &&
      route.request().method() === "POST"
    ) {
      const b = route.request().postDataJSON();
      const session = {
        id: "session",
        seriesId: "series",
        programId: "program",
        ...b,
        status: "scheduled",
      };
      data.sessions.push(session);
      body = session;
    } else if (
      u.pathname.endsWith("/sessions/session") &&
      route.request().method() === "PATCH"
    ) {
      const b = route.request().postDataJSON();
      if (b.preview)
        body = {
          revision: "test-revision",
          affected: [
            { ...data.sessions[0], startsAt: b.startsAt, endsAt: b.endsAt },
          ],
          protectedCount: 1,
        };
      else {
        Object.assign(data.sessions[0], b);
        body = data.sessions[0];
      }
    } else if (u.pathname.endsWith("/live")) {
      const b = route.request().postDataJSON();
      room ??= {
        hostId: uid,
        presenterId: uid,
        waiting: false,
        ended: false,
        canHost: true,
        shared: {},
        participants: [
          { userId: uid, name: "민수", canHost: true },
          { userId: "viewer", name: "지우", canHost: false },
        ],
      };
      if (b.action === "presenter") room.presenterId = b.userId;
      if (b.action === "reclaim") room.presenterId = uid;
      if (b.action === "share")
        room.shared = {
          type: "slide",
          title: doc.getText(`title:${pageId}`).toString(),
          body: doc.getText(`body:${pageId}`).toString(),
          elements: [],
          background: "#ffffff",
        };
      body = room;
    } else if (u.pathname.endsWith("/materials"))
      body = { submissions: [], sessions: data.sessions };
    else if (u.pathname.endsWith("/study/storage"))
      body = {
        usedBytes: 2048,
        limitBytes: 10 * 1024 ** 3,
        unusedRetentionDays: 7,
      };
    else if (u.pathname.endsWith("/study/settings"))
      body = {
        attendance: {
          mode: "duration",
          minimumMinutes: 30,
          reference: "scheduled",
          graceMinutes: 10,
          lateEntry: "allow",
          endPresenceMinutes: null,
          includeWaiting: false,
        },
      };
    else if (u.pathname.endsWith("/study/programs")) {
      const b = route.request().postDataJSON();
      const p = {
        id: "program",
        ...b,
        status: "preparing",
        archivedAt: null,
        memberIds: [],
        organizers: [{ userId: uid, role: "host" }],
      };
      data.programs.push(p);
      body = p;
    } else if (
      u.pathname.includes("/study/programs/") &&
      route.request().method() === "PATCH"
    ) {
      data.programs[0].status = "active";
      data.programs[0].memberIds = [uid];
      body = data.programs[0];
    } else
      body = {
        sessions: [],
        requests: [],
        approvals: [],
        connections: [],
        providers: [],
        status: "disconnected",
      };
    await route.fulfill({ json: body });
  });
  await page.addInitScript(
    ({ id }) => {
      history.replaceState(
        {
          developerView: "projects",
          projectId: id,
          projectSection: "overview",
        },
        "",
        location.href,
      );
    },
    { id },
  );
  await page.goto(origin + "/");
  await page
    .getByRole("button", { name: "프로그램 만들기", exact: true })
    .waitFor();
  if (font)
    await page.addStyleTag({
      content: `@font-face{font-family:StudyTest;src:url(data:font/ttf;base64,${font})}body,body *{font-family:StudyTest,sans-serif!important}`,
    });
  await page.evaluate(() => document.fonts.ready);
  await page
    .getByRole("button", { name: "프로그램 만들기", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "이름", exact: true })
    .fill("파이썬 책 읽기");
  await page.getByRole("button", { name: "프로그램 만들기", exact: true }).click();
  await page.waitForTimeout(300);
  if (errors.length) throw Error(`Program save failed: ${errors.join("; ")}`);
  await page
    .getByRole("button", { name: "프로그램 시작", exact: true })
    .waitFor();
  page.on("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "프로그램 시작", exact: true })
    .click();
  await page.getByText("진행 중 · 1명 참여", { exact: true }).waitFor();
  await page.getByRole("button", { name: "발표 자료", exact: true }).click();
  await page
    .getByRole("button", { name: "함께 읽는 자료", exact: true })
    .click();
  await page.getByLabel("페이지 제목", { exact: true }).waitFor();
  await page
    .getByLabel("페이지 제목", { exact: true })
    .fill("수정된 발표 제목");
  await page.getByRole("button", { name: "텍스트 추가", exact: true }).click();
  await page.waitForTimeout(600);
  await page
    .getByLabel("발표 텍스트", { exact: true })
    .fill("함께 생각해 볼 문제");
  await page.getByRole("status").filter({ hasText: "저장됨" }).waitFor();
  await page.waitForTimeout(1300);
  if (doc.getText(`title:${pageId}`).toString() !== "수정된 발표 제목")
    throw Error("deck update not saved");
  const elementId = doc.getArray(`elements:${pageId}`).get(0);
  await page.getByRole("button", { name: "내 수정 취소", exact: true }).click();
  await page.waitForTimeout(1400);
  if (doc.getText(`text:${elementId}`).toString() !== "텍스트를 입력하세요")
    throw Error("local undo was not persisted");
  await page.getByRole("button", { name: "다시 실행", exact: true }).click();
  await page.waitForTimeout(1400);
  if (doc.getText(`text:${elementId}`).toString() !== "함께 생각해 볼 문제")
    throw Error("redo was not persisted");
  const second = await page.context().newPage();
  second.on("pageerror", (e) => errors.push(e.message));
  await second.addInitScript(
    ({ id }) =>
      history.replaceState(
        {
          developerView: "projects",
          projectId: id,
          projectSection: "overview",
        },
        "",
        location.href,
      ),
    { id },
  );
  await second.goto(origin + "/");
  await second.getByRole("button", { name: /파이썬 책 읽기/ }).click();
  await second.getByRole("button", { name: "발표 자료", exact: true }).click();
  await second
    .getByRole("button", { name: "함께 읽는 자료", exact: true })
    .click();
  await second.getByLabel("발표 텍스트", { exact: true }).waitFor();
  await Promise.all([
    page.getByLabel("페이지 제목", { exact: true }).fill("두 화면 공동 편집"),
    second
      .getByLabel("발표 텍스트", { exact: true })
      .fill("다른 화면에서 편집한 내용"),
  ]);
  await page.waitForTimeout(2600);
  if (
    (await page.getByLabel("발표 텍스트", { exact: true }).inputValue()) !==
    "다른 화면에서 편집한 내용"
  )
    throw Error("remote body failed to merge");
  if (
    (await second.getByLabel("페이지 제목", { exact: true }).inputValue()) !==
    "두 화면 공동 편집"
  )
    throw Error("remote title failed to merge");
  deck.presence = [
    {
      userId: "remote-editor",
      name: "지우",
      pageId,
      field: `title:${pageId}`,
      start: 0,
      end: 3,
    },
  ];
  await page.locator(".study-remote-selection").first().waitFor();
  const selectedMarker = await page
    .locator(".study-remote-selection")
    .first()
    .boundingBox();
  if (!selectedMarker || selectedMarker.width <= 2)
    throw Error("Remote text selection not rendered");
  deck.presence = [
    {
      userId: "remote-editor",
      name: "지우",
      pageId,
      field: `title:${pageId}`,
      start: 3,
      end: 3,
    },
  ];
  await page.waitForTimeout(1300);
  const caretMarker = await page
    .locator(".study-remote-selection")
    .first()
    .boundingBox();
  if (!caretMarker || caretMarker.width > 3)
    throw Error("Remote caret not rendered");
  deck.presence = [];
  await second.close();
  await page
    .getByLabel("페이지 제목", { exact: true })
    .fill("수정된 발표 제목");
  await page.waitForTimeout(1400);
  await page
    .getByRole("button", { name: "발표 미리보기", exact: true })
    .click();
  await page.screenshot({
    path: require("node:path").join(screenshots, "study-editor-1280.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "← 자료", exact: true }).click();
  await page.getByRole("button", { name: "회차", exact: true }).click();
  await page.getByRole("button", { name: "회차 추가", exact: true }).click();
  await page
    .getByRole("textbox", { name: "이름", exact: true })
    .fill("1회차 · 함께 시작하기");
  await page.getByLabel("시작", { exact: true }).fill("2026-12-01T14:00");
  await page.getByLabel("종료", { exact: true }).fill("2026-12-01T15:00");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await page.getByRole("button", { name: "일정 변경", exact: true }).click();
  await page.getByLabel("변경 범위").selectOption("following");
  await page.getByLabel("시작", { exact: true }).fill("2026-12-01T14:30");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await page.getByRole("region", { name: "일정 변경 미리보기" }).waitFor();
  if (data.sessions[0].startsAt === "2026-12-01T05:30:00.000Z")
    throw Error("Preview mutated a schedule");
  await page.screenshot({
    path: require("node:path").join(screenshots, "study-schedule-preview.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "확인한 일정으로 변경", exact: true })
    .click();
  await page.getByRole("button", { name: "발표실 열기", exact: true }).click();
  await page.getByRole("button", { name: "라이브 시작", exact: true }).click();
  await page.getByRole("button", { name: "발표권 주기", exact: true }).click();
  await page
    .getByRole("button", { name: "발표권 회수", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "발표권 회수", exact: true }).click();
  await page
    .getByRole("button", { name: "발표 자료 선택", exact: true })
    .click();
  await page
    .getByRole("button", { name: "함께 읽는 자료", exact: true })
    .click();
  await page
    .getByRole("button", { name: "1. 수정된 발표 제목", exact: true })
    .click();
  await page
    .getByRole("button", { name: "선택한 자료 공유하기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "발표 자료 선택", exact: true })
    .click();
  for (const width of [1280, 768, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: require("node:path").join(
        screenshots,
        `study-implementation-${width}.png`,
      ),
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    if (overflow) throw Error("overflow " + width);
  }
  await page
    .getByRole("button", { name: "회차로 돌아가기", exact: true })
    .click();
  await page.getByRole("button", { name: "회원", exact: true }).click();
  await page.getByRole("button", { name: "역할·권한", exact: true }).click();
  await page.getByRole("button", { name: "역할 추가", exact: true }).click();
  await page.getByRole("textbox", { name: "역할 이름" }).fill("진행 도우미");
  if (await page.locator("input[type=checkbox]").count())
    throw Error("checkbox found in study");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByRole("heading", { name: "출석 규칙", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "입장 시각 + 참여 시간", exact: true })
    .click();
  await page.getByLabel("최소 참여 시간 (분)", { exact: true }).fill("45");
  await page
    .getByRole("button", { name: "출석 규칙 저장", exact: true })
    .click();
  for (const width of [1280, 360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: require("node:path").join(
        screenshots,
        `study-settings-${width}.png`,
      ),
      fullPage: true,
    });
    if (
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      )
    )
      throw Error("settings overflow " + width);
  }
  await page.goto(origin + "/projects/new");
  await page
    .getByRole("button", { name: /스터디·모임 프로그램과 회차/ })
    .click();
  if (await page.getByLabel("소유 개발팀", { exact: true }).count())
    throw Error("developer team shown in study");
  await page.getByRole("button", { name: /개발 프로젝트 요청부터/ }).click();
  await page.getByLabel("소유 개발팀", { exact: true }).waitFor();
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS: program/session create, canvas edit/save/undo/redo/two-page sync, live grant/reclaim/preview/share, roles/attendance settings, creation separation, 1280/768/360/320 overflow check, no runtime exceptions",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
