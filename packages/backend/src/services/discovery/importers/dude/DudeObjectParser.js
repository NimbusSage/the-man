// packages/backend/src/services/discovery/importers/dude/DudeObjectParser.js

import { BinaryReader } from './format/BinaryReader.js';
import { FieldType, decodeFieldValue } from './format/fieldTypes.js';
import { dataFormatName } from './format/objectTypes.js';
import { FIELD_ID_NAMES } from './format/fieldIds.js';

const MAGIC_BYTE_0 = 0x4d; // 'M'
const MAGIC_BYTE_1 = 0x32; // '2'

export class DudeParseError extends Error {}

function readFieldInfo(reader) {
  const raw = reader.readUInt32LE();
  return { id: raw & 0xffffff, type: raw >>> 24 };
}

function formatMacAddress(buffer) {
  const macs = [];
  for (let offset = 0; offset + 6 <= buffer.length; offset += 6) {
    macs.push(
      Array.from(buffer.subarray(offset, offset + 6))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(':')
    );
  }
  return macs;
}

/**
 * Parse one row of the Dude `objs` table (the raw blob column) into
 * `{ typeId, typeName, fields, warnings }`. Degrades gracefully: an
 * unrecognized field type tag stops decoding *that object* (with a
 * warning) instead of throwing, since Mikrotik's own writer is
 * inconsistent across Dude versions.
 */
export function parseDudeObject(buffer) {
  if (buffer.length < 2 || buffer[0] !== MAGIC_BYTE_0 || buffer[1] !== MAGIC_BYTE_1) {
    throw new DudeParseError('missing "M2" magic header');
  }

  const reader = new BinaryReader(buffer, 2);

  if (!reader.canRead(4)) {
    throw new DudeParseError('truncated before data-format field');
  }
  const formatInfo = readFieldInfo(reader);
  if (formatInfo.type !== FieldType.INT_ARRAY) {
    throw new DudeParseError(
      `expected IntArray data-format field, got type 0x${formatInfo.type.toString(16)}`
    );
  }
  const formatArray = decodeFieldValue(reader, FieldType.INT_ARRAY);
  const typeId = formatArray[0] ?? 0;
  const typeName = dataFormatName(typeId);

  const fields = {};
  const warnings = [];

  while (reader.canRead(4)) {
    const info = readFieldInfo(reader);
    let value;
    try {
      value = decodeFieldValue(reader, info.type);
    } catch (err) {
      warnings.push(`stopped parsing at offset ${reader.offset}: ${err.message}`);
      break;
    }

    const fieldName = FIELD_ID_NAMES[info.id] ?? `field_0x${info.id.toString(16)}`;
    if (fieldName === 'Device_MacAddress' && Buffer.isBuffer(value)) {
      value = formatMacAddress(value);
    }
    fields[fieldName] = value;
  }

  return { typeId, typeName, fields, warnings };
}

export default parseDudeObject;
