const mediaOrigin = (process.env.EXPO_PUBLIC_MEDIA_BASE_URL ?? "").replace(/\/$/, "");
import { bundledCovers, bundledMusic, bundledVideos, musicTracks, videoTracks } from "./generated-media";

export { musicTracks, videoTracks };

export function mediaUrl(folder: "videos" | "music", file: string) {
  return `${mediaOrigin}/${folder}/${encodeURIComponent(file).replace(/%2F/g, "/")}`;
}

export function musicSource(file: string) {
  return bundledMusic[file] ?? mediaUrl("music", file);
}

export function musicCover(file: string) {
  return bundledCovers[file];
}

export function videoSource(file: string) {
  return bundledVideos[file] ?? mediaUrl("videos", file);
}

export const trackTitle = (path: string) => path.split("/").at(-1)?.replace(/\.mp3$/i, "") ?? path;
