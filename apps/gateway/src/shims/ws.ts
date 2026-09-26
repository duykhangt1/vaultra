export class WebSocketServer {
  constructor(_opts?: any) {}
  on(_ev: string, _cb: any) {}
  handleUpgrade(_req: any, _socket: any, _head: any, _cb: any) {}
}

export class WebSocket {
  static OPEN = 1;
  readyState = 1;
  send(_data: any) {}
  ping() {}
  on(_ev: string, _cb: any) {}
}

