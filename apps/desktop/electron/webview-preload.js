/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */
const { ipcRenderer } = require('electron');

const originalAlert = typeof window.alert === 'function' ? window.alert.bind(window) : () => {};
const originalConfirm =
  typeof window.confirm === 'function' ? window.confirm.bind(window) : () => false;
const originalPrompt =
  typeof window.prompt === 'function' ? window.prompt.bind(window) : () => null;

function normalizeDialogMessage(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return String(value);
  } catch {
    return '';
  }
}

window.alert = (message = '') => {
  try {
    ipcRenderer.sendSync('webview-site-dialog-sync', {
      type: 'alert',
      message: normalizeDialogMessage(message),
    });
    return;
  } catch {
    originalAlert(message);
  }
};

window.confirm = (message = '') => {
  try {
    return ipcRenderer.sendSync('webview-site-dialog-sync', {
      type: 'confirm',
      message: normalizeDialogMessage(message),
    }) === true;
  } catch {
    return originalConfirm(message);
  }
};

window.prompt = (message = '', defaultValue = '') => originalPrompt(message, defaultValue);
