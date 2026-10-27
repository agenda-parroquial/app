import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { compartir, conGuion, mensajeInvitacion } from '../lib/invitaciones';
import {
  asignarmeComoParroco, cancelarInvitacionParroco, crearParroquia, editarParroquia, invitarParroco, listarParroquias,
} from '../lib/store';
import { esErrorDeRed, mensajeDeError, useEstadoSync } from '../lib/sync';
import type { ParroquiaAdmin, Perfil } from '../types';
import { VolverAjustes } from './VolverAjustes';

const ZONAS = [
  'America/Mexico_City', 'America/Bogota', 'America/Lima', 'America/Caracas', 'America/Santiago',
  'America/Argentina/Buenos_Aires', 'America/Montevideo', 'America/Asuncion', 'America/La_Paz', 'America/Guayaquil',
  'America/Guatemala', 'America/El_Salvador', 'America/Tegucigalpa', 'America/Managua', 'America/Costa_Rica',
  'America/Panama', 'America/Havana', 'America/Santo_Domingo', 'America/Puerto_Rico', 'America/New_York',
  'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/Madrid',
];

interface Creada {
  parroquia: string;
  nombre: string;
  email: string;
  codigo: string;
}

/**
 * Panel del superadmin: crear parroquias, darle acceso a su párroco con una invitación
 * y suspender o reactivar parroquias. Solo gestiona accesos; no ve la agenda de nadie.
 */
export function Superadmin({ perfil, soloEsto = false }: { perfil: Perfil | null; soloEsto?: boolean }) {
  const { cerrarSesion } = useAuth();
  const { enLinea } = useEstadoSync();
  const [parroquias, setParroquias] = useState<ParroquiaAdmin[] | null>(null);
  const [error, setError] = useState('');
  const [creada, setCreada] = useState<Creada | null>(null);
  const [nombre, setNombre] = useState('');
  const [zona, setZona] = useState('America/Mexico_City');
  const [email, setEmail] = useState('');
  const [nombreParroco, setNombreParroco] = useState('');
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
      const r = await crearParroquia({ nombre, zona, email, nombreParroco });
      setCreada({ parroquia: r.parroquia_id, nombre: nombre.trim(), email: email.trim().toLowerCase(), codigo: r.codigo });
      setNombre('');
      setEmail('');
      setNombreParroco('');
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
      const codigo = await invitarParroco(p.id, emailInv, nombreInv);
      setCreada({ parroquia: p.id, nombre: p.nombre, email: emailInv.trim().toLowerCase(), codigo });
      setInvitando(null);
      setEmailInv('');
      setNombreInv('');
    });
  }

  const mensajeParroco = (c: { nombre?: string; email: string; codigo: string }, parroquia: string) =>
    mensajeInvitacion({ nombre: c.nombre ?? '', email: c.email, codigo: c.codigo, rol: 'parroco' }, parroquia);

  return (
    <>
      {!soloEsto && <VolverAjustes />}
      <h2 style={{ marginBottom: 6 }}>Parroquias y accesos</h2>
      <p className="ayuda" style={{ marginTop: 0 }}>
        Aquí das acceso a cada párroco: creas su parroquia y le mandas un código de invitación. Cada párroco invita después a su
        secretaria y a su vicario, y nadie ve la agenda de otra parroquia. Tú gestionas los accesos, no ves su agenda.
      </p>
      {!enLinea && <div className="aviso">Sin conexión: este panel requiere internet.</div>}
      {error && <div className="aviso error">{error}</div>}

      <form onSubmit={crear} className="grupo">
        <h3 style={{ marginBottom: 4 }}>Nueva parroquia</h3>
        <label htmlFor="pn" style={{ marginTop: 0 }}>Nombre de la parroquia</label>
        <input id="pn" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Parroquia San José" required />
        <label htmlFor="pz">Zona horaria</label>
        <input id="pz" list="zonas" value={zona} onChange={(e) => setZona(e.target.value)} required autoCapitalize="none" />
        <datalist id="zonas">{ZONAS.map((z) => <option key={z} value={z} />)}</datalist>
        <label htmlFor="pp">Nombre del párroco</label>
        <input id="pp" value={nombreParroco} onChange={(e) => setNombreParroco(e.target.value)} placeholder="Ej.: Pbro. Juan Pérez" />
        <label htmlFor="pe">Correo del párroco</label>
        <input id="pe" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="padre@correo.com" required autoCapitalize="none" />
        <button className="btn ancho" style={{ marginTop: 12 }} disabled={trabajando || !enLinea}>
          {trabajando ? 'Creando…' : 'Crear parroquia e invitación'}
        </button>
      </form>

      {creada && (
        <div className="aviso ok">
          <b>Listo: {creada.nombre}.</b> Dale este código a {creada.email}:
          <div style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: 3, margin: '8px 0' }}>{conGuion(creada.codigo)}</div>
          <button className="btn chico" onClick={() => void compartir(mensajeParroco(creada, creada.nombre))}>
            Enviar mensaje con las instrucciones
          </button>
        </div>
      )}

      <h3 className="dia-titulo">Parroquias ({parroquias?.length ?? '…'})</h3>
      {parroquias?.length === 0 && <p className="vacio">Todavía no hay parroquias.</p>}
      <div className="lista">
        {parroquias?.map((p) => (
          <div key={p.id} className="item" style={{ display: 'block', opacity: p.activa ? 1 : 0.7 }}>
            <div className="fila" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
              <input
                defaultValue={p.nombre} aria-label="Nombre de la parroquia"
                onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== p.nombre &&
                  void accion(() => editarParroquia(p.id, { nombre: e.target.value.trim() }))}
              />
              {!p.activa && <span className="etq">Suspendida</span>}
            </div>
            <div className="ayuda">
              {p.usuarios} usuario(s) activo(s){p.pendientes > 0 ? ` · ${p.pendientes} sin aprobar` : ''} · {p.zona_horaria}
            </div>
            <div className="ayuda">
              Párroco: {p.parrocos.length ? p.parrocos.map((x) => `${x.nombre || x.email} (${x.email})`).join(', ') : 'aún no se ha registrado'}
            </div>

            {p.invitaciones.map((i) => (
              <div key={i.id} className="fila" style={{ alignItems: 'center', marginTop: 6 }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div className="ayuda">Invitación pendiente: {i.nombre || i.email}</div>
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
                <input value={nombreInv} onChange={(e) => setNombreInv(e.target.value)} placeholder="Nombre del párroco" aria-label="Nombre" />
                <input
                  type="email" value={emailInv} onChange={(e) => setEmailInv(e.target.value)} required
                  placeholder="Correo" aria-label="Correo" autoCapitalize="none" style={{ marginTop: 6 }}
                />
                <div className="fila" style={{ marginTop: 8 }}>
                  <button className="btn chico" disabled={!enLinea}>Crear invitación</button>
                  <button type="button" className="btn sec chico" onClick={() => setInvitando(null)}>Cancelar</button>
                </div>
              </form>
            ) : (
              <div className="fila" style={{ marginTop: 8 }}>
                <button className="btn sec chico" onClick={() => { setInvitando(p.id); setEmailInv(''); setNombreInv(''); }}>
                  Invitar otro párroco
                </button>
                {perfil && perfil.parroquia_id === null && (
                  <button
                    className="btn sec chico"
                    onClick={() => confirm(`¿Ser párroco de ${p.nombre} y usar su agenda con tu cuenta?`) &&
                      void accion(async () => { await asignarmeComoParroco(p.id); location.reload(); })}
                  >Usar mi cuenta aquí</button>
                )}
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
        ))}
      </div>

      {soloEsto && (
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button className="enlace" onClick={() => void cerrarSesion()}>Cerrar sesión</button>
        </div>
      )}
    </>
  );
}
