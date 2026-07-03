import { VEHICLE_INFO_FIELDS, type VehicleInfo } from '@/lib/types'

// Vista de solo lectura de la info operativa del vehículo, para roles que no
// pueden editarla (Editor y Visor). El Administrador ve el formulario editable
// (VehicleInfoForm). Mismos datos que la pestaña "Sobre el vehículo" de la
// ficha pública.
export default function VehicleInfoView({ info }: { info: VehicleInfo }) {
  const filled = VEHICLE_INFO_FIELDS.filter((f) => (info[f.key] ?? '').trim())
  const rows = filled.filter((f) => !f.multiline)
  const notas = filled.find((f) => f.multiline)

  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Sobre el vehículo</h2>
      <p className="mt-1 text-sm text-acero">
        Datos útiles para quien maneje el vehículo. Aparecen en la ficha pública del chip NFC.
      </p>

      {filled.length === 0 ? (
        <p className="mt-4 text-sm text-acero">Aún no hay información del vehículo.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.length > 0 && (
            <dl className="divide-y divide-linea overflow-hidden rounded-xl border border-linea">
              {rows.map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-4 px-4 py-3">
                  <dt className="text-sm text-acero">{f.label}</dt>
                  <dd className="text-right text-sm font-semibold text-tinta">{info[f.key]}</dd>
                </div>
              ))}
            </dl>
          )}
          {notas && (
            <div className="rounded-xl border border-linea p-4">
              <p className="text-sm font-semibold text-tinta">{notas.label}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-acero">{info[notas.key]}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
