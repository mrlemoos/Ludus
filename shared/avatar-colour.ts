const paper = '#f2f5f1';
const ink = '#203b32';

function channel(value: number): number {
  const encoded = value / 255;
  return encoded <= 0.04045 ? encoded / 12.92 : ((encoded + 0.055) / 1.055) ** 2.4;
}

function luminance(red: number, green: number, blue: number): number {
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

const paperLuminance = luminance(242, 245, 241);
const inkLuminance = luminance(32, 59, 50);

function contrast(left: number, right: number): number {
  const lighter = Math.max(left, right);
  const darker = Math.min(left, right);
  return (lighter + 0.05) / (darker + 0.05);
}

function foldedRgb(username: string): [number, number, number] {
  const rgb: [number, number, number] = [0, 0, 0];
  const bytes = new TextEncoder().encode(username);
  for (let index = 0; index < bytes.length; index += 1) {
    const slot = index % 3;
    rgb[slot] = (rgb[slot] + (bytes[index] ?? 0)) % 256;
  }
  return rgb;
}

function hexByte(value: number): string {
  return value.toString(16).padStart(2, '0');
}

function foregroundFor(red: number, green: number, blue: number): string {
  const backgroundLuminance = luminance(red, green, blue);
  return contrast(backgroundLuminance, paperLuminance) >=
    contrast(backgroundLuminance, inkLuminance)
    ? paper
    : ink;
}

export function avatarColour(username: string): { background: string; foreground: string } {
  const [red, green, blue] = foldedRgb(username);
  return {
    background: `#${hexByte(red)}${hexByte(green)}${hexByte(blue)}`,
    foreground: foregroundFor(red, green, blue),
  };
}
