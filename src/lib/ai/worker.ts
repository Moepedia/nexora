
import { env, pipeline } from '@huggingface/transformers';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type WorkerRequest =
  | { type: 'generate'; messages: ChatMessage[] }
  | { type: 'reset' };

type WorkerResponse =
  | { type: 'status'; status: 'loading' | 'generating' | 'ready'; message: string }
  | { type: 'progress'; progress: number; file?: string }
  | { type: 'response'; text: string }
  | { type: 'error'; message: string };

type TextGenerator = (
  prompt: string,
  options: Record<string, unknown>
) => Promise<Array<{
  generated_text?: string | Array<{
    role?: string;
    content?: string;
  }>;
}>>;

const MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct';

let generatorPromise: Promise<TextGenerator> | null = null;
let isGenerating = false;

function post(message: WorkerResponse) {
  self.postMessage(message);
}

async function loadModel(): Promise<TextGenerator> {
  if (generatorPromise) return generatorPromise;

  generatorPromise = (async () => {
    env.allowLocalModels = false;
    env.useBrowserCache = true;

    // Optimasi penggunaan RAM WASM.
    env.backends.onnx.wasm.numThreads = 1;

    const isAndroid = /Android/i.test(navigator.userAgent);

    const onProgress = (event: {
      progress?: number;
      file?: string;
    }) => {
      if (typeof event.progress === 'number') {
        post({
          type: 'progress',
          progress: Math.max(0, Math.min(100, event.progress)),
          file: event.file,
        });
      }
    };

    post({
      type: 'status',
      status: 'loading',
      message: 'Menyiapkan model AI...',
    });

    const gpu = (
      navigator as Navigator & {
        gpu?: {
          requestAdapter: () => Promise<unknown | null>;
        };
      }
    ).gpu;

    // Periksa WebGPU sebelum mengunduh dan memuat model.
    if (gpu) {
      const adapter = await gpu.requestAdapter();

      if (adapter) {
        try {
          const model = await pipeline(
            'text-generation',
            MODEL_ID,
            {
              device: 'webgpu',
              dtype: 'q4',
              progress_callback: onProgress,
            }
          );

          return model as unknown as TextGenerator;
        } catch (error) {
          console.error('NEXORA WebGPU error:', error);

          // Hindari percobaan kedua yang berpotensi
          // memperparah tekanan memori Android.
          if (isAndroid) {
            throw new Error(
              'WebGPU gagal memuat model. Silakan muat ulang halaman dan coba kembali.'
            );
          }

          console.warn('Mencoba fallback WASM...');
        }
      }
    }

    // WASM hanya digunakan jika WebGPU tidak tersedia
    // atau adapter tidak dapat ditemukan.
    const wasmModel = await pipeline(
      'text-generation',
      MODEL_ID,
      {
        device: 'wasm',
        dtype: 'q4',
        progress_callback: onProgress,
      }
    );

    return wasmModel as unknown as TextGenerator;
  })().catch((error) => {
    generatorPromise = null;
    throw error;
  });

  return generatorPromise;
}

function makePrompt(messages: ChatMessage[]) {
  const system = [
    'You are NEXORA AI, a helpful, honest, and thoughtful assistant.',
    'Reply in the same language as the user.',
    'If the user writes Indonesian, respond in natural Indonesian.',
    'If unsure, say so. Do not invent facts.',
    'Use clear formatting and concise explanations.',
  ].join(' ');

  const recentMessages = messages.slice(-6);

  return [
    `<|im_start|>system\n${system}<|im_end|>`,
    ...recentMessages.map(
      (message) =>
        `<|im_start|>${message.role}\n${message.content}<|im_end|>`
    ),
    '<|im_start|>assistant\n',
  ].join('\n');
}

function getGeneratedText(
  result: Array<{
    generated_text?: string | Array<{
      role?: string;
      content?: string;
    }>;
  }>,
  prompt: string
) {
  const generated = result?.[0]?.generated_text;

  if (typeof generated === 'string') {
    return generated.startsWith(prompt)
      ? generated.slice(prompt.length).trim()
      : generated.trim();
  }

  if (Array.isArray(generated)) {
    const lastAssistant = [...generated]
      .reverse()
      .find((item) => item.role === 'assistant');

    return lastAssistant?.content?.trim() ?? '';
  }

  return '';
}

self.addEventListener(
  'message',
  async (event: MessageEvent<WorkerRequest>) => {
    const request = event.data;

    if (request.type === 'reset') {
      if (!isGenerating) {
        generatorPromise = null;
      }
      return;
    }

    if (isGenerating) return;

    isGenerating = true;

    try {
      const generator = await loadModel();

      post({
        type: 'status',
        status: 'generating',
        message: 'NEXORA sedang berpikir...',
      });

      const prompt = makePrompt(request.messages);

      const result = await generator(prompt, {
        max_new_tokens: 128,
        temperature: 0.7,
        do_sample: true,
        repetition_penalty: 1.08,
        return_full_text: false,
      });

      const text = getGeneratedText(result, prompt);

      if (!text) {
        throw new Error(
          'Model tidak menghasilkan jawaban. Coba kirim pesan lain.'
        );
      }

      post({
        type: 'response',
        text,
      });

      post({
        type: 'status',
        status: 'ready',
        message: 'Model siap',
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Terjadi kesalahan saat menjalankan model.';

      post({
        type: 'error',
        message,
      });
    } finally {
      isGenerating = false;
    }
  }
);
