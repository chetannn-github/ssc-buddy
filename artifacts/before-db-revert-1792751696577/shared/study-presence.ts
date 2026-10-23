export const STUDY_HEARTBEAT_MS = 5 * 60000;
// Allow a missed heartbeat without reporting an active browser as disconnected.
export const STUDY_DEVICE_STALE_MS = STUDY_HEARTBEAT_MS * 2 + 60000;
