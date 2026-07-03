# Bitácora de uso — SP3: Análisis con IA (OpenRouter) — Diseño

**Fecha:** 2026-07-03
**Estado:** Aprobado (diseño). Pendiente: plan de implementación.

## Contexto

La **bitácora de custodia** (SP1 padrón + SP2 fotos, ya en producción) hace que el conductor
suba, al entregar, 2 fotos: **tablero** (bencina + kilometraje) y **cabina** (estado general).
Los campos `bencina`, `km`, `limpieza` en `usages` quedaron **reservados y vacíos** esperando
este sub-proyecto.

SP3 agrega **análisis con IA vía OpenRouter**: un modelo de visión lee las fotos y rellena esos
campos automáticamente, con **confirmación humana** (el gestor corrige si hace falta). Baja la
fricción del conductor a cero (solo saca 2 fotos) y a la vez captura datos estructurados, con la
foto como evidencia.

El sistema completo tiene 4 sub-proyectos; **SP4** (panel de flota + alertas + reportes) queda
fuera de alcance de este spec.

## Objetivos

- **Análisis asíncrono** tras la entrega: no bloquea al conductor; se dispara post-respuesta.
- Cliente **OpenRouter** (API OpenAI-compatible) con modelo de visión configurable.
- Rellenar `bencina` (nivel), `km` (odómetro), `limpieza` (categoría) en el `usage`, **best-effort**.
- **Confirmación/corrección** del gestor en la bitácora (Editor + Administrador).
- Enforcement server-side; sin exponer Firestore ni las credenciales de IA al cliente.

## No-objetivos (SP4)

- Panel de flota, alertas de daño / sin-entrega, reportes de responsabilidad.
- Reintentos automáticos del análisis (si falla, queda vacío; el gestor puede llenar a mano).
  Un reintento manual/on-demand es candidato futuro, no de este spec.

## Flujo

1. La ruta `POST /api/v/[token]/entregar` cierra el uso y responde **al instante** (como hoy).
2. Tras responder, con `after()` de Next (trabajo post-respuesta, misma invocación, sin bloquear),
   se dispara `analyzeUsage(usageId)`.
3. `analyzeUsage` carga el uso, resuelve **signed read URLs** de las 2 fotos, llama a OpenRouter
   pidiendo **JSON**, y guarda `bencina`/`km`/`limpieza` + `iaAnalizadoEn`. Best-effort: cualquier
   error se traga (log), los campos quedan vacíos.
4. En la **bitácora** (página del vehículo), el gestor ve la lectura con un badge **"estimado por
   IA"** mientras no esté confirmada, y puede corregir los 3 campos en línea (Editor/Admin).

## IA / OpenRouter

- **`lib/ai/openrouter.ts`** — cliente al endpoint `${OPENROUTER_BASE}/chat/completions`
  (`https://openrouter.ai/api/v1`), header `Authorization: Bearer ${OPENROUTER_API_KEY}`. Init
  **lazy** (patrón `getResend()`). Modelo por `process.env.OPENROUTER_MODEL` con default
  `google/gemini-2.0-flash-001` (visión barata y capaz; configurable). Expone
  `chatVision(images: string[], prompt: string): Promise<string>` (devuelve el texto de la
  respuesta del modelo).
- **`lib/ai/usageVision.ts`** — **puro/inyectable** (recibe una función `chat` para poder testear
  sin red):
  - `buildUsagePrompt(): string` — instruye devolver **solo JSON** con el esquema y las categorías.
  - `parseUsageVision(raw: string): { bencina: string | null; km: number | null; limpieza: Limpieza | null }`
    — extrae el JSON (tolera texto alrededor / fences), valida tipos y **enumeraciones**; cualquier
    cosa inválida → `null` para ese campo (nunca inventa).
  - `analyzeUsagePhotos(chat, { tableroUrl, cabinaUrl })` — orquesta prompt → `chat` → parse.
  - Tipos: `type BencinaNivel = 'Lleno' | '3/4' | '1/2' | '1/4' | 'Reserva'`;
    `type Limpieza = 'limpio' | 'aceptable' | 'sucio'`. `bencina` se guarda como string del nivel.
- Las imágenes van como **signed read URLs** (privadas, expiran en 15 min) en el `image_url` del
  mensaje multimodal; OpenRouter las descarga server-side. (Alternativa base64 si un modelo no
  acepta URLs; se decide en el plan.)

## Datos (`usages`)

- Se rellenan los campos ya reservados: `bencina`, `km`, `limpieza`.
- Nuevos:
  - `iaAnalizadoEn?: string` (ISO) — cuándo corrió la IA; evita reanalizar y habilita el badge.
  - `datosConfirmados?: boolean` — `true` cuando un gestor guarda/edita; la UI deja de mostrar
    "estimado por IA".
- **`lib/data/usages.ts`** (adiciones):
  - `closeUsage(...)` pasa a **devolver el `id`** del uso cerrado (para el trigger).
  - `getUsage(id): Promise<VehicleUsage | null>`.
  - `setUsageAnalysis(id, { bencina, km, limpieza }): Promise<void>` — lo escribe la IA; setea
    `iaAnalizadoEn` = now; **no** marca confirmado.
  - `updateUsageDatos(companyId, id, { bencina?, km?, limpieza? }): Promise<void>` — edición del
    gestor; valida pertenencia a `companyId` (throw `'forbidden'`); marca `datosConfirmados: true`.
- **`lib/ai/analyzeUsage.ts`** (glue, no puro): `analyzeUsage(usageId)` → `getUsage` → si no tiene
  las 2 fotos o ya fue analizado, no hace nada → `createReadUrl` de ambas → `analyzeUsagePhotos`
  (con el cliente real `openrouter`) → `setUsageAnalysis`. Todo envuelto en try/catch.

## Endpoint (corrección del gestor)

- `PATCH /api/usages/[id]` `{ bencina?, km?, limpieza? }` → `getMembership()` +
  `can(role, 'document:write')` (Editor y Administrador; el **Visor** solo lee → 403). Valida los
  valores (bencina ∈ niveles, limpieza ∈ categorías, km entero ≥ 0), llama a `updateUsageDatos`
  (que revalida `companyId`) y marca `datosConfirmados`. `403` si no pertenece; `400` valor inválido.

## Disparo asíncrono

- En `POST /api/v/[token]/entregar`: tras `closeUsage` (que ahora devuelve el `id`), construir la
  respuesta y luego `after(() => analyzeUsage(id))` (import `after` de `next/server`; verificar la
  API exacta en `node_modules/next/dist/docs/` por Next 16). No se `await`ea en el path de respuesta.
- Si `OPENROUTER_API_KEY` no está, `analyzeUsage` no corre (el cliente lo detecta y sale); no rompe.

## UI

- **`components/vehicle/BitacoraUso.tsx`**: cada uso muestra, cuando existan, `bencina`, `km`,
  `limpieza`. Badge **"estimado por IA"** si `iaAnalizadoEn && !datosConfirmados`. La sección de
  edición inline de esos 3 campos es un **sub-componente cliente** nuevo
  (`components/vehicle/UsageDatosEditor.tsx`) que se muestra solo si el rol tiene `document:write`
  (la página del vehículo ya conoce el rol vía `getMembership()`; pasa un prop `puedeEditar`). El
  Visor los ve de solo lectura.
- Guardar → `PATCH /api/usages/[id]` → `router.refresh()`.

## Variables de entorno

- `OPENROUTER_API_KEY` (secreto) — sin ella el análisis no corre (best-effort).
- `OPENROUTER_MODEL` (opcional) — default `google/gemini-2.0-flash-001`.
- Documentar en `.env.example`; setear en Vercel para producción.

## Seguridad

- Credenciales de IA solo server-side; nunca al cliente.
- Imágenes a OpenRouter vía signed URLs privadas (expiran); no se expone Firestore.
- La edición del gestor pasa por `/api/*` con `getMembership()` + `can()` + validación de valores
  y de `companyId`; nunca confía en el cliente.
- El análisis es best-effort y aislado en try/catch: nunca puede tumbar la entrega ni el request.

## Testing

- **Puro (Vitest):**
  - `parseUsageVision`: JSON válido → valores; JSON con texto/fences alrededor → extrae; campos
    fuera de enum o tipos malos → `null`; respuesta no-JSON → todos `null`.
  - `buildUsagePrompt`: menciona el esquema JSON y las categorías/niveles.
  - `analyzeUsagePhotos` con un `chat` mockeado → orquesta y devuelve el parse.
- **Integración (mock Admin SDK):**
  - `updateUsageDatos`: valida `companyId` (throw forbidden), marca `datosConfirmados`.
  - `PATCH /api/usages/[id]`: 403 Visor, 403 cross-company, 400 valor inválido, 200 ok.
  - `analyzeUsage`: no hace nada si faltan fotos o ya `iaAnalizadoEn`; con fotos llama a
    `setUsageAnalysis` con lo parseado (mock del cliente de IA).

## Superficies afectadas

- **`lib/types.ts`**: `VehicleUsage` gana `iaAnalizadoEn?`, `datosConfirmados?`; tipos
  `BencinaNivel`, `Limpieza` (exportables).
- **`lib/ai/`** (nuevo): `openrouter.ts`, `usageVision.ts`, `analyzeUsage.ts`.
- **`lib/data/usages.ts`**: `closeUsage` devuelve id; `getUsage`, `setUsageAnalysis`,
  `updateUsageDatos`.
- **`app/api/v/[token]/entregar/route.ts`**: dispara `after(() => analyzeUsage(id))`.
- **`app/api/usages/[id]/route.ts`** (nuevo): PATCH de corrección.
- **`components/vehicle/BitacoraUso.tsx`** + **`UsageDatosEditor.tsx`** (nuevo) + la página del
  vehículo pasa `puedeEditar`.
- **`.env.example`**: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`.

## Riesgos / cuidados

- **`after()` en Vercel**: corre dentro del tiempo máximo de la función; una llamada de visión son
  segundos, aceptable. Si excede, el uso queda sin lectura (no rompe). Verificar la API de `after`
  para Next 16 en los docs locales.
- **Lecturas imperfectas** (odómetro/aguja borrosos): por eso hay confirmación humana; la foto es la
  verdad, la IA es comodidad. `parseUsageVision` nunca inventa (nulls ante duda).
- **Costo**: ~1 llamada de visión por entrega; modelo barato + configurable. Sin key → no corre.
- No cambiar el flujo del conductor (la entrega sigue cerrando igual de rápido).
