use super::grid::{BattleMap, MAP_HEIGHT, MAP_WIDTH};
use super::pathfinding::{find_path, get_reachable_cells};
use super::types::{CharacterClass, Player, Position, Spell};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum GameStatus {
    Lobby,
    InBattle,
    GameOver { winner_team: u8, winner_kingdom: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CastResult {
    pub caster_id: String,
    pub spell: Spell,
    pub target_pos: Position,
    pub affected_player_id: Option<String>,
    pub damage: i32,
    pub heal: i32,
    pub target_new_hp: i32,
    pub is_target_dead: bool,
    pub is_game_over: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameState {
    pub map: BattleMap,
    pub players: Vec<Player>,
    pub turn_order: Vec<String>,
    pub current_turn_index: usize,
    pub turn_count: u32,
    pub status: GameStatus,
    pub combat_logs: Vec<String>,
}

impl GameState {
    pub fn new() -> Self {
        Self {
            map: BattleMap::default_arena(),
            players: Vec::new(),
            turn_order: Vec::new(),
            current_turn_index: 0,
            turn_count: 1,
            status: GameStatus::Lobby,
            combat_logs: vec!["¡Bienvenidos a Dotin! Elige tu reino y prepárate para el combate.".to_string()],
        }
    }

    pub fn get_occupied_positions(&self) -> Vec<Position> {
        self.players
            .iter()
            .filter(|p| p.is_alive)
            .map(|p| p.pos)
            .collect()
    }

    pub fn add_player(&mut self, id: String, name: String, class: CharacterClass, team: u8, is_bot: bool) -> Result<(), String> {
        if self.players.iter().any(|p| p.id == id) {
            return Err("Ya existe un jugador con este ID".to_string());
        }

        // Posiciones de inicio por equipo: Jinno (Azul, abajo a la izquierda), Shinsoo (Rojo, arriba a la derecha)
        let starting_pos = if team == 0 {
            let offset = self.players.iter().filter(|p| p.team == 0).count() as i32;
            Position::new(1 + offset, 1)
        } else {
            let offset = self.players.iter().filter(|p| p.team == 1).count() as i32;
            Position::new(MAP_WIDTH - 2 - offset, MAP_HEIGHT - 2)
        };

        let player = Player::new(id.clone(), name.clone(), class, starting_pos, team, is_bot);
        self.players.push(player);
        self.turn_order.push(id.clone());

        self.combat_logs.push(format!("{} se ha unido a la arena como {:?}.", name, class));

        Ok(())
    }

    pub fn set_player_spells(&mut self, player_id: &str, spells: Vec<crate::game::types::Spell>) {
        if let Some(p) = self.players.iter_mut().find(|p| p.id == player_id) {
            p.spells = spells;
        }
    }

    pub fn start_battle(&mut self) {
        self.status = GameStatus::InBattle;
        self.current_turn_index = 0;
        self.turn_count = 1;

        if let Some(active_id) = self.turn_order.get(0) {
            if let Some(player) = self.players.iter_mut().find(|p| p.id == *active_id) {
                player.reset_turn_points();
                let active_name = player.name.clone();
                self.combat_logs.push(format!("¡Comienza la batalla! Turno 1: Es el turno de {}.", active_name));
            }
        }
    }

    pub fn current_player_id(&self) -> Option<&String> {
        if self.status != GameStatus::InBattle || self.turn_order.is_empty() {
            None
        } else {
            self.turn_order.get(self.current_turn_index)
        }
    }

    pub fn current_player(&self) -> Option<&Player> {
        let id = self.current_player_id()?;
        self.players.iter().find(|p| p.id == *id)
    }

    pub fn current_player_mut(&mut self) -> Option<&mut Player> {
        let id = self.current_player_id()?.clone();
        self.players.iter_mut().find(|p| p.id == id)
    }

    pub fn move_player(&mut self, player_id: &str, target: Position) -> Result<Vec<Position>, String> {
        if self.status != GameStatus::InBattle {
            return Err("La batalla no está activa".to_string());
        }

        if self.current_player_id().map(|id| id.as_str()) != Some(player_id) {
            return Err("No es tu turno".to_string());
        }

        let player = self.players.iter().find(|p| p.id == player_id).ok_or("Jugador no encontrado")?;
        let start_pos = player.pos;
        let pm = player.pm;

        if pm <= 0 {
            return Err("No te quedan Puntos de Movimiento (PM)".to_string());
        }

        let occupied = self.get_occupied_positions();
        let path = find_path(&self.map, start_pos, target, &occupied, pm)
            .ok_or("Destino inalcanzable o bloqueado")?;

        let steps = (path.len() as i32) - 1;
        if steps <= 0 {
            return Err("Ya estás en esa posición".to_string());
        }

        if steps > pm {
            return Err("No tienes suficientes PM para esa distancia".to_string());
        }

        // Actualizar jugador
        let player_mut = self.players.iter_mut().find(|p| p.id == player_id).unwrap();
        player_mut.pos = target;
        player_mut.pm -= steps;

        self.combat_logs.push(format!("{} se desplazó {} casillas (PM restantes: {}).", player_mut.name, steps, player_mut.pm));

        Ok(path)
    }

    pub fn cast_spell(&mut self, player_id: &str, spell_id: &str, target_pos: Position) -> Result<CastResult, String> {
        if self.status != GameStatus::InBattle {
            return Err("La batalla no está activa".to_string());
        }

        if self.current_player_id().map(|id| id.as_str()) != Some(player_id) {
            return Err("No es tu turno".to_string());
        }

        let (caster_pos, caster_ap, caster_team, caster_name, attack_buff, spell) = {
            let caster = self.players.iter().find(|p| p.id == player_id).ok_or("Lanzador no encontrado")?;
            let spell = caster.spells.iter().find(|s| s.id == spell_id).cloned().ok_or("Hechizo no encontrado")?;
            (caster.pos, caster.ap, caster.team, caster.name.clone(), caster.attack_buff_turns, spell)
        };

        if caster_ap < spell.ap_cost {
            return Err(format!("No tienes suficientes PA (Costo: {}, Tienes: {})", spell.ap_cost, caster_ap));
        }

        let dist = caster_pos.distance(&target_pos);

        // Validación de rango
        if dist < spell.min_range || dist > spell.max_range {
            return Err(format!("Fuera de rango (Rango: {}-{}, Distancia: {})", spell.min_range, spell.max_range, dist));
        }

        // Validación lineal
        if spell.is_linear && !caster_pos.is_linear(&target_pos) {
            return Err("Este hechizo solo puede lanzarse en línea recta".to_string());
        }

        // Validación de línea de visión
        if spell.requires_los {
            let occupied = self.get_occupied_positions();
            if !self.map.has_line_of_sight(&caster_pos, &target_pos, &occupied) {
                return Err("Línea de visión bloqueada por un obstáculo".to_string());
            }
        }

        let affected_id;
        let final_damage;
        let mut final_heal = 0;
        let mut is_dead = false;
        let target_new_hp;

        if spell.is_self_buff {
            let caster_mut = self.players.iter_mut().find(|p| p.id == player_id).unwrap();
            caster_mut.ap -= spell.ap_cost;
            if spell.effect_key == "aura_glow" {
                caster_mut.attack_buff_turns = 2;
                self.combat_logs.push(format!("{} activa [Aura de Espada] (+Daño por 2 turnos).", caster_name));
            } else if spell.effect_key == "dark_shield" || spell.effect_key == "blessing_glow" {
                caster_mut.defense_buff_turns = 2;
                self.combat_logs.push(format!("{} activa defensa mística (protección por 2 turnos).", caster_name));
            }
            affected_id = Some(player_id.to_string());
            target_new_hp = caster_mut.hp;
            final_damage = 0;
        } else if spell.is_heal {
            let target_player = self.players.iter_mut().find(|p| p.pos == target_pos && p.is_alive)
                .ok_or("No hay ningún objetivo vivo en esa casilla")?;

            let heal_amount = 30; // Promedio de curación
            target_player.hp = (target_player.hp + heal_amount).min(target_player.max_hp);
            target_new_hp = target_player.hp;
            final_heal = heal_amount;
            final_damage = 0;
            affected_id = Some(target_player.id.clone());
            let target_name = target_player.name.clone();

            let caster_mut = self.players.iter_mut().find(|p| p.id == player_id).unwrap();
            caster_mut.ap -= spell.ap_cost;

            self.combat_logs.push(format!("{} curó a {} por {} HP.", caster_name, target_name, heal_amount));
        } else {
            // Ataque a un enemigo
            let target_idx = self.players.iter().position(|p| p.pos == target_pos && p.is_alive)
                .ok_or("No hay ningún objetivo en esa casilla")?;

            if self.players[target_idx].team == caster_team {
                return Err("No puedes atacar a un aliado de tu propio reino".to_string());
            }

            // Cálculo de daño con bonos de equipo (armas y armaduras)
            let base = (spell.base_damage_min + spell.base_damage_max) / 2;
            let buff_bonus = if attack_buff > 0 { 12 } else { 0 };
            let equip_atk = self.players.iter().find(|p| p.id == player_id).map(|p| p.attack_bonus).unwrap_or(0);
            let defense_reduction = (if self.players[target_idx].defense_buff_turns > 0 { 10 } else { 0 }) + self.players[target_idx].defense_bonus;
            final_damage = (base + buff_bonus + equip_atk - defense_reduction).max(5);

            let target_player = &mut self.players[target_idx];
            target_player.hp = (target_player.hp - final_damage).max(0);
            target_new_hp = target_player.hp;
            let target_name = target_player.name.clone();
            affected_id = Some(target_player.id.clone());

            if target_player.hp == 0 {
                target_player.is_alive = false;
                is_dead = true;
                self.combat_logs.push(format!("¡{} fue derrotado por {}!", target_name, caster_name));

                // Si se destruye la Piedra Metin, todas sus invocaciones caen con ella
                if target_name.contains("Metin") {
                    let enemy_team = target_player.team;
                    for p in self.players.iter_mut() {
                        if p.team == enemy_team && p.is_alive {
                            p.is_alive = false;
                            p.hp = 0;
                        }
                    }
                    self.combat_logs.push("💥 ¡La Piedra Metin se hace añicos! Todas sus criaturas invocadas han sido purificadas.".to_string());
                }
            } else {
                self.combat_logs.push(format!("{} golpeó a {} con [{}] causando {} de daño.", caster_name, target_name, spell.name, final_damage));
            }

            let caster_mut = self.players.iter_mut().find(|p| p.id == player_id).unwrap();
            caster_mut.ap -= spell.ap_cost;
        }

        // Chequear condición de victoria
        let mut is_game_over = false;
        let jinno_alive = self.players.iter().any(|p| p.team == 0 && p.is_alive);
        let shinsoo_alive = self.players.iter().any(|p| p.team == 1 && p.is_alive);

        if !jinno_alive {
            self.status = GameStatus::GameOver { winner_team: 1, winner_kingdom: "Shinsoo".to_string() };
            self.combat_logs.push("¡Victoria para el Reino Shinsoo (Rojo)!".to_string());
            is_game_over = true;
        } else if !shinsoo_alive {
            self.status = GameStatus::GameOver { winner_team: 0, winner_kingdom: "Jinno".to_string() };
            self.combat_logs.push("¡Victoria para el Reino Jinno (Azul)!".to_string());
            is_game_over = true;
        }

        Ok(CastResult {
            caster_id: player_id.to_string(),
            spell,
            target_pos,
            affected_player_id: affected_id,
            damage: final_damage,
            heal: final_heal,
            target_new_hp,
            is_target_dead: is_dead,
            is_game_over,
        })
    }

    pub fn pass_turn(&mut self) -> Result<String, String> {
        if self.status != GameStatus::InBattle {
            return Err("La batalla no está activa".to_string());
        }

        if self.turn_order.is_empty() {
            return Err("No hay orden de turnos".to_string());
        }

        // Buscar el siguiente jugador vivo
        let total = self.turn_order.len();
        let mut next_idx = (self.current_turn_index + 1) % total;
        let mut looped = 0;

        while looped < total {
            let next_id = &self.turn_order[next_idx];
            if let Some(player) = self.players.iter().find(|p| p.id == *next_id) {
                if player.is_alive {
                    break;
                }
            }
            next_idx = (next_idx + 1) % total;
            looped += 1;
        }

        if next_idx <= self.current_turn_index {
            self.turn_count += 1;
        }

        self.current_turn_index = next_idx;
        let next_player_id = self.turn_order[next_idx].clone();

        if let Some(player) = self.players.iter_mut().find(|p| p.id == next_player_id) {
            player.reset_turn_points();
            let name = player.name.clone();
            self.combat_logs.push(format!("Turno {}: Es el turno de {} ({} PA, {} PM).", self.turn_count, name, player.ap, player.pm));
        }

        Ok(next_player_id)
    }

    /// Comprueba si el jugador activo actual es un Bot y ejecuta su IA táctica
    pub fn try_run_bot_ai(&mut self) -> Option<(Option<Vec<Position>>, Vec<CastResult>)> {
        let active_id = self.current_player_id()?.clone();
        let (is_bot, bot_pos, bot_team, bot_pm) = {
            let p = self.players.iter().find(|p| p.id == active_id)?;
            (p.is_bot, p.pos, p.team, p.pm)
        };

        if !is_bot {
            return None;
        }

        // 1. Encuentra el enemigo vivo más cercano
        let target_enemy = self.players
            .iter()
            .filter(|p| p.team != bot_team && p.is_alive)
            .min_by_key(|p| bot_pos.distance(&p.pos))?
            .clone();

        let is_metin = self.players.iter().find(|p| p.id == active_id).map(|p| p.name.contains("Metin")).unwrap_or(false);

        // Lógica única de la Piedra Metin: invocar oleadas de esbirros
        if is_metin {
            let living_minions = self.players.iter().filter(|p| p.team == bot_team && p.is_alive).count();
            if living_minions < 4 {
                let occupied = self.get_occupied_positions();
                let spawn_cell = [
                    Position::new(bot_pos.x + 1, bot_pos.y),
                    Position::new(bot_pos.x - 1, bot_pos.y),
                    Position::new(bot_pos.x, bot_pos.y + 1),
                    Position::new(bot_pos.x, bot_pos.y - 1),
                    Position::new(bot_pos.x + 1, bot_pos.y + 1),
                    Position::new(bot_pos.x - 1, bot_pos.y - 1),
                ].into_iter().find(|pos| self.map.is_walkable(pos, &occupied));

                if let Some(pos) = spawn_cell {
                    let summon_id = format!("summon_{}_{}", active_id, self.players.len() + 1);
                    let (s_name, s_class) = if living_minions % 2 == 0 {
                        ("Lobo Invocado".to_string(), CharacterClass::Warrior)
                    } else {
                        ("Perro Invocado".to_string(), CharacterClass::Ninja)
                    };

                    let mut summon_p = Player::new(summon_id.clone(), s_name.clone(), s_class, pos, bot_team, true);
                    summon_p.hp = 80;
                    summon_p.max_hp = 80;
                    self.players.push(summon_p);
                    self.turn_order.push(summon_id);
                    self.combat_logs.push(format!("☄️ ¡La Piedra Metin emite una onda oscura e invoca a [{}] en ({}, {})!", s_name, pos.x, pos.y));
                }
            }
            // La Piedra Metin no ataca directamente: solo invoca y pasa turno (sus esbirros atacan)
            return Some((None, Vec::new()));
        }

        let mut move_path = None;
        let mut cast_results = Vec::new();

        // 2. Comprobar si ya puede atacar desde la posición actual con alguno de sus hechizos
        let available_spells: Vec<Spell> = {
            let bot_p = self.players.iter().find(|p| p.id == active_id)?;
            bot_p.spells.iter()
                .filter(|s| !s.is_self_buff && !s.is_heal)
                .cloned()
                .collect()
        };

        let can_attack_from_pos = |pos: &Position, target: &Position, spells: &[Spell], ap: i32| -> bool {
            let d = pos.distance(target);
            spells.iter().any(|s| {
                ap >= s.ap_cost && d >= s.min_range && d <= s.max_range && (!s.is_linear || pos.is_linear(target))
            })
        };

        let current_ap = self.players.iter().find(|p| p.id == active_id)?.ap;
        let can_attack_now = can_attack_from_pos(&bot_pos, &target_enemy.pos, &available_spells, current_ap);

        // 3. Si no puede atacar y tiene PM, moverse hacia el enemigo o a una casilla con rango
        if !can_attack_now && bot_pm > 0 {
            let reachable = get_reachable_cells(&self.map, bot_pos, &self.get_occupied_positions(), bot_pm);
            // Preferir casilla que permita atacar; si ninguna, la más cercana al enemigo
            let best_cell = reachable.iter()
                .filter(|cell| can_attack_from_pos(cell, &target_enemy.pos, &available_spells, current_ap))
                .min_by_key(|cell| cell.distance(&target_enemy.pos))
                .copied()
                .or_else(|| {
                    reachable.into_iter().min_by_key(|cell| cell.distance(&target_enemy.pos))
                });

            if let Some(target_cell) = best_cell {
                if let Ok(path) = self.move_player(&active_id, target_cell) {
                    move_path = Some(path);
                }
            }
        }

        // 4. Intentar lanzar hechizos ofensivos (hasta agotar PA o no tener rango)
        for _ in 0..3 {
            let bot_p = match self.players.iter().find(|p| p.id == active_id) {
                Some(p) => p,
                None => break,
            };
            let curr_pos = bot_p.pos;
            let curr_ap = bot_p.ap;
            let dist = curr_pos.distance(&target_enemy.pos);

            // Buscar un hechizo que cumpla rango y costo
            let matching_spell = bot_p.spells.iter()
                .filter(|s| !s.is_self_buff && !s.is_heal && s.ap_cost <= curr_ap)
                .find(|s| dist >= s.min_range && dist <= s.max_range && (!s.is_linear || curr_pos.is_linear(&target_enemy.pos)))
                .cloned();

            if let Some(spell) = matching_spell {
                if let Ok(res) = self.cast_spell(&active_id, &spell.id, target_enemy.pos) {
                    let game_over = res.is_game_over;
                    cast_results.push(res);
                    if game_over {
                        break;
                    }
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        Some((move_path, cast_results))
    }
}
