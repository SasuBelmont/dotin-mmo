import type { ClientMessage, ServerMessage } from './types';

export class NetworkManager {
  private ws: WebSocket | null = null;
  private url: string;
  private messageHandlers: ((msg: ServerMessage) => void)[] = [];
  private onConnectHandlers: (() => void)[] = [];
  private onDisconnectHandlers: (() => void)[] = [];
  private isExplicitlyClosed = false;
  private sendQueue: ClientMessage[] = [];
  private lastJoinMessage: ClientMessage | null = null;

  constructor(url?: string) {
    if (url) {
      this.url = url;
    } else {
      // 1. Parámetro query en URL (ej: ?ws=wss://mi-servidor.railway.app/ws)
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const queryWs = urlParams?.get('ws');

      if (queryWs) {
        this.url = queryWs;
      } else if ((import.meta as any).env?.VITE_WS_URL) {
        // 2. Variable de entorno Vite configurada en Vercel
        this.url = (import.meta as any).env.VITE_WS_URL;
      } else if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
        const isLanIp = /^192\.168\./.test(hostname) || /^10\./.test(hostname) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

        if (isLocalHost || isLanIp) {
          // Entorno local o red LAN (misma red Wi-Fi / cable)
          this.url = `ws://${hostname}:8080/ws`;
        } else {
          // Despliegue en la nube (Vercel) -> Conectar automáticamente al backend de Render
          this.url = (import.meta as any).env?.VITE_WS_URL || 'wss://dotin-mmo.onrender.com/ws';
        }
      } else {
        this.url = 'ws://127.0.0.1:8080/ws';
      }
    }
  }

  public getUrl(): string {
    return this.url;
  }

  public setUrl(newUrl: string): void {
    if (this.url !== newUrl) {
      this.url = newUrl;
      this.disconnect();
      this.connect();
    }
  }

  public connect(): void {
    this.isExplicitlyClosed = false;
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WS] Conectado al servidor de Dotin:', this.url);

        // Si tenemos un mensaje de Join previo, enviarlo primero
        if (this.lastJoinMessage) {
          this.ws?.send(JSON.stringify(this.lastJoinMessage));
        }

        // Vaciar la cola de mensajes acumulados mientras el socket se conectaba
        while (this.sendQueue.length > 0) {
          const queued = this.sendQueue.shift()!;
          this.ws?.send(JSON.stringify(queued));
        }

        this.onConnectHandlers.forEach((cb) => cb());
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as ServerMessage;
          this.messageHandlers.forEach((handler) => handler(msg));
        } catch (e) {
          console.error('[WS] Error al procesar mensaje JSON:', e);
        }
      };

      this.ws.onclose = () => {
        console.warn('[WS] Conexión cerrada con el servidor. Reintentando en 2s...');
        this.onDisconnectHandlers.forEach((cb) => cb());
        if (!this.isExplicitlyClosed) {
          setTimeout(() => this.connect(), 2000);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[WS] Error en socket:', err);
      };
    } catch (err) {
      console.error('[WS] Error conectando:', err);
      setTimeout(() => this.connect(), 2000);
    }
  }

  public onMessage(handler: (msg: ServerMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  public onConnect(handler: () => void): void {
    this.onConnectHandlers.push(handler);
  }

  public onDisconnect(handler: () => void): void {
    this.onDisconnectHandlers.push(handler);
  }

  public send(msg: ClientMessage): void {
    if (msg.type === 'Join') {
      this.lastJoinMessage = msg;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.log('[WS] Socket no listo aún, encolando mensaje:', msg.type);
      this.sendQueue.push(msg);
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
