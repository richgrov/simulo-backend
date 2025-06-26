import { type User } from "@supabase/supabase-js";
import express from "express";
import cors from "cors";
import fs from "fs/promises";
import { s3, write as s3Write } from "bun";

import { JobQueue, finishJob } from "./job-queue";
import { generateRustCode } from "./ai";
import { supabase } from "./supabase";
import "./websocket";

const compileQueue = new JobQueue();

const corsOptions = { origin: process.env.CORS };

const server = express();
server.use(cors(corsOptions), express.text());

async function authorize(req: express.Request): Promise<User | undefined> {
  const auth = req.header("Authorization");
  if (!auth) {
    return undefined;
  }

  const { data, error } = await supabase.auth.getUser(auth);
  if (error) {
    return undefined;
  }

  if (!data.user) {
    return undefined;
  }

  return data.user;
}

server.options("/project/:projectId/agent", cors(corsOptions));
server.post("/project/:projectId/agent", async (req, res) => {
  const query = (req.body as string).trim();
  if (query.length < 1 || query.length > 1000) {
    res.status(400).send("invalid query");
    return;
  }

  const user = await authorize(req);
  if (!user) {
    res.status(401).send("unauthorized");
    return;
  }

  const projectId = req.params.projectId;
  const { data: projectData, error: projectError } = await supabase
    .from("projects")
    .select("id, deployments ( source, created_at )")
    .eq("id", projectId)
    .order("created_at", { ascending: false })
    .single();

  if (projectError) {
    console.error("failed to fetch project", projectError);
    res.status(500).send("internal server error");
    return;
  }

  if (!projectData) {
    res.status(404).send("project not found");
    return;
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
      res.status(500).send("internal server error");
      return;
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
      res.status(500).send("internal server error");
      return;
    }

    res.send("OK");
  } catch (err) {
    console.error("Job failed", err);
    res.status(500).send("job failed");
  }
});

server.listen(3000, () => console.log("Online"));
