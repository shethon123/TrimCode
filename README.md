# Trim Code

Injector barcode scanner desktop utility built with Electron + Vite + React.

## Prerequisites

- Node.js 18 or newer
- npm

## Install

```bash
npm install
```

## Development

Start the app with hot-reload:

```bash
npm run dev
```

This opens the Electron window. Changes to JSX or CSS reload automatically.

## Production Build

```bash
npm run build
```

Bundles everything into `out/`. Then launch the built app:

```bash
npm run preview
```

## Tests

```bash
npm test
```

## Saved Files

Files are saved to `~/Documents/trimcodes/` as plain text.

Filename format: `{COMPANY}{REFID}.txt`
Example: company `ABC`, ref `123` → `ABC123.txt`

File format:
```
[04-20-2026 12:33 PM]
1 CODE-ONE
2 CODE-TWO
```
