export function buildExifJpeg(entries: { tag: number; value: string }[]): Buffer {
  const sorted = [...entries].sort((a, b) => a.tag - b.tag)
  const strings = sorted.map((entry) => Buffer.from(`${entry.value}\0`, 'ascii'))
  const exifIfdOffset = 26
  const valuesOffset = exifIfdOffset + 2 + sorted.length * 12 + 4
  const tiffSize = valuesOffset + strings.reduce((sum, value) => sum + value.length, 0)
  const tiff = Buffer.alloc(tiffSize)

  tiff.write('II', 0, 'ascii')
  tiff.writeUInt16LE(0x002a, 2)
  tiff.writeUInt32LE(8, 4)
  tiff.writeUInt16LE(1, 8)
  tiff.writeUInt16LE(0x8769, 10)
  tiff.writeUInt16LE(4, 12)
  tiff.writeUInt32LE(1, 14)
  tiff.writeUInt32LE(exifIfdOffset, 18)
  tiff.writeUInt32LE(0, 22)
  tiff.writeUInt16LE(sorted.length, exifIfdOffset)

  let cursor = valuesOffset
  sorted.forEach((entry, index) => {
    const position = exifIfdOffset + 2 + index * 12
    const bytes = strings[index]
    tiff.writeUInt16LE(entry.tag, position)
    tiff.writeUInt16LE(2, position + 2)
    tiff.writeUInt32LE(bytes.length, position + 4)
    tiff.writeUInt32LE(cursor, position + 8)
    bytes.copy(tiff, cursor)
    cursor += bytes.length
  })
  tiff.writeUInt32LE(0, exifIfdOffset + 2 + sorted.length * 12)

  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff])
  const app1 = Buffer.alloc(4 + payload.length)
  app1.writeUInt16BE(0xffe1, 0)
  app1.writeUInt16BE(payload.length + 2, 2)
  payload.copy(app1, 4)
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, Buffer.from([0xff, 0xd9])])
}
