use super::types::Position;
use serde::{Deserialize, Serialize};

pub const MAP_WIDTH: i32 = 12;
pub const MAP_HEIGHT: i32 = 12;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TileType {
    Grass,
    StonePath,
    MetinStone, // Metin2 core theme! Center obstacle
    Rock,
    Tree,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapCell {
    pub x: i32,
    pub y: i32,
    pub tile_type: TileType,
    pub is_walkable: bool,
    pub blocks_los: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BattleMap {
    pub width: i32,
    pub height: i32,
    pub cells: Vec<MapCell>,
}

impl BattleMap {
    pub fn default_arena() -> Self {
        let mut cells = Vec::with_capacity((MAP_WIDTH * MAP_HEIGHT) as usize);

        for y in 0..MAP_HEIGHT {
            for x in 0..MAP_WIDTH {
                // Determine obstacle layout:
                // Rocas y árboles estratégicos en los flancos tácticos (sin obstrucciones invisibles en el centro)
                let is_rock = (x == 2 && y == 3) || (x == 9 && y == 8) || (x == 3 && y == 9) || (x == 8 && y == 2);
                let is_tree = (x == 2 && y == 8) || (x == 9 && y == 3) || (x == 1 && y == 5) || (x == 10 && y == 6);
                let is_path = x == y || (x + y == MAP_WIDTH - 1);

                let (tile_type, is_walkable, blocks_los) = if is_rock {
                    (TileType::Rock, false, true)
                } else if is_tree {
                    (TileType::Tree, false, true)
                } else if is_path {
                    (TileType::StonePath, true, false)
                } else {
                    (TileType::Grass, true, false)
                };

                cells.push(MapCell {
                    x,
                    y,
                    tile_type,
                    is_walkable,
                    blocks_los,
                });
            }
        }

        Self {
            width: MAP_WIDTH,
            height: MAP_HEIGHT,
            cells,
        }
    }

    pub fn get_cell(&self, x: i32, y: i32) -> Option<&MapCell> {
        if x < 0 || x >= self.width || y < 0 || y >= self.height {
            None
        } else {
            Some(&self.cells[(y * self.width + x) as usize])
        }
    }

    pub fn is_walkable(&self, pos: &Position, occupied_positions: &[Position]) -> bool {
        if let Some(cell) = self.get_cell(pos.x, pos.y) {
            if !cell.is_walkable {
                return false;
            }
            !occupied_positions.contains(pos)
        } else {
            false
        }
    }

    /// Comprueba línea de visión (LoS) estilo Dofus entre origen y destino
    pub fn has_line_of_sight(&self, from: &Position, to: &Position, obstacles: &[Position]) -> bool {
        if from == to {
            return true;
        }

        // Raycasting discreto sobre cuadrícula (Bresenham)
        let dx = (to.x - from.x).abs();
        let dy = (to.y - from.y).abs();
        let sx = if from.x < to.x { 1 } else { -1 };
        let sy = if from.y < to.y { 1 } else { -1 };
        let mut err = dx - dy;

        let mut curr_x = from.x;
        let mut curr_y = from.y;

        loop {
            let e2 = 2 * err;
            if e2 > -dy {
                err -= dy;
                curr_x += sx;
            }
            if e2 < dx {
                err += dx;
                curr_y += sy;
            }

            let curr = Position::new(curr_x, curr_y);

            // Llegamos al objetivo
            if curr == *to {
                return true;
            }

            // Celda intermedia bloquea LoS si es obstáculo del mapa o está ocupada por otra entidad
            if let Some(cell) = self.get_cell(curr.x, curr.y) {
                if cell.blocks_los || obstacles.contains(&curr) {
                    return false;
                }
            } else {
                return false;
            }
        }
    }
}
