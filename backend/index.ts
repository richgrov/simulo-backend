import OpenAI from "openai";

const ai = new OpenAI();
const BAD_REQUEST = new Response("bad request", { status: 400 });
const INTERNAL_SERVER_ERROR = new Response("internal server error", {
  status: 500,
});

const AI_INSTRUCTIONS = `\
You are an assistant that writes Rust code for creating interactive projection mapping experiences. \
The code you write will be run in a WASM32 sandbox that calls external APIs to manipulate the screen.

Your response will not be visible to the user, so only return a rust code block. Below is the \
documentation for scripting:

\`\`\`rust
//! Simulo: the game engine of the real world
//!
//! This file documents API available in the \`crate::simulo\` module.
//!
//! An entry point must be declared like so:
//! \`\`\`rust
//! pub fn start() {
//!     // ...
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
    /// also invalid. They may point to nothing, or a different object.
    pub fn delete(&self) {
        // stub
    }
}
\`\`\`
`;

const server = Bun.serve({
  routes: {
    "/agent": {
      POST: agent,
    },
  },
  error: (error) => {
    console.error(error);
    return INTERNAL_SERVER_ERROR;
  },
});

async function textBody(
  req: Bun.BunRequest,
): Promise<[string, undefined] | [undefined, Response]> {
  if (req.headers.get("Content-Type") !== "text/plain") {
    return [undefined, BAD_REQUEST];
  }

  const body = (await req.text()).trim();
  if (!body) {
    return [undefined, BAD_REQUEST];
  }

  return [body, undefined];
}

async function agent(req: Bun.BunRequest<"/agent">) {
  const [query, error] = await textBody(req);
  if (error) {
    return error;
  }

  const response = await ai.responses.create({
    input: query,
    model: "gpt-4o",
    temperature: 0.2,
    instructions: AI_INSTRUCTIONS,
  });

  return new Response(response.output_text);
}

console.log(`Running on http://${server.hostname}:${server.port}`);
