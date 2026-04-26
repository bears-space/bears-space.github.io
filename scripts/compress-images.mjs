#!/usr/bin/env node
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_SIZE_THRESHOLD = 2 * 1024 * 1024;
export const DEFAULT_MAX_DIMENSION = 3840;
export const DEFAULT_JPEG_QUALITY = 80;

const SUPPORTED = new Set([".jpg", ".jpeg", ".png"]);

function resolveOpts(opts = {}) {
  return {
    sizeThreshold:
      opts.sizeThreshold ??
      Number(process.env.IMAGE_SIZE_THRESHOLD ?? DEFAULT_SIZE_THRESHOLD),
    maxDimension:
      opts.maxDimension ??
      Number(process.env.IMAGE_MAX_DIMENSION ?? DEFAULT_MAX_DIMENSION),
    jpegQuality:
      opts.jpegQuality ??
      Number(process.env.IMAGE_JPEG_QUALITY ?? DEFAULT_JPEG_QUALITY),
  };
}

export async function compressFile(filepath, opts = {}) {
  const { sizeThreshold, maxDimension, jpegQuality } = resolveOpts(opts);
  const ext = path.extname(filepath).toLowerCase();

  if (!SUPPORTED.has(ext)) {
    return { status: "unsupported", filepath, beforeSize: 0, afterSize: 0 };
  }

  let stat;
  try {
    stat = await fs.stat(filepath);
  } catch {
    return { status: "missing", filepath, beforeSize: 0, afterSize: 0 };
  }
  if (!stat.isFile()) {
    return { status: "missing", filepath, beforeSize: 0, afterSize: 0 };
  }
  if (stat.size < sizeThreshold) {
    return {
      status: "under-threshold",
      filepath,
      beforeSize: stat.size,
      afterSize: stat.size,
    };
  }

  const buf = await fs.readFile(filepath);
  const sourceMeta = await sharp(buf, { failOn: "none" }).metadata();
  const pipeline = sharp(buf, { failOn: "none" }).rotate().resize({
    width: maxDimension,
    height: maxDimension,
    fit: "inside",
    withoutEnlargement: true,
  });

  // Palette mode quantizes to 256 colors — fine for icons/logos/diagrams (which
  // have transparency), but produces visible banding on photos saved as PNG.
  // Use hasAlpha as the proxy: photo-PNGs almost never carry an alpha channel.
  const out =
    ext === ".png"
      ? sourceMeta.hasAlpha
        ? await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer()
        : await pipeline
            .png({ compressionLevel: 9, palette: false, adaptiveFiltering: true })
            .toBuffer()
      : await pipeline.jpeg({ quality: jpegQuality, mozjpeg: true }).toBuffer();

  if (out.length >= stat.size) {
    return {
      status: "no-gain",
      filepath,
      beforeSize: stat.size,
      afterSize: out.length,
    };
  }

  await fs.writeFile(filepath, out);
  return {
    status: "compressed",
    filepath,
    beforeSize: stat.size,
    afterSize: out.length,
  };
}

export async function compressFiles(filepaths, opts = {}) {
  const results = [];
  for (const fp of filepaths) {
    results.push(await compressFile(fp, opts));
  }
  return results;
}

function fmt(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + "MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + "KB";
  return bytes + "B";
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const files = process.argv.slice(2).filter(Boolean);
  if (files.length === 0) {
    console.log("compress-images: no files provided, nothing to do");
    process.exit(0);
  }
  const results = await compressFiles(files);
  let changed = 0;
  for (const r of results) {
    if (r.status === "compressed") {
      console.log(
        `  ${r.filepath}: ${fmt(r.beforeSize)} → ${fmt(r.afterSize)}`,
      );
      changed++;
    } else if (r.status === "no-gain") {
      console.log(
        `  skip ${r.filepath} (${fmt(r.beforeSize)} → ${fmt(r.afterSize)}, no gain)`,
      );
    }
  }
  if (changed > 0) console.log(`compress-images: rewrote ${changed} file(s)`);
}
