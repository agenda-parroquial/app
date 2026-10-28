import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import {
  claveDia, deClave, diaCorto, diaLargo, fechaDe, hoyClave, inicioSemana, mesAnio, sumarDias,
} from '../lib/fechas';
import { ir, useAvisosParroquiales, useIdsPendientes, useLugares, useParroquia, usePerfiles } from '../lib/hooks';
import { usePrefDiocesanos } from '../lib/preferencias';
import { claveTipo, puedeEditarIntenciones, type Evento, type EventoDiocesano, type Perfil } from '../types';
import { EventoForm } from './EventoForm';
import { Icono } from './Iconos';
import { Intenciones } from './Intenciones';
import { DiocesanoDetalle, TarjetaDiocesana } from './TarjetaDiocesana';
import { TarjetaEvento } from './TarjetaEvento';

const SIN_EVENTOS: Evento[] = [];
const SIN_DIOCESANOS: EventoDiocesano[] = [];
const SIN_COLORES: Record<string, string> = {};

/** Ruta: agenda/<fecha>/<nuevo | id de evento> */
export function Agenda({ ruta, perfil }: { ruta: string[]; perfil: Perfil }) {
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(ruta[1] ?? '') ? ruta[1] : hoyClave();
  const accion = ruta[2];
  const [modo, setModo] = useState<'dia' | 'semana'>('dia');

  const lugares = useLugares();
  const perfiles = usePerfiles();
  const pendientes = useIdsPendientes();

  // «En curso» y «Sigue» en la agenda de hoy se ponen al día cada minuto.
  const [, setLatido] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setLatido((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const dia = deClave(fecha);
  const ini = inicioSemana(dia);
  const claveIni = claveDia(ini);
  const eventos = useLiveQuery(
    () => db.eventos.where('inicio').between(ini.toISOString(), sumarDias(ini, 7).toISOString(), true, false).sortBy('inicio'),
    [claveIni], SIN_EVENTOS,
  );

  const porDia = useMemo(() => {
    const m = new Map<string, Evento[]>();
    for (const e of eventos) {
      const k = fechaDe(e.inicio);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return m;
  }, [eventos]);

  // Eventos de la diócesis (indicativos): cada quien puede ocultarlos o ignorarlos.
  const parroquia = useParroquia(perfil.parroquia_id);
  const colores = parroquia?.colores ?? SIN_COLORES;
  const pref = usePrefDiocesanos();
  const diocesanos = useLiveQuery(
    () => db.eventos_diocesanos.where('inicio').between(ini.toISOString(), sumarDias(ini, 7).toISOString(), true, false)
      .filter((d) => d.activo).sortBy('inicio'),
    [claveIni], SIN_DIOCESANOS,
  );
  const dioPorDia = useMemo(() => {
    const m = new Map<string, EventoDiocesano[]>();
    if (pref.ocultarTodos) return m;
    for (const d of diocesanos) {
      if (pref.ocultos.includes(d.id)) continue;
      const k = fechaDe(d.inicio);
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return m;
  }, [diocesanos, pref]);

  // Avisos parroquiales vigentes (el botón «Avisos» muestra cuántos hay).
  const avisos = useAvisosParroquiales();
  const hoy = hoyClave();
  const nAvisos = avisos.filter((a) => a.activo && a.desde <= hoy && (!a.hasta || a.hasta >= hoy)).length;

  const evAbierto = useLiveQuery(
    () => (accion && accion !== 'nuevo' && !accion.startsWith('dio:') ? db.eventos.get(accion) : undefined),
    [accion],
  );
  const dioAbierto = useLiveQuery(
    () => (accion?.startsWith('dio:') ? db.eventos_diocesanos.get(accion.slice(4)) : undefined),
    [accion],
  );
  // .../intenciones = lista de solo lectura (botón de la tarjeta, para todos)
  // .../editar-intenciones = capturar y editar (desde «Editar evento», solo quien tiene permiso)
  const verIntenciones = ruta[3] === 'intenciones' || ruta[3] === 'editar-intenciones';
  const puedeEditar = !!evAbierto && puedeEditarIntenciones(perfil, evAbierto);

  // Cuántas intenciones tiene cada evento visible (para el botón de la tarjeta).
  const idsVisibles = eventos.map((e) => e.id);
  const conteo = useLiveQuery(
    async () => {
      const m = new Map<string, number>();
      const todas = await db.intenciones.where('evento_id').anyOf(idsVisibles).filter((i) => i.activa).toArray();
      todas.forEach((i) => m.set(i.evento_id, (m.get(i.evento_id) ?? 0) + 1));
      return m;
    },
    [idsVisibles.join(',')], new Map<string, number>(),
  );

  const irDia = (k: string) => ir(`agenda/${k}`);
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(ini, i));
  const mostrar = modo === 'dia' ? [fecha] : dias.map(claveDia);

  /** En la agenda de hoy: el evento que está ocurriendo y el primero que sigue. */
  const momentoDe = (k: string, lista: Evento[]) => {
    const m = new Map<string, 'ahora' | 'siguiente'>();
    if (k !== hoy) return m;
    const ahora = new Date().toISOString();
    const vivos = lista.filter((e) => e.estado !== 'cancelado');
    vivos.filter((e) => e.inicio <= ahora && ahora < e.fin).forEach((e) => m.set(e.id, 'ahora'));
    const sigue = vivos.find((e) => e.inicio > ahora);
    if (sigue) m.set(sigue.id, 'siguiente');
    return m;
  };

  return (
    <>
      <div className="navfecha">
        <button className="icono-btn claro" onClick={() => irDia(claveDia(sumarDias(dia, -7)))} aria-label="Semana anterior">
          <Icono n="izquierda" size={22} />
        </button>
        <h2>{mesAnio(dia)}</h2>
        <button className="btn sec chico" onClick={() => irDia(hoy)}>Hoy</button>
        <button className="icono-btn claro" onClick={() => irDia(claveDia(sumarDias(dia, 7)))} aria-label="Semana siguiente">
          <Icono n="derecha" size={22} />
        </button>
      </div>

      <div className="semana">
        {dias.map((d) => {
          const k = claveDia(d);
          const delDia = (porDia.get(k) ?? []).filter((e) => e.estado !== 'cancelado');
          const hayDio = (dioPorDia.get(k) ?? []).length > 0;
          return (
            <button
              key={k} className={[k === fecha ? 'sel' : '', k === hoy ? 'hoy' : ''].join(' ')} onClick={() => irDia(k)}
              aria-label={diaLargo(d)} aria-pressed={k === fecha}
            >
              <small>{diaCorto(d)}</small>
              <b>{d.getDate()}</b>
              {delDia.length > 0
                ? <i className={delDia.some((e) => e.estado === 'en_conflicto') ? 'mal' : ''} />
                : hayDio ? <i className="dio" /> : <i className="sin" />}
            </button>
          );
        })}
      </div>

      <div className="barra-agenda">
        <div className="segmentos" role="group" aria-label="Vista">
          <button className={modo === 'dia' ? 'on' : ''} onClick={() => setModo('dia')}>Día</button>
          <button className={modo === 'semana' ? 'on' : ''} onClick={() => setModo('semana')}>Semana</button>
        </div>
        <a className="chip" href="#/parroquiales">
          <Icono n="megafono" size={18} />Avisos{nAvisos > 0 && <span className="num">{nAvisos}</span>}
        </a>
      </div>

      {mostrar.map((k) => {
        const lista = porDia.get(k) ?? [];
        const dio = dioPorDia.get(k) ?? [];
        const vacio = lista.length === 0 && dio.length === 0;
        const momentos = momentoDe(k, lista);
        return (
          <section key={k}>
            <h3 className={`dia-titulo ${modo === 'semana' ? 'pegado' : ''}`}>
              <span>{diaLargo(deClave(k))}</span>
              {k === hoy && <span className="etq oro">Hoy</span>}
            </h3>
            {vacio && modo === 'dia' && (
              <div className="vacio grande">
                <span className="vacio-ico"><Icono n="calendario" size={26} /></span>
                <b>Nada agendado este día</b>
                <span>Toca «Nuevo» para agendar una misa, un bautizo o lo que haga falta.</span>
              </div>
            )}
            {vacio && modo === 'semana' && <div className="ayuda" style={{ margin: '0 2px 8px' }}>Sin eventos</div>}
            {dio.map((d) => <TarjetaDiocesana key={d.id} evento={d} onClick={() => ir(`agenda/${fecha}/dio:${d.id}`)} />)}
            {lista.map((e) => (
              <TarjetaEvento
                key={e.id} evento={e} lugares={lugares} perfiles={perfiles} color={colores[claveTipo(e)]} momento={momentos.get(e.id)}
                sinEnviar={pendientes.has(e.id)} onClick={() => ir(`agenda/${fecha}/${e.id}`)}
                nIntenciones={conteo.get(e.id) ?? 0} onIntenciones={() => ir(`agenda/${fecha}/${e.id}/intenciones`)}
              />
            ))}
          </section>
        );
      })}

      <button className="fab" onClick={() => ir(`agenda/${fecha}/nuevo`)} aria-label="Nuevo evento">
        <Icono n="mas" size={24} strokeWidth={2.6} />Nuevo
      </button>

      {accion === 'nuevo' && <EventoForm fecha={fecha} onCerrar={() => irDia(fecha)} />}
      {dioAbierto && <DiocesanoDetalle evento={dioAbierto} onCerrar={() => irDia(fecha)} />}
      {evAbierto && !verIntenciones && (
        <EventoForm
          key={evAbierto.id} evento={evAbierto} fecha={fecha} onCerrar={() => irDia(fecha)}
          onIntenciones={puedeEditar ? () => ir(`agenda/${fecha}/${evAbierto.id}/editar-intenciones`) : undefined}
        />
      )}
      {evAbierto && verIntenciones && (
        <Intenciones
          key={evAbierto.id + ruta[3]} evento={evAbierto} onCerrar={() => irDia(fecha)}
          editable={ruta[3] === 'editar-intenciones' && puedeEditar}
        />
      )}
    </>
  );
}
