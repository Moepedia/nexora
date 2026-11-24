# NEXORA AI — Stage 1 Starter

A public, local-first AI web app foundation built with Next.js App Router.

## Current stage

- Responsive desktop and mobile chat interface
- Guest-first entry point; sign-in is an optional placeholder
- New conversation and conversation switching
- Local conversation persistence using browser localStorage
- Starter prompt cards
- Clear preview notice: no AI model is connected yet

## Requirements

- Node.js 20.9 or newer
- npm

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Build check

```bash
npm run build
```

## Deploy to Vercel

1. Push this project to a GitHub repository.
2. Import the repository at https://vercel.com/new.
3. Keep the framework preset as Next.js.
4. Deploy. No environment variables are needed for this UI-only stage.

## Important architecture notes

- This stage is the UI and local conversation foundation only. It does not generate AI answers yet.
- Conversations are stored in the current browser's localStorage. They do not sync between devices and can be lost if browser site data is cleared.
- The AI engine will be added in Stage 2 using an in-browser open model runtime. Model files should be fetched from a model host/CDN rather than bundled into the Vercel deployment.
- Optional accounts and cross-device sync are planned for a later stage. A hosted database/auth provider may have free-tier limits.
- Public web search cannot be guaranteed unlimited and free. We will keep it as a replaceable adapter and evaluate providers before enabling it.

## Project structure

```text
src/
  app/
    globals.css
    layout.tsx
    page.tsx
```
