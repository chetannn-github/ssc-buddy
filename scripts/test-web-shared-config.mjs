import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, mkdir, writeFile, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { build } from "vite";

const root = new URL("../", import.meta.url);
const domain = new URL("mobile-tasks/src/domain/", root);

async function importedSharedModules(directory) {
  const modules = new Set();
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const url = new URL(item.name + (item.isDirectory() ? "/" : ""), directory);
    if (item.isDirectory()) {
      for (const name of await importedSharedModules(url)) modules.add(name);
    } else if (/\.tsx?$/.test(item.name)) {
      const source = await readFile(url, "utf8");
      for (const match of source.matchAll(/from\s+["'][^"']*mobile-tasks\/src\/domain\/([^"']+)["']/g)) {
        modules.add(match[1]);
      }
    }
  }
  return modules;
}

test("web shared modules build without Expo installed", async () => {
  const modules = await importedSharedModules(new URL("src/", root));
  assert.ok(modules.has("habits"));
  const directory = await mkdtemp(path.join(tmpdir(), "ssc-web-shared-"));
  try {
    const destination = path.join(directory, "mobile-tasks/src/domain");
    await mkdir(destination, { recursive: true });
    // Keep the actual Expo parent config, but deliberately omit mobile node_modules.
    await cp(new URL("mobile-tasks/tsconfig.json", root), path.join(directory, "mobile-tasks/tsconfig.json"));
    for (const file of await readdir(domain)) {
      if (/\.(ts|json)$/.test(file)) await cp(new URL(file, domain), path.join(destination, file));
    }
    // Shared scoring helpers are pure TypeScript too; include their real source.
    await mkdir(path.join(directory, "shared"), { recursive: true });
    await cp(new URL("shared/focus-rewards.ts", root), path.join(directory, "shared/focus-rewards.ts"));
    const entry = path.join(directory, "entry.ts");
    await writeFile(entry, [...modules].map((name, index) =>
      `export * as shared${index} from "./mobile-tasks/src/domain/${name}";`
    ).join("\n"));
    await build({
      configFile: false,
      root: directory,
      logLevel: "silent",
      build: { write: false, minify: false, lib: { entry, formats: ["es"] } },
    });
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.match(path.basename(directory), /^ssc-web-shared-/);
    await rm(directory, { recursive: true, force: true });
  }
});
