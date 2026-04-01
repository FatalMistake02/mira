/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
const { contextBridge, ipcRenderer } = require('electron');
const isMacOS = process.platform === 'darwin';
const appVersion = process.env.MIRA_VERSION || null;

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  isMacOS,
  appVersion,
  getAppVersion: () => ipcRenderer.invoke('app-get-version'),
  ipcRenderer: {
    on: (channel, listener) => ipcRenderer.on(channel, listener),
    off: (channel, listener) => ipcRenderer.removeListener(channel, listener),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  },
});

contextBridge.exposeInMainWorld('mira', {
  version: appVersion,
  getVersion: () => ipcRenderer.invoke('app-get-version'),
});
