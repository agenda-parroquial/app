import { useState, type FormEvent } from 'react';
import { useMinistros } from '../lib/hooks';
import { guardarMinistro } from '../lib/store';
import { puedeEditarCatalogos, TIPOS_MINISTRO, type Ministro, type Perfil, type TipoMinistro } from '../types';
import { Icono } from './Iconos';
import { VolverAjustes } from './VolverAjustes';

function FormMinistro({ ministro, onCerrar }: { ministro?: Ministro; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(ministro?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoMinistro>(ministro?.tipo ?? 'ministro');
  const [activo, setActivo] = useState(ministro?.activo ?? true);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    await guardarMinistro({ nombre: nombre.trim(), tipo, activo }, ministro?.id);
    onCerrar();
  }

  return (
    <div className="fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="hoja" onSubmit={guardar}>
        <div className="hoja-cab">
          <h2>{ministro ? 'Editar' : 'Agregar'} {TIPOS_MINISTRO[tipo].toLowerCase()}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <label htmlFor="mn" style={{ marginTop: 6 }}>Nombre</label>
        <input id="mn" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus placeholder="Ej.: Pbro. Luis Ramos" autoComplete="off" />
        <label>Es</label>
        <div className="segmentos lleno" role="group" aria-label="Tipo">
          {(Object.keys(TIPOS_MINISTRO) as TipoMinistro[]).map((t) => (
            <button type="button" key={t} className={tipo === t ? 'on' : ''} onClick={() => setTipo(t)}>{TIPOS_MINISTRO[t]}</button>
          ))}
        </div>
        {ministro && (
          <label className="check">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Disponible para elegirlo en los eventos
          </label>
        )}
        <p className="ayuda">
          No necesita cuenta ni correo: solo aparece en la lista de celebrantes al agendar. Si ya no está, desmarca «Disponible»:
          los eventos que ya lo tienen conservan su nombre.
        </p>
        <div className="acciones barra">
          <button className="btn" type="submit">Guardar</button>
          <button className="btn sec" type="button" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

/** El párroco o la secretaria registran a los ministros y vicarios que no tienen cuenta, para elegirlos como celebrantes. */
export function Ministros({ perfil }: { perfil: Perfil }) {
  const ministros = useMinistros();
  const [editando, setEditando] = useState<Ministro | 'nuevo' | null>(null);
  const puede = puedeEditarCatalogos(perfil.rol);
  const orden = [...ministros].sort(
    (a, b) => Number(b.activo) - Number(a.activo) || a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre, 'es'),
  );

  return (
    <>
      <VolverAjustes />
      <div className="fila entre" style={{ marginBottom: 12 }}>
        <h2>Ministros y vicarios</h2>
        {puede && <button className="btn chico" onClick={() => setEditando('nuevo')}><Icono n="mas" size={17} strokeWidth={2.4} />Agregar</button>}
      </div>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Las personas que celebran o ayudan pero no usan la app. Al agendar un evento o una misa fija las eliges como celebrante,
        junto a los sacerdotes con cuenta, y la app avisa si les empalmas dos eventos a la misma hora.
      </p>
      {orden.length === 0 && (
        <div className="vacio grande">
          <span className="vacio-ico"><Icono n="personas" size={26} /></span>
          <b>Aún no hay ministros ni vicarios</b>
          <span>Agrega a quienes celebran contigo para poder asignarles eventos.</span>
        </div>
      )}
      <div className="lista">
        {orden.map((m) => (
          <div key={m.id} className={`item ${puede ? 'clic' : ''} ${m.activo ? '' : 'inactivo'}`} onClick={() => puede && setEditando(m)}>
            <span className={`ico ${m.tipo === 'vicario' ? 'oro' : ''}`}><Icono n="persona" /></span>
            <div>
              <b>{m.nombre}</b>{!m.activo && ' (no disponible)'}
              <div className="ayuda">{TIPOS_MINISTRO[m.tipo]} · sin cuenta</div>
            </div>
          </div>
        ))}
      </div>
      {editando && <FormMinistro ministro={editando === 'nuevo' ? undefined : editando} onCerrar={() => setEditando(null)} />}
    </>
  );
}
