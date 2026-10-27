import { build } from "esbuild";
await build({
  entryPoints: ["lib/monitor-sources.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile: "public/review-collector.mjs",
});
