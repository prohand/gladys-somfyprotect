// -----------------------------------------------------------------------------
// Camera snapshots, made to fit Gladys.
//
// Gladys takes camera images of at most 150 KB (`image/jpg;base64,...`). A
// full-HD snapshot of a Somfy camera is often bigger, so it is decoded,
// downscaled and re-encoded here, in pure JavaScript (jpeg-js: no native
// module to build for every architecture of the image).
// -----------------------------------------------------------------------------

import jpeg from 'jpeg-js';

/** Gladys' limit, on the decoded bytes. */
export const MAX_IMAGE_BYTES = 150 * 1024;

const MAX_WIDTH = 960;
const QUALITIES = [80, 65, 50, 35];

/**
 * Shrink an RGBA frame by an integer factor (box filter: the average of each
 * factor × factor block), cheap and good enough for a snapshot.
 */
function downscale({ width, height, data }, factor) {
  const w = Math.floor(width / factor);
  const h = Math.floor(height / factor);
  const out = Buffer.alloc(w * h * 4);
  const area = factor * factor;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sums = [0, 0, 0];
      for (let dy = 0; dy < factor; dy += 1) {
        let i = ((y * factor + dy) * width + x * factor) * 4;
        for (let dx = 0; dx < factor; dx += 1) {
          sums[0] += data[i];
          sums[1] += data[i + 1];
          sums[2] += data[i + 2];
          i += 4;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = sums[0] / area;
      out[o + 1] = sums[1] / area;
      out[o + 2] = sums[2] / area;
      out[o + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * A JPEG Buffer as Gladys takes it, shrunk when it is too big.
 * @param {Buffer} buffer JPEG bytes
 * @returns {string} `image/jpg;base64,...`
 */
export function toGladysImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Empty camera snapshot');
  }
  if (buffer.length <= MAX_IMAGE_BYTES) {
    return `image/jpg;base64,${buffer.toString('base64')}`;
  }
  let frame = jpeg.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 256 });
  const factor = Math.max(1, Math.ceil(frame.width / MAX_WIDTH));
  if (factor > 1) {
    frame = downscale(frame, factor);
  }
  for (const quality of QUALITIES) {
    const { data } = jpeg.encode(frame, quality);
    if (data.length <= MAX_IMAGE_BYTES) {
      return `image/jpg;base64,${Buffer.from(data).toString('base64')}`;
    }
  }
  // Still too big at the lowest quality: halve the size once more.
  const { data } = jpeg.encode(downscale(frame, 2), QUALITIES.at(-1));
  return `image/jpg;base64,${Buffer.from(data).toString('base64')}`;
}
