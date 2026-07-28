# Subir varias fotos como un solo documento (PDF)

**Fecha:** 2026-07-27
**Estado:** aprobado, pendiente de plan

## Problema

> Como conductor, quiero poder subir múltiples fotos desde la cámara de mi celular al cargar
> documentos, para poder digitalizar archivos extensos de manera ágil y en un solo archivo.

Hoy el formulario de documentos tiene un `<input type="file">` de un solo archivo. Desde el
celular, el usuario toca el campo, el sistema ofrece Cámara / Galería / Archivos, elige Cámara,
saca **una** foto y el selector se cierra. La mayoría de los documentos vehiculares tienen más
de una cara (permiso de circulación, padrón), así que hoy solo se puede guardar una de ellas.

El nudo técnico: cuando el celular abre la cámara desde un `input file`, **siempre devuelve
exactamente una foto y cierra**. No hay forma de pedirle al sistema operativo una ráfaga de
fotos; eso no lo controla la web. El atributo `multiple` solo ayuda por el lado de la galería.

La solución no está en el input: está en que **la app acumule** las fotos entre invocaciones
sucesivas del selector y arme un solo archivo al guardar.

## Alcance

- **Dónde:** el formulario de agregar documento y el de editar documento (`DocumentForm` y
  `DocumentEditForm`), ambos en la pestaña Documentos de la ficha del vehículo. Fuera de
  alcance: las fotos de la bitácora (tablero/cabina) y del daño — la IA las lee de a una y un
  PDF las rompería — y la constancia de mantención.
- **Una sola foto → se sube como imagen**, no como PDF. En la ficha pública el carabinero la ve
  directo, sin visor de PDF de por medio (comportamiento actual, se preserva).
- **Dos o más fotos → un PDF** de una página por foto.
- **Tope: 10 páginas.** Con la compresión definida abajo, el PDF final queda en ~3 MB en el peor
  caso. Cubre de sobra los documentos vehiculares chilenos.
- **Un PDF elegido por el usuario** ocupa la lista completa: se sube tal cual y se bloquea
  agregar más páginas. Mezclar un PDF existente con fotos nuevas exigiría rasterizar el PDF; no
  vale la pena para este caso.

Nota: hoy **no existe ningún límite de peso** en la subida. El `PUT` va directo a Cloud Storage
con una signed URL, sin pasar por Vercel, así que nada lo topa. El límite se define aquí por
primera vez, y se aplica por compresión + tope de páginas, no por un rechazo con mensaje de
error.

## Enfoque elegido

El PDF se arma **en el navegador**, con `pdf-lib` cargada por `import()` dinámico.

Alternativas descartadas:

- **Escribir el PDF a mano** (~150 líneas, cero dependencias). Un PDF con imágenes JPEG es
  simple: JPEG es `DCTDecode` nativo, los bytes se incrustan sin recodificar. Encajaría con el
  estilo de lógica pura del repo. Se descartó porque el archivo termina en manos de un
  carabinero en una fiscalización: es preferible que la corrección del PDF sea problema de una
  librería que ya usa mucha gente.
- **Unir las fotos en el servidor.** Obliga a subir N archivos, meter una dependencia de PDF en
  el servidor y pagar tiempo de función en Vercel, todo para un trabajo que el celular hace
  gratis mientras el usuario mira.

El costo de la dependencia es acotado: con carga dinámica, `pdf-lib` solo se descarga cuando
alguien realmente arma un PDF. El resto de la app no la ve nunca.

## Arquitectura

Hoy `DocumentForm` y `DocumentEditForm` tienen el **mismo bloque de subida duplicado carácter
por carácter** (pedir signed URL → `PUT` → guardar `filePath`). Ese bloque se pone más gordo con
este cambio, así que se extrae en vez de duplicarlo otra vez.

### Lógica pura — `lib/documentos/paginas.ts`

Sin DOM ni Firebase, como el resto de la lógica del repo.

- `MAX_PAGINAS = 10`
- `cabenPaginas(actuales: number, nuevas: number): { acepta: number; rechaza: number }` —
  cuántas de las que el usuario eligió caben bajo el tope y cuántas quedan fuera.
- `decidirSalida(paginas): 'ninguno' | 'archivo' | 'pdf'` — `'ninguno'` si la lista está vacía;
  `'archivo'` si es un PDF o una sola imagen; `'pdf'` si son dos o más imágenes.
- `dimensionesReescaladas(w, h, ladoMax): { w: number; h: number }` — respeta la proporción,
  **no agranda** imágenes que ya son más chicas que `ladoMax`, redondea a enteros.

### Adaptadores del navegador — `lib/documentos/`

Tocan APIs del DOM; se mantienen finos, con la lógica calculable delegada al módulo puro.

- `imagen.ts` → `comprimirImagen(file: File): Promise<Blob>`. Decodifica con
  `createImageBitmap(file, { imageOrientation: 'from-image' })`, reescala a **2000 px de lado
  largo** usando `dimensionesReescaladas`, y re-encodea a **JPEG calidad 0.8** vía canvas.
  Libera el bitmap (`bitmap.close()`) antes de devolver.
- `pdf.ts` → `construirPdf(jpegs: Blob[]): Promise<Blob>`. `import('pdf-lib')` dinámico, una
  página por imagen, **cada página del tamaño exacto de su foto** en puntos. No se fuerza A4: no
  hay bandas blancas ni deformación. Los JPEG entran con `embedJpg` **sin recodificar**, así que
  el PDF final pesa casi exactamente la suma de las fotos comprimidas.
- `subir.ts` → `subirPaginas(vehicleId, paginas, onProgreso): Promise<{ filePath: string } | null>`.
  Orquesta comprimir → armar → pedir signed URL → `PUT`. Es el bloque hoy duplicado, extraído y
  con lo nuevo adentro.

### UI — `components/documento/SelectorPaginas.tsx`

Reemplaza el `<input type="file">` en ambos formularios.

- Input de archivo oculto (con `multiple`, sin `capture`: el usuario debe poder elegir Cámara,
  Galería o Archivos) + botón visible "Agregar página" / "Agregar otra página".
- Grilla de miniaturas con botón de borrar y **flechas ← →** para reordenar. En el celular el
  drag & drop táctil es poco confiable; las flechas funcionan con el pulgar.
- Contador "3 de 10 páginas". Al llegar al tope, el botón queda desactivado con el aviso.
- Si el usuario elige un PDF, pasa a ser la única página y se bloquea agregar más.

## Flujo

**Mientras arma el documento** (todo local, sin red):

1. Toca "Agregar página" → selector del sistema. Por cámara vuelve una foto; por galería pueden
   volver varias.
2. Cada archivo entra a la lista como miniatura vía `objectURL`. El archivo **no** se lee entero
   a memoria en este punto.
3. Si eligió más de las que caben, se agregan las que quepan y se avisa cuántas quedaron fuera.
4. Puede borrar una foto movida o correrla de lugar.

**Al tocar "Guardar"** (aquí recién el trabajo pesado):

1. `decidirSalida` mira la lista. Un PDF elegido por el usuario se sube tal cual, sin tocarlo:
   los pasos 2 y 3 solo aplican a imágenes.
2. Cada imagen se comprime **en orden y de a una**. Una foto de 5 MB queda en ~300 KB.
3. Si son dos o más, `construirPdf` las mete de a una por página.
4. Se pide la signed URL y se hace el `PUT`. El `contentType` y el nombre salen de lo que
   realmente se va a subir, no del archivo original: `application/pdf` + `documento.pdf` para el
   PDF armado, `image/jpeg` + `documento.jpg` para la foto única ya comprimida (aunque haya
   entrado como HEIC), y los del archivo tal cual cuando es un PDF del usuario.
5. De ahí para adelante es idéntico a hoy: un `filePath`, un archivo en Storage, un documento en
   Firestore.

El paso 2 tarda. Con 10 fotos en un celular modesto son varios segundos con la pantalla
aparentemente quieta, así que el botón muestra avance real: **"Preparando página 3 de 10…"** y
luego **"Subiendo…"**. Sin eso el usuario toca Guardar dos veces y sube el documento duplicado.

**El servidor no cambia.** `/api/documents/upload-url` y `/api/documents` quedan intactos: para
el backend, un PDF armado en el celular es un PDF más.

## Riesgos y mitigaciones

**HEIC del iPhone.** Las fotos de iPhone pueden llegar en HEIC, que muchos visores no abren.
Pasar por canvas las normaliza a JPEG, así que este cambio **arregla un problema que hoy existe
en silencio**. Por eso, aunque haya una sola foto, igual pasa por `comprimirImagen`: se sube como
imagen (no como PDF), pero como JPEG normalizado y liviano, no como el archivo crudo de la
cámara. Si la decodificación falla igual, esa página se marca con error y las demás siguen.

**Memoria.** Diez fotos decodificadas a la vez revientan la pestaña en un celular de gama baja.
Se procesan **una a la vez, en secuencia**, liberando cada bitmap antes de abrir el siguiente.
Nunca hay más de una imagen descomprimida en memoria.

**Rotación EXIF.** Una foto sacada apaisada trae el giro en los metadatos, no en los píxeles. Si
se ignora, el permiso de circulación sale acostado en el PDF. Se decodifica con
`imageOrientation: 'from-image'`.

**Fugas de `objectURL`.** Se revoca al borrar la página y al desmontar el formulario.

**Doble submit.** El botón queda desactivado mientras trabaja (ya lo hace hoy).

Los errores se **señalan por página**: si una foto no se puede leer, se marca esa miniatura con
"No pudimos leer esta foto, bórrala y sácala de nuevo" y el resto del formulario queda intacto —
el usuario no pierde las otras nueve páginas ni los datos que ya llenó.

Explícito, porque admite otra lectura: en ese caso **no se sube nada**. El PDF no se arma
saltándose la página mala. Que a un permiso de circulación se le caiga la página 3 en silencio y
nadie lo note es peor que obligar al usuario a borrarla o sacarla de nuevo. Como la compresión de
todas las páginas ocurre **antes** de la primera llamada de red, una foto ilegible se detecta sin
haber subido nada a Storage.

## Tests

- **`lib/documentos/__tests__/paginas.test.ts`** (puro): el tope de 10 con selección parcial; la
  decisión de salida en los cuatro casos (vacío / una foto / varias fotos / un PDF); el
  reescalado — que no agrande fotos chicas y que respete la proporción.
- **`lib/documentos/__tests__/pdf.test.ts`**: armar un PDF con dos JPEG y **volver a cargarlo con
  `PDFDocument.load`** para verificar dos páginas con las dimensiones correctas. Corre en Node,
  sin worker ni navegador.
- **`components/documento/__tests__/SelectorPaginas.test.tsx`** (jsdom): agregar dos fotos muestra
  dos miniaturas; borrar deja una; al llegar a 10 el botón se desactiva; elegir un PDF bloquea
  agregar más. Requiere stub de `URL.createObjectURL`, que jsdom no trae.

**Lo que NO queda cubierto por tests automáticos:** `comprimirImagen`. jsdom no tiene canvas
real, así que la decodificación, el reescalado efectivo y la rotación EXIF solo se verifican en
un celular de verdad. La lógica de cálculo (`dimensionesReescaladas`) sí está testeada, pero el
"sale derecha y se lee" es verificación manual: Android y iPhone, tres fotos, revisar orden,
orientación y que el PDF abra en la ficha pública.

## Fuera de alcance

- Detección de bordes o recorte automático del documento (tipo CamScanner).
- OCR del contenido.
- Convertir a PDF las fotos de la bitácora o del daño.
- Reemplazar página por página un PDF ya subido: hoy y después, subir un archivo nuevo lo
  reemplaza entero.
