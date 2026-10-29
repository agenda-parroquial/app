import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ir } from '../lib/hooks';
import { compartir, conGuion, mensajeInvitacion } from '../lib/invitaciones';
import {
  cancelarInvitacionParroco, crearParroquia, editarParroquia, eliminarParroquia, fijarVigencia, invitarParroco,
  listarParroquias,
} from '../lib/store';
import { esErrorDeRed, mensajeDeError, useEstadoSync } from '../lib/sync';
import { claveDia, deClave } from '../lib/fechas';
import { nombreParroquia, type ParroquiaAdmin } from '../types';
import { Diocesanos } from './Diocesanos';
import { Icono } from './Iconos';
import { LugaresParroquias } from './LugaresParroquias';
import { ResumenCreador } from './ResumenCreador';
import { estadoDe, ETIQUETA_ACCESO, porcentajeTiempo, porUrgencia, textoTiempo } from '../lib/vigencia';
import { VolverAjustes } from './VolverAjustes';

interface Creada {
  parroquia: string;
  nombre: string;
  email: string;
  codigo: string;
  obispo: boolean;
}

/** La fecha de hoy ('YYYY-MM-DD') en la zona horaria de la parroquia. */
function hoyEn(zona: string) {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: zona });
  } catch {
    return claveDia(new Date());
  }
}

/** Suma meses a una fecha sin pasarse de mes (31 ene + 1 mes = 28/29 feb). */
function sumarMeses(clave: string, meses: number) {
  const d = deClave(clave);
  const destino = new Date(d.getFullYear(), d.getMonth() + meses, 1);
  const ultimo = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  return claveDia(new Date(destino.getFullYear(), destino.getMonth(), Math.min(d.getDate(), ultimo)));
}

export type Pestana = 'resumen' | 'parroquias' | 'lugares' | 'diocesanos';

/** El nombre de la parroquia y su lugar (solo para distinguirlas): se cambian aquí y se guardan con el botón «Guardar». */
function NombreParroquia({ p, enLinea, onGuardar }: {
  p: ParroquiaAdmin; enLinea: boolean; onGuardar: (cambios: { nombre: string; lugar: string }) => Promise<void>;
}) {
  const [nombre, setNombre] = useState(p.nombre);
  const [lugar, setLugar] = useState(p.lugar ?? '');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setNombre(p.nombre), [p.nombre]);
  useEffect(() => setLugar(p.lugar ?? ''), [p.lugar]);
  const cambio = nombre.trim() !== '' && (nombre.trim() !== p.nombre || lugar.trim() !== (p.lugar ?? ''));
  return (
    <div style={{ width: '100%' }}>
      <label className="ayuda" style={{ margin: 0 }}>Nombre de la parroquia</label>
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} aria-label="Nombre de la parroquia" maxLength={120} />
      <label className="ayuda" style={{ margin: '8px 0 0' }}>Lugar (solo para distinguirla)</label>
      <input value={lugar} onChange={(e) => setLugar(e.target.value)} aria-label="Lugar de la parroquia" maxLength={120} placeholder="Ej.: Arroyo Hondo" />
      {cambio && (
        <button
          className="btn chico" style={{ marginTop: 8 }} disabled={!enLinea || guardando}
          onClick={async () => { setGuardando(true); try { await onGuardar({ nombre: nombre.trim(), lugar: lugar.trim() }); } finally { setGuardando(false); } }}
        >{guardando ? 'Guardando…' : 'Guardar'}</button>
      )}
    </div>
  );
}

/**
 * Panel del superadmin: crear parroquias, darle acceso a su párroco con una invitación
 * y suspender o reactivar parroquias. Solo gestiona accesos; no ve la agenda de nadie.
 */
export function Superadmin(
  { soloEsto = false, soloDiocesanos = false, seccion }: { soloEsto?: boolean; soloDiocesanos?: boolean; seccion?: Pestana },
) {
  const { enLinea } = useEstadoSync();
  const [parroquias, setParroquias] = useState<ParroquiaAdmin[] | null>(null);
  const [error, setError] = useState('');
  const [creada, setCreada] = useState<Creada | null>(null);
  const [nombre, setNombre] = useState('');
  const [lugar, setLugar] = useState('');
  const [email, setEmail] = useState('');
  const [nombreParroco, setNombreParroco] = useState('');
  const [vigenteNueva, setVigenteNueva] = useState('');
  const [esObispo, setEsObispo] = useState(false);
  const [nuevaAbierta, setNuevaAbierta] = useState(false);
  const [esObispoInv, setEsObispoInv] = useState(false);
  const [fechaVig, setFechaVig] = useState<Record<string, string>>({});
  const [pestanaInterna, setPestanaInterna] = useState<Pestana>('resumen');
  // Con `seccion` (la interfaz del Creador) la sección la manda el menú; sin ella, las pestañas de arriba.
  const pestana = seccion ?? pestanaInterna;
  const irA = (p: Pestana) => (seccion ? ir(p === 'resumen' ? 'cuentas' : p) : setPestanaInterna(p));
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [textoElimina, setTextoElimina] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [invitando, setInvitando] = useState<string | null>(null);
  const [emailInv, setEmailInv] = useState('');
  const [nombreInv, setNombreInv] = useState('');

  const cargar = useCallback(async () => {
    try {
      setParroquias(await listarParroquias());
    } catch (e) {
      setError(esErrorDeRed(e) ? 'Necesitas internet para ver las parroquias.' : mensajeDeError(e));
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function accion(f: () => Promise<void>) {
    setError('');
    try {
      await f();
      await cargar();
    } catch (e) {
      setError(esErrorDeRed(e) ? 'Necesitas internet para hacer esto.' : mensajeDeError(e));
    }
  }

  async function crear(e: FormEvent) {
    e.preventDefault();
    setError('');
    setTrabajando(true);
    try {
      const r = await crearParroquia({ nombre, lugar, email, nombreParroco, vigenteHasta: vigenteNueva, esObispo });
      setCreada({ parroquia: r.parroquia_id, nombre: nombre.trim(), email: email.trim().toLowerCase(), codigo: r.codigo, obispo: esObispo });
      setNombre('');
      setLugar('');
      setEmail('');
      setNombreParroco('');
      setVigenteNueva('');
      setEsObispo(false);
      setNuevaAbierta(false);
      await cargar();
    } catch (err) {
      setError(esErrorDeRed(err) ? 'Necesitas internet para hacer esto.' : mensajeDeError(err));
    } finally {
      setTrabajando(false);
    }
  }

  async function invitar(e: FormEvent, p: ParroquiaAdmin) {
    e.preventDefault();
    await accion(async () => {
      const codigo = await invitarParroco(p.id, emailInv, nombreInv, esObispoInv);
      setCreada({ parroquia: p.id, nombre: p.nombre, email: emailInv.trim().toLowerCase(), codigo, obispo: esObispoInv });
      setInvitando(null);
      setEmailInv('');
      setNombreInv('');
      setEsObispoInv(false);
    });
  }

  /** Da más tiempo de acceso: desde el vencimiento actual, o desde hoy si ya venció o no tenía fecha. */
  const extender = (p: ParroquiaAdmin, meses: number) => {
    const hoyP = hoyEn(p.zona_horaria);
    const base = p.vigente_hasta && p.vigente_hasta >= hoyP ? p.vigente_hasta : hoyP;
    return accion(() => fijarVigencia(p.id, sumarMeses(base, meses)));
  };

  async function eliminar(p: ParroquiaAdmin) {
    await accion(async () => {
      await eliminarParroquia(p.id, textoElimina);
      setEliminando(null);
      setTextoElimina('');
    });
  }

  const mensajeParroco = (c: { nombre?: string; email: string; codigo: string; obispo?: boolean }, parroquia: string) =>
    mensajeInvitacion({ nombre: c.nombre ?? '', email: c.email, codigo: c.codigo, rol: 'parroco', obispo: c.obispo }, parroquia);

  return (
    <>
      {!soloEsto && <VolverAjustes />}
      {soloDiocesanos && <><h2 style={{ marginBottom: 10 }}>Eventos diocesanos</h2><Diocesanos esAdmin={false} /></>}
      {!soloDiocesanos && !soloEsto && <h2 style={{ marginBottom: 10 }}>Administración</h2>}
      {!soloDiocesanos && !seccion && <div className="segmentos lleno compacto" style={{ marginBottom: 14 }} role="tablist" aria-label="Secciones de administración">
        <button className={pestana === 'resumen' ? 'on' : ''} onClick={() => irA('resumen')}>Resumen</button>
        <button className={pestana === 'parroquias' ? 'on' : ''} onClick={() => irA('parroquias')}>Parroquias</button>
        <button className={pestana === 'lugares' ? 'on' : ''} onClick={() => irA('lugares')}>Lugares</button>
        <button className={pestana === 'diocesanos' ? 'on' : ''} onClick={() => irA('diocesanos')}>Diocesanos</button>
      </div>}

      {!soloDiocesanos && pestana === 'resumen' && <>
        {!enLinea && <div className="aviso">Sin conexión: este panel requiere internet.</div>}
        {error && <div className="aviso error">{error}</div>}
        <ResumenCreador parroquias={parroquias} onVerParroquias={() => irA('parroquias')} />
      </>}
      {!soloDiocesanos && pestana === 'diocesanos' && <Diocesanos esAdmin />}
      {!soloDiocesanos && pestana === 'lugares' && <LugaresParroquias />}

      {!soloDiocesanos && pestana === 'parroquias' && <>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Aquí das acceso a cada párroco: creas su parroquia y le mandas un código de invitación. Cada párroco invita después a su
        oficina y a su vicario, y nadie ve la agenda de otra parroquia. Tú gestionas los accesos, no ves su agenda.
        Con una fecha de vigencia, el acceso de la parroquia se desactiva solo al pasar esa fecha.
      </p>
      {!enLinea && <div className="aviso">Sin conexión: este panel requiere internet.</div>}
      {error && <div className="aviso error">{error}</div>}

      <button
        className={`btn ancho ${nuevaAbierta ? 'sec' : ''}`} style={{ margin: '4px 0 12px' }}
        onClick={() => setNuevaAbierta(!nuevaAbierta)} aria-expanded={nuevaAbierta}
      >
        <Icono n={nuevaAbierta ? 'cerrar' : 'mas'} size={18} strokeWidth={2.4} />{nuevaAbierta ? 'Cerrar' : 'Nueva parroquia u obispo'}
      </button>

      {nuevaAbierta && <form onSubmit={crear} className="grupo">
        <h3 style={{ marginBottom: 4 }}>Nueva cuenta de parroquia u obispo</h3>
        <label htmlFor="pn" style={{ marginTop: 0 }}>Nombre de la parroquia (o del obispado)</label>
        <input id="pn" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Parroquia San José" required />
        <label htmlFor="pp">{esObispo ? 'Nombre del obispo' : 'Nombre del párroco'}</label>
        <input id="pp" value={nombreParroco} onChange={(e) => setNombreParroco(e.target.value)} placeholder="Ej.: Pbro. Juan Pérez" />
        <label htmlFor="pl">Lugar</label>
        <input id="pl" value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Ej.: Arroyo Hondo, Yumbo" required />
        <p className="ayuda" style={{ margin: '4px 0 0' }}>Solo sirve para distinguir parroquias con el mismo nombre; en la app se muestra únicamente el nombre.</p>
        <label htmlFor="pe">{esObispo ? 'Correo del obispo' : 'Correo del párroco'}</label>
        <input id="pe" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="padre@correo.com" required autoCapitalize="none" />
        <label className="check">
          <input type="checkbox" checked={esObispo} onChange={(e) => setEsObispo(e.target.checked)} />
          Esta persona es el obispo
        </label>
        <p className="ayuda" style={{ margin: '0 0 0' }}>
          {esObispo
            ? 'Tendrá su cuenta y su agenda como cualquier párroco, y además podrá publicar, editar y eliminar eventos diocesanos para todas las parroquias.'
            : 'Si es el obispo, márcalo: podrá además publicar eventos diocesanos.'}
        </p>
        <label htmlFor="pv">Acceso hasta (opcional)</label>
        <input id="pv" type="date" value={vigenteNueva} onChange={(e) => setVigenteNueva(e.target.value)} />
        <p className="ayuda" style={{ margin: '4px 0 0' }}>Si lo dejas vacío, no vence. Después puedes extenderlo con «+1 mes» o «+1 año».</p>
        <button className="btn ancho" style={{ marginTop: 12 }} disabled={trabajando || !enLinea}>
          {trabajando ? 'Creando…' : esObispo ? 'Crear cuenta del obispo e invitación' : 'Crear parroquia e invitación'}
        </button>
      </form>}

      {creada && (
        <div className="aviso ok">
          <b>Listo: {creada.nombre}{creada.obispo ? ' (obispo)' : ''}.</b> Dale este código a {creada.email}:
          <div style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: 3, margin: '8px 0' }}>{conGuion(creada.codigo)}</div>
          <button className="btn chico" onClick={() => void compartir(mensajeParroco(creada, creada.nombre))}>
            Enviar mensaje con las instrucciones
          </button>
        </div>
      )}

      <h3 className="dia-titulo">Parroquias ({parroquias?.length ?? '…'})</h3>
      {parroquias?.length === 0 && <p className="vacio">Todavía no hay parroquias.</p>}
      <div className="lista">
        {parroquias && [...parroquias].sort(porUrgencia).map((p) => {
          const { estado, dias } = estadoDe(p);
          return (
          <div key={p.id} className={`item cuenta ${estado}`} style={{ display: 'block', opacity: estado === 'suspendida' || estado === 'vencida' ? 0.85 : 1 }}>
            <div className="fila" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
              <NombreParroquia p={p} enLinea={enLinea} onGuardar={(cambios) => accion(() => editarParroquia(p.id, cambios))} />
            </div>
            <div className="fila" style={{ alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span className={`etq-vig ${estado}`}>{ETIQUETA_ACCESO[estado]}</span>
              <span className="ayuda" style={{ flex: 1, minWidth: 0 }}>
                <Icono n="calendario" size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />{textoTiempo(p, estado, dias)}
              </span>
            </div>
            <div className="medidor" aria-hidden><span style={{ width: `${porcentajeTiempo(dias)}%` }} /></div>
            <div className="ayuda">
              {p.usuarios} usuario(s) activo(s){p.pendientes > 0 ? ` · ${p.pendientes} sin aprobar` : ''} · {p.eventos_proximos ?? 0} evento(s) por venir
            </div>
            <div className="ayuda">
              Párroco: {p.parrocos.length ? p.parrocos.map((x) => `${x.nombre || x.email} (${x.email})${x.obispo ? ' · OBISPO' : ''}`).join(', ') : 'aún no se ha registrado'}
            </div>
            <div className="fila" style={{ marginTop: 6, alignItems: 'center' }}>
              <button className="btn sec chico" onClick={() => void extender(p, 1)} disabled={!enLinea}>+1 mes</button>
              <button className="btn sec chico" onClick={() => void extender(p, 12)} disabled={!enLinea}>+1 año</button>
              <input
                type="date" aria-label="Fecha de vigencia" style={{ width: 'auto', minHeight: 36 }}
                value={fechaVig[p.id] ?? ''} onChange={(e) => setFechaVig({ ...fechaVig, [p.id]: e.target.value })}
              />
              <button
                className="btn sec chico" disabled={!enLinea || !fechaVig[p.id]}
                onClick={() => void accion(async () => { await fijarVigencia(p.id, fechaVig[p.id]); setFechaVig({ ...fechaVig, [p.id]: '' }); })}
              >Fijar</button>
              {p.vigente_hasta && (
                <button className="btn sec chico" onClick={() => void accion(() => fijarVigencia(p.id, null))} disabled={!enLinea}>Sin límite</button>
              )}
            </div>

            {p.invitaciones.map((i) => (
              <div key={i.id} className="fila" style={{ alignItems: 'center', marginTop: 6 }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div className="ayuda">Invitación pendiente{i.obispo ? ' de obispo' : ''}: {i.nombre || i.email}</div>
                  <div style={{ fontWeight: 700, letterSpacing: 2 }}>{conGuion(i.codigo)}</div>
                </div>
                <button className="btn sec chico" onClick={() => void compartir(mensajeParroco(i, p.nombre))}>Mensaje</button>
                <button
                  className="btn peligro chico"
                  onClick={() => confirm(`¿Cancelar la invitación de ${i.nombre || i.email}?`) && void accion(() => cancelarInvitacionParroco(i.id))}
                >Cancelar</button>
              </div>
            ))}

            {invitando === p.id ? (
              <form onSubmit={(e) => void invitar(e, p)} style={{ marginTop: 8 }}>
                <input value={nombreInv} onChange={(e) => setNombreInv(e.target.value)} placeholder={esObispoInv ? 'Nombre del obispo' : 'Nombre del párroco'} aria-label="Nombre" />
                <input
                  type="email" value={emailInv} onChange={(e) => setEmailInv(e.target.value)} required
                  placeholder="Correo" aria-label="Correo" autoCapitalize="none" style={{ marginTop: 6 }}
                />
                <label className="check" style={{ marginTop: 6 }}>
                  <input type="checkbox" checked={esObispoInv} onChange={(e) => setEsObispoInv(e.target.checked)} />
                  Es el obispo (podrá publicar eventos diocesanos)
                </label>
                <div className="fila" style={{ marginTop: 8 }}>
                  <button className="btn chico" disabled={!enLinea}>Crear invitación</button>
                  <button type="button" className="btn sec chico" onClick={() => setInvitando(null)}>Cancelar</button>
                </div>
              </form>
            ) : (
              <div className="fila" style={{ marginTop: 8 }}>
                <button className="btn sec chico" onClick={() => { setInvitando(p.id); setEmailInv(''); setNombreInv(''); setEsObispoInv(false); }}>
                  Invitar otro párroco u obispo
                </button>
                {p.activa ? (
                  <button
                    className="btn peligro chico"
                    onClick={() => confirm(`¿Suspender ${p.nombre}? Nadie de esa parroquia podrá entrar hasta que la reactives.`) &&
                      void accion(() => editarParroquia(p.id, { activa: false }))}
                  >Suspender</button>
                ) : (
                  <button className="btn chico" onClick={() => void accion(() => editarParroquia(p.id, { activa: true }))}>Reactivar</button>
                )}
              </div>
            )}

            {eliminando === p.id ? (
              <div className="zona-peligro">
                <b>Eliminar {nombreParroquia(p)}</b>
                <p className="ayuda" style={{ color: 'var(--alerta)', margin: '4px 0 8px' }}>
                  Se borra para siempre, sin poder deshacerlo: {p.eventos ?? 0} evento(s), {p.lugares ?? 0} lugar(es), sus eventos fijos, ministros, tipos,
                  avisos, invitaciones y las cuentas de sus {p.usuarios + p.pendientes} usuario(s). Los dispositivos con esa parroquia perderán el acceso.
                </p>
                <label htmlFor={`el-${p.id}`} style={{ marginTop: 0 }}>Para confirmar, escribe: <b>{nombreParroquia(p)}</b></label>
                <input id={`el-${p.id}`} value={textoElimina} onChange={(e) => setTextoElimina(e.target.value)} autoComplete="off" autoCapitalize="none" />
                <div className="fila" style={{ marginTop: 8 }}>
                  <button
                    className="btn peligro chico" disabled={!enLinea || textoElimina.trim().toLowerCase() !== nombreParroquia(p).trim().toLowerCase()}
                    onClick={() => void eliminar(p)}
                  >Eliminar para siempre</button>
                  <button className="btn sec chico" onClick={() => { setEliminando(null); setTextoElimina(''); }}>Cancelar</button>
                </div>
              </div>
            ) : (
              <button
                className="enlace" style={{ marginTop: 10, padding: 0, color: 'var(--alerta)' }}
                onClick={() => { setEliminando(p.id); setTextoElimina(''); }}
              >Eliminar esta parroquia…</button>
            )}
          </div>
          );
        })}
      </div>
      </>}

    </>
  );
}
