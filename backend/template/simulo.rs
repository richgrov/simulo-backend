//! Documentation for Simulo: the game engine of the real world. All APIs are available in the
//! global namespace.
//!
//! A struct `Game` must be declared with the following functions:
//! ```rust
//! pub struct Game {
//!     // ...
//! }
//!
//! impl Game {
//!     pub fn new() -> Self {
//!         // ...
//!     }
//!
//!     // `delta` is in seconds
//!     pub fn update(&mut self, delta: f32) {
//!         // ...
//!     }
//! }
//! ```
//!
//! Coordinate system:
//! +X = left
//! +Y = up
//! +Z = forward

/// A lightweight handle to an object in the scene. If dropped, the object will still exist. If
/// deleted with `GameObject::delete()`, the object will be removed from the scene and all copies
/// of this object will be invalid.
///
/// The object's position describes the top-left corner of the it's bounding box.
pub struct GameObject(u32);

#[allow(dead_code)]
impl GameObject {
    /// Creates and spawns a new object at the given viewport position. It starts at a 1x1 pixel
    /// scale, so you must likely want to rescale it to something bigger with `GameObject::set_scale()`.
    pub fn new(x: f32, y: f32, material: &Material) -> Self {
        let id = unsafe { simulo_create_object(x, y, material.0) };
        GameObject(id)
    }

    /// Returns the x-coordinate of the object's position in the viewport.
    pub fn x(&self) -> f32 {
        unsafe { simulo_get_object_x(self.0) }
    }

    /// Returns the y-coordinate of the object's position in the viewport.
    pub fn y(&self) -> f32 {
        unsafe { simulo_get_object_y(self.0) }
    }

    /// Sets the position of the object in the viewport.
    pub fn set_position(&self, x: f32, y: f32) {
        unsafe {
            simulo_set_object_position(self.0, x, y);
        }
    }

    /// Sets the scale of the object in the viewport.
    pub fn set_scale(&self, x: f32, y: f32) {
        unsafe {
            simulo_set_object_scale(self.0, x, y);
        }
    }

    /// Deletes the object from the scene. If this object handle was cloned, all other instances are
    /// also invalid. They may point to nothing, or a different object.
    pub fn delete(&self) {
        unsafe {
            simulo_delete_object(self.0);
        }
    }
}

pub struct Material(u32);

impl Material {
    pub fn new(r: f32, g: f32, b: f32) -> Self {
        unsafe { Material(simulo_create_material(r, g, b)) }
    }
}

pub fn random_float() -> f32 {
    unsafe { simulo_random() }
}

pub fn window_width() -> i32 {
    unsafe { simulo_window_width() }
}

pub fn window_height() -> i32 {
    unsafe { simulo_window_height() }
}

#[derive(Clone)]
pub struct Pose(pub PoseData);

impl Pose {
    pub fn nose(&self) -> glam::Vec2 {
        self.keypoint(0)
    }

    pub fn left_eye(&self) -> glam::Vec2 {
        self.keypoint(1)
    }

    pub fn right_eye(&self) -> glam::Vec2 {
        self.keypoint(2)
    }

    pub fn left_ear(&self) -> glam::Vec2 {
        self.keypoint(3)
    }

    pub fn right_ear(&self) -> glam::Vec2 {
        self.keypoint(4)
    }

    pub fn left_shoulder(&self) -> glam::Vec2 {
        self.keypoint(5)
    }

    pub fn right_shoulder(&self) -> glam::Vec2 {
        self.keypoint(6)
    }

    pub fn left_elbow(&self) -> glam::Vec2 {
        self.keypoint(7)
    }

    pub fn right_elbow(&self) -> glam::Vec2 {
        self.keypoint(8)
    }

    pub fn left_wrist(&self) -> glam::Vec2 {
        self.keypoint(9)
    }

    pub fn right_wrist(&self) -> glam::Vec2 {
        self.keypoint(10)
    }

    pub fn left_hip(&self) -> glam::Vec2 {
        self.keypoint(11)
    }

    pub fn right_hip(&self) -> glam::Vec2 {
        self.keypoint(12)
    }

    pub fn left_knee(&self) -> glam::Vec2 {
        self.keypoint(13)
    }

    pub fn right_knee(&self) -> glam::Vec2 {
        self.keypoint(14)
    }

    pub fn left_ankle(&self) -> glam::Vec2 {
        self.keypoint(15)
    }

    pub fn right_ankle(&self) -> glam::Vec2 {
        self.keypoint(16)
    }

    fn keypoint(&self, index: usize) -> glam::Vec2 {
        glam::Vec2::new(self.0[index * 2], self.0[index * 2 + 1])
    }
}

static mut GAME: *mut crate::game::Game = std::ptr::null_mut();

type PoseData = [f32; 17 * 2];
static mut POSE_DATA: PoseData = [0.0; 17 * 2];

#[unsafe(no_mangle)]
#[allow(static_mut_refs)]
pub extern "C" fn init(_root: u32) {
    let g = Box::new(crate::game::Game::new());
    unsafe {
        GAME = Box::leak(g);
        simulo_set_pose_buffer(POSE_DATA.as_mut_ptr());
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn update(delta: f32) {
    unsafe {
        (*GAME).update(delta);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn pose(id: u32, alive: bool) {
    unsafe {
        if alive {
            (*GAME).on_pose_update(id, Some(&Pose(POSE_DATA)));
        } else {
            (*GAME).on_pose_update(id, None);
        }
    }
}

unsafe extern "C" {
    fn simulo_set_pose_buffer(data: *mut f32);
    fn simulo_create_object(x: f32, y: f32, material: u32) -> u32;
    fn simulo_set_object_position(id: u32, x: f32, y: f32);
    fn simulo_set_object_scale(id: u32, x: f32, y: f32);
    fn simulo_get_object_x(id: u32) -> f32;
    fn simulo_get_object_y(id: u32) -> f32;
    fn simulo_delete_object(id: u32);
    fn simulo_random() -> f32;
    fn simulo_window_width() -> i32;
    fn simulo_window_height() -> i32;
    fn simulo_create_material(r: f32, g: f32, b: f32) -> u32;
}
