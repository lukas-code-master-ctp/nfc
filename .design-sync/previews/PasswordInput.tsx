import { PasswordInput } from 'nfc-vehiculos'

const box: React.CSSProperties = { maxWidth: 360 }

// Vacío, con placeholder tenue.
export const Vacio = () => (
  <div style={box}>
    <PasswordInput placeholder="Contraseña" autoComplete="current-password" />
  </div>
)

// Con valor (oculto por defecto; el ojito alterna la visibilidad).
export const ConValor = () => (
  <div style={box}>
    <PasswordInput defaultValue="TapCar2026" autoComplete="new-password" />
  </div>
)
