import { createSharedLiveSource } from "./shared-live-source";

// Keep the original query snapshot so each consumer retains its existing ID,
// deletion-merge and normalization rules. No persisted or cross-account cache.
export type PracticeCollectionSnapshot = {
  docs: { id: string; data: () => Record<string, unknown> }[];
};
export const practiceSnapshots = createSharedLiveSource<PracticeCollectionSnapshot>();
