// Shared web media is served by the Vite deployment. Keeping it remote avoids
// placing the same music/videos a second time inside every Android build.
const mediaOrigin = (process.env.EXPO_PUBLIC_MEDIA_BASE_URL ?? "https://ssc-buddy.vercel.app/media").replace(/\/$/, "");
import { musicCovers, musicTracks, videoTracks } from "./generated-media";

export { musicTracks, videoTracks };

export function mediaUrl(folder: "videos" | "music", file: string) {
  return `${mediaOrigin}/${folder}/${encodeURIComponent(file).replace(/%2F/g, "/")}`;
}

export function musicSource(file: string) {
  return mediaUrl("music", file);
}

export function musicCover(file: string) {
  const cover = musicCovers[file];
  return cover ? { uri: `${mediaOrigin}/covers/generated/${encodeURIComponent(cover)}` } : undefined;
}

export function videoSource(file: string) {
  return mediaUrl("videos", file);
}

export const trackTitle = (path: string) => path.split("/").at(-1)?.replace(/\.mp3$/i, "") ?? path;
