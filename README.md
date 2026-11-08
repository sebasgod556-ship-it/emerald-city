# Emerald City

Juego web multijugador para la comunidad Emerald City. Estado: backend-v0.8 (Fase 2, Pasos 7+8: pistas, repetido y chat).

## Correr en tu computadora (menos de 10 minutos)

1. Instala Node.js 20 o superior.
2. En la carpeta del proyecto: `npm install`
3. Copia `.env.example` a `.env.local` y completa los tres valores (Supabase de pruebas). Nunca subas `.env.local`.
4. `npm run dev` y abre http://localhost:3000
5. Abre http://localhost:3000/api/health: debe responder `{"data":{"status":"ok"},"error":null}`.

## Comprobaciones

`npm run typecheck` · `npm run lint` · `npm run build`

## Más información

Contrato del proyecto (nombres, tokens, errores, variables): `docs/CONTRACTS.md`.

## Pruebas de base de datos (pgTAP)

`supabase test db` (necesita la CLI de Supabase y Docker) corre `supabase/tests/*.test.sql`, incluido `attempts_rls.test.sql` (Paso 5).
