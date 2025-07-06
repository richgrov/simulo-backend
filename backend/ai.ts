import Together from "together-ai";

const ai = new Together();

export const AI_INSTRUCTIONS = `\
You are an assistant that writes Rust code for creating interactive projection mapping experiences. \
The code you write will be run in a WASM32 sandbox that receives computer vision detections and \
calls external APIs to manipulate the screen.

Write a single, complete rust code block. No other crates except std and the below documentation \
for scripting are available.

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
//!     // Called when a pose detection comes within view, moves, or leaves view. When a pose comes
//!     // within view, it is assigned an ID that's reused for future updates like moving or
//!     // leaving view. If the pose data is None, the pose has left view.
//!     pub fn on_pose_update(&mut self, id: u32, pose: Option<&Pose>) {
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
    /// Creates and spawns a new object with the given viewport position and material. It starts at
    // a 1x1 pixel scale, so you must likely want to rescale it to something bigger with
    // \`GameObject::set_scale()\`.
    pub fn new(x: f32, y: f32, material: &Material) -> Self {
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

// A material changes the color of an object.
pub struct Material(/* stub */);

impl Material {
    // Create a material that flat-shades all its objects with a given color.
    // Creating materials is not super fast, and should not be done often. Strive to reuse materials
    // and create them at the beginning of the program.
    pub fn new(r: f32, g: f32, b: f32) -> Self {
        // stub
    }
}

/// A detected pose complete with (x, y) screen coordinates for various body points. Use the
/// relevant getter functions to access the coordinates.
#[derive(Clone)]
pub struct Pose(/* stub */);

impl Pose {
    pub fn left_wrist(&self) -> glam::Vec2 {
        // stub
    }

    pub fn right_wrist(&self) -> glam::Vec2 {
        // stub
    }
}

/// Returns a evenly distributed random float in range [0, 1).
pub fn random_float() -> f32 {
    // stub
}

/// Gets the width of the window in pixels.
pub fn window_width() -> i32 {
    // stub
}

/// Gets the height of the window in pixels.
pub fn window_height() -> i32 {
    // stub
}
\`\`\`
`;

export async function generateRustCode(
  query: string,
  existingCode: string,
): Promise<string> {
  let input = query;
  if (existingCode.trim() !== "") {
    input = `Rewrite the following Rust code according to the request:\n\`\`\`rust\n${existingCode}\n\`\`\`\n\nQuery: ${query}`;
  }

  const response = await ai.chat.completions.create({
    messages: [
      {
        role: "system",
        content: AI_INSTRUCTIONS,
      },
      {
        role: "user",
        content: input,
      },
    ],
    model: "deepseek-ai/DeepSeek-V3",
    temperature: 0.2,
  });

  const text = response.choices[0]?.message?.content ?? "";
  console.log("AI said:", text);

  const codeBlockStart = text.indexOf("```rust") + 7;
  const codeBlockEnd = text.indexOf("```", codeBlockStart);
  return text.substring(codeBlockStart, codeBlockEnd);
}
