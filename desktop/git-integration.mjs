import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { git, parseStatus } from './local-git.mjs';
import { readEditorFile } from './development-space.mjs';
export async function integrationState(path) {
  const file = async name => resolve(path,(await git(path,'rev-parse','--git-path',name)).trim());
  const exists = async name => {try{await access(await file(name));return true;}catch{return false;}};
  let kind = '', branch = '';
  for (const folder of ['rebase-merge','rebase-apply']) if (await exists(folder)) {
    kind='rebase';branch=(await readFile(await file(`${folder}/head-name`),'utf8')).trim().replace(/^refs\/heads\//,'');break;
  }
  if (!kind && await exists('MERGE_HEAD')) {kind='merge';branch=(await git(path,'branch','--show-current')).trim();}
  const conflicts=(await git(path,'diff','--name-only','--diff-filter=U','-z')).split('\0').filter(Boolean);
  return {kind,branch,conflicts};
}
export async function integrate(binding, action, options) {
  const path=binding.path, state=await integrationState(path);
  if (binding.branch==='main'||binding.branch===binding.baseBranch) throw Error('업무 브랜치에서만 통합할 수 있습니다.');
  const head=(await git(path,'rev-parse','HEAD')).trim();
  if (options.expectedHead!==head) throw Error('HEAD가 변경되었습니다. 최신 상태를 확인해주세요.');
  if (action==='merge'||action==='rebase') {
    if(state.kind)throw Error('진행 중인 병합/리베이스를 먼저 완료하거나 중단해주세요.');
    if((await git(path,'status','--porcelain')).trim())throw Error('미커밋 변경사항을 먼저 처리해주세요.');
    const refs=(await git(path,'for-each-ref','--format=%(refname:short)','refs/heads','refs/remotes')).trim().split('\n');
    if(!refs.includes(options.target)||options.target===binding.branch)throw Error('통합할 다른 브랜치를 선택해주세요.');
    const target=(await git(path,'rev-parse','--verify',`${options.target}^{commit}`)).trim();
    if(action==='rebase') {
      const commits=(await git(path,'rev-list',`${target}..HEAD`)).trim().split('\n').filter(Boolean);
      if(commits.length>300)throw Error('리베이스 범위가 큽니다. 병합을 사용해주세요.');
      for(const commit of commits)if((await git(path,'for-each-ref',`--contains=${commit}`,'--format=%(refname)','refs/remotes')).trim())throw Error('이미 원격에 공개된 커밋은 재작성하지 않습니다. 병합을 선택해주세요.');
    }
    try {await git(path,'-c','core.editor=true',action,...(action==='merge'?['--no-edit']:[]),target);}
    catch(e){if(!(await integrationState(path)).kind)throw e;}
  } else {
    if(!state.kind||state.branch!==binding.branch)throw Error('현재 업무의 진행 중인 병합/리베이스가 없습니다.');
    if(action==='resolve') {
      if(!state.conflicts.includes(options.path))throw Error('충돌 파일을 다시 확인해주세요.');
      if(options.deleted===true)await git(path,'rm','--',options.path);
      else {const f=await readEditorFile(path,options.path);if(f.revision!==options.revision)throw Error('파일이 변경되었습니다. 저장 후 다시 확인해주세요.');if(/^(<{7}|={7}|>{7}|\|{7})/m.test(f.content))throw Error('충돌 표시를 모두 해결하고 저장해주세요.');await git(path,'add','--',options.path);}
    } else if(action==='continue') {
      if(state.conflicts.length)throw Error('충돌 파일을 모두 해결 완료로 표시해주세요.');
      try {await git(path,'-c','core.editor=true',state.kind,'--continue');}catch(e){if(!(await integrationState(path)).conflicts.length)throw e;}
    } else if(action==='abort')await git(path,state.kind,'--abort');
    else throw Error('지원하지 않는 통합 작업입니다.');
  }
  return integrationState(path);
}
