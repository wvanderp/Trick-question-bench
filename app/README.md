# Trick Question Bench Visualizer App

Self-contained Vite + React app for browsing benchmark outputs.

## What it does

- Precomputes visualization stats from `../output/**/*.json` (excluding `summary.json`)
- Generates `public/generated/benchmark-data.json`
- Shows aggregate stats and simple visual charts
- Lets you filter and inspect prompt, model answer, and judge explanation per result

## Run locally

```bash
cd app
npm install
npm run dev
```

## Build

```bash
cd app
npm run build
```

`npm run build` runs the precompute step first, then builds the Vite site.
