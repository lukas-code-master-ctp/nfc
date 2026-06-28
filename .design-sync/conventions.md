# TapCar UI — convenciones

Componentes de **TapCar**, app chilena para gestionar la documentación de una flota de vehículos (Permiso de Circulación, Revisión Técnica, SOAP, etc.). React, estilados con **Tailwind CSS v4** + tokens de marca. UI en español neutro (Chile), sin dark mode.

## Setup / wrapping

No requieren provider ni contexto: importa el componente y úsalo. Los tokens y utilidades llegan vía `styles.css` (que `@import`a `_ds_bundle.css`); asegúrate de que esa hoja esté cargada o todo renderiza sin estilo.

```jsx
const { StatusBadge, VehicleCard, PublicVehicleView, PasswordInput } = window.TapCarUI
```

## Idioma de estilos: utilidades Tailwind + tokens

Estilo vía **clases de utilidad Tailwind**. Los colores son tokens de marca (no uses `red-500` genéricos; usa los del sistema):

| Familia | Clases (token) | Uso |
|---|---|---|
| Texto | `text-tinta` · `text-acero` | principal · secundario |
| Fondos | `bg-lienzo` · `bg-superficie` | fondo de app · cards/paneles |
| Primario | `bg-azul` · `bg-azul-press` · `text-azul` | CTA · hover/active · links |
| Bordes | `border-linea` | divisores y bordes de card |
| Acento | `text-ambar` · `bg-ambar` | acento cálido |
| Estados | `text-vigente` · `text-por-vencer` · `text-vencido` | al día (verde) · por vencer (ámbar) · vencido (rojo) |

Patrones idiomáticos del sistema:
- **Card**: `rounded-2xl border border-linea bg-superficie p-5 shadow-sm`
- **Badge/pill**: `inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold`
- **Botón primario**: `rounded-lg bg-azul px-4 py-2.5 font-semibold text-white hover:bg-azul-press`
- Iconos: SVG inline (no emojis). Fondo lienzo, cards blancas con sombra suave.

## Dónde está la verdad

- Tokens y utilidades compiladas: `styles.css` y `_ds_bundle.css` (léelos antes de inventar clases).
- API y uso por componente: `<Name>.d.ts` (props) y `<Name>.prompt.md` (ejemplos).

## Ejemplo

```jsx
const { VehicleCard, StatusBadge } = window.TapCarUI

function Flota({ vehiculos }) {
  return (
    <div className="space-y-4 bg-lienzo p-6">
      <h1 className="text-xl font-bold text-tinta">Mi flota</h1>
      <div className="space-y-2.5">
        {vehiculos.map((v) => (
          <VehicleCard key={v.id} vehicle={v} status={v.estado} docCount={v.docs} />
        ))}
      </div>
    </div>
  )
}
```

Los estados válidos en todo el sistema: `'al_dia' | 'por_vencer' | 'vencido' | 'sin_vencimiento'`.
