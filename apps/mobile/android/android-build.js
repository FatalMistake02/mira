#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');
const os = require('os');

const isWindows = os.platform() === 'win32';
const gradleCmd = isWindows ? 'gradlew.bat' : './gradlew';
const buildType = process.argv[2] || 'assembleRelease';

const result = spawnSync(gradleCmd, [buildType], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true,
});

process.exit(result.status || 0);
