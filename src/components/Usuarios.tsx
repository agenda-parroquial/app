import { useState } from 'react';
import { usePerfiles } from '../lib/hooks';
import { actualizarPerfil } from '../lib/store';
import { esErrorDeRed, mensajeDeError, useEstadoSync } from '../lib/sync';
import { ROLES, type Perfil, type Rol } from '../types';

/** Solo el párroco: aprueba cuentas y decide el rol de cada persona. */
export function Usuarios({ perfil }: { perfil: Perfil }) {
  const perfiles = usePerfiles();
  const { enLinea } = useEstadoSync();
  const [error, setError] = useState('');

  const orden = [...perfiles].sort(
    (a, b) => Number(a.activo) - Number(b.activo) || (a.nombre || a.email || '').localeCompare(b.nombre || b.email || '', 'es'),
  );
  const pendientes = orden.filter((p) => !p.activo).length;

  async function cambiar(p: Perfil, cambios: Partial<Pick<Perfil, 'rol' | 'activo' | 'nombre'>>) {
    setError('');
    try {
      await actualizarPerfil(p.id, cambios);
    } catch (e) {
      const msg = mensajeDeError(e);
      setError(esErrorDeRed(e) ? 'Necesitas internet para cambiar usuarios.' : msg);
    }
  }

  return (
    <>
      <h2 style={{ marginBottom: 6 }}>Usuarios</h2>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Quien se registra queda pendiente hasta que lo apruebes aquí. El <b>párroco</b> puede todo; la <b>secretaria</b> maneja
        la agenda, lugares y misas fijas; el <b>vicario</b> ve toda la agenda y crea o edita eventos.
      </p>
      {!enLinea && <div className="aviso">Sin conexión: los cambios de usuarios requieren internet.</div>}
      {pendientes > 0 && <div className="aviso">Hay {pendientes} cuenta(s) esperando tu aprobación.</div>}
      {error && <div className="aviso error">{error}</div>}

      <div className="lista">
        {orden.map((p) => (
          <div key={p.id} className="item" style={{ flexWrap: 'wrap', background: p.activo ? undefined : '#fffaf0' }}>
            <div style={{ minWidth: 200 }}>
              <input
                defaultValue={p.nombre} aria-label="Nombre" placeholder="Nombre"
                onBlur={(e) => e.target.value.trim() !== p.nombre && void cambiar(p, { nombre: e.target.value.trim() })}
              />
              <div className="ayuda">{p.email}{p.id === perfil.id ? ' · (tú)' : ''}</div>
            </div>
            <select
              style={{ width: 150 }} value={p.rol} aria-label="Rol"
              onChange={(e) => void cambiar(p, { rol: e.target.value as Rol })}
            >
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {p.activo ? (
              <button className="btn peligro chico" onClick={() => confirm(`¿Quitar el acceso a ${p.nombre || p.email}?`) && void cambiar(p, { activo: false })}>
                Quitar acceso
              </button>
            ) : (
              <button className="btn chico" onClick={() => void cambiar(p, { activo: true })}>Aprobar</button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
