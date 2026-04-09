#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isWindows = os.platform() === 'win32';
const gradleCmd = isWindows ? 'gradlew.bat' : './gradlew';
const buildType = process.argv[2] || 'assembleRelease';
const androidDir = path.join(__dirname, 'android');

console.log(`Running gradle command: ${gradleCmd} ${buildType}`);
console.log(`Working directory: ${androidDir}`);

const result = spawnSync(gradleCmd, [buildType], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: true,
});

if (result.error) {
  console.error('Failed to run gradle. Make sure Java is installed:');
  console.error('  java -version');
  process.exit(1);
}

process.exit(result.status || 0);
