import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import {
  claveDia, deClave, diaCorto, diaLargo, fechaDe, hoyClave, inicioSemana, mesAnio, sumarDias,
} from '../lib/fechas';
import { ir, useIdsPendientes, useLugares, usePerfiles } from '../lib/hooks';
import { puedeEditarIntenciones, type Evento, type Perfil } from '../types';
import { EventoForm } from './EventoForm';
import { Intenciones } from './Intenciones';
import { TarjetaEvento } from './TarjetaEvento';

const SIN_EVENTOS: Evento[] = [];

/** Ruta: agenda/<fecha>/<nuevo | id de evento> */
export function Agenda({ ruta, perfil }: { ruta: string[]; perfil: Perfil }) {
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(ruta[1] ?? '') ? ruta[1] : hoyClave();
  const accion = ruta[2];
  const [modo, setModo] = useState<'dia' | 'semana'>('dia');

  const lugares = useLugares();
  const perfiles = usePerfiles();
  const pendientes = useIdsPendientes();

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

  const evAbierto = useLiveQuery(
    () => (accion && accion !== 'nuevo' ? db.eventos.get(accion) : undefined),
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
  const hoy = hoyClave();
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(ini, i));
  const mostrar = modo === 'dia' ? [fecha] : dias.map(claveDia);

  return (
    <>
      <div className="navfecha">
        <button className="btn sec" onClick={() => irDia(claveDia(sumarDias(dia, -7)))} aria-label="Semana anterior">‹</button>
        <h2>{mesAnio(dia)}</h2>
        <button className="btn sec" onClick={() => irDia(hoy)}>Hoy</button>
        <button className="btn sec" onClick={() => irDia(claveDia(sumarDias(dia, 7)))} aria-label="Semana siguiente">›</button>
      </div>

      <div className="semana">
        {dias.map((d) => {
          const k = claveDia(d);
          const delDia = (porDia.get(k) ?? []).filter((e) => e.estado !== 'cancelado');
          return (
            <button key={k} className={[k === fecha ? 'sel' : '', k === hoy ? 'hoy' : ''].join(' ')} onClick={() => irDia(k)}>
              <small>{diaCorto(d)}</small>
              <b>{d.getDate()}</b>
              {delDia.length > 0 && <i className={delDia.some((e) => e.estado === 'en_conflicto') ? 'mal' : ''} />}
            </button>
          );
        })}
      </div>

      <div className="fila" style={{ marginBottom: 8 }}>
        <button className={`btn chico ${modo === 'dia' ? '' : 'sec'}`} onClick={() => setModo('dia')}>Día</button>
        <button className={`btn chico ${modo === 'semana' ? '' : 'sec'}`} onClick={() => setModo('semana')}>Semana</button>
      </div>

      {mostrar.map((k) => {
        const lista = porDia.get(k) ?? [];
        return (
          <section key={k}>
            <h3 className="dia-titulo">{diaLargo(deClave(k))}{k === hoy ? ' · hoy' : ''}</h3>
            {lista.length === 0 && modo === 'dia' && <div className="vacio">No hay nada agendado este día.</div>}
            {lista.length === 0 && modo === 'semana' && <div className="ayuda" style={{ margin: '0 2px 8px' }}>Sin eventos</div>}
            {lista.map((e) => (
              <TarjetaEvento
                key={e.id} evento={e} lugares={lugares} perfiles={perfiles}
                sinEnviar={pendientes.has(e.id)} onClick={() => ir(`agenda/${fecha}/${e.id}`)}
                nIntenciones={conteo.get(e.id) ?? 0} onIntenciones={() => ir(`agenda/${fecha}/${e.id}/intenciones`)}
              />
            ))}
          </section>
        );
      })}

      <button className="fab" onClick={() => ir(`agenda/${fecha}/nuevo`)} aria-label="Nuevo evento">+</button>

      {accion === 'nuevo' && <EventoForm fecha={fecha} onCerrar={() => irDia(fecha)} />}
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
