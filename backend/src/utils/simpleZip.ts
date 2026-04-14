type ZipFile = {
  name: string;
  data: Buffer;
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buffer: Buffer) => {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    const idx = (crc ^ buffer[i]) & 0xff;
    crc = (crc >>> 8) ^ crcTable[idx];
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const dosDateTime = (date: Date) => {
  const year = date.getFullYear();
  const dosYear = Math.max(1980, Math.min(2107, year)) - 1980;
  const dosMonth = date.getMonth() + 1;
  const dosDay = date.getDate();
  const dosHours = date.getHours();
  const dosMinutes = date.getMinutes();
  const dosSeconds = Math.floor(date.getSeconds() / 2);
  const time =
    (dosHours << 11) |
    (dosMinutes << 5) |
    dosSeconds;
  const day =
    (dosYear << 9) |
    (dosMonth << 5) |
    dosDay;
  return { time, day };
};

export const createZipBuffer = (files: ZipFile[]) => {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  const now = dosDateTime(new Date());

  for (const file of files) {
    const fileName = Buffer.from(file.name, "utf8");
    const data = file.data;
    const checksum = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(now.time, 10);
    localHeader.writeUInt16LE(now.day, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(fileName.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, fileName, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(now.time, 12);
    centralHeader.writeUInt16LE(now.day, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(fileName.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);

    centralParts.push(centralHeader, fileName);
    localOffset += localHeader.length + fileName.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const locals = Buffer.concat(localParts);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(locals.length, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([locals, centralDirectory, end]);
};
