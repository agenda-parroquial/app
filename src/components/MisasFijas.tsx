import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { deClave, diaBreve, hhmm, proximasFechas, proximoDia } from '../lib/fechas';
import { useIntencionesTipos, useLugares, useMinistros, useNombresTipos, usePerfiles, useTiposEvento } from '../lib/hooks';
import { guardarMisaFija, guardarTipoEvento } from '../lib/store';
import {
  baseLlevaIntenciones, celebranteDeValor, DIAS, esSacerdote, nombreCelebrante, nombrePerfil, nombreTipo, nombreTipoBase,
  puedeEditarCatalogos, TIPOS_EVENTO, valorCelebrante,
  type MisaFija, type Perfil, type TipoEvento,
} from '../types';
import { Icono } from './Iconos';
import { VolverAjustes } from './VolverAjustes';

const DURACIONES = [30, 45, 60, 75, 90, 120];
const FRECUENCIAS: Record<number, string> = {
  1: 'Todas las semanas',
  2: 'Cada 2 semanas (una sí, una no)',
  3: 'Cada 3 semanas',
  4: 'Cada 4 semanas',
};
const SIN_MISAS: MisaFija[] = [];
const norm = (s: string) => s.trim().toLowerCase();

/** Texto corto de la frecuencia para la lista: «Cada 2 semanas · próx. dom, 8 nov». */
const textoFrecuencia = (m: MisaFija) => {
  const cada = m.cada_semanas ?? 1;
  if (cada <= 1 || !m.desde) return '';
  return `Cada ${cada} semanas · próx. ${diaBreve(proximasFechas(m.desde, cada, 1)[0])}`;
};

function FormMisa({ misa, parroquiaId, onCerrar }: { misa?: MisaFija; parroquiaId: string | null; onCerrar: () => void }) {
  const tiposTodos = useTiposEvento();
  const nombresTipos = useNombresTipos(parroquiaId);
  const intencionesTipos = useIntencionesTipos(parroquiaId);
  const tiposGuardados = tiposTodos.filter((t) => t.activo || (misa?.tipo === 'otro' && norm(t.nombre) === norm(misa.tipo_texto ?? '')))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  // El selector vale: un tipo de la lista ('misa'…), 'guardado:<id>' o 'otro' (escribirlo, p. ej. «Hora Santa»).
  const [tipoSel, setTipoSel] = useState<string>(() => {
    if (!misa || misa.tipo !== 'otro') return misa?.tipo ?? 'misa';
    const g = tiposTodos.find((t) => norm(t.nombre) === norm(misa.tipo_texto ?? ''));
    return g ? `guardado:${g.id}` : 'otro';
  });
  const [tipoTexto, setTipoTexto] = useState(misa?.tipo === 'otro' ? misa.tipo_texto ?? '' : '');
  const [error, setError] = useState('');
  const tipoGuardadoSel = tipoSel.startsWith('guardado:') ? tiposTodos.find((t) => t.id === tipoSel.slice(9)) : undefined;
  const llevaInt = tipoSel.startsWith('guardado:') ? !!tipoGuardadoSel?.lleva_intenciones
    : tipoSel === 'otro' ? false : baseLlevaIntenciones(tipoSel as TipoEvento, intencionesTipos);
  const lugares = useLugares().filter((l) => l.activo || l.id === misa?.lugar_id);
  const sacerdotes = usePerfiles().filter((p) => p.activo && esSacerdote(p));
  const ministros = useMinistros().filter((m) => m.activo || m.id === misa?.ministro_id);
  const [dia, setDia] = useState(misa?.dia_semana ?? 0);
  const [hora, setHora] = useState(misa ? hhmm(misa.hora) : '08:00');
  const [duracion, setDuracion] = useState(misa?.duracion_min ?? 60);
  const [lugarId, setLugarId] = useState(misa?.lugar_id ?? '');
  const [celebrante, setCelebrante] = useState(misa ? valorCelebrante(misa) : '');
  const [intencion, setIntencion] = useState(misa?.intencion ?? '');
  const [activo, setActivo] = useState(misa?.activo ?? true);
  const [cada, setCada] = useState(misa?.cada_semanas ?? 1);
  const [desde, setDesde] = useState(misa?.desde ?? proximoDia(misa?.dia_semana ?? 0));

  // Con frecuencia alterna, la fecha de inicio manda: el día de la semana sale de ella.
  function cambiarDia(d: number) {
    setDia(d);
    setDesde(proximoDia(d));
  }
  function cambiarDesde(f: string) {
    setDesde(f);
    if (f) setDia(deClave(f).getDay());
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError('');
    let tipo: TipoEvento = 'misa';
    let tipo_texto: string | null = null;
    if (tipoSel.startsWith('guardado:')) {
      tipo = 'otro';
      tipo_texto = tipoGuardadoSel?.nombre ?? null;
    } else if (tipoSel === 'otro') {
      tipo_texto = tipoTexto.trim();
      if (!tipo_texto) return setError('Escribe el nombre del tipo de evento.');
      tipo = 'otro';
      // Un tipo escrito aquí se guarda en «Tipos de evento» para poder usarlo también en la agenda.
      const existente = tiposTodos.find((t) => norm(t.nombre) === norm(tipo_texto!));
      if (!existente) await guardarTipoEvento({ nombre: tipo_texto, activo: true });
      else if (!existente.activo) await guardarTipoEvento({ activo: true }, existente.id);
    } else {
      tipo = tipoSel as TipoEvento;
    }
    await guardarMisaFija(
      {
        tipo, tipo_texto,
        dia_semana: dia, hora, duracion_min: duracion, lugar_id: lugarId, ...celebranteDeValor(celebrante),
        intencion: llevaInt ? intencion.trim() || null : null, activo, cada_semanas: cada, desde: cada > 1 ? desde : null,
      },
      misa?.id,
    );
    onCerrar();
  }

  return (
    <div className="fondo">
      <form className="hoja" onSubmit={guardar}>
        <div className="hoja-cab">
          <h2>{misa ? 'Editar evento fijo' : 'Nuevo evento fijo'}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <label htmlFor="mt" style={{ marginTop: 6 }}>Tipo de evento</label>
        <select id="mt" value={tipoSel} onChange={(e) => setTipoSel(e.target.value)}>
          {(Object.keys(TIPOS_EVENTO) as TipoEvento[]).filter((k) => k !== 'otro').map((k) => (
            <option key={k} value={k}>{nombreTipoBase(k, nombresTipos)}</option>
          ))}
          {tiposGuardados.length > 0 && (
            <optgroup label="Tipos guardados">
              {tiposGuardados.map((t) => <option key={t.id} value={`guardado:${t.id}`}>{t.nombre}</option>)}
            </optgroup>
          )}
          <option value="otro">Otro (escribirlo)…</option>
        </select>
        {tipoSel === 'otro' && (
          <input
            style={{ marginTop: 8 }} value={tipoTexto} onChange={(e) => setTipoTexto(e.target.value)}
            placeholder="Ej.: Hora Santa" maxLength={60} aria-label="Nombre del tipo de evento"
          />
        )}
        <label htmlFor="md">Día de la semana</label>
        <select id="md" value={dia} onChange={(e) => cambiarDia(Number(e.target.value))}>
          {DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>

        <label htmlFor="mf">Frecuencia</label>
        <select
          id="mf" value={cada}
          onChange={(e) => {
            const n = Number(e.target.value);
            setCada(n);
            if (n > 1 && !desde) setDesde(proximoDia(dia));
          }}
        >
          {Object.entries(FRECUENCIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {cada > 1 && (
          <>
            <label htmlFor="ms">Primera fecha en que se celebra</label>
            <input id="ms" type="date" value={desde} onChange={(e) => cambiarDesde(e.target.value)} required />
            {desde && (
              <p className="ayuda" style={{ marginBottom: 0 }}>
                Se celebrará: <b>{proximasFechas(desde, cada, 4).map(diaBreve).join(' · ')}</b>…<br />
                {cada === 2 && 'Para alternar con otra misa a la misma hora, crea la otra con la fecha de inicio una semana después.'}
              </p>
            )}
          </>
        )}
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
        <label htmlFor="ma">Celebrante (opcional)</label>
        <select id="ma" value={celebrante} onChange={(e) => setCelebrante(e.target.value)}>
          <option value="">Sin asignar</option>
          {sacerdotes.length > 0 && (
            <optgroup label="Sacerdotes">
              {sacerdotes.map((p) => <option key={p.id} value={`p:${p.id}`}>{nombrePerfil(p)}</option>)}
            </optgroup>
          )}
          {ministros.some((m) => m.tipo === 'vicario') && (
            <optgroup label="Vicarios (sin cuenta)">
              {ministros.filter((m) => m.tipo === 'vicario').map((m) => <option key={m.id} value={`m:${m.id}`}>{m.nombre}</option>)}
            </optgroup>
          )}
          {ministros.some((m) => m.tipo === 'ministro') && (
            <optgroup label="Ministros extraordinarios">
              {ministros.filter((m) => m.tipo === 'ministro').map((m) => <option key={m.id} value={`m:${m.id}`}>{m.nombre}</option>)}
            </optgroup>
          )}
        </select>
        {llevaInt && (
          <>
            <label htmlFor="mi">Intención habitual (opcional)</label>
            <input id="mi" value={intencion} onChange={(e) => setIntencion(e.target.value)} placeholder="Ej.: Por la comunidad" />
          </>
        )}
        {misa && (
          <label className="check">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Activa (si la quitas, deja de agendarse)
          </label>
        )}
        <p className="ayuda">
          Al guardar se agenda sola en los próximos 90 días. Las fechas que ya se hayan modificado a mano no se tocan.
        </p>
        {error && <div className="aviso error">{error}</div>}
        <div className="acciones barra">
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
  const ministros = useMinistros();
  const nombresTipos = useNombresTipos(perfil.parroquia_id);
  const misas = useLiveQuery(() => db.misas_fijas.toArray(), [], SIN_MISAS);
  const [editando, setEditando] = useState<MisaFija | 'nueva' | null>(null);
  const puede = puedeEditarCatalogos(perfil.rol);

  return (
    <>
      <VolverAjustes />
      <div className="fila entre" style={{ marginBottom: 12 }}>
        <h2>Eventos fijos</h2>
        {puede && <button className="btn chico" onClick={() => setEditando('nueva')} disabled={!lugares.some((l) => l.activo)}><Icono n="mas" size={17} strokeWidth={2.4} />Agregar</button>}
      </div>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Los horarios que se repiten: misas, hora santa, confesiones, reuniones… Cada uno es de un tipo de evento. Aparecen solos en la agenda y avisan si algo se empalma con ellos.
      </p>
      {puede && !lugares.some((l) => l.activo) && <div className="aviso">Primero agrega al menos un lugar.</div>}
      {misas.length === 0 && (
        <div className="vacio grande">
          <span className="vacio-ico"><Icono n="iglesia" size={26} /></span>
          <b>Aún no hay eventos fijos</b>
          <span>Agrega los horarios que se repiten (misas, hora santa, confesiones…) y aparecerán solos en la agenda.</span>
        </div>
      )}
      {DIAS.map((nombre, d) => {
        const delDia = misas.filter((m) => m.dia_semana === d).sort((a, b) => a.hora.localeCompare(b.hora));
        if (!delDia.length) return null;
        return (
          <section key={d}>
            <h3 className="dia-titulo">{nombre}</h3>
            <div className="lista">
              {delDia.map((m) => (
                <div key={m.id} className={`item ${puede ? 'clic' : ''} ${m.activo ? '' : 'inactivo'}`} onClick={() => puede && setEditando(m)}>
                  <span className="ico oro"><Icono n="reloj" /></span>
                  <div>
                    <b>{hhmm(m.hora)}</b> · {nombreTipo({ tipo: m.tipo ?? 'misa', tipo_texto: m.tipo_texto ?? null }, nombresTipos)} · {lugares.find((l) => l.id === m.lugar_id)?.nombre ?? '—'}{!m.activo && ' (inactivo)'}
                    <div className="ayuda">
                      {textoFrecuencia(m) && <b>{textoFrecuencia(m)} · </b>}
                      {m.duracion_min} min
                      {nombreCelebrante(m, perfiles, ministros) ? ` · Celebrante: ${nombreCelebrante(m, perfiles, ministros)}` : ''}
                      {m.intencion ? ` · ${m.intencion}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
      {editando && <FormMisa misa={editando === 'nueva' ? undefined : editando} parroquiaId={perfil.parroquia_id} onCerrar={() => setEditando(null)} />}
    </>
  );
}
