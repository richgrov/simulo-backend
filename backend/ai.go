package main

import (
	"context"
	"fmt"
	"strings"

	"github.com/conneroisu/groq-go"
)

const AI_INSTRUCTIONS = `You are an assistant that writes Rust code for creating interactive projection mapping experiences. The code you write will be run in a WASM32 sandbox that receives computer vision detections and calls external APIs to manipulate the screen.
Write a single, complete rust code block. No other crates except std and the below documentation for scripting are available.
Some APIs use glam for vector and matrix operations. Access the components of a vector using the ` + "`" + `.x` + "`" + `, ` + "`" + `.y` + "`" + `, ` + "`" + `.z` + "`" + `, etc fields.

` + "```" + `rust
//! Documentation for Simulo: The game engine of the real world. All APIs are available in the
//! global namespace.
//!
//! A struct ` + "`" + `Game` + "`" + ` must be declared with the following functions:
//! ` + "```" + `rust
//! pub struct Game {
//!     // ...
//! }
//!
//! impl Game {
//!     pub fn new() -> Self {
//!         // ...
//!     }
//!
//!     // ` + "`" + `delta` + "`" + ` is in seconds.
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
//! ` + "```" + `
//!
//! Coordinate system:
//! +X = left
//! +Y = up
//! +Z = forward

/// A lightweight handle to an object in the scene. If dropped, the object will still exist. If
/// deleted with ` + "`" + `GameObject::delete()` + "`" + `, the object will be removed from the scene and all copies
/// of this object will be invalid.
///
/// The position of the object is anchored at the top-left corner.
pub struct GameObject(/* stub */);

impl GameObject {
    /// Creates and spawns a new object with the given viewport position and material. It starts at
    // a 1x1 pixel scale, so you must likely want to rescale it to something bigger with
    // ` + "`" + `GameObject::set_scale()` + "`" + `.
    pub fn new(position: glam::Vec2, material: &Material) -> Self { /* stub */ }

    pub fn position(&self) -> glam::Vec2 { /* stub */ }

    pub fn set_position(&self, pos: glam::Vec2) { /* stub */ }

    /// Gets the rotation of the object in radians.
    pub fn rotation(&self) -> f32 { /* stub */ }

    /// Sets the rotation of the object in radians.
    pub fn set_rotation(&self, rotation: f32) { /* stub */ }

    pub fn set_scale(&self, scale: glam::Vec2) { /* stub */ }

    pub fn set_material(&self, material: &Material) { /* stub */ }

    /// Deletes the object from the scene. If this object handle was cloned, all other instances are
    /// also invalid. They may now point to nothing, or a different object.
    pub fn delete(&self) { /* stub */ }
}

/// A material changes the color of an object.
pub struct Material(/* stub */);

impl Material {
    /// Creates a material with a given texture and color tint.
    /// Creating materials is not super fast, and should not be done often. Strive to reuse materials
    /// and create them at the beginning of the program.
    pub fn new(image_id: u32, r: f32, g: f32, b: f32) -> Self { /* stub */ }
}

/// Utility for creating solid-colored objects. A 1x1 pixel image that, when tinted, will appear
/// exactly as the material color.
pub const WHITE_PIXEL_IMAGE: u32 = /* stub */;

/// A detected pose complete with (x, y) screen coordinates for various body points. Use the
/// relevant getter functions to access the coordinates.
#[derive(Clone)]
pub struct Pose(/* stub */);

impl Pose {
    pub fn nose(&self) -> glam::Vec2 { /* stub */ }

    pub fn left_eye(&self) -> glam::Vec2 { /* stub */ }

    pub fn right_eye(&self) -> glam::Vec2 { /* stub */ }

    pub fn left_ear(&self) -> glam::Vec2 { /* stub */ }

    pub fn right_ear(&self) -> glam::Vec2 { /* stub */ }

    pub fn left_shoulder(&self) -> glam::Vec2 { /* stub */ }

    pub fn right_shoulder(&self) -> glam::Vec2 { /* stub */ }

    pub fn left_elbow(&self) -> glam::Vec2 { /* stub */ }

    pub fn right_elbow(&self) -> glam::Vec2 { /* stub */ }

    pub fn left_wrist(&self) -> glam::Vec2 { /* stub */ }

    pub fn right_wrist(&self) -> glam::Vec2 { /* stub */ }

    pub fn left_hip(&self) -> glam::Vec2 { /* stub */ }

    pub fn right_hip(&self) -> glam::Vec2 { /* stub */ }

    pub fn left_knee(&self) -> glam::Vec2 { /* stub */ }

    pub fn right_knee(&self) -> glam::Vec2 { /* stub */ }

    pub fn left_ankle(&self) -> glam::Vec2 { /* stub */ }

    pub fn right_ankle(&self) -> glam::Vec2 { /* stub */ }
}

/// Returns a evenly distributed random float in range [0, 1).
pub fn random_float() -> f32 { /* stub */ }

/// Gets the size of the window in pixels.
pub fn window_size() -> glam::IVec2 { /* stub */ }
` + "```"

type GroqClient struct {
	client *groq.Client
}

type CodeConversation struct {
	messages []groq.ChatCompletionMessage
}

func NewGroqClient(apiKey string) *GroqClient {
	client, err := groq.NewClient(apiKey)
	if err != nil {
		panic(fmt.Sprintf("failed to create Groq client: %v", err))
	}
	return &GroqClient{client: client}
}

func NewCodeConversation(query, existingCode string) *CodeConversation {
	input := query
	if existingCode != "" {
		input = fmt.Sprintf("Rewrite the following Rust code according to the request:\n```rust\n%s\n```\n\nQuery: %s", existingCode, query)
	}

	return &CodeConversation{
		messages: []groq.ChatCompletionMessage{
			{
				Role:    groq.RoleSystem,
				Content: AI_INSTRUCTIONS,
			},
			{
				Role:    groq.RoleUser,
				Content: input,
			},
		},
	}
}

func (c *CodeConversation) Generate(groqClient *GroqClient) (string, error) {
	req := groq.ChatCompletionRequest{
		Model:       groq.ChatModel("moonshotai/kimi-k2-instruct"),
		Messages:    c.messages,
		Temperature: 0.2,
	}
	
	chatCompletion, err := groqClient.client.ChatCompletion(context.Background(), req)
	if err != nil {
		return "", fmt.Errorf("failed to create chat completion: %w", err)
	}

	if len(chatCompletion.Choices) == 0 {
		return "", fmt.Errorf("no choices returned from Groq")
	}

	message := chatCompletion.Choices[0].Message
	text := message.Content

	c.messages = append(c.messages, groq.ChatCompletionMessage{
		Role:    groq.RoleAssistant,
		Content: text,
	})

	// Extract Rust code block
	codeStart := strings.Index(text, "```rust")
	if codeStart == -1 {
		return "", fmt.Errorf("no rust code block found")
	}
	codeStart += 7 // length of "```rust"

	codeEnd := strings.Index(text[codeStart:], "```")
	if codeEnd == -1 {
		return "", fmt.Errorf("incomplete rust code block")
	}

	return text[codeStart : codeStart+codeEnd], nil
}

func (c *CodeConversation) ReportError(error string) {
	c.messages = append(c.messages, groq.ChatCompletionMessage{
		Role:    groq.RoleUser,
		Content: fmt.Sprintf("An error occurred. Produce a new code block in the same format as described in the instructions based on this error: %s", error),
	})
}

