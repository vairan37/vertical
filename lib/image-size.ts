/** Dimensions d'une image JPEG ou PNG, lues dans son en-tête (sans dépendance). */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  // PNG : signature puis bloc IHDR (largeur et hauteur sur 4 octets aux positions 16 et 20).
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG : on parcourt les segments jusqu'à un marqueur SOF (0xC0 à 0xCF sauf C4, C8, CC).
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const length = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + length;
    }
  }
  return null;
}
