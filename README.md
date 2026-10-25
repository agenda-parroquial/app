# Agenda Parroquial

App web instalable (PWA) para llevar la agenda de la parroquia entre la secretaria, el párroco y el vicario.

- **Funciona sin internet** en el teléfono y en la PC: se puede abrir, consultar y agregar eventos. Al volver la señal se sincroniza sola.
- **Avisos al instante** cuando alguien agrega, cambia o cancela algo (con la app abierta y con internet).
- **Detección de empalmes:** si dos eventos coinciden en horario y lugar (o con el mismo sacerdote), ambos se marcan en conflicto y se avisa a todos para resolverlo.
- **Misas fijas** semanales que aparecen solas en la agenda.
- **Roles:** párroco, secretaria y vicario; el párroco aprueba las cuentas.

Tecnología: React + Vite (PWA) · Dexie/IndexedDB (copia local) · Supabase (base de datos, usuarios y tiempo real) · Netlify (hosting).

---

## 1. Crear el proyecto en Supabase (gratis)

1. Entra a <https://supabase.com> → **New project**. Anota la contraseña de la base de datos.
2. **SQL Editor → New query**: pega **todo** el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**.
   - Si tu parroquia no está en la zona horaria de Ciudad de México, cambia `America/Mexico_City` en la primera línea de datos del archivo antes de ejecutarlo.
3. **Authentication → Providers → Email**: desactiva **Confirm email**. (No hace falta confirmar el correo: el párroco ya aprueba cada cuenta a mano.)
4. **Project Settings → API**: copia la **Project URL** y la clave **anon / publishable**.

## 2. Probarla en tu computadora

```bash
npm install
cp .env.example .env     # en Windows: copy .env.example .env
# edita .env y pega la URL y la clave de Supabase
npm run dev
```

## 3. Publicarla en Netlify (gratis)

1. Sube esta carpeta a un repositorio de GitHub (el archivo `.env` **no** se sube).
2. En <https://netlify.com> → **Add new site → Import from Git** y elige el repositorio. La configuración de compilación ya viene en `netlify.toml`.
3. **Site configuration → Environment variables**: agrega `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los mismos valores del `.env`.
4. Despliega. Netlify te da una dirección tipo `https://agenda-parroquia.netlify.app` (puedes cambiar el nombre en *Domain management*).
5. En Supabase → **Authentication → URL Configuration**, pon esa dirección en **Site URL**.

## 4. Primer uso

1. **El párroco se registra primero** desde la dirección de Netlify. El primer usuario que se registra queda automáticamente como párroco y con acceso.
2. En **Más → Lugares** agrega la parroquia, las capillas y la oficina.
3. En **Más → Misas fijas** agrega los horarios semanales.
4. La secretaria y el vicario se registran ellos mismos; el párroco los aprueba en **Más → Usuarios** y les asigna su rol.

| | Párroco | Secretaria | Vicario |
|---|:-:|:-:|:-:|
| Ver la agenda y los conflictos | ✔ | ✔ | ✔ |
| Crear, editar y cancelar eventos | ✔ | ✔ | ✔ |
| Lugares y misas fijas | ✔ | ✔ | solo ver |
| Aprobar cuentas y asignar roles | ✔ | — | — |

## 5. Instalar en el teléfono

- **iPhone:** abrir la dirección en **Safari** → Compartir → **Añadir a pantalla de inicio**. Abrirla desde ese ícono.
- **Android:** en Chrome → menú ⋮ → **Instalar aplicación**.
- **PC:** en Chrome o Edge, ícono de instalar en la barra de direcciones (opcional; también funciona como página normal).

**Importante:** abrir la app **una vez con internet** después de instalarla, para que descargue todo y funcione sin señal.

---

## Cómo se resuelven los empalmes

- Al escribir un evento, el formulario avisa al momento si se empalma con otro (incluso sin internet).
- Si se guarda igual, o si el empalme nace porque dos personas agendaron sin verse (por ejemplo, el párroco sin señal), al sincronizar **el servidor marca ambos eventos «EN CONFLICTO» y avisa a todos**.
- En la pestaña **Conflictos** se resuelve: cambiar horario o lugar, cancelar uno, o confirmar que pueden coexistir. Al cambiar o cancelar, el conflicto se cierra solo.
- Si dos personas editan **el mismo evento** a la vez, aparece «Cambio que chocó» mostrando las dos versiones para elegir cuál conservar. Solo viajan los campos que cada quien cambió, así que no se pisan cambios distintos.

La regla de empalme: se cruzan en el tiempo **y** comparten lugar (de la lista) **o** el mismo sacerdote asignado. Un evento en «Otro lugar (solo esta vez)» solo choca por sacerdote.

## Límites actuales y siguientes pasos

- **Avisos con la app cerrada (push):** hoy los avisos llegan al instante **solo mientras la app está abierta en pantalla**. Si el teléfono la suspende o está cerrada, los avisos se ven al abrirla. Para que suenen con la app cerrada (sobre todo en iPhone) falta la fase de *notificaciones push*.
- **Mapa de capillas:** la tabla de lugares ya guarda latitud y longitud. Falta la pantalla con mapa (Leaflet + OpenStreetMap, gratis).
- **PDF/impresión semanal** para el tablón: pendiente.
- **Supabase gratis** pausa un proyecto tras una semana sin actividad; con uso diario no ocurre. El plan gratis **no incluye respaldos automáticos**: conviene exportar las tablas `eventos`, `lugares` y `misas_fijas` a CSV de vez en cuando (Table Editor → Export).
- **Cerrar sesión borra los datos locales** de ese dispositivo; si hay cambios sin enviar, la app lo avisa antes.

## Estructura

```
supabase/schema.sql        tablas, roles, seguridad, detección de empalmes, misas fijas
src/lib/db.ts              copia local (Dexie)
src/lib/store.ts           escrituras "local primero" + cola de cambios pendientes
src/lib/sync.ts            enviar pendientes, traer cambios, tiempo real
src/lib/traslapes.ts       regla de empalme (espejo de la del servidor)
src/components/            pantallas
```
