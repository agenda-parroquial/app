import { useState, type FormEvent } from 'react';
import { useLugares } from '../lib/hooks';
import { guardarLugar } from '../lib/store';
import { puedeEditarCatalogos, TIPOS_LUGAR, type Lugar, type Perfil, type TipoLugar } from '../types';

function FormLugar({ lugar, onCerrar }: { lugar?: Lugar; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(lugar?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoLugar>(lugar?.tipo ?? 'capilla');
  const [direccion, setDireccion] = useState(lugar?.direccion ?? '');
  const [activo, setActivo] = useState(lugar?.activo ?? true);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    await guardarLugar({ nombre: nombre.trim(), tipo, direccion: direccion.trim() || null, activo }, lugar?.id);
    onCerrar();
  }

  return (
    <div className="fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="hoja" onSubmit={guardar}>
        <div className="hoja-cab">
          <h2>{lugar ? 'Editar lugar' : 'Nuevo lugar'}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <label htmlFor="ln">Nombre</label>
        <input id="ln" value={nombre} onChange={(e) => setNombre(e.target.value)} required placeholder="Ej.: Capilla de San José" />
        <label htmlFor="lt">Tipo</label>
        <select id="lt" value={tipo} onChange={(e) => setTipo(e.target.value as TipoLugar)}>
          {Object.entries(TIPOS_LUGAR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label htmlFor="ld">Dirección o referencia (opcional)</label>
        <input id="ld" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        {lugar && (
          <label className="check">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Se usa actualmente (si lo quitas, ya no aparece al agendar)
          </label>
        )}
        <div className="acciones">
          <button className="btn" type="submit">Guardar</button>
          <button className="btn sec" type="button" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

export function Lugares({ perfil }: { perfil: Perfil }) {
  const lugares = useLugares();
  const [editando, setEditando] = useState<Lugar | 'nuevo' | null>(null);
  const puede = puedeEditarCatalogos(perfil.rol);
  const orden = [...lugares].sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <>
      <div className="fila entre" style={{ marginBottom: 12 }}>
        <h2>Lugares</h2>
        {puede && <button className="btn" onClick={() => setEditando('nuevo')}>+ Agregar</button>}
      </div>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Parroquia, capillas y demás lugares habituales. Para algo de una sola vez (una unción en una casa) elige
        «Otro lugar» al crear el evento.
      </p>
      {orden.length === 0 && <div className="vacio">Aún no hay lugares. Agrega la parroquia y las capillas.</div>}
      <div className="lista">
        {orden.map((l) => (
          <div key={l.id} className={`item ${puede ? 'clic' : ''} ${l.activo ? '' : 'inactivo'}`} onClick={() => puede && setEditando(l)}>
            <div>
              <b>{l.nombre}</b>{!l.activo && ' (sin uso)'}
              <div className="ayuda">{TIPOS_LUGAR[l.tipo]}{l.direccion ? ` · ${l.direccion}` : ''}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="ayuda" style={{ marginTop: 14 }}>🗺 Próximamente: ver las capillas en un mapa.</p>
      {editando && <FormLugar lugar={editando === 'nuevo' ? undefined : editando} onCerrar={() => setEditando(null)} />}
    </>
  );
}
