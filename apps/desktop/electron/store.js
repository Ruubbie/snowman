// Local settings + the device token, in Electron's userData folder.
//
// The token is encrypted with safeStorage (DPAPI on Windows, Keychain on
// macOS, libsecret on Linux) and never leaves the main process: the renderer
// only ever sees "paired: true". If encryption is unavailable the token is
// kept in memory for this session only - never written in plain text.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_CONFIG = { serverUrl: null, deviceId: null, deviceName: null, pairedAt: null, theme: 'system' };

function createStore(dir, safeStorage) {
  const configPath = path.join(dir, 'snowman-config.json');
  const tokenPath = path.join(dir, 'snowman-device-token.bin');
  let memoryToken = null;

  function readConfig() {
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  let config = readConfig();

  function writeConfig(next) {
    config = { ...config, ...next };
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return config;
  }

  return {
    getConfig: () => ({ ...config }),
    setConfig: writeConfig,

    canEncrypt: () => safeStorage.isEncryptionAvailable(),

    getToken() {
      if (memoryToken) return memoryToken;
      if (!fs.existsSync(tokenPath) || !safeStorage.isEncryptionAvailable()) return null;
      try {
        memoryToken = safeStorage.decryptString(fs.readFileSync(tokenPath));
        return memoryToken;
      } catch {
        return null;
      }
    },

    /** @returns {{persisted: boolean}} */
    setToken(token) {
      memoryToken = token;
      if (!safeStorage.isEncryptionAvailable()) return { persisted: false };
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(tokenPath, safeStorage.encryptString(token), { mode: 0o600 });
      return { persisted: true };
    },

    tokenPersisted: () => fs.existsSync(tokenPath),

    /** Forget the pairing (keeps the theme). */
    clearPairing() {
      memoryToken = null;
      try {
        fs.rmSync(tokenPath, { force: true });
      } catch {
        // already gone
      }
      writeConfig({ serverUrl: null, deviceId: null, deviceName: null, pairedAt: null });
    },
  };
}

module.exports = { createStore };
