import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { identificarPin, PIN_MAX, PIN_MIN, segundosDeBloqueo } from '../lib/pin';
import type { Secretaria } from '../types';
import { Icono } from './Iconos';

export interface OpcionesPin {
  titulo?: string;
  texto: string;
  /** Si se pasa, el PIN debe ser de esa persona (p. ej. quien agendó el evento que se quiere editar). */
  exigirId?: string | null;
  /** Su nombre, para decir de quién es el evento si el PIN es de otra persona. */
  exigirNombre?: string | null;
}

/** Cuadro que pide el PIN y devuelve a la persona de la Secretaría a quien pertenece. */
function PedirPin({ parroquiaId, opciones, onListo, onCerrar }: {
  parroquiaId: string; opciones: OpcionesPin; onListo: (p: Secretaria) => void; onCerrar: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  // Si hay bloqueo, el aviso se va actualizando solo.
  useEffect(() => {
    if (!error.startsWith('Demasiados')) return;
    const t = window.setInterval(() => {
      const s = segundosDeBloqueo();
      if (s <= 0) { setError(''); window.clearInterval(t); } else setError(`Demasiados intentos. Espera ${s} segundos.`);
    }, 1000);
    return () => window.clearInterval(t);
  }, [error]);

  async function confirmar(e: FormEvent) {
    e.preventDefault();
    if (pin.length < PIN_MIN) return setError(`El PIN tiene de ${PIN_MIN} a ${PIN_MAX} números.`);
    setTrabajando(true);
    setError('');
    const r = await identificarPin(pin, parroquiaId);
    setTrabajando(false);
    if (!r.ok) {
      setPin('');
      return setError(
        r.motivo === 'bloqueado' ? `Demasiados intentos. Espera ${segundosDeBloqueo()} segundos.`
          : r.motivo === 'sin-datos' ? 'Este dispositivo todavía no tiene los PIN. Conéctate a internet un momento y vuelve a intentarlo.'
          : 'PIN incorrecto.',
      );
    }
    if (opciones.exigirId && r.persona.id !== opciones.exigirId) {
      setPin('');
      return setError(`Ese PIN es de ${r.persona.nombre}, pero este evento lo agendó ${opciones.exigirNombre ?? 'otra persona'}. Solo quien lo agendó puede cambiarlo.`);
    }
    onListo(r.persona);
  }

  return (
    <div className="fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="hoja" onSubmit={confirmar} autoComplete="off">
        <div className="hoja-cab">
          <h2>{opciones.titulo ?? 'Escribe tu PIN'}</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar">×</button>
        </div>
        <p className="ayuda" style={{ marginTop: 0 }}>{opciones.texto}</p>
        <label htmlFor="pin-sec" className="sr-solo">PIN</label>
        <input
          id="pin-sec" className="pin-campo" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code"
          maxLength={PIN_MAX} value={pin} autoFocus placeholder="••••"
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setError(''); }}
        />
        {error && <div className="aviso error"><Icono n="alerta" size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />{error}</div>}
        <div className="acciones barra">
          <button className="btn" type="submit" disabled={trabajando || pin.length < PIN_MIN}>{trabajando ? 'Comprobando…' : 'Confirmar'}</button>
          <button className="btn sec" type="button" onClick={onCerrar}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}

/**
 * \`pedir(opciones)\` abre el cuadro del PIN y devuelve a la persona de la Secretaría (o null si se cancela).
 * Hay que poner \`dialogo\` en la pantalla.
 */
export function usePedirPin(parroquiaId: string | null | undefined) {
  const [abierto, setAbierto] = useState<{ opciones: OpcionesPin; resolver: (p: Secretaria | null) => void } | null>(null);
  const pedir = useCallback(
    (opciones: OpcionesPin) => new Promise<Secretaria | null>((resolver) => setAbierto({ opciones, resolver })),
    [],
  );
  const cerrar = (p: Secretaria | null) => {
    abierto?.resolver(p);
    setAbierto(null);
  };
  const dialogo: ReactNode = abierto && parroquiaId
    ? <PedirPin parroquiaId={parroquiaId} opciones={abierto.opciones} onListo={cerrar} onCerrar={() => cerrar(null)} />
    : null;
  return { pedir, dialogo };
}
