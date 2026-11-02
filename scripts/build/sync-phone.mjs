import "./sync-steward-prompts.mjs";
import { cp, access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Compile the existing app, not a second source copy. Relative asset paths also
// work when MobileGym is hosted under a subpath. No user data is copied/deleted.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const destination = join(root, "mobilegym/public/zhiyin");
await access(join(root, "mobilegym/apps/Zhiyin/manifest.ts"));
const staging = await mkdtemp(join(tmpdir(), "zhiyin-phone-build-"));
const result = spawnSync(process.execPath, [
  join(root, "node_modules/vite/bin/vite.js"), "build", "--base", "./",
  "--outDir", staging,
], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
await cp(staging, destination, { recursive: true });
console.log(`知银已更新到手机：${destination}`);
