import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
const { syncLaunchImages } = createRequire(import.meta.url)("../mobile-tasks/scripts/launch-image-assets.cjs");

function fixture(run) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ssc-launch-assets-"));
  try {
    const shared = path.join(temp, "public", "avatars");
    const project = path.join(temp, "mobile-tasks");
    fs.mkdirSync(shared, { recursive: true });
    fs.mkdirSync(project, { recursive: true });
    run({ temp, shared, project });
  } finally {
    const resolved = path.resolve(temp);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith("ssc-launch-assets-"));
    fs.rmSync(resolved, { recursive: true });
  }
}
test("new shared images are copied and statically required by the app", () => fixture(({ shared, project }) => {
  fs.writeFileSync(path.join(shared, "new quote.jpeg"), "image");
  fs.writeFileSync(path.join(shared, "manifest.json"), "[]");
  assert.deepEqual(syncLaunchImages(project), ["new quote.jpeg"]);
  assert.equal(fs.readFileSync(path.join(project, "assets/avatars/new quote.jpeg"), "utf8"), "image");
  assert.match(fs.readFileSync(path.join(project, "src/lib/launch-images.ts"), "utf8"), /require\("..\/..\/assets\/avatars\/new quote.jpeg"\)/);
}));
test("deleted shared images are excluded and EAS mobile-only archives retain the exact list", () => fixture(({ temp, shared, project }) => {
  fs.writeFileSync(path.join(shared, "old.jpg"), "old");
  fs.writeFileSync(path.join(shared, "keep.webp"), "keep");
  syncLaunchImages(project);
  fs.unlinkSync(path.join(shared, "old.jpg"));
  assert.deepEqual(syncLaunchImages(project), ["keep.webp"]);
  const archive = path.join(temp, "archive", "mobile-tasks");
  fs.mkdirSync(path.join(archive, "assets", "avatars"), { recursive: true });
  for (const file of fs.readdirSync(path.join(project, "assets", "avatars")))
    fs.copyFileSync(path.join(project, "assets", "avatars", file), path.join(archive, "assets", "avatars", file));
  assert.deepEqual(syncLaunchImages(archive), ["keep.webp"]);
  assert.doesNotMatch(fs.readFileSync(path.join(archive, "src/lib/launch-images.ts"), "utf8"), /old.jpg/);
}));
test("empty image directories produce a safe bundled default", () => fixture(({ project }) => {
  assert.deepEqual(syncLaunchImages(project), []);
  assert.match(fs.readFileSync(path.join(project, "src/lib/launch-images.ts"), "utf8"), /assets\/auth.jpg/);
}));
