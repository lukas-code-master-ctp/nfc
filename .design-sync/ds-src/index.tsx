// Barrel synth-entry para design-sync (TapCar UI).
// Re-exporta como NOMBRES los componentes presentacionales (los reales son
// `export default`). VehicleCard va por un shim local que reemplaza
// `next/link` por `<a>` para que bundlee sin el runtime de Next.
export { default as StatusBadge } from '@/components/StatusBadge'
export { default as PasswordInput } from '@/components/PasswordInput'
export { default as PublicVehicleView } from '@/components/PublicVehicleView'
export { default as VehicleCard } from './general/VehicleCard'
