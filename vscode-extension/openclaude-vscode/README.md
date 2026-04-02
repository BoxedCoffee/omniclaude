# OpenClaude VS Code Extension

A sleek, terminal-first VS Code companion for OpenClaude.

## Features

- **Launch OpenClaude instantly** in the integrated terminal via `OpenClaude: Launch in Terminal`
- **Open repository/docs quickly** via `OpenClaude: Open Repository`
- **Built-in dark theme**: `OpenClaude Terminal Black` (terminal-inspired, low-glare, neon accents)

## Requirements

- VS Code `1.95+`
- `openclaude` available in your terminal PATH (`npm install -g @gitlawb/openclaude`)

## Commands

- `OpenClaude: Launch in Terminal`
- `OpenClaude: Open Repository`

## Settings

- `openclaude.launchCommand` (default: `openclaude`)
- `openclaude.terminalName` (default: `OpenClaude`)
- `openclaude.useOpenAIShim` (default: `true`)

## Development

From this folder:

```bash
npm run lint
```

To package (optional):

```bash
npm run package
```

