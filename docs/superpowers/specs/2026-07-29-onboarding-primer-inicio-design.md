# Onboarding en el primer inicio

**Fecha:** 2026-07-29
**Estado:** aprobado, pendiente de plan

## Problema

> Como nuevo usuario, quiero realizar un proceso de onboarding personalizado según mi tipo de
> cuenta, para entender el funcionamiento de la plataforma y configurar mis herramientas
> iniciales de manera guiada.

Cuando un usuario ingresa por primera vez debe elegir entre una cuenta **personal** o de
**empresa**, y según esa respuesta recibir un onboarding u otro. El personal aprende a agregar un
vehículo y cargar sus documentos. El de empresa aprende además a configurar los datos de la
empresa, crear categorías, definir los parámetros de uso y mantención, sumar miembros al equipo,
registrar conductores, y en qué se diferencian el Dashboard y los Reportes.

El reconocimiento arrojó tres hechos que condicionan el diseño:

1. **Toda cuenta ya es una "empresa" por dentro.** `ensureProvisioned` (`lib/data/companies.ts`)
   crea un doc en `companies` para todo usuario en su primer login. El concepto "cuenta personal"
   no existe hoy y hay que introducirlo.
2. **Existe un tercer caso que el pedido no cubre: el invitado.** Quien entra por invitación cae
   en una empresa ajena con rol Editor o Visor. No se le puede preguntar "¿personal o empresa?"
   —la respuesta ya está tomada— y además carece de permisos para casi todos los pasos que
   enseñaría el onboarding de empresa.
3. **Todo lo que hay que enseñar ya existe y vive en un solo lugar.** `/configuracion` tiene las
   cards de empresa, categorías, pauta de mantención, equipo y conductores. El onboarding no
   necesita construir formularios: necesita llevar al usuario hasta los que ya están.

## Alcance

- Una pantalla de elección `/bienvenida` (personal o empresa), obligatoria una sola vez.
- Una tarjeta de progreso en el dashboard con los pasos del tipo elegido, que persiste entre
  sesiones hasta completarse o descartarse.
- Un campo `onboarding` en la empresa y un endpoint para mutarlo.

**Fuera de alcance:** el tipo de cuenta **no cambia la app**. Configuración sigue mostrando
equipo, conductores, categorías y mantención a todo el mundo. `tipoCuenta` solo decide qué pasos
se enseñan. Así no hace falta guardar rutas, ni migrar datos cuando alguien crece de un auto a
una flota: ya tiene todo disponible.

## Modelo de datos

Un solo campo nuevo, en `companies/{companyId}`:

```ts
export interface Onboarding {
  tipoCuenta: 'personal' | 'empresa'
  vistos: string[]                // ids de pasos informativos reconocidos
  completadoEn?: string | null    // ISO
  descartadoEn?: string | null    // ISO
}
```

### Por qué vive en la empresa y no en el usuario

Por el invitado (hecho 2). El onboarding lo ve **solo quien tiene rol Administrador**; para
Editor y Visor sencillamente no existe. Si el campo viviera en `users/{uid}`, cada miembro
arrastraría su propio estado de un proceso que no le corresponde ejecutar.

Vivir en la empresa tiene además una propiedad útil cuando hay dos administradores: como el
progreso se deriva de los datos (ver más abajo), lo que hace uno lo ve el otro sin sincronizar
nada.

### El disparador no necesita migración

`tipoCuenta` ausente es la señal de "esta cuenta todavía no eligió". Las cuentas que ya existen en
producción caen naturalmente en ese caso y ven la pantalla en su próximo ingreso. No hace falta
script de backfill.

## El progreso se deriva de los datos reales

Ningún paso guarda "hecho". Cada uno se calcula al renderizar: ¿hay al menos un vehículo?, ¿hay al
menos un documento?, ¿la razón social está llena?, ¿hay categorías?, ¿hay conductores?

Las consecuencias importan:

- **No puede mentir.** No hay forma de marcar listo un paso sin haberlo hecho.
- **Se auto-corrige.** Si el paso se completó desde otro lugar de la app —lo normal, porque los
  formularios ya existían antes que el onboarding— el checklist lo refleja igual.
- **No se desincroniza.** Con estado guardado por paso, borrar el dato deja el checklist mintiendo
  para siempre.

La alternativa descartada —guardar "hecho" al hacer clic— es más simple de calcular y falla en las
dos direcciones. La otra alternativa descartada, un tour guiado con spotlight sobre la UI real, se
acopla al DOM y a las clases de Tailwind: cualquier rediseño lo rompe en silencio, y en celular el
recorte de foco sobre una barra sticky se comporta mal. Para pasos que son "anda acá y llena
esto", no compensa.

### Los pasos informativos son la excepción

Dos pasos no dejan rastro en los datos y por eso necesitan un "Entendido" guardado en `vistos`:

- **El chip NFC** (`chip`). El `publicToken` se crea junto con el vehículo, así que la app no
  tiene forma de saber si el chip llegó a grabarse. Entra al onboarding porque hoy un usuario
  nuevo puede no descubrir nunca que existe: vive en la pestaña Ajustes de la ficha del vehículo,
  que es el último lugar donde uno mira.
- **Dashboard y Reportes** (`reportes`). Es una explicación, no una configuración.

### El enganche del final

Derivar todo tiene un problema circular: **para saber que el onboarding está completo hay que
hacer las consultas**. Sin resolverlo, esas lecturas se pagarían en cada carga del dashboard para
siempre.

Por eso `completadoEn` se estampa cuando todos los pasos quedan listos. El dashboard mira primero
`completadoEn` y `descartadoEn`: si alguno está, no renderiza la tarjeta y **no hace ninguna
consulta extra**. Solo mientras el onboarding sigue vivo se calculan las señales.

De paso arregla una rareza: sin el enganche, una empresa que borra a su último conductor dos años
después vería reaparecer el checklist de bienvenida.

La escritura es **best-effort** vía `after()` de `next/server`, como el resto de los refrescos
denormalizados del proyecto. Si Firestore falla justo ahí, la próxima carga vuelve a calcular y lo
intenta de nuevo; nunca rompe el render del dashboard.

## El flujo

### La pantalla de elección

`app/bienvenida/page.tsx`, **fuera** del grupo `(app)`: sin barra de navegación ni menú de
usuario, solo el logo y dos tarjetas grandes —"Un vehículo particular" y "Una flota de la
empresa"— cada una con una línea de lo que trae. Es la primera impresión del producto y merece
pantalla completa. Exige sesión por su cuenta (`getCurrentUser`, redirige a `/login` si no hay).

Va fuera de `(app)` a propósito: si viviera dentro, el layout que redirige hacia ella se
redirigiría a sí mismo.

### El portero vive en el dashboard

La comprobación "¿esta cuenta ya eligió tipo?" va en `app/(app)/dashboard/page.tsx`, no en el
layout de `(app)`.

La razón es de costo. El layout envuelve las nueve páginas de la app, así que poner ahí la
comprobación significa una lectura extra de Firestore en cada navegación, para siempre, incluso
años después de completado el onboarding. El dashboard **ya lee la empresa**: la comprobación sale
gratis.

El precio, explícito: si alguien escribe `/configuracion` directo en la barra sin haber elegido
tipo, entra sin pasar por la pantalla. En la práctica no ocurre —`LoginForm` manda a `/dashboard`
después de autenticar— y la próxima vez que toque el logo cae en el portero igual. Es un
intercambio deliberado: evitar una consulta permanente en todas las páginas a cambio de un hueco
que nadie recorre.

Solo redirige si `can(role, 'billing:manage')`. Un Editor o Visor en una empresa sin `tipoCuenta`
entra al dashboard normalmente.

### La tarjeta de progreso

Arriba de la lista de vehículos: "Configura tu cuenta · 2 de 9", con barra y pasos pendientes.
Cada paso es un enlace al formulario que ya existe, con una frase de por qué importa. El
onboarding es un índice, no un reemplazo.

Desaparece sola al completarse. Tiene "Ocultar" (escribe `descartadoEn`) y se recupera desde
Configuración, para que ocultarla no sea un callejón sin salida.

Quien eligió "personal" y después arma una flota tiene un enlace *"en realidad administro una
flota"* que agrega los seis pasos restantes. Es solo cambiar `tipoCuenta`: ningún dato se toca.

## Los pasos

**Cuenta personal — 3 pasos**

| id | Paso | Lleva a | Listo cuando |
| --- | --- | --- | --- |
| `vehiculo` | Agrega tu vehículo | Dashboard, abre el modal de alta | Hay ≥ 1 vehículo |
| `documentos` | Sube sus documentos | Ficha del vehículo, pestaña Documentos | Algún vehículo tiene ≥ 1 documento |
| `chip` | Vincula el chip NFC | Ficha del vehículo, pestaña Ajustes | El usuario da "Entendido" |

**Cuenta empresa — esos 3, y además 6**

| id | Paso | Lleva a | Listo cuando |
| --- | --- | --- | --- |
| `empresa` | Completa los datos de la empresa | `/configuracion` | La razón social no está vacía |
| `categorias` | Crea tus categorías | `/configuracion#categorias` | Hay ≥ 1 categoría |
| `mantencion` | Define la pauta de mantención | `/configuracion#mantencion` | La pauta tiene km o meses |
| `equipo` | Suma a tu equipo | `/configuracion#equipo` | Hay ≥ 2 miembros, o ≥ 1 invitación pendiente |
| `conductores` | Registra a tus conductores | `/configuracion#conductores` | Hay ≥ 1 conductor |
| `reportes` | Dashboard y Reportes: en qué se diferencian | — (texto en la tarjeta) | El usuario da "Entendido" |

Los enlaces con ancla requieren agregar `id` a las cards de `/configuracion`, que hoy no los
tienen.

### El orden empieza por el vehículo, también en cuenta de empresa

Es tentador poner primero los datos de la empresa —es lo formal— pero el momento en que TapCar se
entiende es cuando aparece el primer auto en el dashboard. Pedirle razón social y giro a alguien
que todavía no vio para qué sirve la app es la mejor forma de perderlo.

### El aviso de uso no sirve como señal de progreso

`avisoUsoHoras` tiene un default de 12 horas, así que el campo ausente **ya está funcionando**: no
hay forma de distinguir "no lo configuró" de "le quedó bien el default". Por eso el paso
`mantencion` se deriva de la pauta, que sí es señal real, y el aviso de uso se menciona en el
texto del paso porque vive en la misma página.

## Costo de las señales

| Señal | De dónde sale | Consultas extra |
| --- | --- | --- |
| Vehículos | `listVehicles`, que el dashboard ya hace | 0 |
| Documentos | Los `items` ya resueltos por `resolverResumen` | 0 |
| Razón social, categorías, pauta | `getCompany`, que el dashboard ya hace | 0 |
| Miembros | `countMembers` + `countPendingInvitations` | 2 |
| Conductores | `listActiveDrivers` | 1 |

**Cuenta personal: cero consultas extra.** Las tres adicionales son solo de cuenta empresa, y solo
mientras el onboarding sigue vivo.

La señal de documentos se toma de los `items` ya resueltos y **no** de `v.resumenDocs` directo: un
vehículo creado antes del feature de resúmenes tiene el campo ausente, y `resolverResumen` es
justamente quien resuelve ese caso. Leerlo crudo daría "sin documentos" en vehículos que sí los
tienen.

## Componentes

| Archivo | Responsabilidad |
| --- | --- |
| `lib/onboarding/pasos.ts` | **Lógica pura, sin Firebase.** Recibe tipo de cuenta + señales, devuelve la lista de pasos con su estado y si está todo listo. |
| `lib/onboarding/cargar.ts` | Carga las señales que no están en el render del dashboard (miembros, conductores). Toca Firestore. |
| `lib/data/companies.ts` | `saveOnboarding(companyId, patch)` y el mapeo del campo en `getCompany`. Va aquí porque es el mismo documento que `saveCompany`. |
| `app/bienvenida/page.tsx` | La pantalla de elección. |
| `app/api/onboarding/route.ts` | `PATCH` con `{ tipoCuenta?, visto?, descartado? }`, todos opcionales, al estilo de `PATCH /api/company`. |
| `components/onboarding/TarjetaProgreso.tsx` | La tarjeta del dashboard. |

## Seguridad

El endpoint escribe en la empresa, así que valida `getMembership()` + `can(role, 'billing:manage')`
como todos los demás endpoints privados, y nunca confía en el `companyId` del cliente. Un Editor
que lo llame a mano recibe 403.

La pantalla `/bienvenida` no es un permiso: es una pregunta. El enforcement está en el endpoint.

`visto` se valida contra la lista de ids conocidos (`chip`, `reportes`) antes de escribirse, para
que nadie infle el arreglo con basura.

## Tests

El corazón es `lib/onboarding/pasos.ts`, puro y con las señales inyectadas, al estilo de
`lib/documents/status.ts`:

- Cuenta personal devuelve 3 pasos; cuenta empresa devuelve 9.
- Cada señal marca listo el paso que le corresponde y ningún otro.
- Los pasos informativos dependen solo de `vistos`.
- "Todos listos" es exactamente lo que dispara el enganche de `completadoEn`.

Además:

- **El endpoint**: acepta a Administrador, rechaza a Editor y Visor con 403, rechaza un `visto`
  desconocido, y responde 400 si el patch queda sin campos válidos.
- **El portero**: empresa sin `tipoCuenta` + rol admin redirige a `/bienvenida`; el mismo caso con
  rol editor no redirige; empresa con `tipoCuenta` no redirige a nadie.

**Lo que no se puede probar automáticamente** es si el onboarding sirve. Eso se verifica creando
una cuenta nueva de verdad y recorriéndola entera, en celular: que la pantalla de elección se lea
bien, que cada paso lleve al lugar correcto, que el progreso avance al completar cada uno, y que
la tarjeta desaparezca al terminar.
