import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source=await readFile(new URL('../mobile-tasks/src/domain/practice-history-range.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
const {matchesHistoryTimeRange:matches,HISTORY_TIME_RANGES}=await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const now=new Date(2026,9,24,12);
test('all time retains older and legacy records',()=>{
  assert.ok(matches({date:'2020-01-01'},'all',now));assert.ok(matches({},'all',now));
  assert.equal(HISTORY_TIME_RANGES.length,5);
});
test('today and yesterday use local calendar days',()=>{
  assert.ok(matches({date:'2026-10-24'},'today',now));
  assert.ok(matches({date:'2026-10-23'},'yesterday',now));
  assert.equal(matches({date:'2026-10-23'},'today',now),false);
  assert.ok(matches({createdAt:new Date(2026,9,24,0,1).toISOString()},'today',now));
  assert.ok(matches({date:new Date(2026,9,23,23,59).toISOString()},'yesterday',now));
});
test('last 7 and 30 days include today and their exact lower boundaries',()=>{
  assert.ok(matches({date:'2026-10-18'},'7days',now));
  assert.equal(matches({date:'2026-10-17'},'7days',now),false);
  assert.ok(matches({date:'2026-09-25'},'30days',now));
  assert.equal(matches({date:'2026-09-24'},'30days',now),false);
  assert.equal(matches({date:'2026-10-25'},'30days',now),false);
});
test('recall date is not shifted by a later update timestamp',()=>{
  const record={date:'2026-10-23',createdAt:new Date(2026,9,24,11).toISOString()};
  assert.equal(matches(record,'today',now),false);assert.ok(matches(record,'yesterday',now));
  assert.equal(matches({date:'invalid'},'today',now),false);
});
