# Lectura automática de fechas (OCR) — Diseño

**Fecha:** 2026-07-31
**Historia:** Como usuario, quiero que las fechas de mis documentos se carguen automáticamente al ingresarlos, para ahorrar tiempo en el registro y evitar errores manuales.

> Tercera de las cuatro features del sprint (sesión ✔ → librería de marcas ✔ → **OCR de fechas** → código promocional). Cada una tiene su propio spec y su propio plan.

---

## 1. Qué existe ya

Tres piezas hacen que esto no empiece de cero:

- **`lib/ai/`** — integración con OpenRouter: `chatVision(imageUrls, prompt)` y `isOpenRouterConfigured()`, más el patrón `buildPrompt`/`parse`/`analyze` de `usageVision.ts` para leer las fotos de entrega.
- **`lib/documentos/imagen.ts`** — `comprimirImagen` ya convierte una foto a JPEG, y de paso **normaliza los HEIC del iPhone y corrige la rotación EXIF**.
- **`components/documento/PdfPreview.tsx`** — ya renderiza la primera página de un PDF a un canvas con `pdfjs`, con `import()` dinámico.

Hoy la foto **no se sube al elegirla**: `subirPaginas` corre dentro del `submit` de `DocumentForm`. Eso condiciona el diseño.

## 2. Decisiones de producto

| Decisión | Valor | Por qué |
|---|---|---|
| Qué hace la app con la fecha leída | **Rellena el campo; el usuario confirma** | Una fecha de vencimiento equivocada es exactamente lo que la app promete cuidar: manda los recordatorios el día que no es, o muestra "al día" un documento vencido — y eso lo descubre un carabinero, no el usuario. Guardar sigue siendo un acto humano. |
| Cuándo se lee | **Al elegir la foto, en segundo plano** | La fecha aparece sola mientras el usuario elige el tipo. Guardar sigue siendo un clic. |
| Formatos | **Fotos y PDFs** | El Permiso de Circulación y el SOAP llegan normalmente en PDF; sin ellos el feature no serviría para los dos documentos digitales más comunes. |
| Cómo llega la imagen al servidor | **Data URI en el cuerpo** | Sin archivos temporales en Storage. La alternativa (subir primero) dejaría basura de formularios abandonados — el proyecto ya tiene un script de limpieza de huérfanas de bitácora por exactamente ese problema. |
| Dónde se monta | **Solo el formulario de alta** | En el de edición la fecha ya está llena casi siempre y la regla "solo si está vacío" haría que no se aplicara nunca. |

**Costo aceptado explícitamente:** una llamada al modelo por cada documento que se sube. No se consulta el tipo de documento para decidir si vale la pena, porque el tipo se puede cambiar después de elegir la foto.

## 3. `lib/ai/documentoVision.ts` (puro, sin red)

Calcado del patrón de `usageVision.ts`.

```ts
export function buildFechaPrompt(): string
export function parseFechaVision(raw: string, ahoraMs: number): string | null
```

`ahoraMs` entra como parámetro y no se lee del reloj adentro: el rango de cordura (abajo) no se podría testear si la función dependiera de `Date.now()`.

### El parseo es la parte peligrosa

`parseFechaVision` no es una conveniencia: es lo que impide construir un bug ya documentado en el proyecto. Una `fechaVencimiento` mal formada hace que `daysUntil` devuelva `NaN`, `documentStatus` caiga a `al_dia`, y **un documento vencido se pinte verde**.

Por eso descarta todo lo que no sea una fecha real:

1. Formato exacto `YYYY-MM-DD`. No "casi".
2. Fecha de calendario que **existe** — un `2027-02-31` se descarta (la validación de formato sola lo dejaría pasar).
3. Dentro de un **rango sensato**: entre 20 años atrás y 20 años adelante de `ahoraMs`. Un documento ya vencido es legítimo (se sube un histórico), pero un año 0207 o 9999 es una alucinación.

Fuera de eso devuelve `null`. **Preferimos no leer nada a rellenar basura**: el campo vacío el usuario lo llena; el campo con una fecha absurda quizás no lo mira.

### Dos cosas que el prompt debe decir

- **En Chile las fechas se escriben DD-MM-YYYY.** "03-04-2027" es el 3 de abril, no el 4 de marzo. El prompt lo dice explícitamente y pide la respuesta **ya en ISO**, para no adivinar después.
- **Un documento tiene varias fechas** (emisión, pago, vencimiento). El prompt pide la fecha **hasta la cual el documento es válido**, con las formas en que aparece acá: "válido hasta", "vence el", "hasta el".

**No se le pasa el tipo de documento.** Así el resultado no depende de que el usuario haya elegido bien el tipo antes de sacar la foto, y no hay que releer si lo cambia después.

Formato de respuesta: JSON, igual que `usageVision`, con `null` cuando no se puede leer con seguridad. El prompt dice explícitamente que no invente.

## 4. `lib/documentos/primeraImagen.ts`

Una sola responsabilidad: dada la primera página elegida, devolver un JPEG listo para leer, o `null`.

- **Foto** → `comprimirImagen`, que ya existe (y arregla HEIC y rotación EXIF de paso).
- **PDF** → renderizar la primera página a un canvas con `pdfjs` y sacar un JPEG. Mismo procedimiento que `PdfPreview`, **incluido el `import()` dinámico**: pdfjs nunca puede ir en module scope o rompe el render del servidor.

Si el archivo no se puede leer (PDF corrupto, imagen ilegible) devuelve `null` y no se llama al modelo — cero costo.

## 5. `POST /api/documents/leer-fecha`

Recibe `{ imagen: string }` y responde `{ fecha: string | null }`.

`imagen` es un **data URI completo** (`data:image/jpeg;base64,…`), no base64 suelto: `chatVision` lo pasa tal cual como `image_url.url`, y ahí OpenRouter necesita el prefijo para saber qué está recibiendo. El endpoint valida que sea un string con ese prefijo y responde 400 si no.

- **Exige membresía.** No es un endpoint decorativo: cada llamada cuesta plata, así que no puede quedar abierto.
- Sin `OPENROUTER_API_KEY` (`isOpenRouterConfigured()` falso) responde `{ fecha: null }` sin llamar a nadie. Eso permite desplegar el feature antes de configurar la clave.
- Cualquier fallo del modelo se registra en el log del servidor y responde `{ fecha: null }`. El usuario nunca ve un error por esto.

## 6. Comportamiento en el formulario

La lectura arranca cuando **cambia la primera página** y corre en segundo plano. **Nunca bloquea nada**: Guardar sigue disponible, y si la lectura no llegó, se guarda sin fecha como hoy.

Cuando el resultado vuelve, se escribe en el campo **solo si sigue vacío**. Si el usuario alcanzó a tipear la fecha, no se le pisa.

Debajo del campo va un aviso discreto: mientras lee, que está leyendo; cuando llegó, "Fecha leída del documento — revísala". **El aviso desaparece apenas el usuario toca el campo**: a partir de ahí la fecha es suya, y seguir diciendo que la leyó una máquina sería mentir.

### La carrera, y cómo se corta

Si el usuario cambia la primera página mientras una lectura va en camino, la respuesta vieja llega después y escribiría la fecha del documento anterior — en silencio, sobre un documento distinto.

Se corta con un **contador de secuencia**: cada lectura lleva su número y el resultado solo se aplica si sigue siendo el vigente. Hay un test que lo fija.

### Interacción con el tipo de documento

El Padrón no vence, así que su campo de fecha no existe. La lectura se hace igual (es agnóstica del tipo), y si el usuario cambia de Padrón a SOAP, la fecha ya está lista cuando el campo aparece.

## 7. Archivos

**Crear**
- `lib/ai/documentoVision.ts` — `buildFechaPrompt`, `parseFechaVision` (puro)
- `lib/documentos/primeraImagen.ts` — primera página → JPEG
- `app/api/documents/leer-fecha/route.ts` — el endpoint

**Modificar**
- `components/DocumentForm.tsx` — disparar la lectura, rellenar, el aviso y el corte de la carrera
- `CLAUDE.md` — documentar las piezas nuevas

## 8. Testing

**Puro** (`lib/ai/__tests__/documentoVision.test.ts`) — es el archivo con más tests, porque protege del bug del documento vencido en verde:
- ISO válido → se devuelve.
- Formato casi-válido (`2027-3-4`, `04/03/2027`) → `null`.
- Fecha que no existe (`2027-02-31`) → `null`.
- Fuera de rango (año 0207, año 9999) → `null`.
- JSON con texto alrededor → se extrae igual (mismo criterio que `parseUsageVision`).
- Respuesta vacía o sin JSON → `null`.
- `buildFechaPrompt` menciona ISO y advierte que en Chile se escribe DD-MM.

**Endpoint** (`app/api/__tests__/leer-fecha.test.ts`)
- Sin sesión → 401, sin llamar al modelo.
- Con `imagen` que no es un data URI → 400, sin llamar al modelo.
- Sin `OPENROUTER_API_KEY` → `{ fecha: null }`, sin llamar al modelo.
- Con respuesta válida del modelo → devuelve la fecha parseada.
- Si el modelo lanza → `{ fecha: null }` y no propaga el error.

**Componente** (`components/__tests__/DocumentFormOcr.test.tsx`)
- Rellena el campo cuando está vacío.
- **No pisa** lo que el usuario escribió.
- **Descarta un resultado viejo** cuando ya cambió la primera página — el test de la carrera.
- Guardar nunca queda bloqueado por la lectura.
- El aviso desaparece al tocar el campo.

**Lo que no se puede testear automáticamente, y hay que decirlo:**
- `primeraImagen` usa canvas y pdfjs, que no existen en jsdom — la misma limitación que ya tiene `comprimirImagen`, que tampoco tiene test.
- **Ningún test dice si el modelo lee bien.** Eso se prueba con una foto real de una Revisión Técnica y un PDF real de SOAP, y lo hace el usuario con documentos de verdad.

## 9. Fuera de alcance

- Leer cualquier otro dato (tipo de documento, patente, número de póliza). La historia pide fechas.
- El formulario de edición de documentos.
- Leer páginas más allá de la primera. En los documentos chilenos el vencimiento va en la cara principal; leer diez páginas multiplicaría el costo por diez para el mismo dato.
- Guardar la fecha automáticamente sin que el usuario la vea.
- Reintentos automáticos si el modelo falla.
