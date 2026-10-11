const fs = require("fs");
const path = require("path");

const tracks = [
  ["music/motivation/1. Aarambh.mp3", "aarambh.jpg"],
  ["music/motivation/13. Dhurandhar - Title Track (From _Dhurandhar_).mp3", "dhurandhar.jpg"],
  ["music/motivation/15. Winning Speech.mp3", "winning-speech.jpg"],
  ["music/19. Lakshya.mp3", "lakshya.jpg"],
  ["music/20. Bismil.mp3", "bismil.jpg"],
];

fs.mkdirSync(path.join(__dirname, "..", "assets", "covers"), { recursive: true });

for (const [track, output] of tracks) {
  const source = fs.readFileSync(path.join(__dirname, "..", "assets", track));
  const frameAt = source.indexOf(Buffer.from("APIC"));
  if (frameAt < 0) throw new Error(`No embedded artwork in ${track}`);

  const imageStart = source.indexOf(Buffer.from([0xff, 0xd8]), frameAt);
  const frameSize = source.readUInt32BE(frameAt + 4);
  if (imageStart < 0 || imageStart >= frameAt + 10 + frameSize) {
    throw new Error(`Could not read artwork in ${track}`);
  }

  fs.writeFileSync(
    path.join(__dirname, "..", "assets", "covers", output),
    source.subarray(imageStart, frameAt + 10 + frameSize),
  );
}
