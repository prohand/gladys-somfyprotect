import { test } from 'node:test';
import assert from 'node:assert/strict';
import jpeg from 'jpeg-js';
import { MAX_IMAGE_BYTES, toGladysImage } from '../src/somfy/image.js';

function noiseJpeg(width, height, quality) {
  const data = Buffer.alloc(width * height * 4);
  let seed = 42;
  for (let i = 0; i < data.length; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    data[i] = seed & 0xff;
  }
  return Buffer.from(jpeg.encode({ width, height, data }, quality).data);
}

const decodedSize = (image) => Buffer.from(image.replace('image/jpg;base64,', ''), 'base64').length;

test('a small snapshot is passed as is', () => {
  const small = noiseJpeg(64, 36, 80);
  assert.equal(toGladysImage(small), `image/jpg;base64,${small.toString('base64')}`);
});

test('a big snapshot is shrunk under the Gladys limit', () => {
  const big = noiseJpeg(1280, 720, 95);
  assert.ok(big.length > MAX_IMAGE_BYTES, 'the sample must be over the limit');
  const image = toGladysImage(big);
  assert.match(image, /^image\/jpg;base64,/);
  assert.ok(decodedSize(image) <= MAX_IMAGE_BYTES, `${decodedSize(image)} bytes`);
});

test('an empty answer is an error, not a blank image', () => {
  assert.throws(() => toGladysImage(Buffer.alloc(0)), /Empty/);
});
