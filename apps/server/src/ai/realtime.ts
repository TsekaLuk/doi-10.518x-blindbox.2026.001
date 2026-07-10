import { createBunWebSocket } from "hono/bun";
import type { WSContext } from "hono/ws";
import { env } from "../env";

/**
 * Bidirectional relay for the OpenAI-Realtime-shaped voice protocol so the
 * browser never sees the DashScope API key. Pure byte/text relay — the
 * server does not need to interpret any of the protocol's JSON events.
 */
export const { upgradeWebSocket, websocket } = createBunWebSocket();

export const realtimeHandler = upgradeWebSocket(() => {
  let upstream: WebSocket | null = null;
  let upstreamOpen = false;
  const pending: Array<string | ArrayBufferLike> = [];

  return {
    onOpen(_evt: unknown, ws: WSContext) {
      if (!env.bailianWorkspaceId) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "realtime voice not configured (missing BAILIAN_WORKSPACE_ID)",
          }),
        );
        ws.close();
        return;
      }

      const wsUrl = `wss://${env.bailianWorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=${env.ai.models.realtime}`;
      // Bun's WebSocket client supports a second constructor arg for custom
      // headers — a Bun-specific extension beyond the browser standard.
      upstream = new WebSocket(wsUrl, {
        headers: { Authorization: `Bearer ${env.ai.apiKey}` },
      } as unknown as string[]) as WebSocket;

      upstream.onopen = () => {
        upstreamOpen = true;
        for (const msg of pending.splice(0)) {
          upstream?.send(msg as string);
        }
      };
      upstream.onmessage = (evt) => {
        ws.send(evt.data as string);
      };
      upstream.onerror = () => {
        ws.close();
      };
      upstream.onclose = () => {
        ws.close();
      };
    },

    onMessage(evt: { data: unknown }) {
      const payload = evt.data as string | ArrayBufferLike;
      if (upstream && upstreamOpen && upstream.readyState === WebSocket.OPEN) {
        upstream.send(payload as string);
      } else {
        pending.push(payload);
      }
    },

    onClose() {
      upstream?.close();
      upstream = null;
    },
  };
});
