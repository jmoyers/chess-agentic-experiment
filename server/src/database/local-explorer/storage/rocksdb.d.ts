/**
 * Type declarations for rocksdb package
 */

declare module 'rocksdb' {
  interface RocksDBOptions {
    createIfMissing?: boolean;
    errorIfExists?: boolean;
    writeBufferSize?: number;
    maxWriteBufferNumber?: number;
    compression?: boolean;
    readOnly?: boolean;
  }

  interface IteratorOptions {
    gt?: Buffer;
    gte?: Buffer;
    lt?: Buffer;
    lte?: Buffer;
    reverse?: boolean;
    limit?: number;
    keys?: boolean;
    values?: boolean;
  }

  interface Iterator {
    next(callback: (err: Error | null, key?: Buffer, value?: Buffer) => void): void;
    end(callback: (err?: Error) => void): void;
  }

  interface Batch {
    put(key: Buffer, value: Buffer): Batch;
    del(key: Buffer): Batch;
    write(callback: (err: Error | null) => void): void;
  }

  class RocksDB {
    constructor(path: string);
    
    open(options: RocksDBOptions, callback: (err: Error | null) => void): void;
    open(callback: (err: Error | null) => void): void;
    
    close(callback: (err: Error | null) => void): void;
    
    get(key: Buffer, callback: (err: Error | null, value?: Buffer) => void): void;
    get(key: Buffer, options: object, callback: (err: Error | null, value?: Buffer) => void): void;
    
    put(key: Buffer, value: Buffer, callback: (err: Error | null) => void): void;
    put(key: Buffer, value: Buffer, options: object, callback: (err: Error | null) => void): void;
    
    del(key: Buffer, callback: (err: Error | null) => void): void;
    
    batch(): Batch;
    
    iterator(options?: IteratorOptions): Iterator;
  }

  export = RocksDB;
}

