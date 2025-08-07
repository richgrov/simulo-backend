export class RetryWebsocket {
  private websocket: WebSocket | undefined;
  private connecting = false;
  private messageSeen = false;
  private hadError = false;
  private connectDelay = 250;

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

    if (this.hadError || !this.messageSeen) {
      this.connectDelay = Math.min(this.connectDelay * 2, 10 * 1000);
    } else {
      this.connectDelay = 250;
    }

    await new Promise((resolve) => setTimeout(resolve, this.connectDelay));

    console.log("WS connecting");
    this.connecting = true;
    this.hadError = false;
    this.websocket = new WebSocket(this.url);
    this.websocket.binaryType = "arraybuffer";
    this.websocket.onmessage = (event) => {
      this.messageSeen = true;
      this.onMessage(event);
    };

    this.websocket.onopen = () => {
      console.log("WS connected");
      this.connecting = false;
      this.ready();
    };

    this.websocket.onclose = (e) => {
      console.log("WS closed:", e.code, e.reason);
      this.connecting = false;
      this.connect();
    };

    this.websocket.onerror = (e) => {
      console.log("WS error:", e);
      this.hadError = true;
    };
  }

  send(message: string | Buffer | ArrayBuffer) {
    if (!this.websocket) {
      return;
    }

    this.websocket.send(message);
  }
}
