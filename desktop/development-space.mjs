import { readdir, realpath, lstat, readFile, open } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { git, parseStatus } from './local-git.mjs';
const limit = 2 * 1024 * 1024;
const digest = data => createHash('sha256').update(data).digest('hex');
// This is the user's editor, not the AI research file allowlist. Never send contents to the server.
export async function editorPath(root, path = '') {
  if (typeof path !== 'string' || path.includes('\0') || isAbsolute(path) || /^[a-z]:/i.test(path) || path.includes('\\') || path.split('/').some(x => x === '..' || x.toLowerCase() === '.git')) throw Error('유효한 작업 폴더 경로를 선택해주세요.');
  const base = await realpath(root);
  let target = base;
  for (const segment of path.split('/').filter(Boolean)) {
    target = resolve(target, segment);
    if ((await lstat(target)).isSymbolicLink()) throw Error('심볼릭 링크는 편집 공간에서 열 수 없습니다.');
  }
  const actual = await realpath(target), rel = relative(base, actual);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw Error('연결한 폴더 밖의 파일입니다.');
  return actual;
}
export async function directoryEntries(root, path = '') {
  const target = await editorPath(root, path);
  const entries = await readdir(target, { withFileTypes: true });
  return { entries: entries.filter(x => x.name.toLowerCase() !== '.git').sort((a,b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name)).slice(0,2000).map(e => ({ name: e.name, path: [path,e.name].filter(Boolean).join('/'), directory: e.isDirectory(), link: e.isSymbolicLink() })), limited: entries.length > 2000 };
}
export async function readEditorFile(root, path) {
  if (!path) throw Error('파일을 선택해주세요.');
  const target = await editorPath(root, path), info = await lstat(target);
  if (!info.isFile() || info.size > limit) throw Error('2MB 이하의 텍스트 파일만 편집할 수 있습니다.');
  const data = await readFile(target);
  if (data.length > limit || data.includes(0)) throw Error('바이너리 또는 큰 파일은 편집할 수 없습니다.');
  let content;
  try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data); }
  catch { throw Error('UTF-8 텍스트 파일만 편집할 수 있습니다.'); }
  return { path, content, revision: digest(data) };
}
export async function writeEditorFile(root, path, content, revision) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > limit || content.includes('\0') || typeof revision !== 'string') throw Error('저장할 텍스트와 파일 버전을 확인해주세요.');
  const target = await editorPath(root, path);
  // Open before checking the version; never truncate when the expected contents differ.
  const file = await open(target, constants.O_RDWR | (constants.O_NOFOLLOW || 0));
  try {
    const info = await file.stat();
    if (!info.isFile() || info.size > limit || info.nlink > 1) throw Error('일반 텍스트 파일만 저장할 수 있습니다. 하드 링크는 지원하지 않습니다.');
    const existing = await file.readFile();
    if (digest(existing) !== revision) throw Error('파일이 외부에서 변경되었습니다. 디스크 내용과 비교한 뒤 다시 불러와주세요. 편집 내용은 유지됩니다.');
    if (await editorPath(root, path) !== target) throw Error('파일 경로가 변경되었습니다. 다시 열어주세요.');
    const data = Buffer.from(content);
    for (let offset = 0; offset < data.length;) {
      const { bytesWritten } = await file.write(data, offset, data.length - offset, offset);
      if (!bytesWritten) throw Error('파일을 끝까지 저장하지 못했습니다.');
      offset += bytesWritten;
    }
    await file.truncate(data.length); await file.sync();
    return { path, content, revision: digest(data) };
  } finally { await file.close(); }
}
export async function searchEditorFiles(root, query) {
  if (typeof query !== 'string' || !query.trim() || query.length > 200) throw Error('검색어를 1~200자로 입력해주세요.');
  const matches = []; let scanned = 0, bytes = 0, limited = false;
  const skip = new Set(['.git','node_modules','dist','build','coverage']);
  async function walk(path, depth) {
    if (depth > 20 || scanned >= 1500 || matches.length >= 100 || bytes > 16 * 1024 * 1024) { limited = true; return; }
    const listing = await directoryEntries(root,path); limited ||= listing.limited;
    for (const entry of listing.entries) {
      if (entry.link || skip.has(entry.name)) continue;
      if (scanned >= 1500 || matches.length >= 100 || bytes > 16 * 1024 * 1024) { limited = true; break; }
      if (entry.directory) { await walk(entry.path,depth+1); continue; }
      scanned++;
      try { const f = await readEditorFile(root,entry.path); bytes += Buffer.byteLength(f.content);
        f.content.split('\n').forEach((line,i) => { if (matches.length < 100 && line.toLowerCase().includes(query.toLowerCase())) matches.push({path:entry.path,line:i+1,text:line.slice(0,300)}); });
      } catch { /* unreadable/binary files are not search results */ }
    }
  }
  await walk('',0);return {matches,limited};
}
export async function developmentGitState(path, count = 60) {
  count = Math.min(300,Math.max(20,Number(count)||60));
  const files = parseStatus(await git(path,'status','--porcelain=v1','-z','--untracked-files=all'));
  const branch = (await git(path,'branch','--show-current')).trim();
  let head = '', upstream = '', ahead = null, behind = null;
  try { head = (await git(path,'rev-parse','--verify','HEAD')).trim(); } catch {}
  try { upstream = (await git(path,'rev-parse','--abbrev-ref','@{upstream}')).trim();
    [behind,ahead] = (await git(path,'rev-list','--left-right','--count','@{upstream}...HEAD')).trim().split(/\s+/).map(Number);
  } catch {}
  let history = [];
  if (head) history = (await git(path,'log','--all','HEAD','--topo-order',`-${count+1}`,'--format=%H%x00%P%x00%s%x00%an%x00%aI')).trim().split('\n').filter(Boolean).map(row => { const [sha,parents,subject,author,date] = row.split('\0'); return {sha,parents:parents.split(' ').filter(Boolean),subject,author,date}; });
  const refs = (await git(path,'for-each-ref','--format=%(objectname)%00%(refname:short)','refs/heads','refs/remotes','refs/tags')).trim().split('\n').filter(Boolean).map(row => {const [sha,name] = row.split('\0');return {sha,name};});
  return {files,branch,head,upstream,ahead,behind,history:history.slice(0,count),hasMore:history.length>count,refs};
}
export async function pullFastForward(binding, expectedHead) {
  const state = await developmentGitState(binding.path);
  if (state.head !== expectedHead) throw Error('커밋이 변경되었습니다. 최신 상태를 확인해주세요.');
  if (!state.branch || state.branch !== binding.branch) throw Error('현재 업무 브랜치를 확인해주세요.');
  if (state.files.length) throw Error('미커밋 변경사항을 먼저 커밋해주세요. 자동으로 보관하거나 덮어쓰지 않습니다.');
  if (state.upstream !== `origin/${binding.branch}`) throw Error('origin 추적 브랜치가 필요합니다. 업무 브랜치를 먼저 Push해주세요.');
  await git(binding.path,'fetch','origin');
  const updated = await developmentGitState(binding.path);
  if (updated.ahead && updated.behind) throw Error('로컬과 원격 브랜치가 갈라졌습니다. 이번 버전은 fast-forward Pull만 지원합니다. 병합 또는 리베이스 후 다시 시도해주세요.');
  await git(binding.path,'merge','--ff-only','@{upstream}');
}

// File operations only: folders cannot be recursively removed or replaced from this UI.
export async function createEditorFile(root, path, content = '') {
  if (typeof path !== 'string' || !path || path.endsWith('/')) throw Error('새 파일 경로를 입력해주세요.');
  const { dirname, basename } = await import('node:path');
  // Validate every existing parent; the leaf must not already exist (including symlinks).
  if (path.includes('\\') || isAbsolute(path) || /^[a-z]:/i.test(path) || path.split('/').some(x => ['..','.git',''].includes(x.toLowerCase()))) throw Error('유효한 파일 경로를 입력해주세요.');
  const parent = await editorPath(root, dirname(path) === '.' ? '' : dirname(path));
  const target = resolve(parent, basename(path));
  const file = await open(target, 'wx', 0o644);
  try { await file.writeFile(content); } finally { await file.close(); }
  return readEditorFile(root, path);
}
export async function renameEditorFile(root, path, nextPath, revision) {
  const source = await readEditorFile(root, path);
  if (source.revision !== revision) throw Error('파일이 변경되었습니다. 다시 읽은 뒤 이름을 변경해주세요.');
  // Exclusive creation prevents replacing another file; source stays intact if creating fails.
  const created = await createEditorFile(root, nextPath, source.content);
  const { unlink, chmod } = await import('node:fs/promises');
  const oldTarget = await editorPath(root, path), newTarget = await editorPath(root, nextPath);
  try {
    if ((await readEditorFile(root, path)).revision !== revision) throw Error('파일이 외부에서 변경되어 원본을 유지했습니다.');
    await chmod(newTarget, (await lstat(oldTarget)).mode & 0o777);
    await unlink(oldTarget);
  } catch(e) { await unlink(newTarget); throw e; }
  return created;
}
export async function trashEditorFile(root, path, revision, trash) {
  if (!trash) throw Error('이 앱에서 휴지통을 사용할 수 없습니다.');
  const file = await readEditorFile(root, path);
  if (file.revision !== revision) throw Error('파일이 변경되었습니다. 다시 읽은 뒤 삭제해주세요.');
  await trash(await editorPath(root, path));
}
export async function previewReplace(root, query, replacement) {
  if (typeof replacement !== 'string' || replacement.length > 10000) throw Error('바꿀 텍스트는 10,000자 이하여야 합니다.');
  const search = await searchEditorFiles(root, query);
  if (search.limited) throw Error('검색 한도를 초과했습니다. 검색어를 좁힌 뒤 다시 시도해주세요.');
  const files = [];
  for (const path of new Set(search.matches.map(m => m.path))) {
    const f = await readEditorFile(root, path);
    const count = f.content.split(query).length - 1;
    if (!count) continue;
    const content = f.content.split(query).join(replacement);
    if (Buffer.byteLength(content) > limit) throw Error('바꾼 파일이 2MB를 넘습니다.');
    files.push({path,revision:f.revision,count,before:f.content,after:content});
  }
  return {files};
}
export async function applyReplace(root, query, replacement, expected) {
  if (!Array.isArray(expected) || expected.length > 100) throw Error('바꾸기 미리보기를 다시 실행해주세요.');
  const preview = await previewReplace(root, query, replacement);
  if (preview.files.length !== expected.length || preview.files.some(f=>!expected.some(e=>e.path===f.path&&e.revision===f.revision))) throw Error('검색 결과가 바뀌었습니다. 미리보기를 다시 확인해주세요.');
  const applied = [];
  try { for (const f of preview.files) { await writeEditorFile(root,f.path,f.after,f.revision); applied.push(f.path); } }
  catch(e) { return {applied,error:`${applied.length}개 파일 적용 후 중단: ${e.message}`}; }
  return {applied};
}
