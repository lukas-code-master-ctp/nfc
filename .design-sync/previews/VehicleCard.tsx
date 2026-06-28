import { VehicleCard } from 'nfc-vehiculos'

const box: React.CSSProperties = { maxWidth: 440 }
const audi = { id: '1', marca: 'Audi', modelo: 'A1', patente: 'RZWV48', anio: 2022, color: 'blanco' }

// Vehículo con toda la documentación al día.
export const AlDia = () => (
  <div style={box}>
    <VehicleCard vehicle={audi} status="al_dia" docCount={3} />
  </div>
)

// Vehículo con documentos por vencer.
export const PorVencer = () => (
  <div style={box}>
    <VehicleCard
      vehicle={{ id: '2', marca: 'Toyota', modelo: 'Hilux', patente: 'KXLP72', anio: 2021, color: 'gris' }}
      status="por_vencer"
      docCount={4}
    />
  </div>
)

// Vehículo con documentos vencidos.
export const Vencido = () => (
  <div style={box}>
    <VehicleCard
      vehicle={{ id: '3', marca: 'Hyundai', modelo: 'Tucson', patente: 'BFGT39', anio: 2020, color: 'negro' }}
      status="vencido"
      docCount={2}
    />
  </div>
)
