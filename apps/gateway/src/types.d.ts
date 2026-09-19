declare module '*.ttf' { const data: ArrayBuffer; export default data; }

declare module 'cloudflare:sockets' {
  interface CfSocket {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    close(): Promise<void>;
    startTls(): CfSocket;
  }
  export function connect(address: { hostname: string; port: number }, options?: { secureTransport?: 'on' | 'off' | 'starttls'; allowHalfOpen?: boolean }): CfSocket;
}
