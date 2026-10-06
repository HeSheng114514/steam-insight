/**
 * 逐字节校验 CRX3：验签、比对 crx_id、解出 ZIP 并与源码逐个文件核对。
 *
 *   node build/verify_crx.mjs [文件.crx] [扩展源码目录]
 *
 * 不依赖任何外部命令（自己解析 ZIP 中央目录 + zlib 解压），避免中文路径在 shell 里被编码搞坏。
 *
 * 校验项：
 *   1. 魔数 Cr24 + 版本 3
 *   2. Protobuf 头解析（sha256_with_rsa 公钥/签名、signed_header_data）
 *   3. RSA-SHA256 验签（按 Chromium 的签名输入构造）
 *   4. crx_id == SHA256(公钥 SPKI DER) 前 16 字节
 *   5. 内嵌 ZIP 每个条目的 CRC32 正确，且与源码同名文件逐字节一致
 *   6. 输出扩展 ID
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.join(HERE, '..');

const crxPath = process.argv[2] || path.join(PROJECT, 'steam-insight.crx');
const srcDir = process.argv[3] || path.join(PROJECT, 'steam-insight');

/** Chromium 的签名输入前缀（末尾有一个 NUL） */
const SIGNATURE_CONTEXT = Buffer.concat([
  Buffer.from('CRX3 SignedData', 'latin1'),
  Buffer.from([0x00]),
]);

/* ---------------------- 极简 protobuf 读取 ---------------------- */

function readVarint(buf, pos) {
  let result = 0;
  let shift = 0;
  let byte;
  do {
    byte = buf[pos++];
    result += (byte & 0x7f) * 2 ** shift;
    shift += 7;
  } while (byte & 0x80);
  return [result, pos];
}

function parseFields(buf) {
  const fields = [];
  let pos = 0;
  while (pos < buf.length) {
    let tag;
    [tag, pos] = readVarint(buf, pos);
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (wire === 2) {
      let len;
      [len, pos] = readVarint(buf, pos);
      fields.push({ field, wire, data: buf.subarray(pos, pos + len) });
      pos += len;
    } else if (wire === 0) {
      let val;
      [val, pos] = readVarint(buf, pos);
      fields.push({ field, wire, value: val });
    } else {
      throw new Error(`不支持的 protobuf wire type ${wire}（field ${field}）`);
    }
  }
  return fields;
}

/* ---------------------- 极简 ZIP 读取（走中央目录） ---------------------- */

function readZip(zipBuf) {
  // 从尾部回找 EOCD（0x06054b50）
  let eocd = -1;
  for (let i = zipBuf.length - 22; i >= 0 && i > zipBuf.length - 66000; i--) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('找不到 ZIP 中央目录结束记录（EOCD）');

  const total = zipBuf.readUInt16LE(eocd + 10);
  let pos = zipBuf.readUInt32LE(eocd + 16);
  const entries = [];

  for (let n = 0; n < total; n++) {
    if (zipBuf.readUInt32LE(pos) !== 0x02014b50) throw new Error(`中央目录条目 ${n} 签名错误`);
    const method = zipBuf.readUInt16LE(pos + 10);
    const crc = zipBuf.readUInt32LE(pos + 16);
    const compSize = zipBuf.readUInt32LE(pos + 20);
    const uncompSize = zipBuf.readUInt32LE(pos + 24);
    const nameLen = zipBuf.readUInt16LE(pos + 28);
    const extraLen = zipBuf.readUInt16LE(pos + 30);
    const commentLen = zipBuf.readUInt16LE(pos + 32);
    const localOffset = zipBuf.readUInt32LE(pos + 42);
    const name = zipBuf.toString('utf8', pos + 46, pos + 46 + nameLen);
    pos += 46 + nameLen + extraLen + commentLen;

    // 本地头里才有实际数据偏移（中央目录的 extra 长度常与本地头不同）
    if (zipBuf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`${name} 本地头签名错误`);
    const lNameLen = zipBuf.readUInt16LE(localOffset + 26);
    const lExtraLen = zipBuf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = zipBuf.subarray(dataStart, dataStart + compSize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);

    if (data.length !== uncompSize) throw new Error(`${name} 解压后长度不符`);
    if (typeof zlib.crc32 === 'function' && zlib.crc32(data) !== crc) {
      throw new Error(`${name} CRC32 校验失败`);
    }
    entries.push({ name, size: uncompSize, data });
  }
  if (pos > zipBuf.length) throw new Error('中央目录越界');
  // Chromium 的打包器会为每个目录也写一条条目（名字以 / 结尾），它们不是文件
  return entries.filter((e) => !e.name.endsWith('/'));
}

/* ---------------------- 主流程 ---------------------- */

const problems = [];
function ok(label, cond, extra) {
  console.log(`  ${cond ? '✅' : '❌'} ${label}${extra !== undefined ? `  ${extra}` : ''}`);
  if (!cond) problems.push(label);
}

if (!fs.existsSync(crxPath)) {
  console.error(`找不到 CRX: ${crxPath}`);
  process.exit(1);
}

const buf = fs.readFileSync(crxPath);
console.log(`校验 ${path.basename(crxPath)}  (${buf.length} 字节)\n`);

ok('魔数 Cr24', buf.subarray(0, 4).toString('latin1') === 'Cr24');
const version = buf.readUInt32LE(4);
ok('CRX 版本 = 3', version === 3, `实际 ${version}`);
const headerSize = buf.readUInt32LE(8);
const header = buf.subarray(12, 12 + headerSize);
const zipBuf = buf.subarray(12 + headerSize);
ok('头部长度合理', headerSize > 0 && 12 + headerSize < buf.length, `${headerSize} 字节`);
ok('ZIP 起始签名正确', zipBuf.readUInt32LE(0) === 0x04034b50);

const headerFields = parseFields(header);
const rsaProof = headerFields.find((f) => f.field === 2);
const signedHeaderField = headerFields.find((f) => f.field === 10000);
ok('头含 sha256_with_rsa (field 2)', !!rsaProof);
ok('头含 signed_header_data (field 10000)', !!signedHeaderField);

const proofFields = parseFields(rsaProof.data);
const publicKey = proofFields.find((f) => f.field === 1).data;
const signature = proofFields.find((f) => f.field === 2).data;
const signedHeaderData = signedHeaderField.data;
ok('公钥非空', publicKey.length > 0, `${publicKey.length} 字节 SPKI DER`);
ok('签名长度 256（RSA-2048）', signature.length === 256, `${signature.length} 字节`);

const sizeField = Buffer.alloc(4);
sizeField.writeUInt32LE(signedHeaderData.length, 0);
const message = Buffer.concat([SIGNATURE_CONTEXT, sizeField, signedHeaderData, zipBuf]);
let signatureValid = false;
try {
  const keyObject = crypto.createPublicKey({ key: publicKey, format: 'der', type: 'spki' });
  signatureValid = crypto.verify('sha256', message, keyObject, signature);
} catch (err) {
  console.error(`  ❌ 验签抛错: ${err.message}`);
}
ok('RSA-SHA256 签名有效', signatureValid);

const crxId = parseFields(signedHeaderData).find((f) => f.field === 1).data;
const expectedCrxId = crypto.createHash('sha256').update(publicKey).digest().subarray(0, 16);
ok('crx_id == SHA256(公钥) 前 16 字节', Buffer.compare(crxId, expectedCrxId) === 0);
const extensionId = [...crxId]
  .flatMap((b) => [97 + (b >> 4), 97 + (b & 0x0f)])
  .map((c) => String.fromCharCode(c))
  .join('');
console.log(`\n  扩展 ID: ${extensionId}\n`);

let entries = [];
try {
  entries = readZip(zipBuf);
  ok('内嵌 ZIP 可解析且条目 CRC32 正确', entries.length > 0, `${entries.length} 个条目`);
} catch (err) {
  console.error(`  ❌ ZIP 解析失败: ${err.message}`);
  problems.push('ZIP 解析失败');
}

if (entries.length) {
  const walk = (dir, base = '') =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const rel = base ? `${base}/${e.name}` : e.name;
      return e.isDirectory() ? walk(path.join(dir, e.name), rel) : [rel];
    });

  const names = entries.map((e) => e.name).sort();
  const srcFiles = walk(srcDir)
    .filter((f) => !f.toLowerCase().endsWith('.md'))
    .sort();

  ok('文件数与源码一致', names.length === srcFiles.length, `ZIP ${names.length} / 源码 ${srcFiles.length}`);
  const missing = srcFiles.filter((f) => !names.includes(f));
  ok('无缺失文件', missing.length === 0, missing.join(', ') || '—');
  const extra = names.filter((f) => !srcFiles.includes(f));
  ok('无多余文件', extra.length === 0, extra.join(', ') || '—');

  let mismatch = 0;
  for (const rel of srcFiles) {
    const e = entries.find((x) => x.name === rel);
    if (!e) continue;
    const a = crypto.createHash('sha256').update(fs.readFileSync(path.join(srcDir, rel))).digest('hex');
    const b = crypto.createHash('sha256').update(e.data).digest('hex');
    if (a !== b) {
      mismatch++;
      console.log(`      ✗ 内容不一致: ${rel}`);
    }
  }
  ok('每个文件与源码逐字节一致', mismatch === 0, `${srcFiles.length} 个文件`);

  try {
    const manifest = JSON.parse(entries.find((e) => e.name === 'manifest.json').data.toString('utf8'));
    ok('manifest 在根目录且可解析', true, `${manifest.name} v${manifest.version}`);
    ok('Manifest V3', manifest.manifest_version === 3);
  } catch (err) {
    ok('manifest 可解析', false, err.message);
  }
}

console.log(`\n${'='.repeat(52)}`);
if (problems.length) {
  console.log(`校验未通过，${problems.length} 项问题：`);
  problems.forEach((p) => console.log(`  · ${p}`));
  process.exit(1);
}
console.log('全部通过：签名有效、crx_id 与公钥一致、ZIP 完整且与源码逐字节相同');
