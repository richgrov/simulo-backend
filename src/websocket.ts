export class RetryWebsocket {
  private websocket: WebSocket | undefined;
  private connecting = false;

  constructor(
    private url: string,
    private ready: () => void,
    private onMessage: (event: MessageEvent) => void,
  ) {
    this.connect();
  }

  connect() {
    if (this.connecting) {
      return;
    }

    console.log("WS connecting");
    this.connecting = true;
    this.websocket = new WebSocket(this.url);
    this.websocket.onmessage = this.onMessage;
    this.websocket.onopen = () => {
      console.log("WS connected");
      this.connecting = false;
      this.ready();
    };
    this.websocket.onclose = () => {
      console.log("WS closed");
      this.connecting = false;
      this.connect();
    };
  }

  send(message: string | Buffer) {
    if (!this.websocket) {
      return;
    }

    this.websocket.send(message);
  }
}
