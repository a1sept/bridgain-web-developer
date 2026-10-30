import React, { useState } from 'react';
import {createRoot} from 'react-dom/client';
import ProjectSettings from '../src/ProjectSettings';
import AiWorkspace from '../src/ai/AiWorkspace';
import CodeDiff from '../src/CodeDiff';
import '../src/style.css';
import '../src/developer-shell.css';
import '../src/project-workspace.css';
import '../src/live-workspace.css';
import '../src/project-controls.css';
import '../src/task-code.css';
const url='https://github.com/a1sept/bridgain-local-git-qa';
const folder='/Users/jirehjung/WORKSPACE/bridgain-local-git-qa';
const state={folders:{qa:folder},running:[],connections:[],providers:[]};
window.bridgainDesktop={state:async()=>state,onEvent:()=>()=>{},repositoryState:async()=>({repositoryUrl:url,branch:'main',authorConfigured:true}),chooseFolder:async()=>null,cloneProject:async()=>null,clearFolder:async()=>{},connectGithub:async()=>{},cancelGithub:async()=>{}} as any;
window.fetch=async (input:any)=>{const path=String(input);let data={stageTypes:[],presets:[],canManage:true};if(path.includes('/github/status')) data={configured:true,connected:true,installUrl:'https://github.com/apps/bridgain/installations/new'};else if(path.includes('/github/repositories'))data={repositories:['bridgain-local-git-qa','bridgain','album-us','another-long-repository-name-for-layout'].map((name,i)=>({id:i,fullName:`a1sept/${name}`,url:`https://github.com/a1sept/${name}`,private:true,defaultBranch:'main',owner:{login:'a1sept',type:'User',avatarUrl:''}}))};else if(path.includes('/github/submodules'))data={submodules:[],parentUrl:url,parentCommit:'abc'};return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}})};
function Preview(){const [manage,setManage]=useState(true);return <div className="ds-shell"><main className="ds-content" style={{maxWidth:1050,margin:'24px auto',padding:24}}><p>UI 검증용 모의 데이터 · 실제 저장소/서버 변경 없음</p><button onClick={()=>setManage(!manage)}>{manage?'작업자 화면 보기':'관리자 화면 보기'}</button><AiWorkspace userId="qa"><ProjectSettings project={{id:'qa',name:'로컬 Git 업무 흐름 검증',description:'연결 설정 UI 검증',status:'planning',repositoryUrls:[url]}} canManage={manage} onSave={async()=>{}} /></AiWorkspace></main></div>}
createRoot(document.getElementById('root')!).render(<Preview/>);
