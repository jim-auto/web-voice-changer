import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function concat(...chunks) {
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

function varint(value) {
  let number = BigInt(value);
  const bytes = [];

  while (number > 0x7fn) {
    bytes.push(Number((number & 0x7fn) | 0x80n));
    number >>= 7n;
  }

  bytes.push(Number(number));
  return Buffer.from(bytes);
}

function key(fieldNumber, wireType) {
  return varint((fieldNumber << 3) | wireType);
}

function intField(fieldNumber, value) {
  return concat(key(fieldNumber, 0), varint(value));
}

function stringField(fieldNumber, value) {
  const data = Buffer.from(value, 'utf8');
  return concat(key(fieldNumber, 2), varint(data.length), data);
}

function messageField(fieldNumber, value) {
  return concat(key(fieldNumber, 2), varint(value.length), value);
}

function dimension(param) {
  return stringField(2, param);
}

function tensorShape(...dims) {
  return concat(...dims.map((dim) => messageField(1, dimension(dim))));
}

function tensorType() {
  return concat(
    intField(1, 1),
    messageField(2, tensorShape('samples')),
  );
}

function typeProto() {
  return messageField(1, tensorType());
}

function valueInfo(name) {
  return concat(
    stringField(1, name),
    messageField(2, typeProto()),
  );
}

function identityNode() {
  return concat(
    stringField(1, 'input'),
    stringField(2, 'output'),
    stringField(3, 'identity'),
    stringField(4, 'Identity'),
  );
}

function graphProto() {
  return concat(
    messageField(1, identityNode()),
    stringField(2, 'IdentityGraph'),
    messageField(11, valueInfo('input')),
    messageField(12, valueInfo('output')),
  );
}

function opsetImport() {
  return intField(2, 13);
}

function modelProto() {
  return concat(
    intField(1, 8),
    stringField(2, 'web-voice-changer'),
    messageField(7, graphProto()),
    messageField(8, opsetImport()),
  );
}

const outputDir = path.resolve('models');
mkdirSync(outputDir, { recursive: true });
writeFileSync(path.join(outputDir, 'model.onnx'), modelProto());
