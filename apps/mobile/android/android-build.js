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

const result = spawnSync(gradleCmd, [buildType], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status || 0);
