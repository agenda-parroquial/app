import { useState, type FormEvent } from 'react';
import { useSecretarias } from '../lib/hooks';
import { huellaPin, PIN_MAX, PIN_MIN, pinValido } from '../lib/pin';
import { guardarSecretaria } from '../lib/store';
import { esErrorDeRed, mensajeDeError, useEstadoSync } from '../lib/sync';
import type { Perfil, Secretaria } from '../types';
import { Icono } from './Iconos';

function Formulario({ persona, parroquiaId, onCerrar }: { persona?: Secretaria; parroquiaId: string; onCerrar: () => void }) {
  const { enLinea } = useEstadoSync();
  const [nombre, setNombre] = useState(persona?.nombre ?? '');
  const [pin, setPin] = useState('');
  const [repite, setRepite] = useState('');
  const [activo, setActivo] = useState(persona?.activo ?? true);
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  // Al reactivar a alguien (o crearla) hace falta un PIN; al editar a una activa, el PIN solo si se quiere cambiar.
  const exigePin = !persona || (!persona.activo && activo);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (exigePin && !pin) return setError('Pon un PIN.');
    if (pin && !pinValido(pin)) return setError(`El PIN debe tener de ${PIN_MIN} a ${PIN_MAX} números.`);
    if (pin && pin !== repite) return setError('Los dos PIN no son iguales.');
    setTrabajando(true);
    try {
      await guardarSecretaria({
        id: persona?.id, nombre: nombre.trim(), activo,
        huellaPin: pin && activo ? await huellaPin(pin, parroquiaId) : undefined,
      });
      onCerrar();
    } catch (err) {
      setError(esErrorDeRed(err) ? 'Necesitas internet para guardar.' : mensajeDeError(err));
      setTrabajando(false);
    }
  }

  return (
    <div className="fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="hoja" onSubmit={guardar} autoComplete="off">
        <div className="hoja-cab">
          <h2>{persona ? 'Editar persona' : 'Agregar persona de la Secretaría'}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <label htmlFor="sn" style={{ marginTop: 6 }}>Nombre</label>
        <input id="sn" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus placeholder="Ej.: Rosa Pérez" autoComplete="off" />

        {activo && (
          <>
            <label htmlFor="sp">{persona && !exigePin ? 'Nuevo PIN (déjalo vacío para no cambiarlo)' : `PIN (${PIN_MIN} a ${PIN_MAX} números)`}</label>
            <input
              id="sp" className="pin-campo" type="password" inputMode="numeric" pattern="[0-9]*" maxLength={PIN_MAX} value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" placeholder="••••"
            />
            {pin && (
              <>
                <label htmlFor="sp2">Repite el PIN</label>
                <input
                  id="sp2" className="pin-campo" type="password" inputMode="numeric" pattern="[0-9]*" maxLength={PIN_MAX} value={repite}
                  onChange={(e) => setRepite(e.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" placeholder="••••"
                />
              </>
            )}
          </>
        )}

        {persona && (
          <label className="check">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
            Activa (si la desactivas, su PIN deja de servir)
          </label>
        )}
        <p className="ayuda">
          Cada persona tiene su propio PIN y no se pueden repetir. Quien lo escriba queda como la persona que agendó, editó o eliminó
          el evento. El PIN sirve para saber quién hizo cada cosa, no es una contraseña de seguridad: pídeles que no lo compartan.
        </p>
        {error && <div className="aviso error">{error}</div>}
        {!enLinea && <div className="aviso">Para guardar necesitas internet.</div>}
        <div className="acciones barra">
          <button className="btn" type="submit" disabled={trabajando || !enLinea}>{trabajando ? 'Guardando…' : 'Guardar'}</button>
          <button className="btn sec" type="button" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

/**
 * Las personas que usan la cuenta de Secretaría. Cada una tiene su PIN: al agendar un evento la app lo pide y el evento
 * queda a su nombre; solo ella (con su PIN) puede editarlo o eliminarlo después.
 */
export function PersonasSecretaria({ perfil }: { perfil: Perfil }) {
  const secretarias = useSecretarias();
  const [editando, setEditando] = useState<Secretaria | 'nueva' | null>(null);
  const orden = [...secretarias].sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'));

  return (
    <>
      <div className="fila entre" style={{ marginTop: 18 }}>
        <h3 className="dia-titulo" style={{ margin: 0, flex: 1 }}>Personas de la Secretaría</h3>
        <button className="btn chico" onClick={() => setEditando('nueva')} disabled={!perfil.parroquia_id}>
          <Icono n="mas" size={17} strokeWidth={2.4} />Agregar
        </button>
      </div>
      <p className="ayuda">
        La cuenta con el rol <b>Secretaría</b> la comparten varias personas. Regístralas aquí, cada una con su PIN: al agendar un evento la
        app pide el PIN y lo deja a su nombre, y la Secretaría solo puede editar o eliminar lo que agendó alguien de la Secretaría.
      </p>
      {orden.length === 0 && (
        <div className="aviso">
          Todavía no hay personas de la Secretaría. Sin ellas, la cuenta de Secretaría no puede agendar eventos.
        </div>
      )}
      <div className="lista">
        {orden.map((s) => (
          <div key={s.id} className={`item clic ${s.activo ? '' : 'inactivo'}`} onClick={() => setEditando(s)}>
            <span className="ico"><Icono n="persona" /></span>
            <div>
              <b>{s.nombre}</b>{!s.activo && ' (desactivada)'}
              <div className="ayuda">{s.activo ? 'Con PIN' : 'Sin PIN'}</div>
            </div>
          </div>
        ))}
      </div>
      {editando && perfil.parroquia_id && (
        <Formulario persona={editando === 'nueva' ? undefined : editando} parroquiaId={perfil.parroquia_id} onCerrar={() => setEditando(null)} />
      )}
    </>
  );
}
