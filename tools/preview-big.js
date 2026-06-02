// 우로스 idle 첫 프레임을 크게(16배) 단독 PNG로. node tools/preview-big.js
const zlib = require("zlib");
const fs = require("fs");
function readPng(path) {
  const b = fs.readFileSync(path);
  let p = 8, w, h, idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString("ascii", p + 4, p + 8), data = b.slice(p + 8, p + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * 4, out = Buffer.alloc(w * h * 4);
  const paeth = (a, bb, c) => { const pp = a + bb - c, pa = Math.abs(pp - a), pb = Math.abs(pp - bb), pc = Math.abs(pp - c); return pa <= pb && pa <= pc ? a : pb <= pc ? bb : c; };
  for (let y = 0; y < h; y++) { const ft = raw[y * (stride + 1)], row = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) { const rv = raw[row + x], a = x >= 4 ? out[y * stride + x - 4] : 0, bu = y > 0 ? out[(y - 1) * stride + x] : 0, c = x >= 4 && y > 0 ? out[(y - 1) * stride + x - 4] : 0;
      let v; if (ft === 0) v = rv; else if (ft === 1) v = rv + a; else if (ft === 2) v = rv + bu; else if (ft === 3) v = rv + ((a + bu) >> 1); else v = rv + paeth(a, bu, c); out[y * stride + x] = v & 255; } }
  return { w, h, data: out };
}
function crc32(buf){let c=~0;for(let i=0;i<buf.length;i++){c^=buf[i];for(let k=0;k<8;k++)c=(c>>>1)^(0xEDB88320&-(c&1));}return ~c>>>0;}
function chunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const tt=Buffer.from(t),cr=Buffer.alloc(4);cr.writeUInt32BE(crc32(Buffer.concat([tt,d])));return Buffer.concat([l,tt,d,cr]);}
function enc(w,h,rgba){const raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;rgba.copy(raw,y*(w*4+1)+1,y*w*4,(y+1)*w*4);}const idat=zlib.deflateSync(raw,{level:9});const sig=Buffer.from([137,80,78,71,13,10,26,10]);const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;return Buffer.concat([sig,chunk("IHDR",ih),chunk("IDAT",idat),chunk("IEND",Buffer.alloc(0))]);}

const src = readPng("assets/player/idle.png");
const FS = 64, SC = 16;
const cw = FS * SC, ch = FS * SC;
const out = Buffer.alloc(cw * ch * 4);
// 흰 배경(투명이 안 보일 수 있으니 밝은 배경)
for (let i = 0; i < cw * ch; i++) { out[i*4]=245; out[i*4+1]=245; out[i*4+2]=250; out[i*4+3]=255; }
for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) {
  const si = (y * src.w + x) * 4, a = src.data[si + 3]; if (a === 0) continue;
  for (let yy = 0; yy < SC; yy++) for (let xx = 0; xx < SC; xx++) {
    const di = ((y*SC+yy)*cw + (x*SC+xx))*4, af=a/255, ia=1-af;
    out[di]=src.data[si]*af+out[di]*ia; out[di+1]=src.data[si+1]*af+out[di+1]*ia; out[di+2]=src.data[si+2]*af+out[di+2]*ia; out[di+3]=255;
  }
}
fs.writeFileSync("uros-big.png", enc(cw, ch, out));
console.log("wrote uros-big.png", cw + "x" + ch);
