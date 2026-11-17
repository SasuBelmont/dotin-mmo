use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Position {
    pub x: i32,
    pub y: i32,
}

impl Position {
    pub fn new(x: i32, y: i32) -> Self {
        Self { x, y }
    }

    /// Manhattan distance (standard for grid games like Dofus)
    pub fn distance(&self, other: &Position) -> i32 {
        (self.x - other.x).abs() + (self.y - other.y).abs()
    }

    pub fn is_linear(&self, other: &Position) -> bool {
        self.x == other.x || self.y == other.y
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CharacterClass {
    Warrior, // Guerrero (Metin2: Cuerpo / Arahan)
    Sura,    // Sura (Metin2: Magia Negra / Hoja)
    Ninja,   // Ninja (Metin2: Asesino / Arco)
    Shaman,  // Chamán (Metin2: Dragón / Curación)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Spell {
    pub id: String,
    pub name: String,
    pub description: String,
    pub ap_cost: i32,
    pub min_range: i32,
    pub max_range: i32,
    pub requires_los: bool,
    pub is_linear: bool,
    pub base_damage_min: i32,
    pub base_damage_max: i32,
    pub is_heal: bool,
    pub is_self_buff: bool,
    pub effect_key: String, // e.g. "aura_sword", "three_way", "flame_strike"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Player {
    pub id: String,
    pub name: String,
    pub class: CharacterClass,
    pub pos: Position,
    pub hp: i32,
    pub max_hp: i32,
    pub ap: i32,
    pub max_ap: i32,
    pub pm: i32,
    pub max_pm: i32,
    pub kingdom: String, // "Jinno" (Azul) or "Shinsoo" (Rojo)
    pub team: u8,        // 0 or 1
    pub is_alive: bool,
    pub is_bot: bool,
    pub spells: Vec<Spell>,
    pub attack_buff_turns: i32,
    pub defense_buff_turns: i32,
    pub attack_bonus: i32,
    pub defense_bonus: i32,
}

impl Player {
    pub fn new(id: String, name: String, class: CharacterClass, pos: Position, team: u8, is_bot: bool) -> Self {
        let (max_hp, max_ap, max_pm, kingdom) = match (class, team) {
            (CharacterClass::Warrior, 0) => (150, 6, 3, "Jinno".to_string()),
            (CharacterClass::Warrior, _) => (150, 6, 3, "Shinsoo".to_string()),
            (CharacterClass::Sura, 0) => (130, 6, 3, "Jinno".to_string()),
            (CharacterClass::Sura, _) => (130, 6, 3, "Shinsoo".to_string()),
            (CharacterClass::Ninja, 0) => (120, 6, 4, "Jinno".to_string()),
            (CharacterClass::Ninja, _) => (120, 6, 4, "Shinsoo".to_string()),
            (CharacterClass::Shaman, 0) => (110, 7, 3, "Jinno".to_string()),
            (CharacterClass::Shaman, _) => (110, 7, 3, "Shinsoo".to_string()),
        };

        let spells = crate::game::spells::get_class_spells(class);

        Self {
            id,
            name,
            class,
            pos,
            hp: max_hp,
            max_hp,
            ap: max_ap,
            max_ap,
            pm: max_pm,
            max_pm,
            kingdom,
            team,
            is_alive: true,
            is_bot,
            spells,
            attack_buff_turns: 0,
            defense_buff_turns: 0,
            attack_bonus: 0,
            defense_bonus: 0,
        }
    }

    pub fn reset_turn_points(&mut self) {
        self.ap = self.max_ap;
        self.pm = self.max_pm;
        if self.attack_buff_turns > 0 {
            self.attack_buff_turns -= 1;
        }
        if self.defense_buff_turns > 0 {
            self.defense_buff_turns -= 1;
        }
    }
}
