# Librería de marcas — Diseño

**Fecha:** 2026-07-31
**Historia:** Como usuario, quiero seleccionar la marca de mi vehículo desde una lista predefinida al registrarlo, para agilizar la categorización y el filtrado de la flota.

> Segunda de las cuatro features del sprint (sesión ✔ → **librería de marcas** → OCR de documentos → código promocional). Cada una tiene su propio spec y su propio plan.

---

## 1. El problema

Hoy la marca es un campo de texto libre sin ningún saneo. `POST /api/vehicles` la guarda tal cual llega — **ni siquiera un `trim`**. Así conviven "subaru", "Subaru", "SUBARU" y " Subaru " como valores distintos.

Dos hallazgos del análisis que acotan el alcance:

**La marca no se puede editar después de crear el vehículo.** No está en la whitelist del `PATCH` (`app/api/vehicles/[id]/route.ts`, que solo acepta `categoriaId`/`pautaMantencion`/`info`/`consumo`) y no hay UI para hacerlo. Un error de tipeo queda permanente. Hoy eso solo molesta en el buscador; el día que exista un filtro por marca, ese vehículo desaparece de su marca sin explicación.

**Hoy la suciedad casi no se nota**, porque el buscador del dashboard normaliza con `normalizarBusqueda` (minúsculas, sin acentos), así que "subaru" encuentra "Subaru". El costo real aparece con el filtro por marca.

## 2. Decisiones de producto

| Decisión | Valor | Por qué |
|---|---|---|
| Tipo de lista | **Abierta**: sugiere, pero deja escribir | En una flota chilena hay importados, vehículos de trabajo y marcas raras. Una lista cerrada bloquearía un alta y obligaría a desplegar código para desbloquearla. |
| Alcance | **Autocompletado + normalizar al guardar + script one-time** | Es lo pedido más lo mínimo para que los datos nuevos queden limpios. |
| Filtro por marca en el dashboard | **Fuera de alcance** | Se hace después, cuando haya datos ordenados que filtrar. |
| Flota existente | **Script de normalización ahora** | El contexto está fresco; dejarlo es una deuda con fecha de vencimiento conocida (el día del filtro). |
| Widget | **Combobox propio**, no `<datalist>` nativo | Ver abajo. |

**Por qué combobox propio y no `<datalist>`:** el nativo es tres líneas y cero JavaScript, pero **no se puede estilizar** — la lista la dibuja el sistema operativo — y su filtrado varía por navegador (unos por prefijo, otros por subcadena). La app se usa mayoritariamente desde el celular, y un desplegable del sistema en medio del único formulario de alta desentona con todo lo demás. Además `InfoTip`, `PillTip` y `Popover` ya establecieron en el proyecto el patrón de "lista flotante propia", así que el combobox se apoya en algo existente en vez de introducir un elemento ajeno.

**Marcas desconocidas conservan la escritura del usuario.** "BYD" no se convierte en "Byd": la forma canónica se aplica solo cuando el texto calza con la librería.

## 3. `lib/vehicles/marcas.ts` (puro, sin React ni Firebase)

### La lista

`MARCAS`, canónica y ordenada alfabéticamente. Pensada para Chile y para **flota**, no para autos particulares: por eso incluye camiones y la ola china, que ya es mayoría en flotas nuevas.

```ts
export const MARCAS: readonly string[] = [
  'Alfa Romeo', 'Audi', 'BAIC', 'Bajaj', 'BMW', 'BYD', 'Cadillac', 'Changan',
  'Chery', 'Chevrolet', 'Chrysler', 'Citroën', 'DFSK', 'Dodge', 'Dongfeng',
  'DS', 'Fiat', 'Ford', 'Foton', 'Freightliner', 'Geely', 'GMC', 'Great Wall',
  'Haval', 'Hino', 'Honda', 'Hyundai', 'International', 'Isuzu', 'Iveco',
  'JAC', 'Jaecoo', 'Jaguar', 'Jeep', 'Jetour', 'Kawasaki', 'Kia', 'Land Rover',
  'Lexus', 'Mack', 'Mahindra', 'MAN', 'Maxus', 'Mazda', 'Mercedes-Benz', 'MG',
  'MINI', 'Mitsubishi', 'Nissan', 'Omoda', 'Opel', 'Peugeot', 'Porsche', 'RAM',
  'Renault', 'Scania', 'SEAT', 'Shineray', 'Škoda', 'Smart', 'SsangYong',
  'Subaru', 'Suzuki', 'Tata', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo',
  'Yamaha',
]
```

Vive en código y no en Firestore: cambia una vez al año, y en Firestore costaría una lectura cada vez que alguien abre el modal, para siempre.

### Las funciones

```ts
export function sugerirMarcas(query: string, limite?: number): string[]
export function normalizarMarca(raw: string): string
```

**`sugerirMarcas(query, limite = 8)`** — devuelve primero las marcas que **empiezan** con lo escrito y después las que lo contienen en cualquier parte, ambas en el orden de `MARCAS`. Así "sub" trae Subaru arriba y "aru" también lo encuentra. Con la query vacía devuelve `[]`: abrir el modal y recibir ocho marcas alfabéticas no ayuda a nadie.

El tope de 8 no es estético: en un celular una lista más larga tapa el formulario completo.

**`normalizarMarca(raw)`** — devuelve la forma canónica si el texto calza con la librería; si no, `trim` con espacios internos colapsados, **conservando la escritura del usuario**.

Ambas comparan usando `normalizarBusqueda` de `lib/vehicles/buscar.ts`, que ya existe y ya quita acentos: así "citroen" encuentra "Citroën" y "skoda" encuentra "Škoda" sin escribir nada nuevo.

## 4. `components/vehicle/MarcaInput.tsx`

Componente cliente controlado por el padre (mismo patrón que `SelectorPaginas`): recibe `value` y `onChange`, más lo que necesite el `<input>` (id, `required`, clases).

**Interacción**

- Escribir filtra y abre la lista; sin sugerencias, no se abre.
- **Teclado:** ↑↓ mueven la selección, Enter elige la resaltada, Escape cierra sin elegir (conservando lo escrito), Tab cierra y sigue.
- **Mouse/táctil:** clic en la opción la elige.
- Clic fuera cierra, con el patrón de `Popover` (ref del contenedor + listener `mousedown` en `document`).
- Escribir libremente siempre funciona: cerrar sin elegir conserva lo tipeado. Eso es lo que hace que la lista sea abierta y no un `<select>` disfrazado.

**El detalle que rompe estos componentes:** seleccionar va en **`onMouseDown`, no en `onClick`**. El `blur` del input dispara antes que el `click`, así que con `onClick` la lista se cierra antes de que la opción reciba el evento y el clic no hace nada. Hay un test que fija esto.

**Accesibilidad:** `role="combobox"` con `aria-expanded` y `aria-activedescendant` en el input; `role="listbox"` en la lista; `role="option"` con `aria-selected` en cada opción. Es el contrato que hace que un lector de pantalla anuncie "Subaru, opción 1 de 3" en vez de silencio.

**Estilo:** tokens del proyecto (`tinta`, `acero`, `linea`, `superficie`, `lienzo`, `azul`), siguiendo el `inputCls` que ya usa `NewVehicleModal`. La lista con altura máxima y scroll propio.

Se monta en `components/NewVehicleModal.tsx`, reemplazando el `<input>` genérico del campo `marca`. Los otros cuatro campos siguen igual.

## 5. La normalización, en el servidor

`POST /api/vehicles` aplica `normalizarMarca(marca)` antes de guardar. Es una línea en el objeto que se pasa a `createVehicle`.

El combobox **solo sugiere**: nunca se confía en lo que manda el cliente, y así queda cubierto también quien cree un vehículo por otra vía.

**Fuera de alcance, anotado:** `patente` y `modelo` tienen el mismo problema — se guardan sin `trim`, así que hoy puede existir una patente con un espacio al final. No se toca en esta entrega porque no es lo pedido y cambiar el saneo de la patente merece pensarse aparte.

## 6. `scripts/normalizar-marcas.mjs`

Patrón de los scripts existentes: **dry-run por defecto**, `--apply` para escribir, credenciales de producción desde `.env.local` vía Admin SDK.

```bash
node --env-file=.env.local scripts/normalizar-marcas.mjs           # muestra qué cambiaría
node --env-file=.env.local scripts/normalizar-marcas.mjs --apply   # escribe
```

Recorre todos los vehículos, calcula la marca normalizada y lista las que cambiarían (`companyId`, patente, valor actual → valor nuevo). Idempotente: correrlo dos veces no hace nada la segunda.

### La trampa de la deriva, y cómo se cierra

Los scripts son `.mjs` y no pueden importar el TypeScript de `lib/`, así que **duplican la lógica**. El proyecto ya pisó esto: el comparador de orden de `backfill-resumen.mjs` se desvió del de la app.

Si la lista del script se separa de `MARCAS`, el script normaliza a valores que la app no reconoce y nadie se entera. Por eso:

**Un test lee `scripts/normalizar-marcas.mjs`, extrae su lista de marcas y afirma que es igual a `MARCAS` — mismos elementos y mismo orden.** Es el mismo recurso que usa `lib/onboarding/__tests__/enlaces.test.ts`, que lee la página de Configuración para verificar que los enlaces del onboarding apunten a anclas que existen.

El script duplica también la **función** de normalización, no solo la lista. Ahí el riesgo de deriva se acepta: son unas pocas líneas y el test de la lista cubre lo que de verdad cambia con el tiempo (marcas nuevas). Para que esa duplicación no se olvide, el script lleva un comentario que apunta a `lib/vehicles/marcas.ts` como fuente de verdad y explica por qué no puede importarla.

## 7. Archivos

**Crear**
- `lib/vehicles/marcas.ts` — `MARCAS`, `sugerirMarcas`, `normalizarMarca`
- `components/vehicle/MarcaInput.tsx` — el combobox
- `scripts/normalizar-marcas.mjs` — normalización one-time

**Modificar**
- `components/NewVehicleModal.tsx` — el campo `marca` pasa a `MarcaInput`
- `app/api/vehicles/route.ts` — normalizar la marca antes de guardar
- `CLAUDE.md` — documentar la librería, el componente y el script

## 8. Testing

**Puro** (`lib/vehicles/__tests__/marcas.test.ts`)
- `sugerirMarcas`: las que empiezan con el texto van antes que las que solo lo contienen; "citroen" encuentra "Citroën" y "skoda" encuentra "Škoda"; respeta el tope de 8; query vacía devuelve `[]`; sin coincidencias devuelve `[]`.
- `normalizarMarca`: `"  subaru "` → `"Subaru"`; una marca desconocida conserva su escritura (`"BYD"` no se vuelve `"Byd"`); colapsa espacios internos; cadena vacía devuelve cadena vacía.

**Componente** (`components/__tests__/MarcaInput.test.tsx`)
- Escribir filtra y abre la lista; sin coincidencias no se abre.
- ↑↓ + Enter eligen la opción resaltada.
- Escape cierra y **conserva lo escrito**.
- El clic en una opción la elige — el test que fija el `onMouseDown`.
- El texto libre sobrevive al cierre.
- Los atributos de accesibilidad (`role`, `aria-expanded`, `aria-activedescendant`).

**Endpoint** (`app/api/__tests__/vehicles-marca.test.ts`)
- Mandar `"  subaru "` guarda `"Subaru"`. Es el test que prueba que la normalización vive en el servidor y no solo en la UI.

**Anti-deriva** (en `lib/vehicles/__tests__/marcas.test.ts`)
- La lista del script es idéntica a `MARCAS`.

**Verificación manual, no automatizable:** cómo se comporta la lista sobre el teclado de un celular real. Se mide primero en el navegador con viewport móvil (que sí se puede) y se confirma en un teléfono.

## 9. Fuera de alcance

- Filtro por marca en el dashboard (se hace después, con los datos ya ordenados).
- Poder **editar** la marca de un vehículo existente. Es el escape para un tipeo y hoy no existe; queda anotado como el hueco que este feature deja visible.
- Librería de **modelos**. La historia pide marcas.
- Sanear `patente` y `modelo`.
