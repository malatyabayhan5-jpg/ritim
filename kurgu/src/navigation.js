// Basit yığın gezinmesi. Ekranlar bağımlılık eklemeden yönetilir; Android geri
// tuşu yığından bir ekran çıkarır. Ekran durumu (açık proje dahil) dil
// değişiminde korunur, çünkü yığın kök bileşenin üstünde tutulur.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

const NavContext = createContext(null);

export function NavigationProvider({ initial = { name: 'home' }, children }) {
  const [stack, setStack] = useState([initial]);
  const backHandlers = useRef([]);

  const push = useCallback((name, params) => setStack((s) => [...s, { name, params, key: `${name}_${Date.now()}` }]), []);
  const pop = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const replace = useCallback((name, params) => setStack((s) => [...s.slice(0, -1), { name, params, key: `${name}_${Date.now()}` }]), []);
  const reset = useCallback((name, params) => setStack([{ name, params, key: `${name}_${Date.now()}` }]), []);

  // Ekranlar kendi geri davranışını kaydedebilir (ör. açık paneli kapatmak).
  const addBackHandler = useCallback((fn) => {
    backHandlers.current.push(fn);
    return () => {
      backHandlers.current = backHandlers.current.filter((h) => h !== fn);
    };
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      for (let i = backHandlers.current.length - 1; i >= 0; i--) {
        if (backHandlers.current[i]()) return true;
      }
      if (stack.length > 1) {
        pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, pop]);

  const value = useMemo(() => ({ stack, route: stack[stack.length - 1], push, pop, replace, reset, addBackHandler }), [stack, push, pop, replace, reset, addBackHandler]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav() {
  return useContext(NavContext);
}

/** Ekran açıkken donanım geri tuşunu yakalar; true dönerse olay tüketilir. */
export function useBackHandler(fn, deps = []) {
  const { addBackHandler } = useNav();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => addBackHandler(fn), deps);
}
