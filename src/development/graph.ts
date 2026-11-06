export type GraphCommit={sha:string;parents:string[]};
// Frontier lanes carry actual parent SHAs across rows, including parents outside the loaded page.
export function graphRows(commits:GraphCommit[]) {
 let lanes:string[]=[];
 return commits.map(commit=>{
  if(!lanes.includes(commit.sha))lanes.push(commit.sha);
  const before=[...lanes],lane=before.indexOf(commit.sha);
  const after=before.filter(s=>s!==commit.sha);
  for(const [i,parent] of commit.parents.entries())if(!after.includes(parent))after.splice(Math.min(lane+i,after.length),0,parent);
  const edges=before.filter(s=>s!==commit.sha).map(s=>({from:before.indexOf(s),to:after.indexOf(s),parent:false}));
  for(const parent of commit.parents)edges.push({from:lane,to:after.indexOf(parent),parent:true});
  lanes=after;
  return {lane,edges,width:Math.max(before.length,after.length,1)};
 });
}
