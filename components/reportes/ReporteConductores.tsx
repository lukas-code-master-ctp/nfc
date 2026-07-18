interface Fila {
  id: string
  nombre: string
  usos: number
  danos: number
  sinEntrega: number
  consumoAnomalo: number
}

export default function ReporteConductores({ filas }: { filas: Fila[] }) {
  return (
    <section className="rounded-2xl border border-linea bg-superficie p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-tinta">Responsabilidad por conductor</h2>
      <p className="mt-1 text-sm text-acero">Acumulado desde que se activó el registro.</p>
      {filas.length === 0 ? (
        <p className="mt-4 text-sm text-acero">Aún no hay conductores.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-linea text-xs uppercase tracking-wide text-acero">
                <th className="w-2/5 py-2 pr-2 text-left align-bottom font-medium">Conductor</th>
                <th className="px-1 py-2 text-center align-bottom font-medium">Usos</th>
                <th className="px-1 py-2 text-center align-bottom font-medium">Daños</th>
                <th className="px-1 py-2 text-center align-bottom font-medium">Sin entrega</th>
                <th className="px-1 py-2 text-center align-bottom font-medium">Consumo anormal</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-linea/60">
                  <td className="truncate py-2 pr-2 font-medium text-tinta">{f.nombre}</td>
                  <td className="px-1 py-2 text-center text-tinta">{f.usos}</td>
                  <td className={`px-1 py-2 text-center ${f.danos > 0 ? 'font-semibold text-[#C81E1E]' : 'text-tinta'}`}>{f.danos}</td>
                  <td className={`px-1 py-2 text-center ${f.sinEntrega > 0 ? 'font-semibold text-[#B45309]' : 'text-tinta'}`}>{f.sinEntrega}</td>
                  <td className={`px-1 py-2 text-center ${f.consumoAnomalo > 0 ? 'font-semibold text-[#B45309]' : 'text-tinta'}`}>{f.consumoAnomalo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
