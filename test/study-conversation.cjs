const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.STUDY_PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const pid='11111111-1111-4111-8111-111111111111',uid='22222222-2222-4222-8222-222222222222';
 const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
 let kind='study',fail=false,items=[],replies=[];
 const message=(key,body)=>({key,kind:'message',body,actorName:'민수',createdAt:new Date().toISOString(),cursorAt:new Date().toISOString(),parentKey:null,targetKind:null,targetId:null,title:'',replyCount:0});
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());let body={},status=200;
  if(url.pathname==='/api/auth/me')body={user:{id:uid,displayName:'민수',email:'demo@example.invalid',accountType:'team'}};
  else if(url.pathname.endsWith('/csrf'))body={csrfToken:'test'};
  else if(url.pathname==='/api/workspace')body={userId:uid,teams:[],projects:[{id:pid,teamId:pid,kind,name:'함께 읽는 파이썬',description:'',permissions:[],members:[],canManage:true}],invitations:[]};
  else if(url.pathname.endsWith('/channel')){
   if(route.request().method()==='POST'){
    const payload=route.request().postDataJSON();writes.push(payload);
    if(fail){fail=false;status=500;body={message:'전송 실패 테스트'};}
    else if(payload.parentKey){replies.push({...message('reply',payload.body),parentKey:payload.parentKey});items[0].replyCount++;}
    else items.push(message('message:'+items.length,payload.body));
   }else body={items:url.searchParams.has('parent')?replies:items,hasMore:false};
  }else body={permissions:[],isOwner:true,programs:[],sessions:[],activities:[],members:[],roles:[],approvals:[],pendingCount:0};
  await route.fulfill({status,json:body});
 });
 await page.addInitScript(({pid})=>history.replaceState({developerView:'projects',projectId:pid,projectSection:'channel'},'',location.href),{pid});
 await page.goto(process.env.STUDY_UI_ORIGIN || 'http://127.0.0.1:15174');
 const chat=page.getByRole('region',{name:'스터디 대화'});await chat.waitFor();
 if(process.env.STUDY_TEST_FONT){const font=fs.readFileSync(process.env.STUDY_TEST_FONT).toString('base64');await page.addStyleTag({content:`@font-face{font-family:StudyTest;src:url(data:font/ttf;base64,${font})}body,body *{font-family:StudyTest,sans-serif!important}`});await page.evaluate(()=>document.fonts.ready);}
 assert.equal(await page.locator('.ds-project-tabs').getByRole('button',{name:'대화',exact:true}).count(),1);
 assert.equal(await chat.getByText('업무 알림',{exact:true}).count(),0);
 await chat.getByText('아직 나눈 이야기가 없어요. 인사나 궁금한 점을 남겨보세요.').waitFor();
 await page.waitForTimeout(1000);
 const compose=chat.getByRole('textbox',{name:'회원들과 나눌 이야기를 입력하세요…'});
 await compose.fill('이번 모임에는 읽은 책에서 인상 깊은 문장을 하나씩 가져와 주세요.');
 fail=true;await chat.getByRole('button',{name:'보내기',exact:true}).click();await chat.getByRole('alert').waitFor();assert.ok((await compose.inputValue()).length);
 await chat.getByRole('button',{name:'보내기',exact:true}).click();await chat.getByRole('button',{name:'답글 달기'}).waitFor();assert.equal(await compose.inputValue(),'');
 await chat.getByRole('textbox',{name:'불러온 대화 검색'}).fill('없는검색어');await chat.getByText('조건에 맞는 대화가 없습니다.').waitFor();await chat.getByRole('button',{name:'검색 초기화'}).click();
 fs.mkdirSync('/tmp/study-conversation',{recursive:true});
 assert.equal(await chat.getByRole('button',{name:'보내기',exact:true}).evaluate(el=>getComputedStyle(el).fontSize),'12px');
 await page.screenshot({path:'/tmp/study-conversation/desktop.png',fullPage:true});
 await chat.getByRole('button',{name:'답글 달기'}).click();
 const thread=chat.getByRole('complementary',{name:'답글 패널'});
 await thread.getByRole('textbox',{name:'답글을 남기세요…'}).fill('좋아요. 저는 함수 부분의 예제를 준비할게요.');await thread.getByRole('button',{name:'보내기'}).click();await thread.locator('.pc-replies').getByText('좋아요. 저는 함수 부분의 예제를 준비할게요.',{exact:true}).waitFor();
 assert.equal(writes.at(-1).parentKey,'message:0');
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`thread overflow ${width}`);
  await page.screenshot({path:`/tmp/study-conversation/thread-${width}.png`,fullPage:true});
 }
 await thread.getByRole('button',{name:'답글 닫기'}).press('Escape');assert.equal(await thread.count(),0);
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`feed overflow ${width}`);
 }
 // A refresh must not take a reader away from an older message.
 items=Array.from({length:30},(_,i)=>message('many:'+i,`이전 대화 ${i} · 함께 읽을 내용을 준비합니다.`));
 await chat.getByRole('button',{name:'새로고침'}).click();await chat.getByText('이전 대화 29 · 함께 읽을 내용을 준비합니다.',{exact:true}).waitFor();
 await page.locator('.pc-feed').evaluate(el=>{el.scrollTop=100});
 await chat.getByRole('button',{name:'새로고침'}).click();await page.waitForTimeout(200);assert.ok(await page.locator('.pc-feed').evaluate(el=>el.scrollTop<160));
 // Developer projects keep the original channel UI and send wording.
 kind='development';await page.reload();await page.getByRole('heading',{name:'프로젝트 채널',exact:true}).waitFor();
 assert.equal(await page.locator('.ds-project-tabs').getByRole('button',{name:'채널',exact:true}).count(),1);
 assert.equal(await page.getByRole('button',{name:'업무 알림',exact:true}).count(),1);
 assert.equal(await page.getByRole('button',{name:'등록',exact:true}).count(),1);
 assert.deepEqual(errors,[]);console.log('PASS study label, empty/search, send retry, replies, responsive layout, reader scroll, developer channel unchanged');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
