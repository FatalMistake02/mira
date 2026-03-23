# Desktop App

## Setup

Install dependencies:
```bash
npm install # From root
# New dependencies may be added, run this command again to install them
```

## Development

```bash
# Run the dev app
npm run desktop:dev # From root
npm run dev # In apps/desktop
```

## Building

```bash
# Build
npm run desktop:build # From root
npm run build # In apps/desktop
```

## App Structure

```
apps/desktop/
├── electron/         # Main process code
├── src/              # Renderer process (React)
├── assets/           # Icons and static files
├── dist/             # Build output (generated)
└── release/          # Packaged apps (generated)
```
