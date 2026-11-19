const TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  text: string
}

/** ZIP sederhana tanpa kompresi (store), nama file UTF-8. Cukup untuk file teks config. */
export function makeZip(entries: ZipEntry[], date = new Date()): Uint8Array {
  const enc = new TextEncoder()
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()

  const prepared = entries.map((e) => {
    const name = enc.encode(e.name)
    const data = enc.encode(e.text)
    return { name, data, crc: crc32(data) }
  })

  const total =
    prepared.reduce((n, p) => n + 30 + p.name.length + p.data.length + 46 + p.name.length, 0) + 22
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  let pos = 0
  const offsets: number[] = []

  for (const p of prepared) {
    offsets.push(pos)
    dv.setUint32(pos, 0x04034b50, true)
    dv.setUint16(pos + 4, 20, true)
    dv.setUint16(pos + 6, 0x0800, true)
    dv.setUint16(pos + 8, 0, true)
    dv.setUint16(pos + 10, dosTime, true)
    dv.setUint16(pos + 12, dosDate, true)
    dv.setUint32(pos + 14, p.crc, true)
    dv.setUint32(pos + 18, p.data.length, true)
    dv.setUint32(pos + 22, p.data.length, true)
    dv.setUint16(pos + 26, p.name.length, true)
    dv.setUint16(pos + 28, 0, true)
    out.set(p.name, pos + 30)
    out.set(p.data, pos + 30 + p.name.length)
    pos += 30 + p.name.length + p.data.length
  }

  const cdStart = pos
  prepared.forEach((p, i) => {
    dv.setUint32(pos, 0x02014b50, true)
    dv.setUint16(pos + 4, 20, true)
    dv.setUint16(pos + 6, 20, true)
    dv.setUint16(pos + 8, 0x0800, true)
    dv.setUint16(pos + 10, 0, true)
    dv.setUint16(pos + 12, dosTime, true)
    dv.setUint16(pos + 14, dosDate, true)
    dv.setUint32(pos + 16, p.crc, true)
    dv.setUint32(pos + 20, p.data.length, true)
    dv.setUint32(pos + 24, p.data.length, true)
    dv.setUint16(pos + 28, p.name.length, true)
    dv.setUint16(pos + 30, 0, true)
    dv.setUint16(pos + 32, 0, true)
    dv.setUint16(pos + 34, 0, true)
    dv.setUint16(pos + 36, 0, true)
    dv.setUint32(pos + 38, 0, true)
    dv.setUint32(pos + 42, offsets[i], true)
    out.set(p.name, pos + 46)
    pos += 46 + p.name.length
  })

  dv.setUint32(pos, 0x06054b50, true)
  dv.setUint16(pos + 4, 0, true)
  dv.setUint16(pos + 6, 0, true)
  dv.setUint16(pos + 8, prepared.length, true)
  dv.setUint16(pos + 10, prepared.length, true)
  dv.setUint32(pos + 12, pos - cdStart, true)
  dv.setUint32(pos + 16, cdStart, true)
  dv.setUint16(pos + 20, 0, true)
  return out
}
