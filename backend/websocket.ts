import * as crypto from "crypto";

import * as s3 from "./s3";
import { supabase } from "./supabase";
import { Packet } from "./packet";

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

  (ws.data as WebsocketData) = {
    type: "machine",
    machineId,
  };

  onlineMachines.add(machineId);

  const { data: deploymentData, error: deploymentError } = await supabase
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
  const objectId = reinterpretSingle(deploymentData.projects).deployments[0]
    ?.compiled_object;
  if (!objectId) {
    ws.close(4006);
    return;
  }

  const [programUrl, programHash] = await Promise.all([
    s3.presignUrl(objectId, 60 * 10),
    s3.getHash(objectId),
  ]);

  const assets = new Array();

  const packet = new Packet();
  packet.u8(0);
  packet.string(programUrl);
  packet.bytes(programHash);
  packet.u8(assets.length);
  for (const asset of assets) {
    packet.string(asset.url);
    packet.bytes(asset.hash);
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

  (ws.data as WebsocketData) = {
    type: "user",
    userId: data.user.id,
    projectId: parts[1]!,
  };

  const { data: projectData, error: projectError } = await supabase
    .from("projects")
    .select("owner, scene")
    .eq("id", parts[1]!)
    .limit(1);

  if (projectError) {
    console.error(projectError);
    return;
  }

  if (projectData.length === 0) {
    ws.close(4009);
    return;
  }

  const project = projectData[0]!;
  if (project.owner !== data.user.id) {
    ws.close(4008);
    return;
  }

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
      console.log(`[user ${data.userId}]`, message);
    }
  },
  async close(ws: Bun.ServerWebSocket<unknown>) {
    const data = ws.data as WebsocketData;

    if (data?.type === "machine") {
      onlineMachines.delete(data.machineId);
    }
  },
};

function reinterpretSingle<T>(array: T[]): T {
  return array as unknown as T;
}
