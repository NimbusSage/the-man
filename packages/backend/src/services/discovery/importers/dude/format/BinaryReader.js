// packages/backend/src/services/discovery/importers/dude/format/BinaryReader.js

/**
 * Little-endian cursor over a Buffer. The Dude's object format has no
 * length prefix for the whole record, so every read just advances the
 * offset and lets Buffer's own bounds-checking throw on truncated data.
 */
export class BinaryReader {
  constructor(buffer, offset = 0) {
    this.buffer = buffer;
    this.offset = offset;
  }

  get remaining() {
    return this.buffer.length - this.offset;
  }

  canRead(byteCount) {
    return this.offset + byteCount <= this.buffer.length;
  }

  readUInt8() {
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readUInt16LE() {
    const value = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  readInt32LE() {
    const value = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readUInt32LE() {
    const value = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readBigUInt64LE() {
    const value = this.buffer.readBigUInt64LE(this.offset);
    this.offset += 8;
    return value;
  }

  readBytes(byteCount) {
    const value = Buffer.from(this.buffer.subarray(this.offset, this.offset + byteCount));
    this.offset += byteCount;
    return value;
  }

  readString(byteCount) {
    const value = this.buffer.toString('utf8', this.offset, this.offset + byteCount);
    this.offset += byteCount;
    return value;
  }
}

export default BinaryReader;
