import { createClient, type User } from "@supabase/supabase-js";
import express from "express";
import cors from "cors";
import { JobQueue, finishJob } from "./job-queue";
import { generateRustCode } from "./ai";
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_API_KEY!,
  {},
);


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
  let existingCode: string | undefined;
  const { data: projectData, error: projectError } = await supabase
    .from("projects")
    .select("source")
    .eq("id", projectId)
    .single();
  if (!projectError && projectData && projectData.source) {
    existingCode = projectData.source as string;
  }

  const code = await generateRustCode(query, existingCode);
  const fullCode = "use crate::simulo::*;\n" + code;

  try {
    const processed = await compileQueue.enqueue(fullCode);
    res.sendFile(processed.wasmPath, (err) => {
      if (err) {
        console.error("Failed to send file", err);
      }
      finishJob(processed);
    });
  } catch (err) {
    console.error("Job failed", err);
    res.status(500).send("job failed");
  }
});

server.listen(3000, () => console.log("Online"));
