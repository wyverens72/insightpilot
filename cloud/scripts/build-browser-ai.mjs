import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";
const source = (
  await readFile(new URL("../browser-ai/worker.ts", import.meta.url), "utf8")
).replace(
  "from '@huggingface/transformers'",
  "from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js'",
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
});
await writeFile(
  new URL("../public/browser-ai-worker.js", import.meta.url),
  output.outputText,
);
