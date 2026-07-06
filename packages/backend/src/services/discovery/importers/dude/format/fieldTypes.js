// packages/backend/src/services/discovery/importers/dude/format/fieldTypes.js
//
// Wire-format type tags used in The Dude's "M2" object serialization.
// Every field in an object blob is a 4-byte FieldInfo (24-bit field id +
// 8-bit type tag, little-endian) followed by a type-specific payload.

export const FieldType = Object.freeze({
  BOOL_FALSE: 0x00,
  BOOL_TRUE: 0x01,
  INT: 0x08,
  BYTE: 0x09,
  LONG: 0x10,
  LONG_LONG: 0x18,
  LONG_STRING: 0x20,
  SHORT_STRING: 0x21,
  LONG_ARRAY: 0x31,
  INT_ARRAY: 0x88,
  STRING_ARRAY: 0xa0,
});

/**
 * Decode one field's payload from the reader's current position.
 * Throws on an unrecognized type tag or truncated buffer - callers should
 * treat that as "stop parsing this object", not a fatal error for the
 * whole import (Mikrotik's own writer is inconsistent across versions).
 */
export function decodeFieldValue(reader, type) {
  switch (type) {
    case FieldType.BOOL_FALSE:
      return false;
    case FieldType.BOOL_TRUE:
      return true;
    case FieldType.BYTE:
      return reader.readUInt8();
    case FieldType.INT:
      return reader.readInt32LE();
    case FieldType.LONG:
      return reader.readBigUInt64LE();
    case FieldType.LONG_LONG: {
      const low = reader.readBigUInt64LE();
      const high = reader.readBigUInt64LE();
      return ((high << 64n) | low).toString(16);
    }
    case FieldType.SHORT_STRING: {
      const length = reader.readUInt8();
      return reader.readString(length);
    }
    case FieldType.LONG_STRING: {
      const length = reader.readUInt16LE();
      return reader.readString(length);
    }
    case FieldType.INT_ARRAY: {
      const count = reader.readUInt16LE();
      const values = new Array(count);
      for (let i = 0; i < count; i++) {
        values[i] = reader.readInt32LE();
      }
      return values;
    }
    case FieldType.LONG_ARRAY: {
      const size = reader.readUInt8();
      return reader.readBytes(size);
    }
    case FieldType.STRING_ARRAY: {
      const count = reader.readUInt16LE();
      const values = new Array(count);
      for (let i = 0; i < count; i++) {
        const length = reader.readUInt16LE();
        values[i] = reader.readString(length);
      }
      return values;
    }
    default:
      throw new Error(`unknown Dude field type tag 0x${type.toString(16)}`);
  }
}

export default FieldType;
