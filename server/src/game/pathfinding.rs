use std::collections::{HashMap, VecDeque};
use super::grid::BattleMap;
use super::types::Position;

const NEIGHBORS: [(i32, i32); 4] = [
    (0, -1), // Arriba
    (0, 1),  // Abajo
    (-1, 0), // Izquierda
    (1, 0),  // Derecha
];

pub fn find_path(
    map: &BattleMap,
    start: Position,
    target: Position,
    occupied_positions: &[Position],
    max_steps: i32,
) -> Option<Vec<Position>> {
    if start == target {
        return Some(vec![start]);
    }

    // El destino no puede estar ocupado ni ser obstáculo
    if !map.is_walkable(&target, occupied_positions) {
        return None;
    }

    let mut queue = VecDeque::new();
    let mut came_from: HashMap<Position, Position> = HashMap::new();
    let mut distances: HashMap<Position, i32> = HashMap::new();

    queue.push_back(start);
    distances.insert(start, 0);

    let mut found = false;

    while let Some(current) = queue.pop_front() {
        let current_dist = *distances.get(&current).unwrap_or(&0);

        if current == target {
            found = true;
            break;
        }

        if current_dist >= max_steps {
            continue;
        }

        for (dx, dy) in NEIGHBORS {
            let next_pos = Position::new(current.x + dx, current.y + dy);

            // Validar límites y caminabilidad
            if map.is_walkable(&next_pos, occupied_positions) || next_pos == target {
                if !distances.contains_key(&next_pos) {
                    distances.insert(next_pos, current_dist + 1);
                    came_from.insert(next_pos, current);
                    queue.push_back(next_pos);
                }
            }
        }
    }

    if !found {
        return None;
    }

    // Reconstruir camino desde el final hasta el inicio
    let mut path = Vec::new();
    let mut curr = target;
    while curr != start {
        path.push(curr);
        if let Some(&prev) = came_from.get(&curr) {
            curr = prev;
        } else {
            break;
        }
    }
    path.push(start);
    path.reverse();

    Some(path)
}

/// Obtiene todas las celdas alcanzables dentro del rango de PM disponibles
pub fn get_reachable_cells(
    map: &BattleMap,
    start: Position,
    occupied_positions: &[Position],
    max_pm: i32,
) -> Vec<Position> {
    let mut reachable = Vec::new();
    let mut queue = VecDeque::new();
    let mut visited: HashMap<Position, i32> = HashMap::new();

    queue.push_back(start);
    visited.insert(start, 0);

    while let Some(curr) = queue.pop_front() {
        let dist = *visited.get(&curr).unwrap_or(&0);
        if dist > 0 {
            reachable.push(curr);
        }

        if dist >= max_pm {
            continue;
        }

        for (dx, dy) in NEIGHBORS {
            let next_pos = Position::new(curr.x + dx, curr.y + dy);
            if map.is_walkable(&next_pos, occupied_positions) && !visited.contains_key(&next_pos) {
                visited.insert(next_pos, dist + 1);
                queue.push_back(next_pos);
            }
        }
    }

    reachable
}
