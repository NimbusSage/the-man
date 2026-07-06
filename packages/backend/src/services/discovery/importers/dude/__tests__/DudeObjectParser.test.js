// packages/backend/src/services/discovery/importers/dude/__tests__/DudeObjectParser.test.js

import { describe, expect, it } from 'vitest';
import { parseDudeObject, DudeParseError } from '../DudeObjectParser.js';
import { FieldType } from '../format/fieldTypes.js';

const DATA_FORMAT_FIELD_ID = 0xff0001;

function fieldInfo(id, type) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE((((type & 0xff) << 24) | (id & 0xffffff)) >>> 0, 0);
  return buf;
}

function intArrayField(id, values) {
  const header = fieldInfo(id, FieldType.INT_ARRAY);
  const count = Buffer.alloc(2);
  count.writeUInt16LE(values.length, 0);
  const data = Buffer.alloc(values.length * 4);
  values.forEach((v, i) => data.writeInt32LE(v, i * 4));
  return Buffer.concat([header, count, data]);
}

function dudeObject(typeId, fieldBuffers) {
  return Buffer.concat([
    Buffer.from([0x4d, 0x32]), // magic "M2"
    intArrayField(DATA_FORMAT_FIELD_ID, [typeId]),
    ...fieldBuffers,
  ]);
}

describe('parseDudeObject', () => {
  it('rejects a buffer missing the M2 magic header', () => {
    expect(() => parseDudeObject(Buffer.from([0x00, 0x00, 0x00]))).toThrow(DudeParseError);
  });

  it('decodes the data-format sentinel field as the object type', () => {
    const buf = dudeObject(0x0f, []); // 0x0f = Device
    const result = parseDudeObject(buf);
    expect(result.typeId).toBe(0x0f);
    expect(result.typeName).toBe('Device');
    expect(result.warnings).toEqual([]);
  });

  it('decodes bool fields', () => {
    const trueField = fieldInfo(0x101f49, FieldType.BOOL_TRUE); // Device_SecureMode
    const falseField = fieldInfo(0x101f4a, FieldType.BOOL_FALSE); // Device_RouterOs
    const buf = dudeObject(0x0f, [trueField, falseField]);
    const result = parseDudeObject(buf);
    expect(result.fields.Device_SecureMode).toBe(true);
    expect(result.fields.Device_RouterOs).toBe(false);
  });

  it('decodes byte and int fields', () => {
    const byteField = Buffer.concat([fieldInfo(0x101f42, FieldType.BYTE), Buffer.from([7])]); // Device_Lookup
    const intBuf = Buffer.alloc(4);
    intBuf.writeInt32LE(-42, 0);
    const intField = Buffer.concat([fieldInfo(0x101f52, FieldType.INT), intBuf]); // Device_ProbeInterval
    const buf = dudeObject(0x0f, [byteField, intField]);
    const result = parseDudeObject(buf);
    expect(result.fields.Device_Lookup).toBe(7);
    expect(result.fields.Device_ProbeInterval).toBe(-42);
  });

  it('decodes long and long-long fields', () => {
    const longBuf = Buffer.alloc(8);
    longBuf.writeBigUInt64LE(123456789012345n, 0);
    const longField = Buffer.concat([fieldInfo(0x100fa0, FieldType.LONG), longBuf]); // ServerConfig_UniqueID

    const longLongBuf = Buffer.alloc(16);
    longLongBuf.writeBigUInt64LE(1n, 0);
    longLongBuf.writeBigUInt64LE(2n, 8);
    const longLongField = Buffer.concat([fieldInfo(0x1, FieldType.LONG_LONG), longLongBuf]);

    const buf = dudeObject(0x0f, [longField, longLongField]);
    const result = parseDudeObject(buf);
    expect(result.fields.ServerConfig_UniqueID).toBe(123456789012345n);
    expect(typeof result.fields.field_0x1).toBe('string');
  });

  it('decodes short and long strings', () => {
    const shortStr = Buffer.from('brown switch', 'utf8');
    const shortStrField = Buffer.concat([
      fieldInfo(0xfe0010, FieldType.SHORT_STRING), // SysName
      Buffer.from([shortStr.length]),
      shortStr,
    ]);

    const longStr = Buffer.from('a'.repeat(300), 'utf8');
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16LE(longStr.length, 0);
    const longStrField = Buffer.concat([fieldInfo(0x105209, FieldType.LONG_STRING), lenBuf, longStr]);

    const buf = dudeObject(0x0f, [shortStrField, longStrField]);
    const result = parseDudeObject(buf);
    expect(result.fields.SysName).toBe('brown switch');
    expect(result.fields.Note_TimeAdded).toBe('a'.repeat(300));
  });

  it('decodes int arrays, long arrays (as MAC addresses), and string arrays', () => {
    const ipField = intArrayField(0x101f40, [45305866]); // Device_IpAddress

    const macBytes = Buffer.from([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]);
    const macField = Buffer.concat([
      fieldInfo(0x101f44, FieldType.LONG_ARRAY), // Device_MacAddress
      Buffer.from([macBytes.length]),
      macBytes,
    ]);

    const strings = ['a.example.com', 'b.example.com'];
    const strCount = Buffer.alloc(2);
    strCount.writeUInt16LE(strings.length, 0);
    const strEntries = strings.map((s) => {
      const strBuf = Buffer.from(s, 'utf8');
      const len = Buffer.alloc(2);
      len.writeUInt16LE(strBuf.length, 0);
      return Buffer.concat([len, strBuf]);
    });
    const dnsField = Buffer.concat([
      fieldInfo(0x101f41, FieldType.STRING_ARRAY), // Device_DnsNames
      strCount,
      ...strEntries,
    ]);

    const buf = dudeObject(0x0f, [ipField, macField, dnsField]);
    const result = parseDudeObject(buf);
    expect(result.fields.Device_IpAddress).toEqual([45305866]);
    expect(result.fields.Device_MacAddress).toEqual(['aa:bb:cc:dd:ee:ff']);
    expect(result.fields.Device_DnsNames).toEqual(strings);
  });

  it('falls back to field_0x<id> for unknown field ids without dropping data', () => {
    const unknownIntField = Buffer.concat([fieldInfo(0x999999, FieldType.INT), Buffer.from([1, 0, 0, 0])]);
    const buf = dudeObject(0x0f, [unknownIntField]);
    const result = parseDudeObject(buf);
    expect(result.fields.field_0x999999).toBe(1);
  });

  it('stops parsing (with a warning) on an unrecognized type tag instead of throwing', () => {
    const badField = fieldInfo(0x1, 0x77); // 0x77 is not a valid FieldType
    const goodField = intArrayField(0x101f40, [1]);
    const buf = dudeObject(0x0f, [badField, goodField]);
    const result = parseDudeObject(buf);
    expect(result.warnings.length).toBe(1);
    expect(result.fields.Device_IpAddress).toBeUndefined();
  });

  it('reports an unknown object type by its numeric id', () => {
    const buf = dudeObject(0x999, []);
    const result = parseDudeObject(buf);
    expect(result.typeName).toBe('Unknown_0x999');
  });
});
