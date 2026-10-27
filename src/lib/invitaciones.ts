import { ROLES, type Invitacion } from '../types';

export const conGuion = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;

/** Texto listo para mandar por WhatsApp o mensaje. `parroquia` solo se pone en la invitación de un párroco. */
export const mensajeInvitacion = (
  i: Pick<Invitacion, 'nombre' | 'email' | 'codigo' | 'rol'>,
  parroquia?: string,
) =>
  `Hola${i.nombre ? ` ${i.nombre}` : ''}, te invité a la Agenda Parroquial como ${ROLES[i.rol].toLowerCase()}` +
  `${parroquia ? ` de ${parroquia}` : ''}.\n\n` +
  `1. Entra a ${location.origin}\n2. Toca «No tengo cuenta · Registrarme»\n` +
  `3. Usa este correo: ${i.email}\n4. Escribe este código de invitación: ${conGuion(i.codigo)}\n` +
  `5. Elige tu contraseña.\n\nAl terminar entrarás directo, sin esperar aprobación.`;

export async function compartir(texto: string) {
  try {
    if (navigator.share) return void (await navigator.share({ text: texto }));
    await navigator.clipboard.writeText(texto);
    alert('Mensaje copiado. Pégalo en WhatsApp o donde quieras mandarlo.');
  } catch {
    /* el usuario cerró el cuadro de compartir */
  }
}
