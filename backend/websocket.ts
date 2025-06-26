import * as crypto from "crypto";
import { s3 } from "bun";

import { supabase } from "./supabase";

interface WebsocketData {
  machineId: number | undefined;
}

async function verifySignature(
  id: string,
  publicKeyPem: string,
  signature: Buffer,
): Promise<boolean> {
  const messageEncoder = new TextEncoder();
  const message = messageEncoder.encode(id);

  return crypto.verify(
    null,
    message,
    {
      key: publicKeyPem,
      format: "pem",
      type: "spki",
    },
    signature,
  );
}

async function tryAuth(
  ws: Bun.ServerWebSocket<unknown>,
  message: string | Buffer,
): Promise<number | undefined> {
  if (!Buffer.isBuffer(message)) {
    ws.close(4000);
    return;
  }

  if (message.length < 1 + 1 + 64 || message.length > 1 + 64 + 64) {
    ws.close(4001);
    return;
  }

  const idLength = message[0] as number;
  if (message.length !== 1 + idLength + 64) {
    console.log(message.length, idLength);
    ws.close(4002);
    return;
  }

  const idBuffer = message.subarray(1, 1 + idLength);
  const signature = message.subarray(1 + idLength);

  const idString = idBuffer.toString();

  const machineId = parseInt(idString, 10);
  if (isNaN(machineId)) {
    ws.close(4003);
    return;
  }

  const { data: machineData, error } = await supabase
    .from("machines")
    .select("public_key")
    .eq("id", machineId)
    .single();

  if (error) {
    console.error(error);
    ws.close(1011);
    return;
  }

  if (typeof machineData.public_key !== "string") {
    ws.close(4004);
    return;
  }

  try {
    const isValid = await verifySignature(
      idString,
      machineData.public_key,
      signature,
    );

    if (!isValid) {
      ws.close(4005);
      return;
    }
  } catch (error) {
    console.error(error);
    ws.close(1011);
    return;
  }

  (ws.data as WebsocketData).machineId = machineId;
  return machineId;
}

Bun.serve({
  port: 3001,
  fetch(req, server) {
    if (server.upgrade(req, { data: { machineId: undefined } })) {
      return;
    }
    return new Response("websocket upgrade failed", { status: 500 });
  },
  websocket: {
    idleTimeout: 10,
    async message(ws, message) {
      const data = ws.data as WebsocketData;

      if (data.machineId === undefined) {
        const machineId = await tryAuth(ws, message);

        if (machineId) {
          const { error } = await supabase
            .from("machines")
            .update({ status: "online" })
            .eq("id", machineId);

          if (error) {
            console.error(error);
            ws.close(1011);
            return;
          }

          const { data: deploymentData, error: deploymentError } =
            await supabase
              .from("machines")
              .select("id, projects(deployments(compiled_object, created_at))")
              .eq("id", machineId)
              .order("created_at", {
                ascending: false,
                referencedTable: "projects.deployments",
              })
              .single();

          if (deploymentError) {
            console.error(deploymentError);
            ws.close(1011);
            return;
          }

          // Supabase incorrectly types this as an array when it's a 1-1 relationship
          const objectId = reinterpretSingle(deploymentData.projects)
            .deployments[0]?.compiled_object;
          if (!objectId) {
            ws.close(4006);
            return;
          }

          const url = s3.file(objectId).presign({
            acl: "public-read",
            expiresIn: 60 * 20,
          });

          ws.sendText(url);
        }
        return;
      }

      console.log(`[machine ${data.machineId}]`, message);
    },
    async close(ws) {
      const data = ws.data as WebsocketData;

      if (data.machineId === undefined) {
        return;
      }

      const { error } = await supabase
        .from("machines")
        .update({ status: "offline" })
        .eq("id", data.machineId);

      if (error) {
        console.error(error);
      }
    },
  },
});

function reinterpretSingle<T>(array: T[]): T {
  return array as unknown as T;
}
