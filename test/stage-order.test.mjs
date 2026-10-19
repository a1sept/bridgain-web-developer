import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sequenceStages,
  isSequential,
  moveStage,
  insertStage,
} from "../src/stage-order.ts";

const chain = () => [
  { id: "plan", dependsOn: [], title: "기획", assigneeIds: ["alice"] },
  { id: "design", dependsOn: ["plan"], title: "디자인", assigneeIds: ["bob"] },
  { id: "code", dependsOn: ["design"], title: "개발", assigneeIds: ["carol"] },
];
test("reordering rewires execution dependencies and preserves task content without mutating the draft", () => {
  const original = chain();
  const snapshot = structuredClone(original);
  const next = moveStage(original, 2, 1);
  assert.deepEqual(
    next.map((s) => [s.id, s.dependsOn]),
    [
      ["plan", []],
      ["code", ["plan"]],
      ["design", ["code"]],
    ],
  );
  assert.deepEqual(next[1].assigneeIds, ["carol"]);
  assert.equal(next[1].title, "개발");
  assert.ok(isSequential(next));
  assert.deepEqual(original, snapshot);
});
test("removing a middle or first task reconnects the remaining execution chain", () => {
  assert.deepEqual(
    sequenceStages(chain().filter((s) => s.id !== "design")).map(
      (s) => s.dependsOn,
    ),
    [[], ["plan"]],
  );
  assert.deepEqual(
    sequenceStages(chain().slice(1)).map((s) => s.dependsOn),
    [[], ["design"]],
  );
});
test("parallel and out-of-order existing dependencies are detected before conversion", () => {
  const parallel = chain();
  parallel[2].dependsOn = ["plan"];
  assert.equal(isSequential(parallel), false);
  assert.equal(isSequential([chain()[1], chain()[0], chain()[2]]), false);
  assert.ok(isSequential([]));
  assert.ok(isSequential(moveStage(parallel, 2, 1)));
});
test("invalid or unchanged positions preserve the existing dependency graph", () => {
  const original = chain();
  for (const [from, to] of [
    [0, 0],
    [-1, 1],
    [0, -1],
    [3, 0],
    [0, 3],
  ])
    assert.equal(moveStage(original, from, to), original);
});

test("inserting a task at the start, middle or end reconnects execution without mutating existing tasks", () => {
  for (const at of [0, 1, 3]) {
    const original = chain(),
      snapshot = structuredClone(original);
    const result = insertStage(
      original,
      { id: "new", dependsOn: [], title: "새 업무", assigneeIds: [] },
      at,
    );
    assert.equal(result[at].id, "new");
    assert.ok(isSequential(result));
    assert.deepEqual(original, snapshot);
    assert.equal(result.length, 4);
  }
});
test("appending to an existing parallel graph preserves its existing dependencies", () => {
  const original = chain();
  original[2].dependsOn = ["plan"];
  const result = insertStage(
    original,
    { id: "new", dependsOn: [] },
    original.length,
  );
  assert.deepEqual(result.slice(0, 3), original);
  assert.deepEqual(result[3].dependsOn, ["code"]);
});
