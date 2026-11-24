import { env, pipeline } from '@huggingface/transformers';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type WorkerRequest =
  | { type: 'generate'; messages: ChatMessage[] }
  | { type: 'reset' };

type WorkerResponse =
  | { type: 'status'; status: 'loading' | 'generating' | 'ready'; message: string }
  | { type: 'progress'; progress: number; file?: string }
  | { type: 'response'; text: string }
  | { type: 'error'; message: string };

type TextGenerator = (prompt: string, options: Record<string, unknown>) => Promise<Array<{ generated_text?: string | Array<{ role?: string; content?: string }> }>>;

const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct';
let generatorPromise: Promise<TextGenerator> | null = null;

function post(message: WorkerResponse) {
  self.postMessage(message);
}

async function loadModel(): Promise<TextGenerator> {
  if (generatorPromise) return generatorPromise;

  generatorPromise = (async () => {
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    const onProgress = (event: { status?: string; progress?: number; file?: string }) => {
      if (typeof event.progress === 'number') {
        post({ type: 'progress', progress: Math.max(0, Math.min(100, event.progress)), file: event.file });
      }
    };

    post({ type: 'status', status: 'loading', message: 'Menyiapkan model AI…' });

    // Prefer WebGPU, then fall back to WASM for browsers without working WebGPU.
    if ('gpu' in navigator) {
      try {
        const gpuPipeline = await pipeline('text-generation', MODEL_ID, {
          device: 'webgpu',
          dtype: 'q4',
          progress_callback: onProgress,
        });
        return gpuPipeline as unknown as TextGenerator;
      } catch (gpuError) {
        console.warn('NEXORA: WebGPU unavailable, falling back to WASM.', gpuError);
      }
    }

    const wasmPipeline = await pipeline('text-generation', MODEL_ID, {
      device: 'wasm',
      dtype: 'q4',
      progress_callback: onProgress,
    });
    return wasmPipeline as unknown as TextGenerator;
  })().catch((error) => {
    generatorPromise = null;
    throw error;
  });

  return generatorPromise;
}

function makePrompt(messages: ChatMessage[]) {
  const system = [
    'You are NEXORA AI, a helpful, honest, and thoughtful assistant.',
    'Reply in the same language as the user. If the user writes Indonesian, respond in natural Indonesian.',
    'If you are unsure, say so. Do not invent sources, facts, or actions.',
    'Use clear formatting and concise explanations unless more detail is requested.',
  ].join(' ');

  const recentMessages = messages.slice(-8);
  return [
    `<|im_start|>system\n${system}<|im_end|>`,
    ...recentMessages.map((message) => `<|im_start|>${message.role}\n${message.content}<|im_end|>`),
    '<|im_start|>assistant\n',
  ].join('\n');
}

function getGeneratedText(result: Array<{ generated_text?: string | Array<{ role?: string; content?: string }> }>, prompt: string) {
  const generated = result?.[0]?.generated_text;
  if (typeof generated === 'string') {
    return generated.startsWith(prompt) ? generated.slice(prompt.length).trim() : generated.trim();
  }
  if (Array.isArray(generated)) {
    const lastAssistant = [...generated].reverse().find((item) => item.role === 'assistant');
    return lastAssistant?.content?.trim() ?? '';
  }
  return '';
}

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'reset') {
    generatorPromise = null;
    return;
  }

  try {
    const generator = await loadModel();
    post({ type: 'status', status: 'generating', message: 'NEXORA sedang berpikir…' });
    const prompt = makePrompt(request.messages);
    const result = await generator(prompt, {
      max_new_tokens: 256,
      temperature: 0.7,
      do_sample: true,
      repetition_penalty: 1.08,
      return_full_text: false,
    });
    const text = getGeneratedText(result, prompt);
    if (!text) throw new Error('Model tidak menghasilkan jawaban. Coba kirim pesan lain.');
    post({ type: 'response', text });
    post({ type: 'status', status: 'ready', message: 'Model siap' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Terjadi kesalahan saat menjalankan model.';
    post({ type: 'error', message });
  }
});
