import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './lib/db';
import { AuthProvider, useAuth } from './lib/auth';
import { avisoDelSistema } from './lib/avisos';
import { configurado } from './lib/supabase';
import { iniciarSync } from './lib/sync';
import { esIPhone, estaInstalada, estadoPush, sincronizarPush } from './lib/push';
import { ir, useContadorConflictos, useNoLeidas, useRuta } from './lib/hooks';
import type { Notificacion, Perfil } from './types';
import { Agenda } from './components/Agenda';
import { Conflictos } from './components/Conflictos';
import { EstadoSync } from './components/EstadoSync';
import { Login } from './components/Login';
import { Lugares } from './components/Lugares';
import { Mas } from './components/Mas';
import { MisasFijas } from './components/MisasFijas';
import { abrirNotificacion, Notificaciones } from './components/Notificaciones';
import { Pendiente } from './components/Pendiente';
import { Usuarios } from './components/Usuarios';

function ConfigFaltante() {
  return (
    <div className="centro">
      <div className="caja">
        <h1>Falta configurar Supabase</h1>
        <p>
          Crea el archivo <code>.env</code> (copia de <code>.env.example</code>) con la URL y la clave anónima de tu
          proyecto de Supabase, y vuelve a iniciar la app. En Netlify, agrégalas en <i>Site configuration → Environment variables</i>.
        </p>
      </div>
    </div>
  );
}

function BannerActualizacion() {
  const { needRefresh: [hayNueva], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      // busca versiones nuevas cada hora mientras la app está abierta
      if (registro) setInterval(() => void registro.update(), 60 * 60 * 1000);
    },
  });
  if (!hayNueva) return null;
  return (
    <div className="actualizar">
      Hay una versión nueva de la app.
      <button onClick={() => void updateServiceWorker(true)}>Actualizar</button>
    </div>
  );
}

const TITULOS: Record<string, string> = {
  agenda: 'Agenda', conflictos: 'Conflictos', avisos: 'Avisos', mas: 'Más',
  lugares: 'Lugares', misas: 'Misas fijas', usuarios: 'Usuarios',
};

/** Invitación (descartable) a activar los avisos en este teléfono. */
function InvitacionAvisos() {
  const [ver, setVer] = useState(false);
  useEffect(() => {
    let descartada = false;
    try { descartada = localStorage.getItem('avisos-descartado') === '1'; } catch { /* sin almacenamiento */ }
    if (descartada) return;
    void estadoPush().then((s) => setVer(s === 'inactivo' || (s === 'no-soportado' && esIPhone() && !estaInstalada())));
  }, []);
  if (!ver) return null;
  const cerrar = () => {
    try { localStorage.setItem('avisos-descartado', '1'); } catch { /* sin almacenamiento */ }
    setVer(false);
  };
  return (
    <div className="actualizar" style={{ gap: 8, flexWrap: 'wrap' }}>
      🔔 Activa los avisos para enterarte al instante
      <button onClick={() => { cerrar(); ir('avisos'); }}>Activar</button>
      <button style={{ background: 'transparent', color: 'inherit', textDecoration: 'underline' }} onClick={cerrar}>Ahora no</button>
    </div>
  );
}

function Shell({ perfil }: { perfil: Perfil }) {
  const ruta = useRuta();
  const seccion = ruta[0];
  const conflictos = useContadorConflictos();
  const noLeidas = useNoLeidas();
  const [toast, setToast] = useState<Notificacion | null>(null);

  useEffect(
    () =>
      iniciarSync(perfil.id, (n) => {
        setToast(n);
        // Si los avisos push están activos, el sistema ya muestra el suyo: no se duplica.
        if (document.visibilityState === 'hidden') {
          void estadoPush().then((s) => {
            if (s !== 'activo') void avisoDelSistema('Agenda Parroquial', n.mensaje);
          });
        }
      }),
    [perfil.id],
  );

  // Este teléfono queda registrado a nombre de quien entró (y se renueva si cambió).
  useEffect(() => { void sincronizarPush().catch(() => {}); }, [perfil.id]);

  // Al tocar un aviso con la app ya abierta, el service worker pide cambiar de pantalla.
  useEffect(() => {
    const alMensaje = (e: MessageEvent) => {
      if (e.data?.tipo === 'IR' && typeof e.data.hash === 'string') location.hash = e.data.hash;
    };
    navigator.serviceWorker?.addEventListener('message', alMensaje);
    return () => navigator.serviceWorker?.removeEventListener('message', alMensaje);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 9000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const enMas = ['mas', 'lugares', 'misas', 'usuarios'].includes(seccion);

  return (
    <div className="app">
      <InvitacionAvisos />
      <header className="top">
        <h1>{TITULOS[seccion] ?? 'Agenda'}</h1>
        <EstadoSync />
        <button onClick={() => ir('avisos')} aria-label="Avisos">
          🔔{noLeidas > 0 && <span className="contador">{noLeidas}</span>}
        </button>
      </header>

      <nav className="tabs">
        <a href="#/agenda" className={seccion === 'agenda' ? 'activa' : ''}><span>📅</span>Agenda</a>
        <a href="#/conflictos" className={seccion === 'conflictos' ? 'activa' : ''}>
          <span>⚠️</span>Conflictos{conflictos > 0 && <b className="contador">{conflictos}</b>}
        </a>
        <a href="#/mas" className={enMas ? 'activa' : ''}><span>☰</span>Más</a>
      </nav>

      <main>
        {seccion === 'conflictos' ? <Conflictos />
          : seccion === 'avisos' ? <Notificaciones usuarioId={perfil.id} />
          : seccion === 'mas' ? <Mas perfil={perfil} />
          : seccion === 'lugares' ? <Lugares perfil={perfil} />
          : seccion === 'misas' ? <MisasFijas perfil={perfil} />
          : seccion === 'usuarios' && perfil.rol === 'parroco' ? <Usuarios perfil={perfil} />
          : <Agenda ruta={ruta} perfil={perfil} />}
      </main>

      {toast && (
        <div className="toast" onClick={() => { void abrirNotificacion(toast); setToast(null); }}>
          🔔 {toast.mensaje}
        </div>
      )}
    </div>
  );
}

function Puerta() {
  const { cargando, usuario, perfil } = useAuth();
  // El perfil local se actualiza en vivo (p. ej. si el párroco cambia el rol).
  const vivo = useLiveQuery(() => (usuario ? db.perfiles.get(usuario.id) : undefined), [usuario?.id]);
  const actual = vivo ?? perfil;

  if (cargando) return <div className="centro"><p className="ayuda">Cargando…</p></div>;
  if (!usuario) return <Login />;
  if (!actual || !actual.activo) return <Pendiente />;
  return <Shell perfil={actual} />;
}

export default function App() {
  if (!configurado) return <ConfigFaltante />;
  return (
    <AuthProvider>
      <BannerActualizacion />
      <Puerta />
    </AuthProvider>
  );
}
