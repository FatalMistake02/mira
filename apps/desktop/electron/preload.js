/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
const { contextBridge, ipcRenderer } = require('electron');
const isMacOS = process.platform === 'darwin';

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  isMacOS,
  ipcRenderer: {
    on: (channel, listener) => ipcRenderer.on(channel, listener),
    off: (channel, listener) => ipcRenderer.removeListener(channel, listener),
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  },
});
