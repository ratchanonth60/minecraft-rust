use super::world::WorldState;
use std::sync::Mutex;

pub struct GameState {
    pub world: Mutex<WorldState>,
}

impl Default for GameState {
    fn default() -> Self {
        Self {
            world: Mutex::new(WorldState::default()),
        }
    }
}
