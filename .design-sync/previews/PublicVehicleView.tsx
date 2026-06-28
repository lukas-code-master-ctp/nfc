import { PublicVehicleView } from 'nfc-vehiculos'

// Ficha pública de fiscalización (lo que ve un carabinero al acercar el
// teléfono al chip NFC). Combina los tres estados de documento y un caso
// "Sin archivo adjunto".
export const Ficha = () => (
  <PublicVehicleView
    vehicle={{ id: '1', marca: 'Audi', modelo: 'A1', patente: 'RZWV48', anio: 2022, color: 'blanco' }}
    documents={[
      {
        id: '1',
        tipo: 'permiso_circulacion',
        nombrePersonalizado: null,
        fechaVencimiento: '2026-07-29',
        status: 'al_dia',
        readUrl: '#',
        filePath: 'permiso.pdf',
      },
      {
        id: '2',
        tipo: 'revision_tecnica',
        nombrePersonalizado: null,
        fechaVencimiento: '2026-07-08',
        status: 'por_vencer',
        readUrl: '#',
        filePath: 'revision.pdf',
      },
      {
        id: '3',
        tipo: 'soap',
        nombrePersonalizado: null,
        fechaVencimiento: '2026-06-15',
        status: 'vencido',
        readUrl: null,
        filePath: '',
      },
    ]}
  />
)
