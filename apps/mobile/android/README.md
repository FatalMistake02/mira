# Android App

## Setup

Install dependencies:
```bash
npm install # From root
# New dependencies may be added, run this command again to install them
```

## Development

```bash
# Run the dev app
npm run mobile:android # From root
npm run android # In apps/mobile/android
```

## Building

```bash
# Build
npm run mobile:android # From root
npm run android:build # In apps/mobile/android
```

## App Structure

```
apps/mobile/android/
├── android/          # Native Android code
├── src/              # React Native app
├── assets/           # Static assets
└── dist/             # Build output (generated)
```
- [ ] Native module optimization