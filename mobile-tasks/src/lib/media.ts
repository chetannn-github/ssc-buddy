const mediaOrigin = (process.env.EXPO_PUBLIC_MEDIA_BASE_URL ?? "").replace(/\/$/, "");

export const videoTracks = ["reel.mp4", "Video-10122.mp4", "Video-12328.mp4"];
export const musicTracks = [
  "motivation/1. Aarambh.mp3",
  "motivation/13. Dhurandhar - Title Track (From _Dhurandhar_).mp3",
  "motivation/15. Winning Speech.mp3",
  "19. Lakshya.mp3",
  "20. Bismil.mp3",
];

// Static imports make these starter-playlist tracks available offline in Expo Go and native builds.
// Further tracks can be added here in later chunks without changing the player UI.
const bundledMusic: Record<string, number> = {
  "motivation/1. Aarambh.mp3": require("../../assets/music/motivation/1. Aarambh.mp3"),
  "motivation/13. Dhurandhar - Title Track (From _Dhurandhar_).mp3": require("../../assets/music/motivation/13. Dhurandhar - Title Track (From _Dhurandhar_).mp3"),
  "motivation/15. Winning Speech.mp3": require("../../assets/music/motivation/15. Winning Speech.mp3"),
  "19. Lakshya.mp3": require("../../assets/music/19. Lakshya.mp3"),
  "20. Bismil.mp3": require("../../assets/music/20. Bismil.mp3"),
};

const bundledCovers: Record<string, number> = {
  "motivation/1. Aarambh.mp3": require("../../assets/covers/aarambh.jpg"),
  "motivation/13. Dhurandhar - Title Track (From _Dhurandhar_).mp3": require("../../assets/covers/dhurandhar.jpg"),
  "motivation/15. Winning Speech.mp3": require("../../assets/covers/winning-speech.jpg"),
  "19. Lakshya.mp3": require("../../assets/covers/lakshya.jpg"),
  "20. Bismil.mp3": require("../../assets/covers/bismil.jpg"),
};

const bundledVideos: Record<string, number> = {
  "reel.mp4": require("../../assets/videos/reel.mp4"),
  "Video-10122.mp4": require("../../assets/videos/Video-10122.mp4"),
  "Video-12328.mp4": require("../../assets/videos/Video-12328.mp4"),
};

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
