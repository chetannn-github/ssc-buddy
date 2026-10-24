export type FocusPermission = "usage" | "overlay" | "notifications" | "admin";
export type FocusAccess = {
  enabled?: boolean;
  usageAccess?: boolean;
  overlayAccess?: boolean;
  notificationSilenceSupported?: boolean;
  notificationAccess?: boolean;
  adminAccess?: boolean;
};

export class FocusPermissionsRequired extends Error {
  readonly missing: FocusPermission[];
  constructor(missing: FocusPermission[]) {
    super("Complete Focus Lock setup before starting.");
    this.missing = missing;
  }
}

export function missingFocusPermissions(access: FocusAccess): FocusPermission[] {
  const missing: FocusPermission[] = [];
  if (access.usageAccess !== true) missing.push("usage");
  if (access.overlayAccess !== true) missing.push("overlay");
  // Skip only when native explicitly reports this feature unsupported on the OS.
  if (access.notificationSilenceSupported !== false && access.notificationAccess !== true) missing.push("notifications");
  if (access.adminAccess !== true) missing.push("admin");
  return missing;
}

export function hasRequiredFocusAccess(access: FocusAccess): boolean {
  return access.enabled === true && missingFocusPermissions(access).length === 0;
}

/** Used by Android manual starts, never scheduled starts. */
export async function withManualFocusAccess<T>(readAccess: () => Promise<FocusAccess>, start: () => Promise<T>): Promise<T> {
  const access = await readAccess();
  const missing = missingFocusPermissions(access);
  if (missing.length) throw new FocusPermissionsRequired(missing);
  if (access.enabled !== true) throw new Error("Could not verify app blocking. Reopen Focus setup and try again.");
  return start();
}
