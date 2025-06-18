import OpenAI from "openai";
import { createClient, type User } from "@supabase/supabase-js";
import express from "express";
import cors from "cors";

const ai = new OpenAI();
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_API_KEY!,
  {},
);

const AI_INSTRUCTIONS = `\
You are an assistant that writes Rust code for creating interactive projection mapping experiences. \
The code you write will be run in a WASM32 sandbox that calls external APIs to manipulate the screen.

Your response will not be visible to the user, so only return a rust code block. Below is the \
documentation for scripting:

\`\`\`rust
//! Documentation for Simulo: the game engine of the real world. All APIs are available in the
//! global namespace.
//!
//! A struct \`Game\` must be declared with the following functions:
//! \`\`\`rust
//! pub struct Game {
//!     // ...
//! }
//!
//! impl Game {
//!     pub fn new() -> Self {
//!         // ...
//!     }
//!
//!     pub fn update(&mut self, delta: f32) {
//!         // ...
//!     }
//! }
//! \`\`\`
//!
//! Coordinate system:
//! +X = left
//! +Y = up
//! +Z = forward

/// A lightweight handle to an object in the scene. If dropped, the object will still exist. If
/// deleted with \`GameObject::delete()\`, the object will be removed from the scene and all copies
/// of this object will be invalid.
pub struct GameObject(/* stub */);

impl GameObject {
    /// Creates and spawns a new object at the given viewport position. It starts at a 1x1 pixel scale.
    pub fn new(x: f32, y: f32) -> Self {
        // stub
    }

    /// Sets the position of the object in the viewport.
    pub fn set_position(&self, x: f32, y: f32) {
        // stub
    }

    /// Sets the scale of the object in the viewport.
    pub fn set_scale(&self, x: f32, y: f32) {
        // stub
    }

    /// Deletes the object from the scene. If this object handle was cloned, all other instances are
    /// also invalid. They may now point to nothing, or a different object.
    pub fn delete(&self) {
        // stub
    }
}
\`\`\`
`;

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

server.options("/agent", cors(corsOptions));
server.post("/agent", async (req, res) => {
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

  const response = await ai.responses.create({
    input: query,
    model: "gpt-4o",
    temperature: 0.2,
    instructions: AI_INSTRUCTIONS,
  });

  const text = response.output_text;
  console.log("OpenAI said:", text);

  const code = text.replace(/^```rust/, "").replace(/```$/, "");
  res.send("use crate::simulo::*;\n" + code);
});

server.listen(3000, () => console.log("Online"));
