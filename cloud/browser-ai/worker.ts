import { pipeline, env } from "@huggingface/transformers";
env.allowLocalModels = false;
env.backends.onnx.wasm!.numThreads = 1;
type Summarizer = (
  input: string,
  options: Record<string, unknown>,
) => Promise<{ summary_text: string }[]>;
const createPipeline = pipeline as unknown as (
  task: string,
  model: string,
  options: Record<string, unknown>,
) => Promise<Summarizer>;
let summarizer: Summarizer | null = null;
self.onmessage = async (
  event: MessageEvent<{
    sources: { id: string; title: string; text: string }[];
  }>,
) => {
  try {
    if (!summarizer) {
      self.postMessage({
        type: "progress",
        message:
          "Downloading the free AI model. The first run downloads several hundred MB; your browser can cache it.",
      });
      summarizer = await createPipeline(
        "summarization",
        "Xenova/distilbart-cnn-6-6",
        {
          dtype: "q8",
          device: "wasm",
          progress_callback: (progress: any) => {
            if (progress.status === "progress")
              self.postMessage({
                type: "progress",
                message: `Loading model assets: ${Math.round(progress.progress || 0)}% of ${progress.file || "file"}`,
              });
          },
        },
      );
    }
    const summaries = [];
    for (let i = 0; i < event.data.sources.length; i++) {
      const s = event.data.sources[i];
      self.postMessage({
        type: "progress",
        message: `Summarizing source ${i + 1} of ${event.data.sources.length} on your device…`,
      });
      const text = s.text.slice(0, 3200);
      if (text.length < 150) {
        summaries.push({
          id: s.id,
          summary:
            text +
            " (Short source excerpt; insufficient text for a reliable model summary.)",
        });
        continue;
      }
      const result = await summarizer(text, {
        max_new_tokens: 110,
        min_length: 15,
        do_sample: false,
        num_beams: 1,
      });
      summaries.push({
        id: s.id,
        summary: Array.isArray(result)
          ? (result[0] as { summary_text: string }).summary_text
          : (result as { summary_text: string }).summary_text,
      });
    }
    self.postMessage({ type: "complete", summaries });
  } catch (error) {
    self.postMessage({
      type: "error",
      message:
        "The local AI model could not run. Check network access and available memory, or use the free source digest.",
    });
  }
};
