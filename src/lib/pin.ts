import { db } from './db';
import type { Secretaria } from '../types';

/**
 * PIN de las personas de la Secretaría. Varias personas usan la misma cuenta y cada una se identifica con su PIN
 * al agendar, editar o eliminar un evento; así queda a nombre de quien lo hizo.
 *
 * El PIN nunca se guarda: se convierte en una huella (PBKDF2) con la parroquia como sal, de modo que dos personas de la
 * misma parroquia no pueden tener el mismo PIN y el PIN basta para saber quién es. La huella viaja a la cuenta de Secretaría
 * para comprobar el PIN incluso sin internet. Sirve para saber quién hizo cada cosa; no es una barrera de seguridad,
 * porque un PIN de pocos dígitos se puede adivinar.
 */
export const PIN_MIN = 4;
export const PIN_MAX = 6;

export const pinValido = (pin: string) => new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);

export async function huellaPin(pin: string, parroquiaId: string): Promise<string> {
  const enc = new TextEncoder();
  const llave = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`agenda-parroquial:${parroquiaId}`), iterations: 100_000 },
    llave, 256,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Tras 5 intentos fallidos seguidos se espera medio minuto (para que no se pruebe PIN por PIN).
let fallos = 0;
let bloqueadoHasta = 0;
export const segundosDeBloqueo = () => Math.max(0, Math.ceil((bloqueadoHasta - Date.now()) / 1000));

export type ResultadoPin = { ok: true; persona: Secretaria } | { ok: false; motivo: 'incorrecto' | 'bloqueado' | 'sin-datos' };

/** Quién es la persona de la Secretaría con ese PIN (con los datos que ya hay en este dispositivo). */
export async function identificarPin(pin: string, parroquiaId: string): Promise<ResultadoPin> {
  if (segundosDeBloqueo() > 0) return { ok: false, motivo: 'bloqueado' };
  if ((await db.secretarias_pin.count()) === 0) return { ok: false, motivo: 'sin-datos' };
  const huella = await huellaPin(pin, parroquiaId);
  const fila = await db.secretarias_pin.filter((p) => p.pin_hash === huella).first();
  const persona = fila ? await db.secretarias.get(fila.id) : undefined;
  if (persona?.activo) {
    fallos = 0;
    return { ok: true, persona };
  }
  fallos += 1;
  if (fallos >= 5) {
    fallos = 0;
    bloqueadoHasta = Date.now() + 30_000;
  }
  return { ok: false, motivo: 'incorrecto' };
}
