import { useSyncExternalStore } from 'react';

/** Cómo quiere ver cada quien, en este dispositivo, los eventos diocesanos (son solo indicativos). */
export interface PrefDiocesanos {
  ocultarTodos: boolean;
  ocultos: string[]; // ids de eventos que esta persona ignoró
}

const CLAVE = 'diocesanos';
const VACIO: PrefDiocesanos = { ocultarTodos: false, ocultos: [] };

let actual: PrefDiocesanos | null = null;
const oyentes = new Set<() => void>();

function leer(): PrefDiocesanos {
  if (actual) return actual;
  try {
    const crudo = localStorage.getItem(CLAVE);
    actual = crudo ? { ...VACIO, ...(JSON.parse(crudo) as Partial<PrefDiocesanos>) } : VACIO;
  } catch {
    actual = VACIO; // sin almacenamiento: se usa lo predeterminado
  }
  return actual;
}

function guardar(p: PrefDiocesanos) {
  actual = p;
  try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch { /* sin almacenamiento */ }
  oyentes.forEach((f) => f());
}

const suscribir = (f: () => void) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};

export const usePrefDiocesanos = () => useSyncExternalStore(suscribir, leer);

export const ocultarTodosDiocesanos = (valor: boolean) => guardar({ ...leer(), ocultarTodos: valor });
export const ocultarDiocesano = (id: string) =>
  guardar({ ...leer(), ocultos: [...new Set([...leer().ocultos, id])] });
export const mostrarDiocesano = (id: string) =>
  guardar({ ...leer(), ocultos: leer().ocultos.filter((x) => x !== id) });
