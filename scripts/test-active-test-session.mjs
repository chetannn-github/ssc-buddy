import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function loadModule(path, dependencies = {}, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require: (name) => {
      if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
      return dependencies[name];
    },
    ...globals,
  });
  return exports;
}

const domain = await loadModule("../mobile-tasks/src/domain/active-test-session.ts");
const progress = {
  version: 1,
  platform: "web",
  id: "test-123",
  payload: {
    config: {
      minutes: 30,
      questionCount: 2,
      marking: { positive: 2, negative: 0.5 },
      subject: "Maths",
      chapter: "Algebra",
      questions: [{ id: "q2" }, { id: "q1" }],
    },
    answerKey: ["B", "A"],
    replay: null,
  },
  states: [
    { answer: "B", visited: true, marked: true },
    { answer: null, visited: true, marked: false },
  ],
  current: 1,
  remaining: 121,
};

test("web reload preserves shuffled paper, answers, review flags and paused time", async () => {
  const store = new Map();
  const storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  const deps = { "../../mobile-tasks/src/domain/active-test-session": domain };
  const first = await loadModule("../src/lib/active-test.ts", deps, { localStorage: storage });
  first.saveActiveTest(progress);
  // A fresh module instance represents a new page; no elapsed wall time is deducted.
  const reopened = await loadModule("../src/lib/active-test.ts", deps, {
    localStorage: storage,
    Date: { now: () => 9999999999999 },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(reopened.loadActiveTest())), progress);
  reopened.clearActiveTest();
  assert.equal(reopened.loadActiveTest(), null);
});

test("malformed, incompatible and out-of-range checkpoints cannot restore", () => {
  for (const raw of [
    null,
    "{",
    "null",
    JSON.stringify({ ...progress, version: 2 }),
    JSON.stringify({ ...progress, platform: "mobile" }),
    JSON.stringify({ ...progress, remaining: -1 }),
    JSON.stringify({ ...progress, current: 2 }),
    JSON.stringify({ ...progress, states: [{ answer: "E", marked: false, visited: true }] }),
  ]) {
    assert.equal(domain.parseActiveTestSession(raw, "web"), null);
  }
  assert.equal(
    domain.parseActiveTestSession(JSON.stringify({ ...progress, remaining: 0 }), "web").remaining,
    0,
  );
});

test("mobile queues checkpoints before cleanup; slow writes cannot resurrect submitted tests", async () => {
  const store = new Map();
  const writes = [];
  const storage = {
    getItem: async (key) => store.get(key) ?? null,
    setItem: async (key, raw) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      writes.push(JSON.parse(raw).remaining);
      store.set(key, raw);
    },
    removeItem: async (key) => {
      writes.push("removed");
      store.delete(key);
    },
  };
  const mobile = await loadModule("../mobile-tasks/src/lib/active-test.ts", {
    "@react-native-async-storage/async-storage": { default: storage },
    "../domain/active-test-session": domain,
  });
  const session = {
    ...progress,
    platform: "mobile",
    payload: {
      ownerId: null,
      activeTest: {
        duration: 30,
        marking: { positive: 2, negative: 0.5 },
        questions: progress.payload.config.questions,
      },
      answerKey: ["B", "A"],
      reattemptOf: "first-attempt",
    },
  };
  await mobile.saveActiveTest(session);
  assert.deepEqual(JSON.parse(JSON.stringify(await mobile.loadActiveTest())), session);
  store.set("ssc-buddy:local-cache-owner:v1", "different-account");
  assert.equal(await mobile.loadActiveTest(), null);
  store.delete("ssc-buddy:local-cache-owner:v1");
  const a = mobile.saveActiveTest({ ...session, remaining: 120 });
  const b = mobile.saveActiveTest({ ...session, remaining: 119 });
  const clear = mobile.clearActiveTest();
  await Promise.all([a, b, clear]);
  assert.deepEqual(writes, [121, 120, 119, "removed"]);
  assert.equal(await mobile.loadActiveTest(), null);
});
