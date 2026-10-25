import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configurado = Boolean(url && key);

// Con señal débil una petición puede quedarse colgada mucho tiempo y bloquear la
// sincronización siguiente: cada una tiene un máximo de 20 s.
const TIEMPO_MAXIMO_MS = 20_000;
const fetchConLimite: typeof fetch = (entrada, init) => {
  const limite = AbortSignal.timeout(TIEMPO_MAXIMO_MS);
  const signal = init?.signal && 'any' in AbortSignal ? AbortSignal.any([init.signal, limite]) : (init?.signal ?? limite);
  return fetch(entrada, { ...init, signal });
};

// Si falta la configuración, App muestra una pantalla de ayuda y nunca usa el cliente.
export const supabase: SupabaseClient = configurado
  ? createClient(url!, key!, { global: { fetch: fetchConLimite } })
  : (null as unknown as SupabaseClient);
