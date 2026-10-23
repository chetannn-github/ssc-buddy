import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Exercise the screen's actual save handler with storage and account sync mocked.
const source = await readFile(new URL('../mobile-tasks/src/screens/PracticeScreen.tsx', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('  const saveBank = '), source.indexOf('  const saveHistory = '));
const code = ts.transpileModule(handler, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
async function save({ signedIn = true, marking = { positive: 2, negative: 0.5 } } = {}) {
  const writes = [], patches = [], subjects = [];
  const initial = { subjects: [{ id: 'maths' }], marking: { positive: 4, negative: 1 } };
  const bankRef = { current: initial };
  const user = signedIn ? { uid: 'alice' } : null;
  const dependencies = {
    bankRef, user, setBank: () => {}, applyQuestionDeletions: value => value, normaliseMarking: value => value,
    AsyncStorage: { setItem: async (key, value) => { writes.push([key, JSON.parse(value)]); } },
    STORE: 'subjects', MARKING: 'cbt-marking', toCloudSubjects: value => value,
    syncPracticeEntities: async (...args) => { subjects.push(args); },
    patchPracticeSettings: async (...args) => { patches.push(args); },
  };
  const saveBank = new Function(...Object.keys(dependencies), `${code}; return saveBank;`)(...Object.values(dependencies));
  await saveBank({ ...initial, marking });
  return { writes, patches, subjects, user, bankRef };
}
test('changed marking saves locally and to the same account settings used by web', async () => {
  const result = await save();
  assert.deepEqual(result.writes.find(([key]) => key === 'cbt-marking')[1], { positive: 2, negative: 0.5 });
  assert.deepEqual(result.patches, [[result.user, { marking: { positive: 2, negative: 0.5 } }]]);
  assert.equal(result.subjects.length, 1);
  assert.deepEqual(result.subjects[0].slice(2), [[{ id: 'maths' }], [{ id: 'maths' }]]);
});
test('unchanged marking does not generate settings writes during other bank edits', async () => {
  assert.equal((await save({ marking: { positive: 4, negative: 1 } })).patches.length, 0);
});
test('guest marking persists on the phone without account operations', async () => {
  const result = await save({ signedIn: false });
  assert.equal(result.patches.length, 0);
  assert.equal(result.subjects.length, 0);
  assert.equal(result.bankRef.current.marking.negative, 0.5);
  assert.ok(result.writes.some(([key]) => key === 'cbt-marking'));
});
