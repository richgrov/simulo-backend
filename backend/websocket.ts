import * as crypto from "crypto";
import { sql } from "bun";

import * as s3 from "./s3";
import { supabase } from "./supabase";
import { Packet, PacketReader } from "../util/packet";

type WebsocketData = Machine | User | undefined;

interface Machine {
  type: "machine";
  machineId: number;
}

interface User {
  type: "user";
  userId: string;
  projectId: string;
}

const onlineMachines = new Set<number>();

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

async function tryMachineAuth(
  ws: Bun.ServerWebSocket<unknown>,
  message: Buffer,
): Promise<number | undefined> {
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

  const machineRows = await sql`
    SELECT public_key
    FROM machines
    WHERE id = ${machineId}
  `;

  if (machineRows.length === 0) {
    ws.close(1011);
    return;
  }

  const machineData = machineRows[0];
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

  (ws.data as WebsocketData) = {
    type: "machine",
    machineId,
  };

  onlineMachines.add(machineId);
  console.log(`Machine ${machineId} authenticated from ${ws.remoteAddress}`);

  const deploymentRows = await sql`
    SELECT p.scene, d.compiled_object
    FROM machines m
    JOIN projects p ON p.id = m.project
    JOIN deployments d ON d.project_id = p.id
    WHERE m.id = ${machineId}
    ORDER BY d.created_at DESC
    LIMIT 1
  `;

  if (deploymentRows.length === 0) {
    ws.close(1011);
    return;
  }

  const project = deploymentRows[0];
  const objectId = project.compiled_object;
  if (!objectId) {
    ws.close(4006);
    return;
  }

  const scene = JSON.parse(project.scene);

  const files = [objectId, ...scene[0].promptImages];
  const urls = await Promise.all(files.map((id) => s3.presignUrl(id, 60 * 5)));
  const hashes = await Promise.all(files.map((id) => s3.getHash(id)));

  const packet = new Packet();
  packet.u8(0);
  packet.string(urls[0]!);
  packet.bytes(hashes[0]!);
  packet.u8(urls.length - 1);
  for (let i = 1; i < urls.length; i++) {
    packet.string(urls[i]!);
    packet.bytes(hashes[i]!);
  }

  ws.sendBinary(packet.toBuffer());
}

async function tryUserAuth(ws: Bun.ServerWebSocket<unknown>, message: string) {
  const parts = message.split("|");
  if (parts.length !== 2) {
    ws.close(4007);
    return;
  }

  const { data, error } = await supabase.auth.getUser(parts[0]);
  if (error) {
    console.error(error);
    ws.close(4000);
    return;
  }

  const projectRows = await sql`
    SELECT owner, scene
    FROM projects
    WHERE id = ${parts[1]!}
    LIMIT 1
  `;

  if (projectRows.length === 0) {
    ws.close(4009);
    return;
  }

  const project = projectRows[0];
  if (project.owner !== data.user.id) {
    ws.close(4008);
    return;
  }

  (ws.data as WebsocketData) = {
    type: "user",
    userId: data.user.id,
    projectId: parts[1]!,
  };

  console.log(`User ${data.user.id} authenticated from ${ws.remoteAddress}`);

  const scene = project.scene as string;
  const sceneData = JSON.parse(scene);
  ws.sendText("scene|" + scene);

  for (const object of sceneData) {
    if (object.type === "machine") {
      const machineId = object.id;
      const machineOnline = onlineMachines.has(machineId);
      ws.sendText("machineonline|" + machineId + "|" + machineOnline);
    }
  }

  for (const image of sceneData[0].promptImages) {
    const url = await s3.presignUrl(image, 60 * 5);
    const response = new Packet();
    response.u8(1);
    response.string(url);
    ws.sendBinary(response.toBuffer());
  }
}

async function handleUserMessage(
  ws: Bun.ServerWebSocket<unknown>,
  message: string | Buffer,
) {
  const userData = ws.data as User;
  if (!Buffer.isBuffer(message)) {
    ws.close(4010);
    return;
  }

  if (message.length < 1) {
    ws.close(4011);
    return;
  }

  const reader = new PacketReader(message.buffer as ArrayBuffer);
  const id = reader.u8();
  if (id === undefined) {
    ws.close(4012);
    return;
  }

  switch (id) {
    case 0:
      const fileCount = reader.u8();
      if (fileCount === undefined) {
        ws.close(4014);
        return;
      }

      for (let i = 0; i < fileCount; i++) {
        const data = reader.dynbytes();
        if (data === undefined) {
          ws.close(4015);
          return;
        }

        const projectRows = await sql`
          SELECT id, scene
          FROM projects
          WHERE id = ${userData.projectId}
        `;

        if (projectRows.length === 0) {
          ws.close(4016);
          return;
        }

        const projectData = projectRows[0];

        const id = Bun.randomUUIDv7();

        const scene = JSON.parse(projectData.scene);
        scene[0].promptImages.push(id);

        await s3.uploadFile(id, Buffer.from(data));
        const url = await s3.presignUrl(id, 60 * 5);

        await sql`
          UPDATE projects
          SET scene = ${JSON.stringify(scene)}
          WHERE id = ${userData.projectId}
        `;

        const response = new Packet();
        response.u8(1);
        response.string(url);
        ws.sendBinary(response.toBuffer());
      }
      break;

    default:
      ws.close(4013);
      return;
  }
}

export function upgradeWebsocket(
  req: Request,
  server: Bun.Server,
): Response | void {
  if (server.upgrade(req, { data: undefined })) {
    return;
  }
  return new Response("websocket upgrade failed", { status: 500 });
}

export const websocket = {
  idleTimeout: 10,
  async message(ws: Bun.ServerWebSocket<unknown>, message: string | Buffer) {
    const data = ws.data as WebsocketData;

    const notAuthenticated = data === undefined;
    if (notAuthenticated) {
      console.log(`Attempting authentication of ${ws.remoteAddress}`);
      if (typeof message === "string") {
        tryUserAuth(ws, message);
      } else {
        tryMachineAuth(ws, message);
      }
      return;
    }

    if (data.type === "machine") {
      console.log(`[machine ${data.machineId}]`, message);
    } else {
      handleUserMessage(ws, message);
    }
  },
  async close(ws: Bun.ServerWebSocket<unknown>) {
    const data = ws.data as WebsocketData;

    if (data?.type === "machine") {
      onlineMachines.delete(data.machineId);
    }
  },
};
