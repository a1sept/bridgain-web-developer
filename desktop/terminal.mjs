import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
const CAP = 256 * 1024;
const size = (n, fallback, max) => Math.min(max, Math.max(2, Math.floor(Number(n) || fallback)));
// PTYs and output are local, owner-scoped, bounded and never persisted or sent to the API.
export class TerminalSessions {
  sessions = new Map();
  generation = 0;
  async open(owner, project, cwd, options = {}) {
    const existing = [...this.sessions.values()].find(s => s.owner === owner && s.project === project && s.cwd === cwd);
    if (existing) return this.snapshot(existing, 0);
    if (this.sessions.size >= 4) throw Error('열린 터미널을 종료한 뒤 다시 시작해주세요. 최대 4개입니다.');
    const generation=this.generation;
    const { spawn } = await import('node-pty');
    if(generation!==this.generation)throw Error('터미널 시작이 취소되었습니다.');
    const duplicate=[...this.sessions.values()].find(s=>s.owner===owner&&s.project===project&&s.cwd===cwd);
    if(duplicate)return this.snapshot(duplicate,0);
    if (this.sessions.size >= 4) throw Error('열린 터미널을 종료한 뒤 다시 시작해주세요. 최대 4개입니다.');
    const shell = process.platform === 'win32' ? (process.env.COMSPEC || 'cmd.exe') : (userInfo().shell || '/bin/sh');
    const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
    delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS; delete env.NODE_CHANNEL_FD;
    const child = spawn(shell, [], { name: 'xterm-256color', cwd, env, cols: size(options.cols, 80, 500), rows: size(options.rows, 24, 200) });
    const session = { id: randomUUID(), owner, project, cwd, child, buffer: '', offset: 0, exited: false, exitCode: null, workspaceTaskId:options.workspaceTaskId, validatedAt:Date.now() };
    this.sessions.set(session.id, session);
    child.onData(data => { session.buffer += data; if (session.buffer.length > CAP) { const remove = session.buffer.length - CAP; session.buffer = session.buffer.slice(remove); session.offset += remove; } });
    child.onExit(({ exitCode }) => { session.exited = true; session.exitCode = exitCode; });
    return this.snapshot(session, 0);
  }
  get(owner, project, id, cwd) {
    const s = this.sessions.get(id);
    if (!s || s.owner !== owner || s.project !== project || s.cwd !== cwd) throw Error('터미널 연결이 끝났거나 작업 폴더가 바뀌었습니다. 다시 시작해주세요.');
    return s;
  }
  snapshot(s, cursor) {
    const end = s.offset + s.buffer.length;
    const from = Math.max(s.offset, Math.min(end, Number(cursor) || 0));
    return { id: s.id, cwd: s.cwd, data: s.buffer.slice(from - s.offset), cursor: end, truncated: Number(cursor) < s.offset, exited: s.exited, exitCode: s.exitCode };
  }
  action(owner, project, id, cwd, action, options) {
    const s = this.get(owner, project, id, cwd);
    if (action === 'read') return this.snapshot(s, options.cursor);
    if (action === 'close') { this.close(s); return; }
    if (s.exited) throw Error('터미널 프로세스가 종료되었습니다. 다시 시작해주세요.');
    if (action === 'input') {
      if (typeof options.data !== 'string' || options.data.length > 65536) throw Error('터미널 입력이 너무 큽니다.');
      s.child.write(options.data);
    } else if (action === 'resize') s.child.resize(size(options.cols, 80, 500), size(options.rows, 24, 200));
    else throw Error('지원하지 않는 터미널 작업입니다.');
  }
  close(s) {
    if (!s.exited) {
      if(process.platform==='win32') {
        try {execFileSync('taskkill',['/PID',String(s.child.pid),'/T','/F'],{stdio:'ignore',timeout:3000});} catch {}
      } else {
        // Capture descendants before terminating the shell (which otherwise reparents jobs).
        const descendants=new Set([s.child.pid]);
        try {
          const rows=process.platform==='linux'?readdirSync('/proc').filter(name=>/^\d+$/.test(name)).flatMap(name=>{try{const stat=readFileSync(`/proc/${name}/stat`,'utf8');return [[Number(name),Number(stat.slice(stat.lastIndexOf(')')+2).split(' ')[1])]];}catch{return [];}}):execFileSync('ps',['-eo','pid=,ppid='],{encoding:'utf8',timeout:2000}).trim().split('\n').map(line=>line.trim().split(/\s+/).map(Number));
          let changed=true;while(changed){changed=false;for(const [pid,parent] of rows)if(descendants.has(parent)&&!descendants.has(pid)){descendants.add(pid);changed=true;}}
        } catch {}
        for(const pid of [...descendants].reverse())try{process.kill(pid,'SIGKILL');}catch{}
      }
      try { s.child.kill(); } catch {}
    }
    this.sessions.delete(s.id);
  }
  release() { this.generation++; for (const s of this.sessions.values()) this.close(s); }
}
