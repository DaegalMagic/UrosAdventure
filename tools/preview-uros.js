// 우로스 스프라이트 미리보기 PNG 생성기. assets/player/*.png(가로 스트립)을 읽어
// 8배 확대 격자로 합쳐 한 장의 PNG로 저장한다(사람이 눈으로 보기용).
//   실행: node tools/preview-uros.js  → uros-preview.png
const zlib = require("zlib");
const fs = require("fs");

// ---- 최소 PNG 디코더(우리 생성기가 만든 형식: RGBA8, 단일 IDAT, filter 0~4) ----
function readPng(path) {
  const b = fs.readFileSync(path);
  let p = 8; // 시그니처 건너뜀
  let w, h, idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p);
    const type = b.toString("ascii", p + 4, p + 8);
    const data = b.slice(p + 8, p + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const out = Buffer.alloc(w * h * 4);
  const paeth = (a, bb, c) => {
    const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? bb : c;
  };
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const row = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const rawv = raw[row + x];
      const a = x >= 4 ? out[y * stride + x - 4] : 0;
      const bup = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? out[(y - 1) * stride + x - 4] : 0;
      let v;
      if (ft === 0) v = rawv;
      else if (ft === 1) v = rawv + a;
      else if (ft === 2) v = rawv + bup;
      else if (ft === 3) v = rawv + ((a + bup) >> 1);
      else v = rawv + paeth(a, bup, c);
      out[y * stride + x] = v & 255;
    }
  }
  return { w, h, data: out };
}

// ---- PNG 인코더(생성기와 동일) ----
function crc32(buf) { let c = ~0; for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const t = Buffer.from(type); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); }
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---- 합성 ----
const states = ["idle", "walk", "jump", "attack", "dash", "dead"];
const FS = 64, SC = 6, PAD = 8, LABEL = 0;
const BG = [38, 40, 52, 255], CELL = [58, 60, 74, 255];

// 캔버스 크기: 가장 프레임 많은 스트립 기준
const sheets = states.map(s => ({ s, img: readPng(`assets/player/${s}.png`) }));
const maxFrames = Math.max(...sheets.map(o => o.img.w / FS));
const cw = PAD + maxFrames * (FS * SC + PAD);
const ch = PAD + states.length * (FS * SC + PAD);
const out = Buffer.alloc(cw * ch * 4);
// 배경
for (let i = 0; i < cw * ch; i++) { out[i * 4] = BG[0]; out[i * 4 + 1] = BG[1]; out[i * 4 + 2] = BG[2]; out[i * 4 + 3] = 255; }

function blit(src, sx, sy, sw, sh, dx, dy, scale) {
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const si = ((sy + y) * src.w + (sx + x)) * 4;
    const a = src.data[si + 3];
    if (a === 0) continue;
    for (let yy = 0; yy < scale; yy++) for (let xx = 0; xx < scale; xx++) {
      const ox = dx + x * scale + xx, oy = dy + y * scale + yy;
      if (ox < 0 || oy < 0 || ox >= cw || oy >= ch) continue;
      const di = (oy * cw + ox) * 4;
      const af = a / 255, ia = 1 - af;
      out[di] = src.data[si] * af + out[di] * ia;
      out[di + 1] = src.data[si + 1] * af + out[di + 1] * ia;
      out[di + 2] = src.data[si + 2] * af + out[di + 2] * ia;
      out[di + 3] = 255;
    }
  }
}
function fillRect(x, y, w, h, c) {
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const ox = x + xx, oy = y + yy; if (ox < 0 || oy < 0 || ox >= cw || oy >= ch) continue;
    const di = (oy * cw + ox) * 4; out[di] = c[0]; out[di + 1] = c[1]; out[di + 2] = c[2]; out[di + 3] = 255;
  }
}

sheets.forEach((o, row) => {
  const frames = o.img.w / FS;
  const dy = PAD + row * (FS * SC + PAD);
  for (let f = 0; f < frames; f++) {
    const dx = PAD + f * (FS * SC + PAD);
    fillRect(dx, dy, FS * SC, FS * SC, CELL); // 셀 배경
    blit(o.img, f * FS, 0, FS, FS, dx, dy, SC);
  }
});

fs.writeFileSync("uros-preview.png", encodePng(cw, ch, out));
console.log("wrote uros-preview.png", cw + "x" + ch);
