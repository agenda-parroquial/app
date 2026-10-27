import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useAuth } from '../lib/auth';
import { useParroquia } from '../lib/hooks';
import { mostrarDiocesano, ocultarTodosDiocesanos, usePrefDiocesanos } from '../lib/preferencias';
import { actualizarMiNombre } from '../lib/store';
import { esErrorDeRed, mensajeDeError, sincronizar, useEstadoSync } from '../lib/sync';
import { puedeEditarCatalogos, ROLES, type Perfil } from '../types';
import { AvisosPush } from './AvisosPush';

const enlace = { textDecoration: 'none', color: 'inherit' } as const;

/** Ajustes: mi cuenta, notificaciones del teléfono y administración (lugares, misas, tipos, usuarios). */
export function Ajustes({ perfil }: { perfil: Perfil }) {
  const { cerrarSesion, usuario, superadmin } = useAuth();
  const parroquia = useParroquia(perfil.parroquia_id);
  const estado = useEstadoSync();
  const porEnviar = useLiveQuery(() => db.outbox.count(), [], 0);
  const [nombre, setNombre] = useState(perfil.nombre);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const editaCatalogos = puedeEditarCatalogos(perfil.rol);
  const pref = usePrefDiocesanos();

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
      <h2 style={{ marginBottom: 12 }}>Ajustes</h2>

      <div className="grupo">
        <h3>👤 Mi cuenta</h3>
        <label htmlFor="mn" style={{ marginTop: 8 }}>Mi nombre</label>
        <div className="fila" style={{ flexWrap: 'nowrap' }}>
          <input id="mn" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" autoComplete="name" />
          <button className="btn" onClick={() => void guardarNombre()} disabled={guardando || !nombre.trim() || nombre.trim() === perfil.nombre}>
            Guardar
          </button>
        </div>
        <p className="ayuda" style={{ marginBottom: 0 }}>
          Este nombre aparece como «Creado por» en lo que agendas. {ROLES[perfil.rol]}{parroquia ? ` de ${parroquia.nombre}` : ''} · {usuario?.email}
        </p>
        {mensaje && <div className={`aviso ${mensaje.tipo === 'ok' ? 'ok' : 'error'}`}>{mensaje.texto}</div>}
        <button className="btn peligro" style={{ marginTop: 12 }} onClick={() => void salir()}>Cerrar sesión</button>
      </div>

      <div className="grupo">
        <h3>🔔 Notificaciones en este teléfono</h3>
        <AvisosPush />
      </div>

      <h3 className="dia-titulo">Administración</h3>
      <div className="lista" style={{ marginBottom: 16 }}>
        <a className="item clic" href="#/lugares" style={enlace}>
          <div>📍 <b>Lugares</b><div className="ayuda">Parroquia, capillas y demás lugares habituales</div></div>
        </a>
        <a className="item clic" href="#/misas" style={enlace}>
          <div>⛪ <b>Misas fijas</b><div className="ayuda">Horarios que se repiten (semanales o alternos)</div></div>
        </a>
        {editaCatalogos && (
          <a className="item clic" href="#/tipos" style={enlace}>
            <div>🏷 <b>Tipos de evento</b><div className="ayuda">Los tipos que hay, agregar nuevos y el color de cada uno</div></div>
          </a>
        )}
        {perfil.rol === 'parroco' && (
          <a className="item clic" href="#/usuarios" style={enlace}>
            <div>👥 <b>Usuarios e invitaciones</b><div className="ayuda">Invitar personas, aprobar cuentas y asignar roles</div></div>
          </a>
        )}
        {superadmin && (
          <a className="item clic" href="#/superadmin" style={enlace}>
            <div>🛡 <b>Administración</b><div className="ayuda">Parroquias, accesos, lugares y eventos diocesanos</div></div>
          </a>
        )}
      </div>

      <div className="grupo">
        <h3>🏛 Eventos diocesanos</h3>
        <label className="check" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={!pref.ocultarTodos} onChange={(e) => ocultarTodosDiocesanos(!e.target.checked)} />
          Mostrar los eventos diocesanos en mi agenda
        </label>
        <p className="ayuda" style={{ marginBottom: 0 }}>
          Son informativos y los publica la diócesis. Esta opción es solo de este dispositivo.
          {pref.ocultos.length > 0 && (
            <> Ocultaste {pref.ocultos.length} de forma individual. <button className="enlace" onClick={() => pref.ocultos.forEach(mostrarDiocesano)}>Volver a mostrarlos</button></>
          )}
        </p>
      </div>

      <div className="grupo">
        <h3>🔄 Sincronización</h3>
        <p className="ayuda">
          {estado.enLinea ? 'Conectado.' : 'Sin conexión: puedes seguir trabajando, todo se enviará al volver el internet.'}{' '}
          {porEnviar > 0 ? `${porEnviar} cambio(s) por enviar. ` : 'Todo está enviado. '}
          {estado.ultimaSync ? `Última sincronización: ${new Date(estado.ultimaSync).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}.` : ''}
        </p>
        {estado.error && <div className="aviso error">{estado.error}</div>}
        <button className="btn sec" onClick={() => void sincronizar()} disabled={estado.sincronizando}>
          {estado.sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
      </div>

      <div className="grupo">
        <h3>📲 Instalar en el teléfono</h3>
        <p className="ayuda" style={{ marginBottom: 0 }}>
          <b>iPhone:</b> abre esta página en Safari → Compartir → «Añadir a pantalla de inicio».<br />
          <b>Android:</b> en Chrome → menú ⋮ → «Instalar aplicación».
        </p>
      </div>
    </>
  );
}
