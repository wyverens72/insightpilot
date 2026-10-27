import { build } from "esbuild";
import { spawnSync } from "node:child_process";
await build({
  entryPoints: [
    "lib/service.ts",
    "lib/research.ts",
    "lib/analysis.ts",
    "lib/monitor-service.ts",
    "lib/monitor-analysis.ts",
    "lib/monitor-sources.ts",
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: "work/tests",
});
const result = spawnSync(
  process.execPath,
  ["--test", "tests/cloud.test.mjs", "tests/monitor.test.mjs"],
  {
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
