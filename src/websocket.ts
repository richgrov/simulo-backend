export class RetryWebsocket {
  private websocket: WebSocket | undefined;
  private connecting = false;
  private hadError = false;
  private connectDelay = 100;

  constructor(
    private url: string,
    private ready: () => void,
    private onMessage: (event: MessageEvent) => void,
  ) {
    this.connect();
  }

  async connect() {
    if (this.connecting) {
      return;
    }

    if (this.hadError) {
      this.connectDelay = Math.min(this.connectDelay * 2, 10 * 1000);
    }

    await new Promise((resolve) => setTimeout(resolve, this.connectDelay));

    console.log("WS connecting");
    this.connecting = true;
    this.hadError = false;
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
    this.websocket.onerror = () => {
      this.hadError = true;
    };
  }

  send(message: string | Buffer) {
    if (!this.websocket) {
      return;
    }

    this.websocket.send(message);
  }
}
