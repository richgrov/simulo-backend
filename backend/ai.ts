import OpenAI from "openai";

const ai = new OpenAI();

export const AI_INSTRUCTIONS = `\
You are an assistant that writes Rust code for creating interactive projection mapping experiences. \
The code you write will be run in a WASM32 sandbox that receives computer vision detections and \
calls external APIs to manipulate the screen.

Your response will not be visible to the user, so only return a rust code block. Below is the \
documentation for scripting:

\`\`\`rust
//! Documentation for Simulo: The game engine of the real world. All APIs are available in the
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
//!     // \`delta\` is in seconds.
//!     pub fn update(&mut self, delta: f32) {
//!         // ...
//!     }
//!
//!     // Called when a pose detection comes within view, moves, or leaves view. X and Y
//!     // coordinates are in pixels. When a pose comes within view, it is assigned an ID that's
//!     // reused for future updates like moving or leaving view. If both X and Y are exactly -1,
//!     // the pose has left view.
//!     pub fn on_pose_update(&mut self, id: u32, x: f32, y: f32) {
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
    /// Creates and spawns a new object at the given viewport position. It starts at a 1x1 pixel
    /// scale, so you must likely want to rescale it to something bigger with \`GameObject::set_scale()\`.
    pub fn new(x: f32, y: f32) -> Self {
        // stub
    }

    /// Returns the x-coordinate of the object's position in the viewport.
    pub fn x(&self) -> f32 {
        // stub
    }

    /// Returns the y-coordinate of the object's position in the viewport.
    pub fn y(&self) -> f32 {
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

export async function generateRustCode(
  query: string,
  existingCode?: string,
): Promise<string> {
  let input = query;
  if (existingCode && existingCode.trim() !== "") {
    input = `Modify the following Rust code according to the request.\n\nRequest: ${query}\n\nExisting code:\n\`\`\`rust\n${existingCode}\n\`\`\``;
  }
  const response = await ai.responses.create({
    input,
    model: "gpt-4o",
    temperature: 0.2,
    instructions: AI_INSTRUCTIONS,
  });

  const text = response.output_text;
  console.log("OpenAI said:", text);

  return text.replace(/^```rust/, "").replace(/```$/, "");
}
