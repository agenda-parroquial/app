// Fechas en hora local del dispositivo; "clave" = 'YYYY-MM-DD'.
const pad = (n: number) => String(n).padStart(2, '0');

export const claveDia = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const deClave = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const hoyClave = () => claveDia(new Date());
export const sumarDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Suma meses sin pasarse de mes (31 ene + 1 mes = 28/29 feb). */
export const sumarMeses = (d: Date, n: number) => {
  const destino = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const ultimo = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate();
  return new Date(destino.getFullYear(), destino.getMonth(), Math.min(d.getDate(), ultimo));
};
export const inicioSemana = (d: Date) => sumarDias(d, -d.getDay()); // la semana empieza en domingo

export const horaDe = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fechaDe = (iso: string) => claveDia(new Date(iso));

export const aISO = (fecha: string, hora: string) => {
  const [y, m, d] = fecha.split('-').map(Number);
  const [h, mi] = hora.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi).toISOString();
};

export const sumarMinutos = (hora: string, min: number) => {
  const [h, m] = hora.split(':').map(Number);
  const total = Math.min(h * 60 + m + min, 23 * 60 + 59);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
};

export const diaLargo = (d: Date) => d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
export const diaCorto = (d: Date) => d.toLocaleDateString('es', { weekday: 'short' }).replace('.', '');
export const mesAnio = (d: Date) => d.toLocaleDateString('es', { month: 'long', year: 'numeric' });
export const fechaHoraCorta = (iso: string) =>
  new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Primer día (hoy incluido) que cae en ese día de la semana (0 = domingo). */
export const proximoDia = (dow: number, hoy = new Date()) => claveDia(sumarDias(hoy, (dow - hoy.getDay() + 7) % 7));

/** Próximas `n` fechas (desde hoy) de una serie que se repite cada `cada` semanas a partir de `desde`. */
export function proximasFechas(desde: string, cada: number, n: number, hoy = new Date()): string[] {
  let d = deClave(desde);
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const paso = Math.max(cada, 1) * 7;
  if (d < inicio) d = sumarDias(d, Math.ceil((inicio.getTime() - d.getTime()) / 86_400_000 / paso) * paso);
  return Array.from({ length: n }, (_, i) => claveDia(sumarDias(d, i * paso)));
}

/** 'dom, 8 nov' */
export const diaBreve = (k: string) =>
  deClave(k).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');

/** 'HH:MM:SS' (columna time de Postgres) → 'HH:MM' */
export const hhmm = (t: string) => t.slice(0, 5);
