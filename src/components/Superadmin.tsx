import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { compartir, conGuion, mensajeInvitacion } from '../lib/invitaciones';
import {
  cancelarInvitacionParroco, crearParroquia, editarParroquia, fijarVigencia, invitarParroco,
  listarParroquias,
} from '../lib/store';
import { esErrorDeRed, mensajeDeError, useEstadoSync } from '../lib/sync';
import { claveDia, deClave, diaBreve } from '../lib/fechas';
import { diasDeVigencia, type ParroquiaAdmin } from '../types';
import { Diocesanos } from './Diocesanos';
import { Icono } from './Iconos';
import { LugaresParroquias } from './LugaresParroquias';
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

/** Texto y estado de la vigencia de una parroquia. */
function describirVigencia(p: ParroquiaAdmin) {
  const dias = diasDeVigencia(p);
  if (dias === null) return { texto: 'Sin límite de fecha', vencida: false };
  const hasta = diaBreve(p.vigente_hasta!);
  if (dias < 0) return { texto: `Vencida desde el ${hasta}`, vencida: true };
  if (dias === 0) return { texto: `Vigente hasta hoy (${hasta})`, vencida: false };
  return { texto: `Vigente hasta el ${hasta} · quedan ${dias} día${dias === 1 ? '' : 's'}`, vencida: false };
}

/**
 * Panel del superadmin: crear parroquias, darle acceso a su párroco con una invitación
 * y suspender o reactivar parroquias. Solo gestiona accesos; no ve la agenda de nadie.
 */
export function Superadmin(
  { soloEsto = false, soloDiocesanos = false }: { soloEsto?: boolean; soloDiocesanos?: boolean },
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
  const [pestana, setPestana] = useState<'parroquias' | 'lugares' | 'diocesanos'>('parroquias');
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
      setCreada({ parroquia: r.parroquia_id, nombre: `${nombre.trim()}, ${lugar.trim()}`, email: email.trim().toLowerCase(), codigo: r.codigo, obispo: esObispo });
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

  const mensajeParroco = (c: { nombre?: string; email: string; codigo: string; obispo?: boolean }, parroquia: string) =>
    mensajeInvitacion({ nombre: c.nombre ?? '', email: c.email, codigo: c.codigo, rol: 'parroco', obispo: c.obispo }, parroquia);

  return (
    <>
      {!soloEsto && <VolverAjustes />}
      {soloDiocesanos && <><h2 style={{ marginBottom: 10 }}>Eventos diocesanos</h2><Diocesanos esAdmin={false} /></>}
      {!soloDiocesanos && !soloEsto && <h2 style={{ marginBottom: 10 }}>Administración</h2>}
      {!soloDiocesanos && <div className="segmentos lleno" style={{ marginBottom: 14 }} role="tablist" aria-label="Secciones de administración">
        <button className={pestana === 'parroquias' ? 'on' : ''} onClick={() => setPestana('parroquias')}>Parroquias</button>
        <button className={pestana === 'lugares' ? 'on' : ''} onClick={() => setPestana('lugares')}>Lugares</button>
        <button className={pestana === 'diocesanos' ? 'on' : ''} onClick={() => setPestana('diocesanos')}>Diocesanos</button>
      </div>}

      {!soloDiocesanos && pestana === 'diocesanos' && <Diocesanos esAdmin />}
      {!soloDiocesanos && pestana === 'lugares' && <LugaresParroquias />}

      {!soloDiocesanos && pestana === 'parroquias' && <>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Aquí das acceso a cada párroco: creas su parroquia y le mandas un código de invitación. Cada párroco invita después a su
        secretaria y a su vicario, y nadie ve la agenda de otra parroquia. Tú gestionas los accesos, no ves su agenda.
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
        <label htmlFor="pl">Lugar</label>
        <input id="pl" value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="Ej.: Arroyo Hondo, Yumbo" required />
        <label htmlFor="pp">{esObispo ? 'Nombre del obispo' : 'Nombre del párroco'}</label>
        <input id="pp" value={nombreParroco} onChange={(e) => setNombreParroco(e.target.value)} placeholder="Ej.: Pbro. Juan Pérez" />
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
        {parroquias?.map((p) => {
          const vig = describirVigencia(p);
          const hoyP = hoyEn(p.zona_horaria);
          const base = p.vigente_hasta && p.vigente_hasta >= hoyP ? p.vigente_hasta : hoyP; // desde dónde se extiende
          const extender = (meses: number) => accion(() => fijarVigencia(p.id, sumarMeses(base, meses)));
          return (
          <div key={p.id} className="item" style={{ display: 'block', opacity: p.activa && !vig.vencida ? 1 : 0.7 }}>
            <div className="fila" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
              <input
                defaultValue={p.nombre} aria-label="Nombre de la parroquia"
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== p.nombre &&
                  void accion(() => editarParroquia(p.id, { nombre: e.target.value.trim() }))}
              />
              <input
                defaultValue={p.lugar ?? ''} aria-label="Lugar de la parroquia" placeholder="Lugar"
                onBlur={(e) => e.target.value.trim() !== (p.lugar ?? '') && void accion(() => editarParroquia(p.id, { lugar: e.target.value.trim() }))}
              />
              {!p.activa && <span className="etq">Suspendida</span>}
              {p.activa && vig.vencida && <span className="etq conflicto">Vencida</span>}
            </div>
            <div className="ayuda">
              {p.usuarios} usuario(s) activo(s){p.pendientes > 0 ? ` · ${p.pendientes} sin aprobar` : ''}
            </div>
            <div className="ayuda">
              Párroco: {p.parrocos.length ? p.parrocos.map((x) => `${x.nombre || x.email} (${x.email})${x.obispo ? ' · OBISPO' : ''}`).join(', ') : 'aún no se ha registrado'}
            </div>
            <div className="ayuda" style={vig.vencida ? { color: 'var(--alerta)', fontWeight: 700 } : undefined}><Icono n="calendario" size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: 5 }} />{vig.texto}</div>
            <div className="fila" style={{ marginTop: 6, alignItems: 'center' }}>
              <button className="btn sec chico" onClick={() => void extender(1)} disabled={!enLinea}>+1 mes</button>
              <button className="btn sec chico" onClick={() => void extender(12)} disabled={!enLinea}>+1 año</button>
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
          </div>
          );
        })}
      </div>
      </>}

    </>
  );
}
