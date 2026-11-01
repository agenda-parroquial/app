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

// ---------- Vista de la agenda: detallada (la de siempre) o compacta (solo horario y evento) ----------
const CLAVE_VISTA = 'vistaCompacta';
let vistaActual: boolean | null = null;
const oyentesVista = new Set<() => void>();

function leerVista(): boolean {
  if (vistaActual !== null) return vistaActual;
  try {
    vistaActual = localStorage.getItem(CLAVE_VISTA) === '1';
  } catch {
    vistaActual = false; // sin almacenamiento: la vista detallada
  }
  return vistaActual;
}

const suscribirVista = (f: () => void) => {
  oyentesVista.add(f);
  return () => oyentesVista.delete(f);
};

/** true = vista compacta. Es una preferencia de este dispositivo; por omisión, la detallada. */
export const useVistaCompacta = () => useSyncExternalStore(suscribirVista, leerVista);

export function ponerVistaCompacta(valor: boolean) {
  vistaActual = valor;
  try { localStorage.setItem(CLAVE_VISTA, valor ? '1' : '0'); } catch { /* sin almacenamiento */ }
  oyentesVista.forEach((f) => f());
}
