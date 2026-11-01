// Export the approved raster mark at UI/icon sizes without redrawing its shape.
// SVG files below are containers for PNG artwork, not vector master files.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicPath = `${root}public/`;
await mkdir(`${publicPath}brand`, { recursive: true });

const mark = await sharp(`${root}resources/brand/webmail-mark-master.png`)
    .trim()
    .resize(1024, 544, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
await writeFile(`${publicPath}brand/webmail-mark.png`, mark);
const markUrl = `data:image/png;base64,${mark.toString('base64')}`;

function markShape(x, y, width, height, color) {
    return `<defs><mask id="mark" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${width}" height="${height}" style="mask-type:alpha"><image href="${markUrl}" x="${x}" y="${y}" width="${width}" height="${height}"/></mask></defs><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}" mask="url(#mark)"/>`;
}

function svg(width, height, content) {
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`,
    );
}

async function appIcon(size, { maskable = false, rounded = false } = {}) {
    // A 68% x 36.125% mark fits inside the central 80%-diameter safe circle.
    const width = size * (maskable ? 0.68 : 0.8);
    const height = width * (544 / 1024);
    const x = (size - width) / 2;
    const y = (size - height) / 2;
    const background = `<rect width="${size}" height="${size}" rx="${rounded ? size * 0.22 : 0}" fill="#0b57d0"/>`;
    return sharp(
        svg(size, size, background + markShape(x, y, width, height, '#fff')),
    )
        .png({ compressionLevel: 9 })
        .toBuffer();
}

for (const size of [192, 512]) {
    await writeFile(`${publicPath}icon-${size}.png`, await appIcon(size));
}
await writeFile(
    `${publicPath}icon-maskable-512.png`,
    await appIcon(512, { maskable: true }),
);
await writeFile(`${publicPath}apple-touch-icon.png`, await appIcon(180));

const faviconSizes = [16, 32, 48];
const faviconImages = [];
for (const size of faviconSizes) {
    const icon = await appIcon(size, { rounded: true });
    faviconImages.push(icon);
    await writeFile(`${publicPath}brand/favicon-${size}.png`, icon);
}
// A PNG-backed ICO supports legacy browser discovery without another package.
const directory = Buffer.alloc(6 + faviconImages.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(faviconImages.length, 4);
let offset = directory.length;
faviconImages.forEach((icon, index) => {
    const entry = 6 + index * 16;
    directory[entry] = faviconSizes[index];
    directory[entry + 1] = faviconSizes[index];
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(icon.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += icon.length;
});
await writeFile(
    `${publicPath}favicon.ico`,
    Buffer.concat([directory, ...faviconImages]),
);
const favicon = await appIcon(128, { rounded: true });
await writeFile(
    `${publicPath}favicon.svg`,
    svg(
        128,
        128,
        `<image href="data:image/png;base64,${favicon.toString('base64')}" width="128" height="128"/>`,
    ),
);

for (const [name, accent, ink, muted] of [
    ['light', '#0b57d0', '#121a2e', '#545b66'],
    ['dark', '#a8c7fa', '#e8ecf2', '#b1bbc8'],
    ['mono', '#121a2e', '#121a2e', '#121a2e'],
    ['white', '#ffffff', '#ffffff', '#ffffff'],
]) {
    const lockup = svg(
        720,
        192,
        markShape(8, 39, 208, 110.5, accent) +
            `<text x="242" y="113" font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="700" letter-spacing="-3" fill="${ink}">WebMail</text>` +
            `<text x="435" y="157" font-family="Arial, Helvetica, sans-serif" font-size="29" fill="${muted}">by Hookstack</text>`,
    );
    await sharp(lockup)
        .png({ compressionLevel: 9 })
        .toFile(`${publicPath}brand/webmail-logo-${name}.png`);
}

const master = await readFile(`${root}resources/brand/webmail-mark-master.png`);
console.log(
    `Exported WebMail brand assets from the ${master.length}-byte raster master.`,
);
