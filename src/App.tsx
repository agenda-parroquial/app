import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './lib/db';
import { AuthProvider, useAuth } from './lib/auth';
import { avisoDelSistema } from './lib/avisos';
import { configurado } from './lib/supabase';
import { iniciarSync } from './lib/sync';
import { esIPhone, estaInstalada, estadoPush, sincronizarPush } from './lib/push';
import { ir, useContadorConflictos, useNoLeidas, useParroquia, useRuta } from './lib/hooks';
import { diasDeVigencia, nombreParroquia, parroquiaSinAcceso, type Notificacion, type Parroquia, type Perfil } from './types';
import { Agenda } from './components/Agenda';
import { Ajustes } from './components/Ajustes';
import { Conflictos } from './components/Conflictos';
import { EstadoSync } from './components/EstadoSync';
import { Icono } from './components/Iconos';
import { Login } from './components/Login';
import { Lugares } from './components/Lugares';
import { MisasFijas } from './components/MisasFijas';
import { Ministros, Vicarios } from './components/Ministros';
import { abrirNotificacion, Notificaciones } from './components/Notificaciones';
import { Parroquiales } from './components/Parroquiales';
import { Pendiente, SinAcceso } from './components/Pendiente';
import { Superadmin } from './components/Superadmin';
import { TiposEvento } from './components/TiposEvento';
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

// (la ruta «avisos» es la de notificaciones; se conserva porque los avisos push ya enviados apuntan a ella)
const TITULOS: Record<string, string> = {
  agenda: 'Agenda', conflictos: 'Conflictos', avisos: 'Notificaciones', parroquiales: 'Avisos',
  ajustes: 'Ajustes', mas: 'Ajustes', lugares: 'Lugares', ministros: 'Ministros', vicarios: 'Vicarios', misas: 'Misas fijas', tipos: 'Tipos de evento', usuarios: 'Usuarios',
  superadmin: 'Administración',
};

/** Invitación (descartable) a activar las notificaciones en este teléfono. */
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
      <Icono n="campana" size={18} /> Activa las notificaciones para enterarte al instante
      <button onClick={() => { cerrar(); ir('avisos'); }}>Activar</button>
      <button style={{ background: 'transparent', color: 'inherit', textDecoration: 'underline' }} onClick={cerrar}>Ahora no</button>
    </div>
  );
}

/** Aviso a los usuarios cuando faltan pocos días para que venza el acceso de la parroquia. */
function AvisoVencimiento({ parroquia }: { parroquia: Parroquia | undefined }) {
  const dias = parroquia ? diasDeVigencia(parroquia) : null;
  if (dias === null || dias > 7) return null;
  return (
    <div className="aviso aviso-vencimiento">
      {dias === 0
        ? 'El acceso de tu parroquia vence hoy.'
        : `El acceso de tu parroquia vence en ${dias} día${dias === 1 ? '' : 's'}.`}{' '}
      Pide a quien administra la Agenda Parroquial que lo renueve para no perder el acceso.
    </div>
  );
}

function Shell({ perfil, superadmin, diocesano, parroquia }: { perfil: Perfil; superadmin: boolean; diocesano: boolean; parroquia: Parroquia | undefined }) {
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

  const enAjustes = ['ajustes', 'mas', 'lugares', 'ministros', 'vicarios', 'misas', 'tipos', 'usuarios', 'superadmin'].includes(seccion);

  return (
    <div className="app">
      <InvitacionAvisos />
      <AvisoVencimiento parroquia={parroquia} />
      <header className="top">
        <div className="titulos">
          <h1>{TITULOS[seccion] ?? 'Agenda'}</h1>
          {parroquia && <div className="sub">{nombreParroquia(parroquia)}</div>}
        </div>
        <EstadoSync />
        <button className="icono-btn" onClick={() => ir('avisos')} aria-label={noLeidas ? `Notificaciones (${noLeidas} sin leer)` : 'Notificaciones'}>
          <Icono n="campana" size={21} />
          {noLeidas > 0 && <span className="contador">{noLeidas}</span>}
        </button>
      </header>

      {/* «Avisos parroquiales» ya no tiene pestaña: se entra desde la agenda y su botón «Avisos». */}
      <nav className="tabs" aria-label="Secciones">
        <a href="#/agenda" className={seccion === 'agenda' || seccion === 'parroquiales' ? 'activa' : ''}>
          <span className="pastilla"><Icono n="calendario" size={22} /></span>Agenda
        </a>
        <a href="#/conflictos" className={seccion === 'conflictos' ? 'activa' : ''}>
          <span className="pastilla"><Icono n="alerta" size={22} /></span>Conflictos{conflictos > 0 && <b className="contador">{conflictos}</b>}
        </a>
        <a href="#/ajustes" className={enAjustes ? 'activa' : ''}>
          <span className="pastilla"><Icono n="ajustes" size={22} /></span>Ajustes
        </a>
      </nav>

      <main>
        {seccion === 'conflictos' ? <Conflictos />
          : seccion === 'avisos' ? <Notificaciones usuarioId={perfil.id} />
          : seccion === 'parroquiales' ? <Parroquiales perfil={perfil} />
          : seccion === 'ajustes' || seccion === 'mas' ? <Ajustes perfil={perfil} />
          : seccion === 'lugares' ? <Lugares perfil={perfil} />
          : seccion === 'ministros' ? <Ministros perfil={perfil} />
          : seccion === 'vicarios' ? <Vicarios perfil={perfil} />
          : seccion === 'misas' ? <MisasFijas perfil={perfil} />
          : seccion === 'tipos' ? <TiposEvento perfil={perfil} />
          : seccion === 'usuarios' && perfil.rol === 'parroco' ? <Usuarios perfil={perfil} />
          : seccion === 'superadmin' && diocesano ? <Superadmin soloDiocesanos={!superadmin} />
          : <Agenda ruta={ruta} perfil={perfil} />}
      </main>

      {toast && (
        <div className="toast" onClick={() => { void abrirNotificacion(toast); setToast(null); }}>
          <Icono n="campana" size={20} /> <span>{toast.mensaje}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Interfaz del Creador: la cuenta que administra la app y no es de ninguna parroquia. Su pantalla principal son las
 * cuentas (parroquias, párrocos y obispo); además tiene la agenda diocesana (solo eventos diocesanos) y sus ajustes.
 * Un obispo sin parroquia ve solo la agenda diocesana y sus ajustes.
 */
function ShellCreador({ perfil, superadmin }: { perfil: Perfil; superadmin: boolean }) {
  const ruta = useRuta();
  const seccion = ruta[0];
  useEffect(() => iniciarSync(perfil.id, () => {}), [perfil.id]);
  // Sin ruta (o con una de otra interfaz) se abre la pantalla principal del creador.
  useEffect(() => {
    if (!/^#\/(cuentas|agenda|ajustes)/.test(location.hash)) ir(superadmin ? 'cuentas' : 'agenda');
  }, [superadmin]);

  const titulo = seccion === 'cuentas' && superadmin ? 'Cuentas' : seccion === 'ajustes' ? 'Ajustes' : 'Agenda diocesana';
  return (
    <div className="app">
      <header className="top">
        <div className="titulos">
          <h1>{titulo}</h1>
          <div className="sub">{superadmin ? 'Creador' : 'Diócesis'}</div>
        </div>
        <EstadoSync />
      </header>

      <nav className="tabs" aria-label="Secciones">
        {superadmin && (
          <a href="#/cuentas" className={seccion === 'cuentas' ? 'activa' : ''}>
            <span className="pastilla"><Icono n="escudo" size={22} /></span>Cuentas
          </a>
        )}
        <a href="#/agenda" className={seccion === 'agenda' ? 'activa' : ''}>
          <span className="pastilla"><Icono n="calendario" size={22} /></span>Agenda
        </a>
        <a href="#/ajustes" className={seccion === 'ajustes' ? 'activa' : ''}>
          <span className="pastilla"><Icono n="ajustes" size={22} /></span>Ajustes
        </a>
      </nav>

      <main>
        {seccion === 'cuentas' && superadmin ? <Superadmin soloEsto />
          : seccion === 'ajustes' ? <Ajustes perfil={perfil} />
          : <Agenda ruta={ruta} perfil={perfil} soloDiocesana />}
      </main>
    </div>
  );
}

function Puerta() {
  const { cargando, usuario, perfil, superadmin, diocesano } = useAuth();
  // El perfil local se actualiza en vivo (p. ej. si el párroco cambia el rol).
  const vivo = useLiveQuery(() => (usuario ? db.perfiles.get(usuario.id) : undefined), [usuario?.id]);
  const actual = vivo ?? perfil;
  const parroquia = useParroquia(actual?.parroquia_id);
  // La vigencia vence por fecha, sin que cambie ningún dato: se vuelve a evaluar cada minuto.
  const [, setLatido] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setLatido((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);

  if (cargando) return <div className="centro"><p className="ayuda">Cargando…</p></div>;
  if (!usuario) return <Login />;
  if (actual?.activo && actual.parroquia_id === null) {
    return superadmin || diocesano
      ? <ShellCreador perfil={actual} superadmin={superadmin} />
      : <SinAcceso titulo="Sin parroquia" texto="Tu cuenta todavía no está asignada a ninguna parroquia. Pide a quien te invitó que te dé acceso." />;
  }
  if (!actual || !actual.activo) return <Pendiente />;
  if (parroquia && parroquiaSinAcceso(parroquia)) {
    const suspendida = !parroquia.activa;
    return (
      <SinAcceso
        parroquiaId={parroquia.id}
        titulo={suspendida ? 'Parroquia suspendida' : 'Acceso vencido'}
        texto={suspendida
          ? `El acceso de ${nombreParroquia(parroquia)} está suspendido. Comunícate con quien administra la Agenda Parroquial.`
          : `El acceso de ${nombreParroquia(parroquia)} venció. Comunícate con quien administra la Agenda Parroquial para renovarlo; tu información se conserva.`}
      />
    );
  }
  return <Shell perfil={actual} superadmin={superadmin} diocesano={diocesano} parroquia={parroquia} />;
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
