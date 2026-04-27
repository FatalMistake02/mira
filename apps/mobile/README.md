# Mobile App

## Setup

Install dependencies:
```bash
npm install # From root
# New dependencies may be added, run this command again to install them
```

### Environment Setup

Make sure you have completed the [React Native Environment Setup](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

For iOS development, install CocoaPods dependencies:

```bash
cd apps/mobile/ios
bundle install
bundle exec pod install
```

## Development

```bash
# Run Android (starts Metro and launches Android)
npm run mobile:android      # From root
npm run android              # In apps/mobile

# Run iOS
npm run mobile:ios           # From root
npm run ios                  # In apps/mobile

# Start Metro separately
npm run mobile:start         # From root
npm run start                # In apps/mobile

# Reset Metro cache
npm run mobile:start:reset   # From root
```


## Building

```bash
# Build release APK (from root)
npm run mobile:android:build

# Build in apps/mobile
npm run android:build

# Build iOS release (from root)
npm run mobile:ios:build

# Build in apps/mobile
npm run ios:build

# Run release on device/emulator (from root)
npm run mobile:android:release
npm run mobile:ios:release
```

## App Structure

```
apps/mobile/
├── android/          # Android native code
├── ios/              # iOS native code
├── src/              # React Native source
│   ├── components/   # Reusable components
│   ├── screens/      # Screen components
│   ├── features/     # Feature modules
│   └── ...
├── assets/           # Static files
├── App.tsx           # App entry point
└── index.js          # Bundle entry
```

