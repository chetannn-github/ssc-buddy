import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestClockAngle } from '../shared/clock-motion.ts';

test('clock hand takes the short arc across 12/00 in both directions',()=>{
  assert.equal(nearestClockAngle(330,0),360);
  assert.equal(nearestClockAngle(360,330),330);
  assert.equal(nearestClockAngle(354,0),360);
  assert.equal(nearestClockAngle(0,354),-6);
});
test('retargeting from a partly rotated hand never adds a full revolution',()=>{
  for(const current of [-1085,-1,0,35,179,355,730,1085])for(const target of [0,6,30,150,180,210,330,354]){
    const next=nearestClockAngle(current,target);
    assert.ok(Math.abs(next-current)<=180);
    assert.equal(((next%360)+360)%360,target);
  }
  assert.equal(nearestClockAngle(30,210),210);
});
test('invalid temporary input does not rotate the needle to NaN',()=>{
  assert.equal(nearestClockAngle(45,NaN),45);
  assert.equal(nearestClockAngle(NaN,30),30);
});
