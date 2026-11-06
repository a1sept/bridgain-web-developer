import {test} from 'node:test';
import assert from 'node:assert/strict';
import {graphRows} from '../src/development/graph.ts';
test('merge branches retain separate lanes and join their real common parent',()=>{
 const rows=graphRows([{sha:'merge',parents:['left','right']},{sha:'left',parents:['base']},{sha:'right',parents:['base']},{sha:'base',parents:[]}]);
 assert.equal(rows[0].edges.filter(e=>e.parent).length,2);
 assert.equal(rows[0].width,2);
 assert.notEqual(rows[1].lane,rows[2].lane);
 assert.equal(rows[2].edges.find(e=>e.parent).to,rows[3].lane);
 assert.equal(rows[3].edges.length,0);
});
test('disconnected heads do not invent parent edges and truncated parents retain lanes',()=>{
 const rows=graphRows([{sha:'a',parents:['outside']},{sha:'b',parents:[]}]);
 assert.equal(rows[1].lane,1);assert.equal(rows[1].edges.filter(e=>e.parent).length,0);assert.equal(rows[1].edges[0].from,0);assert.equal(rows[1].edges[0].to,0);
});
