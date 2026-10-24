import assert from 'node:assert/strict';
import test from 'node:test';
import { FocusPermissionsRequired, withManualFocusAccess, hasRequiredFocusAccess, missingFocusPermissions } from '../mobile-tasks/src/domain/focus-permissions.ts';

const granted = { enabled: true, usageAccess: true, overlayAccess: true,
  notificationSilenceSupported: true, notificationAccess: true, adminAccess: true };

test('post-login gate requires all permissions and detects a later revocation', () => {
  assert.equal(hasRequiredFocusAccess({}), false);
  assert.equal(hasRequiredFocusAccess(granted), true);
  for (const field of ['usageAccess', 'overlayAccess', 'notificationAccess', 'adminAccess']) {
    assert.equal(hasRequiredFocusAccess({ ...granted, [field]: false }), false);
  }
  assert.equal(hasRequiredFocusAccess({ ...granted, enabled: false }), false);
  assert.deepEqual(missingFocusPermissions({}), ['usage', 'overlay', 'notifications', 'admin']);
});

test('manual focus starts once only after all native permissions are verified', async () => {
  const calls = [];
  const result = await withManualFocusAccess(async () => { calls.push('native'); return granted; }, async () => { calls.push('session'); return 'started'; });
  assert.equal(result, 'started');
  assert.deepEqual(calls, ['native', 'session']);
});

test('each denied or revoked permission prevents session creation', async () => {
  for (const [field, id] of [['usageAccess', 'usage'], ['overlayAccess', 'overlay'], ['notificationAccess', 'notifications'], ['adminAccess', 'admin']]) {
    let starts = 0;
    await assert.rejects(withManualFocusAccess(async () => ({ ...granted, [field]: false }), async () => { starts++; }),
      error => error instanceof FocusPermissionsRequired && error.missing.includes(id));
    assert.equal(starts, 0);
  }
});

test('all missing permissions are reported in setup order and unknown native status fails closed', async () => {
  await assert.rejects(withManualFocusAccess(async () => ({}), async () => assert.fail('Must not start')),
    error => error instanceof FocusPermissionsRequired && error.missing.join(',') === 'usage,overlay,notifications,admin');
  await assert.rejects(withManualFocusAccess(async () => { throw Error('native unavailable'); }, async () => assert.fail('Must not start')), /native unavailable/);
  await assert.rejects(withManualFocusAccess(async () => ({ ...granted, enabled: false }), async () => assert.fail('Must not start')), /Could not verify/);
});

test('unsupported notification-policy feature is skipped only with an explicit native report', async () => {
  assert.equal(await withManualFocusAccess(async () => ({ ...granted, notificationSilenceSupported: false, notificationAccess: false }), async () => 'started'), 'started');
  await assert.rejects(withManualFocusAccess(async () => ({ ...granted, notificationSilenceSupported: undefined, notificationAccess: undefined }), async () => assert.fail('Must not start')), FocusPermissionsRequired);
});

test('permission revocation between starts is rechecked rather than cached', async () => {
  let access = granted;
  let starts = 0;
  const start = () => withManualFocusAccess(async () => access, async () => ++starts);
  assert.equal(await start(), 1);
  access = { ...granted, adminAccess: false };
  await assert.rejects(start(), FocusPermissionsRequired);
  assert.equal(starts, 1);
});
