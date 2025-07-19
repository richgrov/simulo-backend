type Field =
  | {
      type: "u8";
      value: number;
    }
  | {
      type: "string";
      value: string;
    }
  | {
      type: "dynbytes";
      value: Uint8Array;
    }
  | {
      type: "bytes";
      value: Uint8Array;
    };

export class Packet {
  private fields = new Array<Field>();
  private length = 0;

  constructor() {}

  u8(value: number) {
    this.fields.push({
      type: "u8",
      value,
    });
    this.length += 1;
  }

  string(value: string) {
    this.fields.push({
      type: "string",
      value,
    });
    this.length += 2 + value.length;
  }

  dynbytes(value: Uint8Array) {
    this.fields.push({
      type: "dynbytes",
      value,
    });
    this.length += 4 + value.length;
  }

  bytes(value: Uint8Array) {
    this.fields.push({
      type: "bytes",
      value,
    });
    this.length += value.length;
  }

  toBuffer() {
    const buffer = new ArrayBuffer(this.length);
    const view = new DataView(buffer);

    let offset = 0;
    for (const field of this.fields) {
      switch (field.type) {
        case "u8":
          view.setUint8(offset, field.value);
          offset += 1;
          break;

        case "string":
          view.setUint16(offset, field.value.length);
          offset += 2;
          for (let i = 0; i < field.value.length; i++) {
            view.setUint8(offset + i, field.value.charCodeAt(i));
          }
          offset += field.value.length;
          break;

        case "dynbytes":
          view.setUint32(offset, field.value.length);
          offset += 4;
          for (let i = 0; i < field.value.length; i++) {
            view.setUint8(offset + i, field.value[i]!);
          }
          offset += field.value.length;
          break;

        case "bytes":
          for (let i = 0; i < field.value.length; i++) {
            view.setUint8(offset + i, field.value[i]!);
          }
          offset += field.value.length;
          break;
      }
    }

    return buffer;
  }
}

export class PacketReader {
  private offset = 0;
  private view: DataView;

  constructor(private buffer: ArrayBuffer) {
    this.view = new DataView(this.buffer);
  }

  u8(): number | undefined {
    if (this.offset >= this.view.byteLength) {
      return undefined;
    }

    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  string(): string | undefined {
    const length = this.view.getUint16(this.offset);
    this.offset += 2;
    if (this.offset + length > this.view.byteLength) {
      return undefined;
    }

    const value = this.view.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return new TextDecoder().decode(value);
  }

  dynbytes(): Uint8Array | undefined {
    if (this.offset >= this.view.byteLength) {
      return undefined;
    }

    const length = this.view.getUint32(this.offset);
    this.offset += 4;
    if (this.offset + length > this.view.byteLength) {
      return undefined;
    }

    const value = this.view.buffer.slice(this.offset, this.offset + length);
    this.offset += length;
    return new Uint8Array(value);
  }
}
