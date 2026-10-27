export type Evidence = {
  id: string;
  title: string;
  text: string;
  url: string;
  kind: string;
  status: string;
};
export function summarizeOnDevice(
  sources: Evidence[],
  progress: (message: string) => void,
  signal?: AbortSignal,
): Promise<{ id: string; summary: string }[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker("/browser-ai-worker.js", { type: "module" });
    const stop = () => {
      worker.terminate();
      reject(
        new Error("Local AI was canceled. Your collected sources are saved."),
      );
    };
    signal?.addEventListener("abort", stop, { once: true });
    const finish = () => {
      worker.terminate();
      signal?.removeEventListener("abort", stop);
    };
    worker.onmessage = (event) => {
      if (event.data.type === "progress") progress(event.data.message);
      if (event.data.type === "complete") {
        finish();
        resolve(event.data.summaries);
      }
      if (event.data.type === "error") {
        finish();
        reject(new Error(event.data.message));
      }
    };
    worker.onerror = () => {
      finish();
      reject(
        new Error(
          "Your browser could not start the AI worker. Try a current desktop browser, or use the source digest.",
        ),
      );
    };
    worker.postMessage({ sources });
  });
}
