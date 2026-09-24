// Persists the upload queue as JSON: expo-file-system on native, localStorage
// on web (expo-file-system's legacy API isn't implemented there).
import { Platform } from 'react-native';

const FILE_NAME = 'polar-upload-queue.json';
const LS_KEY = 'polar.uploadQueue';

function webStorage() {
  return {
    async load() {
      try {
        const raw = globalThis.localStorage?.getItem(LS_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    },
    async save(items) {
      try {
        globalThis.localStorage?.setItem(LS_KEY, JSON.stringify(items));
      } catch {
        // best-effort - e.g. private browsing quota
      }
    },
  };
}

function nativeStorage() {
  // Lazy-require so this file stays importable on web without the native module.
  const FileSystem = require('expo-file-system');
  const uri = `${FileSystem.documentDirectory}${FILE_NAME}`;
  return {
    async load() {
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists) return [];
        const raw = await FileSystem.readAsStringAsync(uri);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    },
    async save(items) {
      try {
        await FileSystem.writeAsStringAsync(uri, JSON.stringify(items));
      } catch {
        // best-effort
      }
    },
  };
}

export function createDefaultStorage() {
  return Platform.OS === 'web' ? webStorage() : nativeStorage();
}

export default { createDefaultStorage };
