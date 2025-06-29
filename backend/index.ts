import { type User } from "@supabase/supabase-js";
import fs from "fs/promises";
import { s3, write as s3Write } from "bun";

import { JobQueue, finishJob } from "./job-queue";
import { generateRustCode } from "./ai";
import { supabase } from "./supabase";
import { upgradeWebsocket, websocket } from "./websocket";

const compileQueue = new JobQueue();

const corsHeaders = {
  "Access-Control-Allow-Origin": process.env.CORS!,
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function authorize(req: Request): Promise<User | undefined> {
  const auth = req.headers.get("Authorization");
  if (!auth) {
    return undefined;
  }

  const { data, error } = await supabase.auth.getUser(auth);
  if (error || !data.user) {
    return undefined;
  }

  return data.user;
}

function parseProjectId(url: string): string | undefined {
  const match = new URL(url).pathname.match(/^\/project\/([^/]+)\/agent$/);
  return match?.[1];
}

async function handleAgentPost(req: Request): Promise<Response> {
  const projectId = parseProjectId(req.url);
  if (!projectId) {
    return new Response("not found", { status: 404, headers: corsHeaders });
  }

  const query = (await req.text()).trim();
  if (query.length < 1 || query.length > 1000) {
    return new Response("bad request", {
      status: 400,
      headers: corsHeaders,
    });
  }

  const user = await authorize(req);
  if (!user) {
    return new Response("unauthorized", {
      status: 401,
      headers: corsHeaders,
    });
  }

  const { data: projectData, error: projectError } = await supabase
    .from("projects")
    .select("id, deployments ( source, created_at )")
    .eq("id", projectId)
    .order("created_at", { ascending: false })
    .single();

  if (projectError) {
    console.error("failed to fetch project", projectError);
    return new Response("internal server error", {
      status: 500,
      headers: corsHeaders,
    });
  }

  if (!projectData) {
    return new Response("project not found", {
      status: 404,
      headers: corsHeaders,
    });
  }

  const source = projectData.deployments[0]?.source || "";
  const code = await generateRustCode(query, source);

  try {
    const processed = await compileQueue.enqueue(
      "use crate::simulo::*;\n" + code,
    );

    try {
      const s3File = s3.file(processed.id);
      const content = await fs.readFile(processed.wasmPath);
      await s3Write(s3File, content);
    } catch (error) {
      console.error("wasm upload failed", error);
      return new Response("internal server error", {
        status: 500,
        headers: corsHeaders,
      });
    } finally {
      finishJob(processed);
    }

    const { error: insertError } = await supabase.from("deployments").insert({
      project_id: projectId,
      source: code,
      compiled_object: processed.id,
    });

    if (insertError) {
      console.error("failed to insert deployment", insertError);
      return new Response("internal server error", {
        status: 500,
        headers: corsHeaders,
      });
    }

    return new Response("OK", { headers: corsHeaders });
  } catch (err) {
    console.error("Job failed", err);
    return new Response("job failed", { status: 500, headers: corsHeaders });
  }
}

Bun.serve({
  routes: {
    "/project/:projectId/agent": {
      OPTIONS: () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: handleAgentPost,
    },
    "/": {
      GET: upgradeWebsocket,
    },
  },
  websocket,
});

console.log("Online");
