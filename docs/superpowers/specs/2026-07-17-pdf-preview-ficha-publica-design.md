# Previsualización de PDFs en la ficha pública

**Fecha:** 2026-07-17
**Estado:** Aprobado (diseño)

## Problema

En la ficha pública (`/v/[token]`, componente `PublicVehicleView` → `DocumentosView`), los documentos que son **imágenes** se muestran inline como preview (tap para ampliar), pero los **PDFs** solo aparecen como un botón azul "Ver documento (PDF)" que abre el archivo en otra pestaña. Durante una fiscalización, el conductor tiene que salir de la ficha para mostrar el documento, lo que resta fluidez.

**Historia de usuario:** Como conductor, quiero previsualizar los documentos en PDF igual que las fotos, para facilitar la muestra ante una fiscalización.

## Solución

Renderizar la **primera página** del PDF como imagen inline (un "print" del PDF), usando **pdf.js (`pdfjs-dist`) en el cliente**, para que los PDFs se vean parejos con las fotos. Solo en la ficha pública. No se toca el flujo de subida, endpoints, datos ni la ficha privada. Cubre todos los PDFs ya cargados, sin migración.

### Componente `components/documento/PdfPreview.tsx` (client)

Props: `{ url: string; label: string }` (`url` = la signed read URL del documento; `label` = nombre del documento para el `alt`).

Comportamiento (dentro de un `useEffect`, todo client-side):
1. `import('pdfjs-dist')` dinámico (mantiene la librería fuera del chunk inicial de la ficha pública; solo carga cuando hay un PDF que previsualizar).
2. Fija `pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'` (worker same-origin, ver más abajo).
3. `getDocument(url)` → primera página → `page.render(...)` sobre un `<canvas>` (`ref`), a una escala que dé un ancho nítido (~ el ancho del contenedor).
4. Cleanup: cancelar el render/tarea de pdf.js si el componente se desmonta antes de terminar.

Tres estados:
- **Cargando:** contenedor con `LoadingDots` + texto "Cargando vista previa…".
- **Éxito:** el `<canvas>` con la página 1, envuelto en un `<a href={url} target="_blank" rel="noopener noreferrer">` con caption "Toca para ver el PDF completo".
- **Error** (fetch/CORS/parse falla): fallback al botón azul actual "Ver documento (PDF)" (mismo markup que hoy). Degradación elegante: si el render falla, no se pierde el acceso al documento.

Estilo del contenedor **idéntico al del preview de imagen** para consistencia visual: `max-h-96 w-full rounded-xl border border-linea bg-lienzo object-contain`.

### pdf.js — worker y SSR

- Dependencia nueva: `pdfjs-dist`.
- **Worker copiado a `public/pdf.worker.min.mjs`** por un script `scripts/copy-pdf-worker.mjs`, enganchado en `postinstall` de `package.json`. Copia el archivo desde `node_modules/pdfjs-dist/build/` → garantiza que la versión del worker calce siempre con la de la librería instalada. El componente referencia `workerSrc = '/pdf.worker.min.mjs'` (same-origin; no hay CSP en la app que lo bloquee).
- `public/pdf.worker.min.mjs` va al `.gitignore` (artefacto de build, no se commitea).
- El `import('pdfjs-dist')` ocurre **solo dentro del efecto client-side**; nunca en module-scope de un archivo que el servidor evalúe (pdfjs referencia APIs de browser como `DOMMatrix` y rompería el SSR).

### Integración (un solo punto)

En `components/PublicVehicleView.tsx`, función `DocumentosView`: la rama `else` del ternario (cuando `d.readUrl` existe y **no** es imagen, hoy el botón "Ver documento (PDF)") se reemplaza por `<PdfPreview url={d.readUrl} label={label} />`. La rama de imágenes (`isImage(d.filePath)`) y la de "Sin archivo adjunto" quedan **idénticas**.

## Verificación de viabilidad (ya chequeada en el diseño)

- **CORS del bucket:** ya permite `GET` desde `app.tapcar.cl`, `nfc-roan-nine.vercel.app` y `localhost:3000` (`scripts/set-storage-cors.mjs`, métodos `GET/PUT/HEAD/OPTIONS`). El `fetch()` de pdf.js al PDF pasa CORS.
- **CSP:** la app no define CSP (`next.config.ts` sin `headers()`, `proxy.ts` sin CSP). El worker same-origin y el fetch a Storage no chocan con nada.

## Alcance / lo que NO cambia

- Solo la ficha pública `/v/[token]`. No se toca la subida de documentos, los endpoints, los datos, las reglas, ni la ficha privada `/vehiculos/[id]`.
- No hay migración: los PDFs ya cargados se previsualizan igual (el render es on-the-fly desde la signed URL).
- La rama de imágenes y el "Sin archivo" no cambian.

## Testing

- El render con pdf.js (canvas + worker + fetch) no es unit-testeable de forma útil sin un entorno de browser real; **no se agregan tests frágiles**.
- Verificación **manual** (idealmente en móvil, que es el caso de uso): un documento PDF muestra la primera página inline; tocarlo abre el PDF completo; un documento imagen sigue igual; un PDF inválido/no accesible cae al botón de fallback.
- El **fallback** es la red de seguridad: cualquier fallo de render deja el botón "Ver documento (PDF)" de siempre.

## Verificación pre-commit

`npx tsc --noEmit`, `npx eslint app components lib`, `npm run build` (corre `postinstall`/copia del worker en el pipeline de Vercel). `npx vitest run` no cambia (sin tests nuevos). Recordar: merge a `master` **auto-despliega a producción**.
