import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { db, vaciarLocal } from './db';
import { supabase } from './supabase';
import { esErrorDeRed } from './sync';
import { desactivarPush } from './push';
import type { Perfil } from '../types';

interface Resultado {
  error?: string;
  aviso?: string;
}

interface AuthCtx {
  cargando: boolean;
  usuario: { id: string; email: string } | null;
  perfil: Perfil | null;
  /** true cuando se entró con la identidad guardada porque no hay internet para renovar la sesión */
  identidadGuardada: boolean;
  iniciarSesion: (email: string, password: string) => Promise<Resultado>;
  registrar: (email: string, password: string, nombre: string, codigo?: string) => Promise<Resultado>;
  cerrarSesion: () => Promise<void>;
  recargarPerfil: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fuera de AuthProvider');
  return c;
};

function traducir(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/email not confirmed/i.test(msg)) return 'Falta confirmar tu correo. Revisa tu bandeja de entrada.';
  if (/already registered|already been registered/i.test(msg)) return 'Ese correo ya está registrado. Inicia sesión.';
  if (/password should be at least/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/rate limit/i.test(msg)) return 'Demasiados intentos. Espera unos minutos.';
  if (/failed to fetch|network|load failed/i.test(msg)) return 'No hay conexión a internet.';
  return msg;
}

async function leerPerfil(id: string): Promise<Perfil | null> {
  try {
    const { data, error } = await supabase.from('perfiles').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (data) await db.perfiles.put(data as Perfil);
    return (data as Perfil | null) ?? null;
  } catch (e) {
    if (esErrorDeRed(e)) return (await db.perfiles.get(id)) ?? null; // sin internet: el perfil guardado
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [usuario, setUsuario] = useState<AuthCtx['usuario']>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [identidadGuardada, setIdentidadGuardada] = useState(false);
  const usuarioRef = useRef<string | null>(null);

  const aplicarSesion = useCallback(async (session: Session | null, sinRed = false) => {
    if (!session) {
      // ¿Sin internet y con un usuario ya conocido en este equipo? Se sigue con lo guardado.
      const guardado = (await db.meta.get('usuarioId'))?.value as string | undefined;
      const perfilGuardado = guardado ? await db.perfiles.get(guardado) : undefined;
      if (guardado && perfilGuardado && (sinRed || !navigator.onLine)) {
        usuarioRef.current = guardado;
        setUsuario({ id: guardado, email: perfilGuardado.email ?? '' });
        setPerfil(perfilGuardado);
        setIdentidadGuardada(true);
      } else {
        usuarioRef.current = null;
        setUsuario(null);
        setPerfil(null);
        setIdentidadGuardada(false);
      }
      setCargando(false);
      return;
    }
    const id = session.user.id;
    const anterior = (await db.meta.get('usuarioId'))?.value;
    if (anterior && anterior !== id) await vaciarLocal(); // otro usuario en el mismo equipo
    await db.meta.put({ key: 'usuarioId', value: id });
    usuarioRef.current = id;
    setUsuario({ id, email: session.user.email ?? '' });
    setIdentidadGuardada(false);

    // Con perfil guardado se entra al instante (aunque no haya señal) y se actualiza en segundo plano.
    const local = await db.perfiles.get(id);
    if (local) {
      setPerfil(local);
      setCargando(false);
      void leerPerfil(id).then((p) => p && usuarioRef.current === id && setPerfil(p));
    } else {
      setPerfil(await leerPerfil(id));
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    // Si renovar la sesión se cuelga (señal muy débil), a los 4 s se sigue con la identidad guardada.
    const limite = new Promise<'tiempo'>((ok) => setTimeout(() => ok('tiempo'), 4000));
    void Promise.race([supabase.auth.getSession(), limite]).then((r) =>
      r === 'tiempo' ? aplicarSesion(null, true) : aplicarSesion(r.data.session),
    );
    const { data: sub } = supabase.auth.onAuthStateChange((evento, session) => {
      // No se llama a supabase directamente dentro de este callback (puede bloquearse).
      if (evento === 'SIGNED_OUT') setTimeout(() => void aplicarSesion(null), 0);
      else if (session && session.user.id !== usuarioRef.current) setTimeout(() => void aplicarSesion(session), 0);
    });
    const alVolverInternet = () => void supabase.auth.getSession().then(({ data }) => aplicarSesion(data.session));
    window.addEventListener('online', alVolverInternet);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener('online', alVolverInternet);
    };
  }, [aplicarSesion]);

  const valor = useMemo<AuthCtx>(
    () => ({
      cargando,
      usuario,
      perfil,
      identidadGuardada,
      iniciarSesion: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        return error ? { error: traducir(error.message) } : {};
      },
      registrar: async (email, password, nombre, codigo) => {
        const c = codigo?.trim() ?? '';
        if (c) {
          // Antes de crear la cuenta se avisa si el código no corresponde a ese correo.
          const { data: valido, error: e } = await supabase.rpc('validar_invitacion', { p_email: email.trim(), p_codigo: c });
          if (e) return { error: traducir(e.message) };
          if (!valido) return { error: 'Ese código no corresponde a ese correo, o ya se usó. Revisa que sea el mismo correo con el que te invitaron.' };
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password, options: { data: { nombre: nombre.trim(), ...(c ? { codigo: c } : {}) } },
        });
        if (error) return { error: traducir(error.message) };
        if (!data.session) return { aviso: 'Te enviamos un correo para confirmar tu cuenta. Después, inicia sesión.' };
        return {};
      },
      cerrarSesion: async () => {
        // Este teléfono deja de recibir los avisos de esta cuenta (si no hay internet, se omite).
        await Promise.race([desactivarPush().catch(() => {}), new Promise((ok) => setTimeout(ok, 3000))]);
        await supabase.auth.signOut({ scope: 'local' });
        await vaciarLocal();
        usuarioRef.current = null;
        setUsuario(null);
        setPerfil(null);
        setIdentidadGuardada(false);
      },
      recargarPerfil: async () => {
        if (usuarioRef.current) setPerfil(await leerPerfil(usuarioRef.current));
      },
    }),
    [cargando, usuario, perfil, identidadGuardada],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
