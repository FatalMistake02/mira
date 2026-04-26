import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MiraApp from './src/MiraApp';

export default function App() {
  return (
    <SafeAreaProvider>
      <MiraApp />
    </SafeAreaProvider>
  );
}
