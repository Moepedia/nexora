# NEXORA AI — Stage 2

Public, browser-first AI chat starter. The language model runs on each visitor's device; Vercel hosts the web app and does not run inference.

## Stack
- Next.js 15.5.29
- React 19
- Transformers.js 3.8.1
- `onnx-community/Qwen2.5-0.5B-Instruct` (Apache-2.0 model card)
- WebGPU preferred, WASM fallback
- Browser cache for model assets; localStorage for conversation history

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Build

```bash
npm run build
```

## Model behavior
- The model is loaded in a Web Worker after the first message, not during initial page load.
- The first model download is large (hundreds of MB; exact assets depend on runtime and quantization). It requires an internet connection.
- The browser attempts WebGPU first and falls back to WASM if WebGPU initialization fails.
- Subsequent visits may reuse browser cache. Browser storage can be cleared or evicted, so caching is not guaranteed forever.
- Inference runs locally. Prompts are sent to the model files host only as asset downloads; chat prompts are not sent to a hosted inference API.
- Performance and compatibility vary by device/browser. Low-memory phones may fail to load this model.

## Current scope
Implemented: local model inference, chat history in localStorage, guest access.
Not implemented yet: accounts/sync, durable memory, web search, file parsing, code execution, abuse prevention and advanced model selection.

## Deploy to Vercel
1. Commit and push this project to GitHub.
2. Import the repository in Vercel as a Next.js project.
3. Deploy with the default build command (`npm run build`).
4. Test the deployed site in a WebGPU-capable browser and a WASM fallback browser.

The Vercel deployment serves static/app assets only. Each visitor downloads model assets and performs inference on their own device.
