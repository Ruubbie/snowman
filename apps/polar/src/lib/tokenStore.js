// Device pairing token storage: expo-secure-store on native, localStorage
// fallback on web (SecureStore has no web implementation).
import { Platform } from 'react-native';

const KEY = 'polar.token';
const SERVER_KEY = 'polar.serverUrl';
const CONVERSATION_KEY = 'polar.olafConversation';

function web() {
  return {
    async getToken() {
      try {
        return globalThis.localStorage?.getItem(KEY) || null;
      } catch {
        return null;
      }
    },
    async setToken(token) {
      try {
        if (token) globalThis.localStorage?.setItem(KEY, token);
        else globalThis.localStorage?.removeItem(KEY);
      } catch {
        // ignore
      }
    },
    async getServerUrl() {
      try {
        return globalThis.localStorage?.getItem(SERVER_KEY) || null;
      } catch {
        return null;
      }
    },
    async setServerUrl(url) {
      try {
        if (url) globalThis.localStorage?.setItem(SERVER_KEY, url);
        else globalThis.localStorage?.removeItem(SERVER_KEY);
      } catch {
        // ignore
      }
    },
    async getConversationId() {
      try {
        return globalThis.localStorage?.getItem(CONVERSATION_KEY) || null;
      } catch {
        return null;
      }
    },
    async setConversationId(id) {
      try {
        if (id) globalThis.localStorage?.setItem(CONVERSATION_KEY, id);
        else globalThis.localStorage?.removeItem(CONVERSATION_KEY);
      } catch {
        // ignore
      }
    },
  };
}

function native() {
  const SecureStore = require('expo-secure-store');
  return {
    async getToken() {
      return SecureStore.getItemAsync(KEY);
    },
    async setToken(token) {
      if (token) await SecureStore.setItemAsync(KEY, token);
      else await SecureStore.deleteItemAsync(KEY);
    },
    async getServerUrl() {
      return SecureStore.getItemAsync(SERVER_KEY);
    },
    async setServerUrl(url) {
      if (url) await SecureStore.setItemAsync(SERVER_KEY, url);
      else await SecureStore.deleteItemAsync(SERVER_KEY);
    },
    /** The chat with Olaf to pick up again next time. */
    async getConversationId() {
      return SecureStore.getItemAsync(CONVERSATION_KEY);
    },
    async setConversationId(id) {
      if (id) await SecureStore.setItemAsync(CONVERSATION_KEY, id);
      else await SecureStore.deleteItemAsync(CONVERSATION_KEY);
    },
  };
}

export const tokenStore = Platform.OS === 'web' ? web() : native();
export default tokenStore;
