import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { usePerfiles } from '../lib/hooks';
import { actualizarPerfil, cancelarInvitacion, invitarUsuario, listarInvitaciones } from '../lib/store';
import { esErrorDeRed, mensajeDeError, useEstadoSync } from '../lib/sync';
import { compartir, conGuion, mensajeInvitacion } from '../lib/invitaciones';
import { nombrePerfil, ROLES, type Invitacion, type Perfil, type Rol } from '../types';
import { PersonasSecretaria } from './PersonasSecretaria';
import { VolverAjustes } from './VolverAjustes';

/** Solo el párroco: invita personas, aprueba cuentas y decide el rol de cada una. */
export function Usuarios({ perfil }: { perfil: Perfil }) {
  const perfiles = usePerfiles();
  const { enLinea } = useEstadoSync();
  const [error, setError] = useState('');
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([]);
  const [nueva, setNueva] = useState<Invitacion | null>(null);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<Rol>('secretaria');
  const [trabajando, setTrabajando] = useState(false);

  const orden = [...perfiles].sort(
    (a, b) => Number(a.activo) - Number(b.activo) || nombrePerfil(a).localeCompare(nombrePerfil(b), 'es'),
  );
  const pendientes = orden.filter((p) => !p.activo).length;

  const cargar = useCallback(async () => {
    try {
      setInvitaciones(await listarInvitaciones());
    } catch {
      /* sin internet: se muestra lo último */
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  function mostrarError(e: unknown) {
    setError(esErrorDeRed(e) ? 'Necesitas internet para hacer esto.' : mensajeDeError(e));
  }

  async function cambiar(p: Perfil, cambios: Partial<Pick<Perfil, 'rol' | 'activo' | 'nombre'>>) {
    setError('');
    try {
      await actualizarPerfil(p.id, cambios);
    } catch (e) {
      mostrarError(e);
    }
  }

  async function invitar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setTrabajando(true);
    try {
      const inv = await invitarUsuario({ nombre, email, rol });
      setNueva(inv);
      setNombre('');
      setEmail('');
      await cargar();
    } catch (err) {
      mostrarError(err);
    } finally {
      setTrabajando(false);
    }
  }

  async function cancelar(i: Invitacion) {
    if (!confirm(`¿Cancelar la invitación de ${i.nombre || i.email}?`)) return;
    try {
      await cancelarInvitacion(i.id);
      if (nueva?.id === i.id) setNueva(null);
      await cargar();
    } catch (e) {
      mostrarError(e);
    }
  }

  return (
    <>
      <VolverAjustes />
      <h2 style={{ marginBottom: 6 }}>Usuarios</h2>
      <p className="ayuda" style={{ marginTop: 0 }}>
        El <b>párroco</b> puede todo; la <b>oficina</b> (secretaria o secretario) maneja la agenda, avisos, lugares y misas fijas (si la usan
        varias personas, cada una se registra con su PIN: más abajo); el <b>vicario</b> ve toda la agenda y crea o edita eventos.
      </p>
      {!enLinea && <div className="aviso">Sin conexión: los cambios de usuarios requieren internet.</div>}
      {error && <div className="aviso error">{error}</div>}

      <form onSubmit={invitar} className="grupo">
        <h3 style={{ marginBottom: 4 }}>Invitar a alguien</h3>
        <p className="ayuda" style={{ marginTop: 0 }}>
          Escribe su nombre, su correo y su rol. Te daremos un código para que se registre y entre ya aprobada,
          eligiendo ella misma su contraseña.
        </p>
        <label htmlFor="in" style={{ marginTop: 0 }}>Nombre</label>
        <input id="in" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Rosa Pérez" required />
        <label htmlFor="ie">Correo electrónico</label>
        <input id="ie" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rosa@correo.com" required autoCapitalize="none" />
        <label htmlFor="ir">Rol</label>
        <select id="ir" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
          {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {rol === 'secretaria' && (
          <p className="ayuda" style={{ margin: '6px 0 0' }}>
            Si la usará una sola persona no hace falta nada más: lo que agende quedará a nombre de la cuenta. Si la usarán varias,
            regístralas con su PIN en «Personas de la Oficina», más abajo.
          </p>
        )}
        <button className="btn ancho" style={{ marginTop: 12 }} disabled={trabajando || !enLinea}>
          {trabajando ? 'Creando…' : 'Crear invitación'}
        </button>
      </form>

      {nueva && (
        <div className="aviso ok">
          <b>Invitación creada para {nueva.nombre || nueva.email}.</b>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: 3, margin: '8px 0' }}>{conGuion(nueva.codigo)}</div>
          <button className="btn chico" onClick={() => void compartir(mensajeInvitacion(nueva))}>Enviar mensaje con las instrucciones</button>
        </div>
      )}

      {invitaciones.length > 0 && (
        <>
          <h3 className="dia-titulo">Invitaciones pendientes</h3>
          <div className="lista" style={{ marginBottom: 16 }}>
            {invitaciones.map((i) => (
              <div key={i.id} className="item" style={{ flexWrap: 'wrap' }}>
                <div style={{ minWidth: 180 }}>
                  <b>{i.nombre || i.email}</b>
                  <div className="ayuda">{i.email} · {ROLES[i.rol]}</div>
                  <div style={{ fontWeight: 700, letterSpacing: 2 }}>{conGuion(i.codigo)}</div>
                </div>
                <button className="btn sec chico" onClick={() => void compartir(mensajeInvitacion(i))}>Mensaje</button>
                <button className="btn peligro chico" onClick={() => void cancelar(i)}>Cancelar</button>
              </div>
            ))}
          </div>
        </>
      )}

      <PersonasSecretaria perfil={perfil} />

      <h3 className="dia-titulo">Cuentas</h3>
      {pendientes > 0 && <div className="aviso">Hay {pendientes} cuenta(s) esperando tu aprobación.</div>}
      <div className="lista">
        {orden.map((p) => (
          <div key={p.id} className="item" style={{ flexWrap: 'wrap', background: p.activo ? undefined : '#fffaf0' }}>
            <div style={{ minWidth: 200 }}>
              <input
                defaultValue={p.nombre} aria-label="Nombre" placeholder="Nombre"
                onBlur={(e) => e.target.value.trim() !== p.nombre && void cambiar(p, { nombre: e.target.value.trim() })}
              />
              <div className="ayuda">{p.email}{p.id === perfil.id ? ' · (tú)' : ''}</div>
            </div>
            <select
              style={{ width: 150 }} value={p.rol} aria-label="Rol"
              onChange={(e) => void cambiar(p, { rol: e.target.value as Rol })}
            >
              {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {p.activo ? (
              <button className="btn peligro chico" onClick={() => confirm(`¿Quitar el acceso a ${nombrePerfil(p)}?`) && void cambiar(p, { activo: false })}>
                Quitar acceso
              </button>
            ) : (
              <button className="btn chico" onClick={() => void cambiar(p, { activo: true })}>Aprobar</button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
