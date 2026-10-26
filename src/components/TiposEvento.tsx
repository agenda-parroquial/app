import { useState, type FormEvent } from 'react';
import { useTiposEvento } from '../lib/hooks';
import { guardarTipoEvento } from '../lib/store';
import { puedeEditarCatalogos, type Perfil } from '../types';
import { VolverAjustes } from './VolverAjustes';

const norm = (s: string) => s.trim().toLowerCase();

/** Tipos de evento que la parroquia agregó (además de misa, bautizo, boda…). */
export function TiposEvento({ perfil }: { perfil: Perfil }) {
  const tipos = useTiposEvento();
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const puede = puedeEditarCatalogos(perfil.rol);
  const orden = [...tipos].sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'));

  async function agregar(e: FormEvent) {
    e.preventDefault();
    setError('');
    const n = nombre.trim();
    if (!n) return;
    const existente = tipos.find((t) => norm(t.nombre) === norm(n));
    if (existente) {
      if (existente.activo) return setError('Ese tipo ya existe.');
      await guardarTipoEvento({ activo: true }, existente.id); // estaba desactivado: se reactiva
    } else {
      await guardarTipoEvento({ nombre: n, activo: true });
    }
    setNombre('');
  }

  return (
    <>
      <VolverAjustes />
      <h2 style={{ marginBottom: 6 }}>Tipos de evento</h2>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Además de misa, bautizo, boda, confesiones, unción y reunión, aquí están los tipos que se han guardado desde
        «Otro» al crear un evento. También puedes agregarlos aquí.
      </p>

      {puede && (
        <form onSubmit={agregar} className="grupo">
          <label htmlFor="tn" style={{ marginTop: 0 }}>Nuevo tipo</label>
          <div className="fila" style={{ flexWrap: 'nowrap' }}>
            <input id="tn" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Retiro espiritual" maxLength={60} />
            <button className="btn" disabled={!nombre.trim()}>Agregar</button>
          </div>
          {error && <div className="aviso error">{error}</div>}
        </form>
      )}

      {orden.length === 0 && <div className="vacio">Todavía no hay tipos guardados.</div>}
      <div className="lista">
        {orden.map((t) => (
          <div key={t.id} className={`item ${t.activo ? '' : 'inactivo'}`}>
            <div><b>{t.nombre}</b>{!t.activo && ' (sin uso)'}</div>
            {puede && (
              <button className="btn sec chico" onClick={() => void guardarTipoEvento({ activo: !t.activo }, t.id)}>
                {t.activo ? 'Quitar' : 'Reactivar'}
              </button>
            )}
          </div>
        ))}
      </div>
      <p className="ayuda" style={{ marginTop: 12 }}>
        Quitar un tipo solo lo oculta de la lista; los eventos que ya lo usan no cambian.
      </p>
    </>
  );
}
