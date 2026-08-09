import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const sizes = [192, 512];
const bgColor = { r: 10, g: 10, b: 10, alpha: 1 };
const borderColor = { r: 255, g: 102, b: 0, alpha: 1 };
const textColor = { r: 255, g: 255, b: 255, alpha: 1 };

for (const size of sizes) {
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="rgb(${bgColor.r},${bgColor.g},${bgColor.b})"/>
      <rect x="4" y="4" width="${size - 8}" height="${size - 8}" fill="none" stroke="rgb(${borderColor.r},${borderColor.g},${borderColor.b})" stroke-width="6" rx="24"/>
      <text x="50%" y="54%" font-size="${size * 0.38}" font-weight="bold" font-family="monospace" fill="rgb(${textColor.r},${textColor.g},${textColor.b})" text-anchor="middle" dominant-baseline="central">HF</text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(publicDir, `icon-${size}.png`));

  console.log(`Generated icon-${size}.png`);
}

console.log('All icons generated successfully');
