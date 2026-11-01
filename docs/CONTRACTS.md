# CONTRACTS — Emerald City

**contract-v0.2** · **backend-v0.2** · design: ninguna entrega todavía (interfaz provisional)

> Este archivo es el contrato compartido entre Programador, Diseñador e Integrador. Lo mantiene el Programador. El Diseñador aporta la tabla de nombres; el Integrador solo lee y audita.
> Nota de v0.2: el Programador no pudo leer la v0.1 desde el repositorio, así que este archivo se reconstruyó desde el BRIEF v1.6 y el canon de continuidad. Si la v0.1 tenía algo que aquí falta, se recupera desde el historial de GitHub.

## 1. Respuestas del proyecto

| Tema | Valor |
|---|---|
| Modo | Proyecto nuevo (create) |
| Roles | Administrador (código de sala), Jugador (solo apodo) |
| Login | Ninguno. Admin entra con código generado al crear la sala (se guarda solo el hash) |
| Idioma | Español, nombres de Pokémon en español |
| Zona horaria | America/Caracas (UTC-4). En base de datos todo `timestamptz` en UTC |
| Modo oscuro | Sí, tema base (verde oscuro y negro). ASSUMPTION: sin modo claro |
| Citas/reservas | No |
| Pagos | No (sin Stripe, sin monetización) |
| Móvil | Obligatorio |
| Salas | Una sola sala activa a la vez |
| Jugadores | Hasta 100 por sala (plan B: 30 a 50) |
| Costo | Cero |

## 2. Stack y versiones

| Pieza | Versión | Origen |
|---|---|---|
| Next.js | 15.5.28 (App Router) | build de Vercel |
| React | ^19 | package.json |
| TypeScript | strict + noUncheckedIndexedAccess | tsconfig.json |
| Zod | ^4 | package.json |
| Tailwind CSS | ^4 (tokens en `@theme`) | package.json |
| ESLint | 8 | package.json |
| Supabase | proyecto de PRUEBAS "Projecto Dinamica Frio-Caliente", us-west-2, Postgres 17 | Supabase |
| Hosting | Vercel Hobby, equipo emerald-city1, proyecto emerald-city | Vercel |
| Aún no instalados | @supabase/supabase-js, @supabase/ssr, Vitest, TanStack Query | llegan con el paso que los usa |

Pendiente: fijar versión de Node (package.json dice `>=20`, Vercel usa 26.x).

## 3. Variables de entorno (solo nombres)

| Variable | Tipo | Dónde se usa |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | pública | navegador y servidor |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | pública | navegador y servidor |
| `SUPABASE_SERVICE_ROLE_KEY` | **secreta, solo servidor** | lecturas de `pokemon` y lógica de salas. Nunca con prefijo `NEXT_PUBLIC_` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | secretas | NO se usan en la Fase 1 (decisión pendiente, ver sección 9) |

Producción y Preview apuntan hoy al Supabase de PRUEBAS (decisión temporal). Al crear el Supabase definitivo solo cambian las de Production.

## 4. Mapa "nombre en diseño → archivo en código"

Interfaz **provisional**: el Diseñador entra al final y reconcilia con esta tabla. Todo renombre se reporta, nunca se hace en silencio.

| Nombre en diseño | Archivo en código | Estado |
|---|---|---|
| Página principal (con espacio de logo) | `app/page.tsx` | provisional |
| Layout raíz | `app/layout.tsx` | provisional |
| Tokens de color y tema | `app/globals.css` (bloque `@theme`) | provisional |
| Health check | `app/api/health/route.ts` | definitivo |
| Validación de variables de entorno | `lib/env.ts` | definitivo |
| Esquema y búsqueda de Pokémon | `lib/validation/pokemon.ts` | definitivo |

## 5. Tokens

Definidos en `app/globals.css`: `ec-bg`, `ec-surface`, `ec-primary` (valor **EXAMPLE**, HEX real pendiente del cliente), `ec-text`, `ec-muted`. Los valores viven solo en ese archivo.

## 6. Matriz de permisos (v0.2)

Nadie inicia sesión en Supabase: Jugador y Administrador llegan a la base como el rol técnico `anon`. Quién es admin y quién es jugador se decide **en el código del servidor** (desde el Paso 3) y el servidor accede con `service_role`. El navegador solo usa `anon`.

| role | table | SELECT | INSERT | UPDATE | DELETE | policy name |
|---|---|---|---|---|---|---|
| anon | `pokemon` | ✗ | ✗ | ✗ | ✗ | ninguna (RLS activo sin políticas = denegado) |
| authenticated | `pokemon` | ✗ | ✗ | ✗ | ✗ | ninguna (RLS activo sin políticas = denegado) |
| service_role | `pokemon` | ✓ | ✗ | ✗ | ✗ | n/a (omite RLS; solo privilegio SELECT) |
| anon | `pokemon_names` (vista) | ✓ | ✗ | ✗ | ✗ | n/a (vista; privilegio SELECT) |
| authenticated | `pokemon_names` (vista) | ✓ | ✗ | ✗ | ✗ | n/a (vista; privilegio SELECT) |
| service_role | `pokemon_names` (vista) | ✓ | ✗ | ✗ | ✗ | n/a (vista; privilegio SELECT) |

Justificación escrita:
- `pokemon` guarda tipo y generación, que son las pistas del juego. Si el navegador pudiera leerla, un jugador vería la respuesta. Por eso no tiene políticas y se le quitaron todos los privilegios a `anon` y `authenticated`: doble barrera.
- `pokemon_names` expone solo `id`, `nombre_es`, `search_key`. Es pública a propósito (los nombres no son secretos; lo secreto es cuál se eligió). La vista usa los derechos de su dueño (`security_invoker = false`) para poder leer la tabla cerrada. El panel de Supabase puede mostrar un aviso "Security Definer View": es intencional y está documentado aquí.
- Ni siquiera `service_role` puede escribir en `pokemon` en tiempo de ejecución. La carga es por migración/seed.

Cada celda tiene su prueba en `supabase/tests/pokemon_rls.test.sql` (63 pruebas).

## 7. Formato de error y códigos

Todas las respuestas (Route Handlers y Server Actions): `{ data, error }`. En error: `error = { code, message, details? }`. `details` nunca lleva mensajes internos de Postgres.

| HTTP (solo Route Handlers) | code | Estado |
|---|---|---|
| 200 | — | en uso (`/api/health`) |
| 400 | `VALIDATION_ERROR` | propuesto |
| 401 | `UNAUTHENTICATED` | propuesto |
| 403 | `FORBIDDEN` | propuesto |
| 404 | `NOT_FOUND` | propuesto |
| 409 | `CONFLICT` | propuesto |
| 429 | `RATE_LIMITED` (con `Retry-After`) | reservado |
| 500 | `INTERNAL` | en uso (`/api/health`) |
| 503 | `EXTERNAL_SERVICE_UNAVAILABLE` | reservado |

## 8. Endpoints con límite de tasa

Ninguno todavía. Previstos para el Paso 3: crear sala y entrada de admin con código. Almacén decidido en el Paso 3 (ver sección 9).

## 9. Decisiones y reglas vigentes

- **Reglas de pistas** (se calculan solo en el servidor, nunca en el navegador): 🔥 coincide tipo **y** generación; 🌡️ solo uno de los dos; ❄️ ninguno. "Coincide en tipo" = comparte al menos un tipo. Las formas regionales usan su propia generación y tipos.
- **Datos**: `data/pokemon.json` llega con 1083 entradas; **Basculin de Hisui** (`nombre_en = basculin-white-striped`) se excluye porque el brief lo deja fuera. Resultado: **1082** filas (1025 base + 57 regionales). El archivo JSON no se modificó; la exclusión vive en `EXCLUDED_POKEMON_NOMBRE_EN` de `lib/validation/pokemon.ts` y en el seed.
- **Identificadores**: `pokemon.id` (1 a 1082) es la clave del juego y sigue el orden del JSON. `pokemon.dex_number` es el número de la Pokédex y **se repite** en formas regionales (p. ej. Meowth 52 ×3, Tauros 128 ×4). Nunca usar `dex_number` como clave.
- **Buscador**: ignora mayúsculas, tildes, puntos, guiones, apóstrofes y símbolos (♀ ♂). Clave = minúsculas, sin tildes, solo `a-z0-9`. Una sola colisión conocida: Nidoran♀ y Nidoran♂ comparten clave `nidoran`; el buscador muestra ambos.
- **Rate limiting**: la Fase 1 funciona solo con Supabase. Upstash solo si se justifica por escrito.
- **Sin usuarios en Supabase Auth**: no hay `profiles` ni roles en `user_metadata`.

## 10. Tablas cambiadas en esta entrega

| Objeto | Cambio |
|---|---|
| `public.pokemon` | nueva (1082 filas), RLS activo, sin políticas |
| `public.pokemon_names` | nueva vista (id, nombre_es, search_key) |
| `public.normalize_name(text)` | nueva función pura; ejecución solo para `service_role` y dueño |

Migración: `supabase/migrations/20261101223300_create_pokemon.sql` (14 dígitos para coincidir con el historial real del Supabase de pruebas). Rollback documentado al final del archivo.

## 11. Excepciones de accesibilidad aceptadas

Ninguna.

## 12. Versiones de entrega

| Entrega | Versión |
|---|---|
| Diseño | ninguna (interfaz provisional) |
| Backend | backend-v0.2 |
| Contrato | contract-v0.2 |

Changelog:
- **backend-v0.2 / contract-v0.2**: Paso 2. Tabla `pokemon` (1082 filas), vista `pokemon_names`, función `normalize_name`, RLS y matriz de permisos con 63 pruebas pgTAP, esquema Zod `lib/validation/pokemon.ts`, seed. Contrato reconstruido (ver nota inicial).
- backend-v0.1 / contract-v0.1: Paso 1. Sitio base y `/api/health`.

## 13. Temporizadores y tope de 100 mensajes/s

**Pendiente.** Se escribe al cerrar la Fase 1, antes de pedir la confirmación de la Fase 2: (a) mecanismo de temporizadores sin procesos de servidor en Vercel (salto a 20 s, cierre a 5 min de sala vacía) y (b) manejo del tope de 100 mensajes por segundo de Realtime en Supabase Free.
