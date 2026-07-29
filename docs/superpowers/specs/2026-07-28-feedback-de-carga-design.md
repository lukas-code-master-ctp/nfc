# Feedback de carga y dashboard sin consultas por vehículo

**Fecha:** 2026-07-28
**Estado:** aprobado, pendiente de plan

## Problema

> Como usuario, quiero ver un indicador visual de carga cuando realizo una acción, para saber
> que la aplicación está procesando mi solicitud y no se ha quedado congelada.
>
> Cuando hago click en algún lugar no hay ninguna animación de carga o de que algo está por
> suceder; a veces esto hace pensar que se quedó pegada la app.

El reconocimiento arrojó tres hechos que definen el alcance:

1. **No existe ni un solo `loading.tsx`, y las 9 páginas de la app (más su layout) son
   `force-dynamic`.** Ninguna
   navegación tiene feedback: al hacer clic, Next espera al servidor mostrando la pantalla
   anterior intacta. Es indistinguible de una app colgada. Peor: sin `loading.tsx`, Next **no
   prefetchea las rutas dinámicas en absoluto**, así que la espera es completa.
2. **Los formularios sí tienen feedback.** 16 componentes usan `disabled={loading}` con textos
   tipo "Guardando…". El problema no está en los botones que guardan, sino en los que **navegan**.
3. **El dashboard es genuinamente lento, no solo se siente lento.** Hace `listVehicles` y
   después, por cada vehículo, un `listDocuments` y un `ultimaMantencion`. Son 2N+1 consultas.
   El `Promise.all` las paraleliza entre vehículos (la latencia es de ~3 idas y vueltas
   encadenadas, no de 2N+1), pero con 200 vehículos son ~400 consultas simultáneas contra
   Firestore: presión sobre el pool de conexiones y lecturas facturadas.

La **paginación de 25 por página no protege de nada**: es 100% del lado del cliente. El servidor
arma los datos de todos los vehículos y `VehiclesBoard` recién ahí corta el arreglo. Lo mismo el
buscador y los filtros. Fue una decisión consciente (permite buscar sobre toda la flota sin ir al
servidor) y a la escala actual está bien, pero significa que el costo se paga completo siempre.

Por eso el trabajo tiene dos mitades: **feedback** (que algo aparezca al instante) y **velocidad**
(que haya menos que esperar).

## Alcance

- Cuatro `loading.tsx`: uno genérico para el grupo `(app)` y tres específicos (dashboard, ficha
  del vehículo, ficha pública `/v/<token>`).
- Denormalizar en el vehículo el resumen de documentos y la última mantención, para que el
  dashboard **deje de emitir consultas por vehículo**. Le quedan las 5 de empresa que ya hace en
  paralelo (`listVehicles`, `getCompany`, `listAlertas` y las dos de transferencias), que no
  crecen con el tamaño de la flota.
- Refresco al escribir, script de backfill, y fallback a consulta en vivo cuando falta el resumen.

Fuera de alcance: `useLinkStatus` (una vez que hay `loading.tsx`, la fase pendiente se salta casi
siempre); paginación server-side del dashboard; optimizar `/reportes`, que lee todos los usos de
la empresa en cada carga (queda con el skeleton genérico y su deuda de escala documentada).

## Parte 1 — Los skeletons

Cuatro server components sin estado:

| Archivo | Contenido |
| --- | --- |
| `app/(app)/loading.tsx` | Genérico: encabezado + dos bloques de card. Cubre configuración, perfil, facturación, admin, reportes y transferencias. |
| `app/(app)/dashboard/loading.tsx` | Seis tarjetas fantasma con el mismo `grid` y la misma altura que `VehiclesBoard`. |
| `app/(app)/vehiculos/[id]/loading.tsx` | Encabezado (patente, km), fila de pestañas y un bloque de contenido. |
| `app/v/[token]/loading.tsx` | Logo TapCar y el menú de botones de la ficha pública. |

Debajo, `components/skeleton/` con dos primitivas (un bloque y una línea de texto) para que los
cuatro archivos sean composición y no repitan clases de Tailwind.

La ficha pública entra aunque no estaba en el pedido original: es la pantalla que abre un
carabinero al costado de la carretera, con datos móviles, y la que peor tolera una pantalla en
blanco.

**Regla de oro:** el skeleton debe **calzar en tamaño** con lo que reemplaza. Uno más bajo que el
contenido real produce un salto al cargar, que molesta más que no haber puesto nada. Por eso el
del dashboard reusa las clases de grilla y altura de `VehicleCard`.

Animación: `animate-pulse` de Tailwind sobre `bg-linea`. Nada nuevo en la paleta.

Efecto secundario deseado: con `loading.tsx` presente, Next habilita el **prefetch parcial** de la
cáscara de las rutas dinámicas, así que la navegación pasa a ser instantánea de verdad, no solo a
parecerlo.

## Parte 2 — El resumen denormalizado

Dos campos nuevos en `vehicles/{id}`, ambos opcionales:

```ts
resumenDocs?:       { total: number; proximoVencimiento: string | null }
resumenMantencion?: { ultima: { km: number | null; fecha: string } | null }
```

### Por qué se guarda la fecha y no el estado

`worstStatus` ordena `vencido > por_vencer > al_dia > sin_vencimiento`, y `documentStatus` es
monótono en los días restantes. Por lo tanto **el documento que vence primero siempre determina
el badge de la tarjeta**. Guardar esa única fecha reproduce el resultado exactamente.

Guardar el estado calculado, en cambio, sería un error: un documento pasa de "al día" a "por
vencer" a la medianoche, **sin que nadie escriba nada**. El dashboard mostraría badges verdes de
documentos ya vencidos hasta que alguien tocara ese vehículo. Con la fecha, el estado se sigue
calculando en cada render contra el reloj de ese momento, igual que hoy.

El mismo criterio aplica a la mantención: `estadoMantencion` depende de `now` y de `kmActual`, así
que se guarda `ultima` (que es exactamente lo que devuelve `ultimaMantencion` hoy) y el estado se
calcula al leer.

### Por qué la mantención va envuelta en un objeto

`ultima` legítimamente vale `null` cuando el vehículo nunca tuvo mantención. Si el campo fuera
directamente `ultima`, no habría forma de distinguir "no tiene mantenciones" de "todavía no se
ha calculado". El envoltorio lo resuelve: **campo ausente** = sin calcular (usar el fallback);
**`{ ultima: null }`** = calculado y no hay.

### Dónde se refresca

Cinco puntos de escritura, todos identificados:

- `POST /api/documents`, `PATCH /api/documents/[id]`, `DELETE /api/documents/[id]` → `refreshResumenDocs(vehicleId)`
- `POST /api/mantenciones`, `DELETE /api/mantenciones/[id]` → `refreshResumenMantencion(vehicleId)`

Mismo patrón que `refreshVehicleKm`. `PATCH /api/documents/[id]` entra porque puede cambiar la
fecha de vencimiento, y con ella el documento que vence primero.

**Transferir un vehículo NO requiere refresco:** los documentos y las mantenciones se mueven junto
con él, así que el conteo y las fechas siguen siendo válidos. Borrar un vehículo tampoco: el
vehículo desaparece.

### Lo que puede salir mal

El refresco es **best-effort**, como el de kilometraje: si Firestore falla justo ahí, no queremos
que la subida del documento —que ya se guardó— reviente. El costo es que el resumen queda viejo
hasta la siguiente escritura sobre ese vehículo.

El daño está acotado y vale la pena decirlo explícito: ese dato **solo alimenta el badge y el
contador de la tarjeta del dashboard**. La ficha del vehículo y la ficha pública que ve el
carabinero leen los documentos en vivo. El peor caso es un badge desactualizado en la vista de
gestión, nunca un documento mal mostrado en una fiscalización.

### Migración y red de seguridad

- `scripts/backfill-resumen.mjs [--apply]`, dry-run por defecto, al estilo de `backfill-km.mjs`.
- **Fallback:** si un vehículo no tiene el campo, el dashboard lo consulta en vivo solo para ese
  vehículo. Una flota a medio migrar da resultados correctos, solo más lentos para los que faltan.
  La migración no puede romper nada: en el peor caso queda tan lento como hoy, nunca incorrecto.
- Para que el fallback sea testeable, la decisión "¿uso el resumen o consulto en vivo?" vive en
  una función con la carga inyectada, al estilo de `runReminders`, **no** incrustada en el server
  component.

### Frecuencia de escritura

Un usuario con dos autos que entra dos veces al año refresca dos veces al año, y eso está bien:
el resumen solo necesita cambiar cuando cambian los datos que resume. Si los documentos no
cambiaron, el resumen del año pasado sigue siendo exacto. Lo que cambia solo, con el calendario,
es el estado — y por eso no se guarda.

## Tests

**El test keystone es de equivalencia:** que el badge calculado desde `proximoVencimiento` sea
idéntico al que hoy sale de `worstStatus` sobre la lista completa. Toda la denormalización
descansa en esa afirmación. Se prueba para varios conjuntos (todos vigentes, uno vencido, mezcla
con Padrón sin fecha, lista vacía) comparando ambos caminos.

- **`lib/documents/resumen.ts`** (puro): `resumirDocumentos(docs)` toma la fecha más próxima,
  ignora los documentos sin vencimiento al elegirla pero sí los cuenta en el total, y devuelve
  `null` cuando ninguno vence.
- **Los refrescadores** (`lib/data/`, Firestore mockeado como el resto de esa carpeta): que
  escriban el resumen correcto y que un fallo no propague la excepción.
- **Los cinco endpoints**: que cada mutación dispare su refrescador.
- **El fallback**: un vehículo con resumen no toca la consulta; uno sin resumen sí.

**Lo que NO queda cubierto por tests automáticos:** los cuatro `loading.tsx`. Son marcado estático
sin lógica, y un test de "renderiza sin explotar" no atraparía lo único que puede salir mal ahí:
que el skeleton no calce con el contenido real y produzca un salto. Eso se verifica mirando.

Tampoco se puede aseverar automáticamente que el dashboard *quedó más rápido*. Lo que sí se
verifica es la causa: que su carga deje de emitir consultas por vehículo.

## Verificación manual

- Navegar entre Dashboard, Reportes, ficha de un vehículo y Configuración: en cada clic debe
  aparecer algo de inmediato.
- Que al llegar el contenido real **nada salte de lugar** respecto del skeleton.
- Abrir `/v/<token>` desde el celular con datos móviles.
- Con un vehículo ya migrado y otro sin migrar (antes de correr el backfill con `--apply`), que
  ambos muestren el mismo badge y el mismo conteo de documentos.
- Subir un documento y confirmar que el badge del dashboard cambia sin recargar nada más.
