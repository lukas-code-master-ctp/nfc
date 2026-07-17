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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-linea text-left text-xs uppercase tracking-wide text-acero">
                <th className="py-2 pr-4 font-medium">Conductor</th>
                <th className="py-2 pr-4 font-medium">Usos</th>
                <th className="py-2 pr-4 font-medium">Daños</th>
                <th className="py-2 pr-4 font-medium">Sin entrega</th>
                <th className="py-2 font-medium">Consumo anormal</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className="border-b border-linea/60">
                  <td className="py-2 pr-4 font-medium text-tinta">{f.nombre}</td>
                  <td className="py-2 pr-4 text-tinta">{f.usos}</td>
                  <td className={`py-2 pr-4 ${f.danos > 0 ? 'font-semibold text-[#C81E1E]' : 'text-tinta'}`}>{f.danos}</td>
                  <td className={`py-2 pr-4 ${f.sinEntrega > 0 ? 'font-semibold text-[#B45309]' : 'text-tinta'}`}>{f.sinEntrega}</td>
                  <td className={`py-2 ${f.consumoAnomalo > 0 ? 'font-semibold text-[#B45309]' : 'text-tinta'}`}>{f.consumoAnomalo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
