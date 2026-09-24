import { createContext, useContext } from 'react';

/** {state (bridge state), client (SDK), refresh(), setTheme(t), unpair()} */
export const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}
