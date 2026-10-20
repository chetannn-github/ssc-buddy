export const musicPlaylistName = (track: string) => decodeURIComponent(track).split("/").slice(0, -1).join(" / ") || "Music";

/** Keep the liked-first session order, but never cross into another playlist. */
export function musicQueueFor(orderedTracks: readonly string[], selected: string) {
  const tracks = orderedTracks.filter((track) => musicPlaylistName(track) === musicPlaylistName(selected));
  const index = tracks.indexOf(selected);
  return index < 0 ? null : { tracks, index };
}

/** Reopening from a notification must not restart an already playing track. */
export function initialMusicSelection(orderedTracks: readonly string[], playingId: string | null) {
  if (playingId && orderedTracks.includes(playingId)) return { track: playingId, restore: true };
  return { track: orderedTracks[0], restore: false };
}
