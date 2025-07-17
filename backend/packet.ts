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
