// Web NFC no está en lib.dom.d.ts. Declaramos solo lo que usamos.
// Soporte real: Android Chrome 89+. Ver docs/superpowers/specs/2026-07-27-grabar-chip-nfc-web-design.md

interface NDEFRecordInit {
  recordType: string
  mediaType?: string
  id?: string
  data?: unknown
}

interface NDEFMessageInit {
  records: NDEFRecordInit[]
}

interface NDEFWriteOptions {
  overwrite?: boolean
  signal?: AbortSignal
}

declare class NDEFReader {
  constructor()
  write(message: NDEFMessageInit, options?: NDEFWriteOptions): Promise<void>
}

interface Window {
  /** Solo existe en Android/Chrome. Se accede vía `window.NDEFReader` para poder falsearlo en tests. */
  NDEFReader?: typeof NDEFReader
}
