import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/profile.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const flags = ['practiceSessionEnabled', 'trackProgressEnabled', 'showTrackerOnProfile', 'timersEnabled', 'habitsEnabled', 'randomQuotesEnabled'];

test('every profile toggle persists explicit off and on values for cloud merging and reload', () => {
  const storage = new Map();
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: () => ({ normalizeAppAccent: value => value || '#ffe000' }),
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    window: { dispatchEvent() {} },
    Event: class {},
  });
  for (const flag of flags) {
    const profile = { name: 'Student', questionGoal: 100, username: 'student' };
    exports.savePracticeProfile({ ...profile, [flag]: false });
    assert.equal(exports.loadPracticeProfile()[flag], false);
    const cloud = JSON.parse(storage.get(exports.PROFILE_KEY));
    exports.savePracticeProfile({ ...profile, [flag]: true });
    Object.assign(cloud, JSON.parse(storage.get(exports.PROFILE_KEY)));
    assert.equal(cloud[flag], true, `${flag} must overwrite the previous false value`);
    assert.equal(exports.loadPracticeProfile()[flag], true);
  }
});
