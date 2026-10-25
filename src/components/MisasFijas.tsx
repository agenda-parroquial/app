import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { hhmm } from '../lib/fechas';
import { useLugares, usePerfiles } from '../lib/hooks';
import { guardarMisaFija } from '../lib/store';
import { DIAS, esSacerdote, puedeEditarCatalogos, type MisaFija, type Perfil } from '../types';

const DURACIONES = [30, 45, 60, 75, 90, 120];
const SIN_MISAS: MisaFija[] = [];

function FormMisa({ misa, onCerrar }: { misa?: MisaFija; onCerrar: () => void }) {
  const lugares = useLugares().filter((l) => l.activo || l.id === misa?.lugar_id);
  const sacerdotes = usePerfiles().filter((p) => p.activo && esSacerdote(p));
  const [dia, setDia] = useState(misa?.dia_semana ?? 0);
  const [hora, setHora] = useState(misa ? hhmm(misa.hora) : '08:00');
  const [duracion, setDuracion] = useState(misa?.duracion_min ?? 60);
  const [lugarId, setLugarId] = useState(misa?.lugar_id ?? '');
  const [asignado, setAsignado] = useState(misa?.asignado_a ?? '');
  const [intencion, setIntencion] = useState(misa?.intencion ?? '');
  const [activo, setActivo] = useState(misa?.activo ?? true);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    await guardarMisaFija(
      { dia_semana: dia, hora, duracion_min: duracion, lugar_id: lugarId, asignado_a: asignado || null, intencion: intencion.trim() || null, activo },
      misa?.id,
    );
    onCerrar();
  }

  return (
    <div className="fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="hoja" onSubmit={guardar}>
        <div className="hoja-cab">
          <h2>{misa ? 'Editar misa fija' : 'Nueva misa fija'}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <label htmlFor="md">Día de la semana</label>
        <select id="md" value={dia} onChange={(e) => setDia(Number(e.target.value))}>
          {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
        <div className="dos">
          <div>
            <label htmlFor="mh">Hora</label>
            <input id="mh" type="time" value={hora} onChange={(e) => setHora(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="mu">Duración</label>
            <select id="mu" value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
              {DURACIONES.map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
        </div>
        <label htmlFor="ml">Lugar</label>
        <select id="ml" value={lugarId} onChange={(e) => setLugarId(e.target.value)} required>
          <option value="">— Elegir —</option>
          {lugares.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
        <label htmlFor="ma">Quién la celebra (opcional)</label>
        <select id="ma" value={asignado} onChange={(e) => setAsignado(e.target.value)}>
          <option value="">Sin asignar</option>
          {sacerdotes.map((p) => <option key={p.id} value={p.id}>{p.nombre || p.email}</option>)}
        </select>
        <label htmlFor="mi">Intención habitual (opcional)</label>
        <input id="mi" value={intencion} onChange={(e) => setIntencion(e.target.value)} placeholder="Ej.: Por la comunidad" />
        {misa && (
          <label className="check">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Activa (si la quitas, deja de agendarse)
          </label>
        )}
        <p className="ayuda">
          Al guardar se agenda sola en los próximos 90 días. Las fechas que ya se hayan modificado a mano no se tocan.
        </p>
        <div className="acciones">
          <button className="btn" type="submit">Guardar</button>
          <button className="btn sec" type="button" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

export function MisasFijas({ perfil }: { perfil: Perfil }) {
  const lugares = useLugares();
  const perfiles = usePerfiles();
  const misas = useLiveQuery(() => db.misas_fijas.toArray(), [], SIN_MISAS);
  const [editando, setEditando] = useState<MisaFija | 'nueva' | null>(null);
  const puede = puedeEditarCatalogos(perfil.rol);

  return (
    <>
      <div className="fila entre" style={{ marginBottom: 12 }}>
        <h2>Misas fijas</h2>
        {puede && <button className="btn" onClick={() => setEditando('nueva')} disabled={!lugares.some((l) => l.activo)}>+ Agregar</button>}
      </div>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Los horarios de misa que se repiten cada semana. Aparecen solos en la agenda y avisan si algo se empalma con ellos.
      </p>
      {puede && !lugares.some((l) => l.activo) && <div className="aviso">Primero agrega al menos un lugar.</div>}
      {misas.length === 0 && <div className="vacio">Aún no hay misas fijas.</div>}
      {DIAS.map((nombre, d) => {
        const delDia = misas.filter((m) => m.dia_semana === d).sort((a, b) => a.hora.localeCompare(b.hora));
        if (!delDia.length) return null;
        return (
          <section key={d}>
            <h3 className="dia-titulo">{nombre}</h3>
            <div className="lista">
              {delDia.map((m) => (
                <div key={m.id} className={`item ${puede ? 'clic' : ''} ${m.activo ? '' : 'inactivo'}`} onClick={() => puede && setEditando(m)}>
                  <div>
                    <b>{hhmm(m.hora)}</b> · {lugares.find((l) => l.id === m.lugar_id)?.nombre ?? '—'}{!m.activo && ' (inactiva)'}
                    <div className="ayuda">
                      {m.duracion_min} min
                      {m.asignado_a ? ` · ${perfiles.find((p) => p.id === m.asignado_a)?.nombre ?? ''}` : ''}
                      {m.intencion ? ` · ${m.intencion}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {editando && <FormMisa misa={editando === 'nueva' ? undefined : editando} onCerrar={() => setEditando(null)} />}
    </>
  );
}
