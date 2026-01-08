/**
 * Type declarations for zstd-codec
 */
declare module 'zstd-codec' {
  interface ZstdStreaming {
    decompress(data: Buffer | Uint8Array): Uint8Array | null;
  }

  interface ZstdCodecModule {
    Streaming: new () => ZstdStreaming;
  }

  export const ZstdCodec: {
    run(): Promise<ZstdCodecModule>;
  };
}


