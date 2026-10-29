import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useAuth } from '../lib/auth';
import { useParroquia } from '../lib/hooks';
import { mostrarDiocesano, ocultarTodosDiocesanos, usePrefDiocesanos } from '../lib/preferencias';
import { actualizarMiNombre } from '../lib/store';
import { esErrorDeRed, mensajeDeError, sincronizar, useEstadoSync } from '../lib/sync';
import { nombreParroquia, nombrePerfil, puedeEditarCatalogos, puedeRegistrarPersonas, ROLES, type Perfil } from '../types';
import { AvisosPush } from './AvisosPush';
import { Icono, type NombreIcono } from './Iconos';

const iniciales = (nombre: string) =>
  nombre.trim().split(/\s+/).filter((p) => !/^(pbro|p|fr|lic|sr|sra|dr|dra)\.?$/i.test(p)).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';

/** Fila de un menú: icono, título, descripción y flecha. */
function Fila({ href, icono, titulo, texto, tono }: { href: string; icono: NombreIcono; titulo: string; texto: string; tono?: string }) {
  return (
    <a className="item clic" href={href}>
      <span className={`ico ${tono ?? ''}`}><Icono n={icono} /></span>
      <div><b>{titulo}</b><div className="ayuda">{texto}</div></div>
    </a>
  );
}

/** Ajustes: mi cuenta, administración de la parroquia (lugares, misas, tipos, usuarios) y preferencias de este teléfono. */
export function Ajustes({ perfil }: { perfil: Perfil }) {
  const { cerrarSesion, usuario, superadmin, diocesano, cambiarCorreo, cambiarClave, recargarPerfil } = useAuth();
  const parroquia = useParroquia(perfil.parroquia_id);
  const estado = useEstadoSync();
  const porEnviar = useLiveQuery(() => db.outbox.count(), [], 0);
  const [nombre, setNombre] = useState(perfil.nombre);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const editaCatalogos = puedeEditarCatalogos(perfil.rol);
  // Sin parroquia = el creador (o un obispo sin parroquia): no hay menús de parroquia ni avisos de agenda.
  const sinParroquia = !perfil.parroquia_id;
  const pref = usePrefDiocesanos();
  const [cuenta, setCuenta] = useState<'correo' | 'clave' | null>(null);
  const [correoNuevo, setCorreoNuevo] = useState('');
  const [claveNueva, setClaveNueva] = useState('');
  const [claveRepite, setClaveRepite] = useState('');
  const [msgCuenta, setMsgCuenta] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [cambiando, setCambiando] = useState(false);

  /** Cambia el correo o la contraseña de esta cuenta; la persona escribe los valores aquí, nunca pasan por otra parte. */
  async function cambiarDatosDeAcceso(e: React.FormEvent) {
    e.preventDefault();
    setMsgCuenta(null);
    if (cuenta === 'clave') {
      if (claveNueva.length < 6) return setMsgCuenta({ tipo: 'error', texto: 'La contraseña debe tener al menos 6 caracteres.' });
      if (claveNueva !== claveRepite) return setMsgCuenta({ tipo: 'error', texto: 'Las dos contraseñas no son iguales.' });
    }
    setCambiando(true);
    try {
      const r = cuenta === 'correo' ? await cambiarCorreo(correoNuevo) : await cambiarClave(claveNueva);
      if (r.error) return setMsgCuenta({ tipo: 'error', texto: r.error });
      setMsgCuenta({ tipo: 'ok', texto: r.aviso ?? (cuenta === 'correo' ? 'Correo cambiado. Desde ahora entras con el correo nuevo.' : 'Contraseña cambiada.') });
      if (cuenta === 'correo' && !r.aviso) void recargarPerfil();
      setCuenta(null);
      setCorreoNuevo('');
      setClaveNueva('');
      setClaveRepite('');
    } catch (err) {
      setMsgCuenta({ tipo: 'error', texto: esErrorDeRed(err) ? 'Necesitas internet para hacer este cambio.' : mensajeDeError(err) });
    } finally {
      setCambiando(false);
    }
  }

  async function guardarNombre() {
    setMensaje(null);
    setGuardando(true);
    try {
      await actualizarMiNombre(nombre);
      setMensaje({ tipo: 'ok', texto: 'Nombre guardado.' });
    } catch (e) {
      setMensaje({ tipo: 'error', texto: esErrorDeRed(e) ? 'Necesitas internet para cambiar tu nombre.' : mensajeDeError(e) });
    } finally {
      setGuardando(false);
    }
  }

  async function salir() {
    const aviso = porEnviar
      ? `Tienes ${porEnviar} cambio(s) sin enviar que se perderán si cierras sesión ahora. ¿Cerrar sesión de todos modos?`
      : '¿Cerrar sesión en este dispositivo?';
    if (confirm(aviso)) await cerrarSesion();
  }

  return (
    <>
      <div className="perfil-card">
        <span className="avatar" aria-hidden>{iniciales(nombrePerfil(perfil))}</span>
        <div className="quien">
          <b>{nombrePerfil(perfil)}</b>
          <div className="rol">{sinParroquia ? (superadmin ? 'Creador' : 'Diócesis') : ROLES[perfil.rol]}{parroquia ? ` · ${nombreParroquia(parroquia)}` : ''}</div>
          <div className="correo">{usuario?.email}</div>
        </div>
      </div>

      {!sinParroquia && <><div className="seccion-etq">Mi parroquia</div>
      <div className="lista">
        <Fila href="#/lugares" icono="ubicacion" titulo="Lugares" texto="Templo, capillas y su mapa" />
        {puedeRegistrarPersonas(perfil.rol) && <Fila href="#/vicarios" icono="persona" titulo="Vicarios" texto="Sacerdotes que celebran contigo, con o sin cuenta" tono="oro" />}
        {puedeRegistrarPersonas(perfil.rol) && <Fila href="#/ministros" icono="personas" titulo="Ministros extraordinarios" texto="Quienes ayudan con la comunión (sin cuenta)" tono="dio" />}
        <Fila href="#/misas" icono="iglesia" titulo="Misas fijas" texto="Horarios que se repiten (semanales o alternos)" tono="oro" />
        {editaCatalogos && <Fila href="#/tipos" icono="paleta" titulo="Tipos de evento" texto="Corregir nombres, agregar tipos, color e intenciones" tono="ok" />}
        {perfil.rol === 'parroco' && <Fila href="#/usuarios" icono="personas" titulo="Usuarios e invitaciones" texto="Invitar personas, aprobar cuentas y asignar roles" tono="dio" />}
      </div></>}

      {diocesano && !sinParroquia && (
        <>
          <div className="seccion-etq">{superadmin ? 'Administración de la app' : 'Diócesis'}</div>
          <div className="lista">
            <Fila
              href="#/superadmin" icono={superadmin ? 'escudo' : 'diocesis'}
              titulo={superadmin ? 'Administración' : 'Eventos diocesanos'}
              texto={superadmin ? 'Parroquias, accesos, lugares y eventos diocesanos' : 'Publicar eventos para todas las parroquias'}
            />
          </div>
        </>
      )}

      <div className="seccion-etq">Mi cuenta</div>
      <div className="grupo">
        <label htmlFor="mn" style={{ marginTop: 0 }}>Mi nombre</label>
        <div className="fila" style={{ flexWrap: 'nowrap' }}>
          <input id="mn" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" autoComplete="name" />
          <button className="btn" onClick={() => void guardarNombre()} disabled={guardando || !nombre.trim() || nombre.trim() === perfil.nombre}>
            Guardar
          </button>
        </div>
        <p className="ayuda" style={{ marginBottom: 0 }}>Este nombre aparece como «Creado por» en lo que agendas.</p>
        {mensaje && <div className={`aviso ${mensaje.tipo === 'ok' ? 'ok' : 'error'}`}>{mensaje.texto}</div>}
      </div>

      <div className="grupo">
        <h3 className="fila" style={{ gap: 8 }}><Icono n="escudo" size={19} />Correo y contraseña</h3>
        <p className="ayuda">Entras con <b>{usuario?.email}</b>. Cambiar estos datos requiere internet.</p>
        <div className="fila">
          <button type="button" className={`btn chico ${cuenta === 'correo' ? '' : 'sec'}`} onClick={() => { setCuenta(cuenta === 'correo' ? null : 'correo'); setMsgCuenta(null); }}>Cambiar correo</button>
          <button type="button" className={`btn chico ${cuenta === 'clave' ? '' : 'sec'}`} onClick={() => { setCuenta(cuenta === 'clave' ? null : 'clave'); setMsgCuenta(null); }}>Cambiar contraseña</button>
        </div>
        {cuenta && (
          <form onSubmit={(e) => void cambiarDatosDeAcceso(e)} autoComplete="off">
            {cuenta === 'correo' ? (
              <>
                <label htmlFor="cc">Correo nuevo</label>
                <input id="cc" type="email" value={correoNuevo} onChange={(e) => setCorreoNuevo(e.target.value)} required autoCapitalize="none" autoComplete="email" placeholder="nuevo@correo.com" />
              </>
            ) : (
              <>
                <label htmlFor="cn">Contraseña nueva (mínimo 6 caracteres)</label>
                <input id="cn" type="password" value={claveNueva} onChange={(e) => setClaveNueva(e.target.value)} required autoComplete="new-password" />
                <label htmlFor="cr">Repite la contraseña nueva</label>
                <input id="cr" type="password" value={claveRepite} onChange={(e) => setClaveRepite(e.target.value)} required autoComplete="new-password" />
              </>
            )}
            <div className="fila" style={{ marginTop: 10 }}>
              <button className="btn" disabled={cambiando || !estado.enLinea}>{cambiando ? 'Guardando…' : 'Guardar'}</button>
              <button type="button" className="btn sec" onClick={() => setCuenta(null)}>Cancelar</button>
            </div>
          </form>
        )}
        {msgCuenta && <div className={`aviso ${msgCuenta.tipo === 'ok' ? 'ok' : 'error'}`}>{msgCuenta.texto}</div>}
      </div>

      <div className="seccion-etq">En este teléfono</div>
      {!sinParroquia && (
        <div className="grupo">
          <h3 className="fila" style={{ gap: 8 }}><Icono n="campana" size={19} />Notificaciones</h3>
          <AvisosPush />
        </div>
      )}

      <div className="grupo">
        <h3 className="fila" style={{ gap: 8 }}><Icono n="diocesis" size={19} />Eventos diocesanos</h3>
        <label className="check" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={!pref.ocultarTodos} onChange={(e) => ocultarTodosDiocesanos(!e.target.checked)} />
          Mostrar los eventos diocesanos en mi agenda
        </label>
        <p className="ayuda" style={{ marginBottom: 0 }}>
          Son informativos y los publica la diócesis. Esta opción es solo de este dispositivo.
          {pref.ocultos.length > 0 && (
            <> Ocultaste {pref.ocultos.length} de forma individual. <button className="enlace" style={{ padding: 0 }} onClick={() => pref.ocultos.forEach(mostrarDiocesano)}>Volver a mostrarlos</button></>
          )}
        </p>
      </div>

      <div className="grupo">
        <h3 className="fila" style={{ gap: 8 }}><Icono n="sincronizar" size={19} />Sincronización</h3>
        <p className="ayuda">
          {estado.enLinea ? 'Conectado.' : 'Sin conexión: puedes seguir trabajando, todo se enviará al volver el internet.'}{' '}
          {porEnviar > 0 ? `${porEnviar} cambio(s) por enviar. ` : 'Todo está enviado. '}
          {estado.ultimaSync ? `Última sincronización: ${new Date(estado.ultimaSync).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.` : ''}
        </p>
        {estado.error && <div className="aviso error">{estado.error}</div>}
        <button className="btn sec" onClick={() => void sincronizar()} disabled={estado.sincronizando}>
          <Icono n="sincronizar" size={17} />{estado.sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
      </div>

      <div className="grupo">
        <h3 className="fila" style={{ gap: 8 }}><Icono n="celular" size={19} />Instalar en el teléfono</h3>
        <p className="ayuda" style={{ marginBottom: 0 }}>
          <b>iPhone:</b> abre esta página en Safari → Compartir → «Añadir a pantalla de inicio».<br />
          <b>Android:</b> en Chrome → menú ⋮ → «Instalar aplicación».
        </p>
      </div>

      <button className="btn peligro ancho" style={{ marginTop: 6 }} onClick={() => void salir()}>
        <Icono n="salir" size={18} />Cerrar sesión
      </button>
    </>
  );
}
