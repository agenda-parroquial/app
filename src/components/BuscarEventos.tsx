import { Fragment, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useAuth } from '../lib/auth';
import { diaBreve, fechaDe, horaDe } from '../lib/fechas';
import { useLugares, useMinistros, useNombresTipos, usePerfiles } from '../lib/hooks';
import { usePrefDiocesanos } from '../lib/preferencias';
import { nombreCelebrante, nombreTipo, type Evento, type EventoDiocesano, type Intencion } from '../types';
import { Icono } from './Iconos';
import { nombreLugar } from './TarjetaEvento';

const SIN_EVENTOS: Evento[] = [];
const SIN_DIOCESANOS: EventoDiocesano[] = [];
const SIN_INTENCIONES: Intencion[] = [];
const POR_PAGINA = 40;

/** Minúsculas y sin acentos: «Sábado» y «sabado» coinciden. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Fila {
  id: string;
  ruta: string; // lo que se abre al tocar: <id> o dio:<id>
  inicio: string;
  fin: string;
  titulo: string;
  detalle: string;
  cancelado: boolean;
  diocesano: boolean;
  /** Todo lo que se puede buscar de este evento, ya sin acentos. */
  pajar: string;
  intenciones: string[];
}

/** Resalta lo que coincide con lo que se escribió. */
function Resaltado({ texto, palabras }: { texto: string; palabras: string[] }) {
  if (!palabras.length) return <>{texto}</>;
  const sin = norm(texto);
  const marcas: [number, number][] = [];
  for (const p of palabras) {
    let i = sin.indexOf(p);
    while (i >= 0) { marcas.push([i, i + p.length]); i = sin.indexOf(p, i + p.length); }
  }
  if (!marcas.length) return <>{texto}</>;
  marcas.sort((a, b) => a[0] - b[0]);
  const unidas: [number, number][] = [];
  for (const m of marcas) {
    const ult = unidas[unidas.length - 1];
    if (ult && m[0] <= ult[1]) ult[1] = Math.max(ult[1], m[1]); else unidas.push([...m]);
  }
  const partes: React.ReactNode[] = [];
  let pos = 0;
  unidas.forEach(([a, b], k) => {
    if (a > pos) partes.push(texto.slice(pos, a));
    partes.push(<mark key={k}>{texto.slice(a, b)}</mark>);
    pos = b;
  });
  if (pos < texto.length) partes.push(texto.slice(pos));
  return <>{partes.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>;
}

/**
 * Buscador de eventos: pasados, presentes y futuros, mientras se escribe. Busca en el título, el tipo, el lugar, el celebrante,
 * el motivo, las intenciones (nombres), el contacto, las notas y la fecha. Funciona con lo que ya está en este teléfono, sin internet.
 */
export function BuscarEventos({ onCerrar, onElegir }: { onCerrar: () => void; onElegir: (fecha: string, ruta: string) => void }) {
  const [texto, setTexto] = useState('');
  const consulta = useDeferredValue(texto);
  const [verProximos, setVerProximos] = useState(POR_PAGINA);
  const [verAnteriores, setVerAnteriores] = useState(POR_PAGINA);

  const lugares = useLugares();
  const perfiles = usePerfiles();
  const ministros = useMinistros();
  const pref = usePrefDiocesanos();
  const eventos = useLiveQuery(() => db.eventos.toArray(), [], SIN_EVENTOS);
  const diocesanos = useLiveQuery(() => db.eventos_diocesanos.filter((d) => d.activo).toArray(), [], SIN_DIOCESANOS);
  const intenciones = useLiveQuery(() => db.intenciones.filter((i) => i.activa).toArray(), [], SIN_INTENCIONES);
  const { perfil } = useAuth();
  const nombresTipos = useNombresTipos(perfil?.parroquia_id);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  // Lo que se puede buscar de cada evento: se arma una sola vez y no con cada letra.
  const filas = useMemo(() => {
    const textos = new Map<string, string[]>();
    for (const i of intenciones) textos.set(i.evento_id, [...(textos.get(i.evento_id) ?? []), i.texto]);
    const propios: Fila[] = eventos.map((e) => {
      const lugar = nombreLugar(e, lugares);
      const celebrante = nombreCelebrante(e, perfiles, ministros);
      const tipo = nombreTipo(e, nombresTipos);
      const ints = textos.get(e.id) ?? [];
      const k = fechaDe(e.inicio);
      return {
        id: e.id, ruta: e.id, inicio: e.inicio, fin: e.fin, titulo: e.titulo || tipo,
        detalle: [e.titulo ? tipo : '', lugar, celebrante ?? ''].filter(Boolean).join(' · '),
        cancelado: e.estado === 'cancelado', diocesano: false, intenciones: ints,
        pajar: norm([
          e.titulo, tipo, e.intencion, lugar, celebrante, e.contacto_nombre, e.contacto_telefono, e.notas, ...ints,
          k, diaBreve(k), horaDe(e.inicio), e.estado === 'cancelado' ? 'cancelado' : '',
        ].filter(Boolean).join(' | ')),
      };
    });
    const dio: Fila[] = pref.ocultarTodos ? [] : diocesanos.filter((d) => !pref.ocultos.includes(d.id)).map((d) => {
      const k = fechaDe(d.inicio);
      return {
        id: d.id, ruta: `dio:${d.id}`, inicio: d.inicio, fin: d.fin, titulo: d.titulo, detalle: ['Diocesano', d.lugar ?? ''].filter(Boolean).join(' · '),
        cancelado: false, diocesano: true, intenciones: [],
        pajar: norm([d.titulo, d.lugar, d.notas, 'diocesano', k, diaBreve(k), horaDe(d.inicio)].filter(Boolean).join(' | ')),
      };
    });
    return [...propios, ...dio];
  }, [eventos, diocesanos, intenciones, lugares, perfiles, ministros, nombresTipos, pref]);

  const palabras = useMemo(() => norm(consulta).split(/\s+/).filter(Boolean), [consulta]);
  const listo = norm(consulta).trim().length >= 2;

  const { proximos, anteriores } = useMemo(() => {
    if (!listo) return { proximos: [] as Fila[], anteriores: [] as Fila[] };
    const ahora = new Date().toISOString();
    const hallados = filas.filter((f) => palabras.every((p) => f.pajar.includes(p)));
    return {
      proximos: hallados.filter((f) => f.fin >= ahora).sort((a, b) => a.inicio.localeCompare(b.inicio)),   // lo que sigue, lo más cercano primero
      anteriores: hallados.filter((f) => f.fin < ahora).sort((a, b) => b.inicio.localeCompare(a.inicio)),  // lo ya pasado, lo más reciente primero
    };
  }, [filas, palabras, listo]);

  useEffect(() => { setVerProximos(POR_PAGINA); setVerAnteriores(POR_PAGINA); }, [consulta]);

  const fila = (f: Fila, pasado: boolean) => {
    const ahora = new Date().toISOString();
    const curso = !f.cancelado && f.inicio <= ahora && ahora < f.fin;
    const k = fechaDe(f.inicio);
    // Si lo que coincidió fue una intención, se muestra cuál.
    const porIntencion = f.intenciones.filter((t) => palabras.some((p) => norm(t).includes(p))).slice(0, 2);
    return (
      <button key={f.ruta} className={`res ${pasado ? 'pasado' : ''} ${curso ? 'curso' : ''}`} onClick={() => onElegir(k, f.ruta)}>
        <span className="quand"><b>{diaBreve(k)}</b><span>{horaDe(f.inicio)} – {horaDe(f.fin)}</span></span>
        <span className="que">
          <b><Resaltado texto={f.titulo} palabras={palabras} />{f.cancelado && <span className="etq cancelado" style={{ marginLeft: 8 }}>CANCELADO</span>}{curso && <span className="etq ahora" style={{ marginLeft: 8 }}>En curso</span>}</b>
          {f.detalle && <span className="ayuda"><Resaltado texto={f.detalle} palabras={palabras} /></span>}
          {porIntencion.length > 0 && <span className="ayuda"><Icono n="cruz" size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} /><Resaltado texto={porIntencion.join(' · ')} palabras={palabras} /></span>}
        </span>
      </button>
    );
  };

  return (
    <div className="fondo">
      <div className="hoja buscador" role="dialog" aria-label="Buscar eventos">
        <div className="hoja-cab">
          <h2>Buscar eventos</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar la búsqueda">×</button>
        </div>
        <div className="campo-busca">
          <input
            type="search" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus autoComplete="off" autoCapitalize="none"
            placeholder="Escribe: misa, bautizo, un nombre, un lugar…" aria-label="Buscar eventos"
          />
        </div>

        {!listo && (
          <p className="ayuda" style={{ marginTop: 0 }}>
            Busca entre todos los eventos, pasados, de hoy y por venir: por título, tipo, lugar, celebrante, motivo, el nombre de una intención,
            contacto, notas o fecha. Escribe al menos 2 letras.
          </p>
        )}
        {listo && proximos.length === 0 && anteriores.length === 0 && (
          <div className="vacio grande">
            <span className="vacio-ico"><Icono n="buscar" size={26} /></span>
            <b>Nada coincide con «{consulta.trim()}»</b>
            <span>Prueba con otra palabra o con menos letras.</span>
          </div>
        )}

        {proximos.length > 0 && (
          <>
            <h3 className="dia-titulo"><span>Hoy y por venir ({proximos.length})</span></h3>
            {proximos.slice(0, verProximos).map((f) => fila(f, false))}
            {proximos.length > verProximos && (
              <button className="btn sec ancho" onClick={() => setVerProximos(verProximos + POR_PAGINA)}>Mostrar más ({proximos.length - verProximos})</button>
            )}
          </>
        )}
        {anteriores.length > 0 && (
          <>
            <h3 className="dia-titulo"><span>Anteriores ({anteriores.length})</span></h3>
            {anteriores.slice(0, verAnteriores).map((f) => fila(f, true))}
            {anteriores.length > verAnteriores && (
              <button className="btn sec ancho" onClick={() => setVerAnteriores(verAnteriores + POR_PAGINA)}>Mostrar más ({anteriores.length - verAnteriores})</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
