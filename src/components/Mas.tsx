import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useAuth } from '../lib/auth';
import { sincronizar, useEstadoSync } from '../lib/sync';
import { ROLES, type Perfil } from '../types';

export function Mas({ perfil }: { perfil: Perfil }) {
  const { cerrarSesion, usuario } = useAuth();
  const estado = useEstadoSync();
  const porEnviar = useLiveQuery(() => db.outbox.count(), [], 0);

  async function salir() {
    const aviso = porEnviar
      ? `Tienes ${porEnviar} cambio(s) sin enviar que se perderán si cierras sesión ahora. ¿Cerrar sesión de todos modos?`
      : '¿Cerrar sesión en este dispositivo?';
    if (confirm(aviso)) await cerrarSesion();
  }

  return (
    <>
      <h2 style={{ marginBottom: 12 }}>Más</h2>
      <div className="lista" style={{ marginBottom: 16 }}>
        <a className="item clic" href="#/lugares" style={{ textDecoration: 'none', color: 'inherit' }}><div>📍 <b>Lugares</b><div className="ayuda">Parroquia y capillas</div></div></a>
        <a className="item clic" href="#/misas" style={{ textDecoration: 'none', color: 'inherit' }}><div>⛪ <b>Misas fijas</b><div className="ayuda">Horarios que se repiten cada semana</div></div></a>
        {perfil.rol === 'parroco' && (
          <a className="item clic" href="#/usuarios" style={{ textDecoration: 'none', color: 'inherit' }}><div>👥 <b>Usuarios</b><div className="ayuda">Aprobar cuentas y asignar roles</div></div></a>
        )}
      </div>

      <div className="grupo">
        <h3>Sincronización</h3>
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
        <h3>Mi cuenta</h3>
        <p style={{ margin: '4px 0' }}>{perfil.nombre || usuario?.email}</p>
        <p className="ayuda" style={{ margin: 0 }}>{ROLES[perfil.rol]} · {usuario?.email}</p>
        <button className="btn peligro" style={{ marginTop: 12 }} onClick={() => void salir()}>Cerrar sesión</button>
      </div>

      <div className="grupo">
        <h3>Instalar en el teléfono</h3>
        <p className="ayuda" style={{ marginBottom: 0 }}>
          <b>iPhone:</b> abre esta página en Safari → Compartir → «Añadir a pantalla de inicio».<br />
          <b>Android:</b> en Chrome → menú ⋮ → «Instalar aplicación».
        </p>
      </div>
    </>
  );
}
