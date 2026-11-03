import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useAuth } from '../lib/auth';
import {
  claveDia, deClave, diaCorto, diaLargo, fechaDe, hoyClave, inicioSemana, mesAnio, sumarDias, sumarMeses,
} from '../lib/fechas';
import {
  ir, useAvisosParroquiales, useIdsPendientes, useIntencionesTipos, useLugares, useMinistros, useNombresTipos, useParroquia, usePerfiles, useSecretarias,
  useTiposEvento,
} from '../lib/hooks';
import { ponerVistaCompacta, usePrefDiocesanos, useVistaCompacta } from '../lib/preferencias';
import { claveTipo, llevaIntenciones, puedeEditarIntenciones, type Evento, type EventoDiocesano, type Perfil } from '../types';
import { BuscarEventos } from './BuscarEventos';
import { CalendarioMes, type MarcaDia } from './CalendarioMes';
import { FormularioDiocesano } from './Diocesanos';
import { EventoForm } from './EventoForm';
import { Icono } from './Iconos';
import { Intenciones } from './Intenciones';
import { DiocesanoDetalle, TarjetaDiocesana } from './TarjetaDiocesana';
import { TarjetaEvento } from './TarjetaEvento';

const SIN_EVENTOS: Evento[] = [];
const SIN_DIOCESANOS: EventoDiocesano[] = [];
const SIN_COLORES: Record<string, string> = {};

/**
 * Hoja de «Nuevo». Quien puede publicar eventos diocesanos (creador y obispo) elige arriba si el evento es
 * de su parroquia o diocesano; el creador, que no tiene parroquia, solo publica diocesanos.
 */
function NuevoEvento({ fecha, onCerrar, soloDiocesano, puedeDiocesano }: {
  fecha: string; onCerrar: () => void; soloDiocesano: boolean; puedeDiocesano: boolean;
}) {
  const [ambito, setAmbito] = useState<'parroquia' | 'diocesano'>(soloDiocesano ? 'diocesano' : 'parroquia');
  const selector = puedeDiocesano && !soloDiocesano ? (
    <div className="segmentos lleno" role="group" aria-label="Qué tipo de evento" style={{ margin: '2px 0 4px' }}>
      <button type="button" className={ambito === 'parroquia' ? 'on' : ''} onClick={() => setAmbito('parroquia')}>
        <Icono n="iglesia" size={16} />Parroquia
      </button>
      <button type="button" className={ambito === 'diocesano' ? 'on' : ''} onClick={() => setAmbito('diocesano')}>
        <Icono n="diocesis" size={16} />Diocesano
      </button>
    </div>
  ) : undefined;
  return ambito === 'parroquia'
    ? <EventoForm fecha={fecha} onCerrar={onCerrar} selector={selector} />
    : <FormularioDiocesano fecha={fecha} encabezado={selector} onCerrar={onCerrar} onGuardado={onCerrar} />;
}

/** Ruta: agenda/<fecha>/<nuevo | id de evento>. `soloDiocesana`: la agenda del creador, sin eventos de parroquia. */
export function Agenda({ ruta, perfil, soloDiocesana = false }: { ruta: string[]; perfil: Perfil; soloDiocesana?: boolean }) {
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(ruta[1] ?? '') ? ruta[1] : hoyClave();
  const accion = ruta[2];
  const [modo, setModo] = useState<'dia' | 'semana' | 'mes'>('dia');
  const { diocesano } = useAuth();

  const lugares = useLugares();
  const perfiles = usePerfiles();
  const ministros = useMinistros();
  const secretarias = useSecretarias();
  const tiposGuardados = useTiposEvento();
  const intencionesTipos = useIntencionesTipos(perfil.parroquia_id);
  const nombresTipos = useNombresTipos(perfil.parroquia_id);
  const pendientes = useIdsPendientes();
  const vistaCompacta = useVistaCompacta();
  const buscando = accion === 'buscar';   // la lupa del encabezado abre agenda/<fecha>/buscar
  // Tarjetas compactas que se desplegaron al tocarlas (se vuelven a contraer al cambiar de vista o de día).
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const alternar = (id: string) => setAbiertas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  useEffect(() => setAbiertas(new Set()), [vistaCompacta, fecha, modo]);

  // «En curso» y «Sigue» en la agenda de hoy se ponen al día cada minuto.
  const [, setLatido] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setLatido((n) => n + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const dia = deClave(fecha);
  // Lo que se carga: la semana del día elegido o, en la vista de mes, todas las semanas que muestra el calendario.
  const primeroDelMes = new Date(dia.getFullYear(), dia.getMonth(), 1);
  const ini = modo === 'mes' ? inicioSemana(primeroDelMes) : inicioSemana(dia);
  const nDias = modo === 'mes'
    ? Math.ceil((primeroDelMes.getDay() + new Date(dia.getFullYear(), dia.getMonth() + 1, 0).getDate()) / 7) * 7
    : 7;
  const claveIni = `${claveDia(ini)}+${nDias}`;
  const eventos = useLiveQuery(
    () => db.eventos.where('inicio').between(ini.toISOString(), sumarDias(ini, nDias).toISOString(), true, false).sortBy('inicio'),
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
    () => db.eventos_diocesanos.where('inicio').between(ini.toISOString(), sumarDias(ini, nDias).toISOString(), true, false)
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
    () => (accion && accion !== 'nuevo' && accion !== 'buscar' && !accion.startsWith('dio:') ? db.eventos.get(accion) : undefined),
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

  // Marcas del calendario del mes: un punto por día con eventos y el día de los diocesanos teñido.
  const marcas = useMemo(() => {
    const m = new Map<string, MarcaDia>();
    if (modo !== 'mes') return m;
    const marca = (k: string) => m.get(k) ?? { eventos: 0, conflicto: false, diocesano: false };
    for (const [k, lista] of porDia) {
      const vivos = lista.filter((e) => e.estado !== 'cancelado');
      if (vivos.length) m.set(k, { ...marca(k), eventos: vivos.length, conflicto: vivos.some((e) => e.estado === 'en_conflicto') });
    }
    for (const [k, lista] of dioPorDia) if (lista.length) m.set(k, { ...marca(k), diocesano: true });
    return m;
  }, [modo, porDia, dioPorDia]);

  const irDia = (k: string) => ir(`agenda/${k}`);
  const paso = (n: number) => irDia(claveDia(modo === 'mes' ? sumarMeses(dia, n) : sumarDias(dia, 7 * n)));
  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(ini, i));
  const mostrar = modo === 'semana' ? dias.map(claveDia) : [fecha];

  const ahoraISO = new Date().toISOString();   // se renueva cada minuto (latido)

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

  // ---- «Ahora»: al abrir el día de hoy (o la semana en curso) la agenda se coloca en el evento que ocurre o el que sigue ----
  /** Identifica lo que se está viendo; el desplazamiento automático se hace una vez por cada una. */
  const claveDeVista = (f: string) => (modo === 'mes' ? '' : modo === 'dia' ? `d${f}` : `s${claveIni}`);
  const claveVista = claveDeVista(fecha);
  const { anclaId, hayAntes } = useMemo(() => {
    if (modo === 'mes' || !mostrar.includes(hoy)) return { anclaId: null, hayAntes: false };
    const ahora = new Date().toISOString();
    let vistos = 0;
    for (const k of mostrar) {
      for (const e of porDia.get(k) ?? []) {
        if (k >= hoy && e.estado !== 'cancelado' && e.fin > ahora) return { anclaId: e.id, hayAntes: vistos > 0 };
        vistos++;
      }
    }
    return { anclaId: null, hayAntes: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, fecha, claveIni, hoy, porDia, ahoraISO.slice(0, 16)]);

  // ---- La parte de arriba (D/S/M, mes, días) queda fija: en pantallas grandes siempre; en el celular se esconde al bajar y reaparece al subir ----
  const cabRef = useRef<HTMLDivElement>(null);
  const centinelaRef = useRef<HTMLDivElement>(null);
  const bloqueoBarra = useRef(0);
  const ocultable = useRef(false);
  ocultable.current = modo === 'semana';   // solo en Semana la barra se esconde al bajar; en Día y Mes se queda fija
  const ocultarBarra = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    const cab = cabRef.current, cen = centinelaRef.current;
    if (!cab || !cen) return;
    const raiz = document.documentElement;
    const grande = window.matchMedia('(min-width: 860px)');
    const altoTop = () => document.querySelector('.top')?.getBoundingClientRect().height ?? 0;
    let ultimo = window.scrollY;
    const poner = (oculta: boolean) => {
      cab.classList.toggle('oculta', oculta);
      raiz.style.setProperty('--barra-h', oculta || grande.matches ? '0px' : `${cab.offsetHeight}px`);
    };
    // Por debajo del encabezado vino y, en pantallas grandes, de la franja de pestañas que también es fija
    const colocar = () => {
      const tabs = document.querySelector('.tabs');
      const fija = tabs && getComputedStyle(tabs).position === 'sticky' ? tabs.getBoundingClientRect().height : 0;
      cab.style.top = `${altoTop() + fija}px`;
    };
    const alDesplazar = () => {
      const y = window.scrollY;
      const umbral = cen.getBoundingClientRect().top + y - altoTop();   // desde aquí la barra ya no está en su lugar de origen
      cab.classList.toggle('pegada', y > umbral);
      if (grande.matches || !ocultable.current || y <= umbral) poner(false);
      else if (Date.now() >= bloqueoBarra.current) {
        if (y > ultimo + 4) poner(true);
        else if (y < ultimo - 4) poner(false);
      }
      if (Math.abs(y - ultimo) > 4) ultimo = y;
    };
    ocultarBarra.current = () => { bloqueoBarra.current = Date.now() + 1500; if (!grande.matches && ocultable.current) poner(true); };
    const alCambiar = () => { colocar(); alDesplazar(); };
    colocar(); alDesplazar();
    window.addEventListener('scroll', alDesplazar, { passive: true });
    window.addEventListener('resize', alCambiar);
    return () => {
      window.removeEventListener('scroll', alDesplazar);
      window.removeEventListener('resize', alCambiar);
      raiz.style.removeProperty('--barra-h');
      ocultarBarra.current = undefined;
    };
  }, []);

  /** Lo que queda fijo arriba de la lista: el encabezado vino y, en pantallas grandes, la franja de pestañas y esta barra. */
  const topeFijo = () => {
    let tope = document.querySelector('.top')?.getBoundingClientRect().bottom ?? 0;
    const tabs = document.querySelector('.tabs');
    if (tabs && getComputedStyle(tabs).position === 'sticky') tope = Math.max(tope, tabs.getBoundingClientRect().bottom);
    if (window.matchMedia('(min-width: 860px)').matches || !ocultable.current) tope += cabRef.current?.offsetHeight ?? 0;
    return tope;
  };

  /** Desplaza la agenda para que el evento que sigue (o el que está en curso) quede arriba, bajo los encabezados fijos. */
  const irAhora = (suave: boolean) => {
    const el = anclaId ? document.querySelector<HTMLElement>(`[data-evento="${anclaId}"]`) : null;
    if (!el) return;
    ocultarBarra.current?.();   // en Semana (celular) la barra se esconde para que el evento quede arriba y no reaparezca con este desplazamiento
    let tope = topeFijo();
    const titulo = el.closest('section')?.querySelector('.dia-titulo.pegado');
    if (titulo && getComputedStyle(titulo).position === 'sticky') tope += titulo.getBoundingClientRect().height;
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - tope - 8), behavior: suave && !quieto ? 'smooth' : 'auto' });
  };

  const yaColocada = useRef('');
  useEffect(() => {
    // Si no hay evento que seguir (o no hay nada arriba), se deja la agenda como está y no se vuelve a intentar en esta vista.
    const cerrar = window.setTimeout(() => { yaColocada.current = claveVista; }, 2000);
    return () => window.clearTimeout(cerrar);
  }, [claveVista]);
  useEffect(() => {
    if (!anclaId || yaColocada.current === claveVista) return;
    yaColocada.current = claveVista;
    if (hayAntes) requestAnimationFrame(() => irAhora(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anclaId, claveVista]);

  // El botón flotante «Ahora» aparece solo cuando ese evento ya no está en pantalla (y dice hacia dónde queda).
  const [lejos, setLejos] = useState<'arriba' | 'abajo' | null>(null);
  useEffect(() => {
    const el = anclaId ? document.querySelector<HTMLElement>(`[data-evento="${anclaId}"]`) : null;
    if (!el || !('IntersectionObserver' in window)) { setLejos(null); return; }
    const tope = Math.ceil(topeFijo());
    const obs = new IntersectionObserver(([ent]) => {
      setLejos(ent.isIntersecting ? null : ent.boundingClientRect.top < (ent.rootBounds?.top ?? 0) ? 'arriba' : 'abajo');
    }, { rootMargin: `-${tope}px 0px -64px 0px` });
    obs.observe(el);
    return () => { obs.disconnect(); setLejos(null); };
  }, [anclaId, modo, eventos, vistaCompacta, abiertas]);

  return (
    <>
      <div className="cabecera-agenda" ref={cabRef}>
      <div className="barra-agenda">
        <div className="segmentos" role="group" aria-label="Vista">
          <button className={modo === 'dia' ? 'on' : ''} onClick={() => setModo('dia')} aria-label="Día" title="Día">D</button>
          <button className={modo === 'semana' ? 'on' : ''} onClick={() => setModo('semana')} aria-label="Semana" title="Semana">S</button>
          <button className={modo === 'mes' ? 'on' : ''} onClick={() => setModo('mes')} aria-label="Mes" title="Mes">M</button>
        </div>
        <div className="herramientas">
          <div className="segmentos iconos" role="group" aria-label="Cómo ver los eventos">
            <button className={!vistaCompacta ? 'on' : ''} onClick={() => ponerVistaCompacta(false)} aria-label="Vista detallada" aria-pressed={!vistaCompacta} title="Vista detallada">
              <Icono n="tarjetas" size={18} />
            </button>
            <button className={vistaCompacta ? 'on' : ''} onClick={() => ponerVistaCompacta(true)} aria-label="Vista compacta: solo horario y evento" aria-pressed={vistaCompacta} title="Vista compacta: solo horario y evento">
              <Icono n="lista" size={18} />
            </button>
          </div>
          {!soloDiocesana && (
            <a className="chip" href="#/parroquiales" aria-label={nAvisos > 0 ? `Avisos parroquiales (${nAvisos})` : 'Avisos parroquiales'} title="Avisos parroquiales">
              <Icono n="megafono" size={18} /><span className="txt">Avisos</span>{nAvisos > 0 && <span className="num">{nAvisos}</span>}
            </a>
          )}
        </div>
      </div>

      <div className="navfecha">
        <button className="icono-btn claro" onClick={() => paso(-1)} aria-label={modo === 'mes' ? 'Mes anterior' : 'Semana anterior'}>
          <Icono n="izquierda" size={22} />
        </button>
        <h2>{mesAnio(dia)}</h2>
        <button className="btn sec chico" onClick={() => { irDia(hoy); if (anclaId && claveDeVista(hoy) === claveVista) irAhora(true); }}>Hoy</button>
        <button className="icono-btn claro" onClick={() => paso(1)} aria-label={modo === 'mes' ? 'Mes siguiente' : 'Semana siguiente'}>
          <Icono n="derecha" size={22} />
        </button>
      </div>

      {modo !== 'mes' && <div className="semana">
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
      </div>}
      </div>
      <div ref={centinelaRef} style={{ height: 0 }} />

      {modo === 'mes' && <CalendarioMes mes={dia} seleccionado={fecha} hoy={hoy} marcas={marcas} onElegir={irDia} />}

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
            {vacio && modo !== 'semana' && (
              <div className="vacio grande">
                <span className="vacio-ico"><Icono n="calendario" size={26} /></span>
                <b>Nada agendado este día</b>
                <span>{soloDiocesana ? 'Toca «Nuevo» para publicar un evento diocesano.' : 'Toca «Nuevo» para agendar una misa, un bautizo o lo que haga falta.'}</span>
              </div>
            )}
            {vacio && modo === 'semana' && <div className="ayuda" style={{ margin: '0 2px 8px' }}>Sin eventos</div>}
            {dio.map((d) => <TarjetaDiocesana key={d.id} evento={d} onClick={() => ir(`agenda/${fecha}/dio:${d.id}`)} />)}
            {lista.map((e) => {
              // Ya terminó (gris), ocurre ahora (verde) o está por venir. Lo ya terminado se contrae solo.
              const fase = e.fin <= ahoraISO ? 'pasado' : e.inicio <= ahoraISO ? 'curso' : 'proximo';
              const contraible = vistaCompacta || fase === 'pasado';
              const desplegada = abiertas.has(e.id);
              return (
              <TarjetaEvento
                key={e.id} evento={e} lugares={lugares} perfiles={perfiles} ministros={ministros} secretarias={secretarias}
                fase={fase} compacta={contraible && !desplegada} puedeContraer={contraible && desplegada} onAlternar={() => alternar(e.id)}
                nombresTipos={nombresTipos} color={colores[claveTipo(e)]} momento={momentos.get(e.id)}
                sinEnviar={pendientes.has(e.id)} onClick={() => ir(`agenda/${fecha}/${e.id}`)}
                nIntenciones={conteo.get(e.id) ?? 0}
                // Solo las misas (y los tipos que lo indiquen) llevan intenciones; quien las captura entra directo a editarlas.
                onIntenciones={llevaIntenciones(e, tiposGuardados, intencionesTipos) || (conteo.get(e.id) ?? 0) > 0
                  ? () => ir(`agenda/${fecha}/${e.id}/${puedeEditarIntenciones(perfil, e) ? 'editar-intenciones' : 'intenciones'}`)
                  : undefined}
              />
              );
            })}
          </section>
        );
      })}

      {buscando && (
        <BuscarEventos
          onCerrar={() => irDia(fecha)}
          onElegir={(k, ruta) => ir(`agenda/${k}/${ruta}`)}
        />
      )}

      {lejos && !accion && (
        <button className="ahora-flota" onClick={() => irAhora(true)} aria-label={`Ir al evento en curso o el que sigue (queda ${lejos === 'arriba' ? 'arriba' : 'abajo'})`}>
          <Icono n={lejos} size={18} strokeWidth={2.4} />Ahora
        </button>
      )}

      <button className="fab" onClick={() => ir(`agenda/${fecha}/nuevo`)} aria-label="Nuevo evento">
        <Icono n="mas" size={24} strokeWidth={2.6} />Nuevo
      </button>

      {accion === 'nuevo' && (
        <NuevoEvento fecha={fecha} onCerrar={() => irDia(fecha)} soloDiocesano={soloDiocesana} puedeDiocesano={diocesano} />
      )}
      {dioAbierto && <DiocesanoDetalle evento={dioAbierto} onCerrar={() => irDia(fecha)} puedeGestionar={diocesano} />}
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
