import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { compressFile, compressFiles } from '../compress-images.mjs';

let tmp;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'compress-images-'));
});

afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

async function writeNoisyJpeg(filepath, { width, height, quality = 100 } = {}) {
  const buf = Buffer.alloc(width * height * 3);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  await sharp(buf, { raw: { width, height, channels: 3 } })
    .jpeg({ quality, mozjpeg: false })
    .toFile(filepath);
}

async function writeNoisyPng(filepath, { width, height, alpha = false } = {}) {
  const channels = alpha ? 4 : 3;
  const buf = Buffer.alloc(width * height * channels);
  for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  await sharp(buf, { raw: { width, height, channels } }).png().toFile(filepath);
}

describe('compressFile', () => {
  it('compresses a JPEG that exceeds the size threshold and writes the smaller result in place', async () => {
    const file = path.join(tmp, 'big.jpg');
    await writeNoisyJpeg(file, { width: 1200, height: 1200 });
    const before = (await fs.stat(file)).size;

    const result = await compressFile(file, { sizeThreshold: 10 * 1024, maxDimension: 800 });

    assert.equal(result.status, 'compressed');
    assert.equal(result.beforeSize, before);
    assert.ok(result.afterSize < before);

    const afterOnDisk = (await fs.stat(file)).size;
    assert.equal(afterOnDisk, result.afterSize);
  });

  it('resizes images larger than maxDimension and preserves aspect ratio without upscaling', async () => {
    const file = path.join(tmp, 'wide.jpg');
    await writeNoisyJpeg(file, { width: 2000, height: 1000 });

    await compressFile(file, { sizeThreshold: 1, maxDimension: 800 });

    const meta = await sharp(file).metadata();
    assert.equal(meta.width, 800);
    assert.equal(meta.height, 400);
  });

  it('does not upscale images smaller than maxDimension', async () => {
    const file = path.join(tmp, 'small.jpg');
    await writeNoisyJpeg(file, { width: 400, height: 300 });

    await compressFile(file, { sizeThreshold: 1, maxDimension: 2000 });

    const meta = await sharp(file).metadata();
    assert.equal(meta.width, 400);
    assert.equal(meta.height, 300);
  });

  it('skips files under the size threshold without modifying them', async () => {
    const file = path.join(tmp, 'tiny.jpg');
    await writeNoisyJpeg(file, { width: 50, height: 50, quality: 40 });
    const before = await fs.readFile(file);

    const result = await compressFile(file, { sizeThreshold: 10 * 1024 * 1024 });

    assert.equal(result.status, 'under-threshold');
    const after = await fs.readFile(file);
    assert.ok(after.equals(before));
  });

  it('returns unsupported for non-image extensions', async () => {
    const file = path.join(tmp, 'notes.txt');
    await fs.writeFile(file, 'hello');

    const result = await compressFile(file);

    assert.equal(result.status, 'unsupported');
  });

  it('returns unsupported for gif and webp extensions', async () => {
    const gif = path.join(tmp, 'anim.gif');
    const webp = path.join(tmp, 'pic.webp');
    await fs.writeFile(gif, 'x');
    await fs.writeFile(webp, 'x');

    assert.equal((await compressFile(gif)).status, 'unsupported');
    assert.equal((await compressFile(webp)).status, 'unsupported');
  });

  it('returns missing for non-existent files without throwing', async () => {
    const result = await compressFile(path.join(tmp, 'nope.jpg'));
    assert.equal(result.status, 'missing');
  });

  it('returns missing for directories that happen to end in an image extension', async () => {
    const dirPath = path.join(tmp, 'folder.jpg');
    await fs.mkdir(dirPath);
    const result = await compressFile(dirPath);
    assert.equal(result.status, 'missing');
  });

  it('compresses PNG files without alpha using lossless mode (no palette quantization)', async () => {
    const file = path.join(tmp, 'big.png');
    await writeNoisyPng(file, { width: 800, height: 800 });
    const before = (await fs.stat(file)).size;

    const result = await compressFile(file, { sizeThreshold: 1, maxDimension: 400 });

    assert.equal(result.status, 'compressed');
    assert.ok(result.afterSize < before);

    const head = await fs.readFile(file);
    assert.notEqual(head[25], 3);
  });

  it('compresses PNG files with alpha using palette mode (256-color quantization)', async () => {
    const file = path.join(tmp, 'big-alpha.png');
    await writeNoisyPng(file, { width: 800, height: 800, alpha: true });
    const before = (await fs.stat(file)).size;

    const result = await compressFile(file, { sizeThreshold: 1, maxDimension: 400 });

    assert.equal(result.status, 'compressed');
    assert.ok(result.afterSize < before);

    const head = await fs.readFile(file);
    assert.equal(head[25], 3);
  });

  it('is idempotent enough that re-running never grows the file on disk', async () => {
    const file = path.join(tmp, 'img.jpg');
    await writeNoisyJpeg(file, { width: 1200, height: 1200 });

    await compressFile(file, { sizeThreshold: 1, maxDimension: 800, jpegQuality: 80 });
    const afterFirst = (await fs.stat(file)).size;

    await compressFile(file, { sizeThreshold: 1, maxDimension: 800, jpegQuality: 80 });
    const afterSecond = (await fs.stat(file)).size;

    assert.ok(afterSecond <= afterFirst);
  });

  it('never replaces the file when the re-encoded buffer would not be smaller', async () => {
    const file = path.join(tmp, 'pre-encoded.jpg');
    const raw = Buffer.alloc(200 * 200 * 3);
    for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(Math.random() * 256);
    await sharp(raw, { raw: { width: 200, height: 200, channels: 3 } })
      .jpeg({ quality: 20, mozjpeg: true })
      .toFile(file);

    const before = await fs.readFile(file);

    const result = await compressFile(file, {
      sizeThreshold: 1,
      maxDimension: 400,
      jpegQuality: 95,
    });

    const after = await fs.readFile(file);
    if (result.status === 'no-gain') {
      assert.ok(after.equals(before));
    } else {
      assert.equal(result.status, 'compressed');
      assert.ok(after.length < before.length);
    }
  });

  it('produces a smaller file at a lower jpegQuality than at a higher one', async () => {
    const hi = path.join(tmp, 'hi.jpg');
    const lo = path.join(tmp, 'lo.jpg');
    await writeNoisyJpeg(hi, { width: 1200, height: 1200 });
    await fs.copyFile(hi, lo);

    await compressFile(hi, { sizeThreshold: 1, maxDimension: 800, jpegQuality: 95 });
    await compressFile(lo, { sizeThreshold: 1, maxDimension: 800, jpegQuality: 60 });

    const hiSize = (await fs.stat(hi)).size;
    const loSize = (await fs.stat(lo)).size;
    assert.ok(loSize < hiSize);
  });

  it('handles .jpeg extension the same as .jpg', async () => {
    const file = path.join(tmp, 'photo.jpeg');
    await writeNoisyJpeg(file, { width: 1000, height: 1000 });

    const result = await compressFile(file, { sizeThreshold: 1, maxDimension: 500 });

    assert.equal(result.status, 'compressed');
    const meta = await sharp(file).metadata();
    assert.equal(meta.width, 500);
  });
});

describe('compressFiles', () => {
  it('processes multiple files and returns one result per input', async () => {
    const a = path.join(tmp, 'a.jpg');
    const b = path.join(tmp, 'b.txt');
    const c = path.join(tmp, 'missing.jpg');
    await writeNoisyJpeg(a, { width: 800, height: 800 });
    await fs.writeFile(b, 'plain');

    const results = await compressFiles([a, b, c], { sizeThreshold: 1, maxDimension: 400 });

    assert.equal(results.length, 3);
    assert.equal(results[0].status, 'compressed');
    assert.equal(results[1].status, 'unsupported');
    assert.equal(results[2].status, 'missing');
  });
});
