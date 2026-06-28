import { StatusBadge } from 'nfc-vehiculos'

const row: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }

// Estados de un documento individual (etiqueta corta).
export const Documento = () => (
  <div style={row}>
    <StatusBadge status="al_dia" />
    <StatusBadge status="por_vencer" />
    <StatusBadge status="vencido" />
    <StatusBadge status="sin_vencimiento" />
  </div>
)

// Estado resumido de un vehículo (peor estado de sus documentos).
export const Vehiculo = () => (
  <div style={row}>
    <StatusBadge status="al_dia" variant="vehicle" />
    <StatusBadge status="por_vencer" variant="vehicle" />
    <StatusBadge status="vencido" variant="vehicle" />
    <StatusBadge status="sin_vencimiento" variant="vehicle" />
  </div>
)
