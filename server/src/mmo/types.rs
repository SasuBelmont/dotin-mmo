use serde::{Deserialize, Serialize};
use crate::game::state::GameState;
use crate::game::types::CharacterClass;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Vec2 {
    pub x: f32,
    pub z: f32,
}

impl Vec2 {
    pub fn new(x: f32, z: f32) -> Self {
        Self { x, z }
    }

    pub fn distance(&self, other: &Vec2) -> f32 {
        ((self.x - other.x).powi(2) + (self.z - other.z).powi(2)).sqrt()
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ItemType {
    Weapon,
    Armor,
    Consumable,
    Material,
    SkillBook,
}

fn default_durability() -> u32 { 100 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Item {
    pub id: String,
    pub name: String,
    pub item_type: ItemType,
    pub upgrade_level: u8,
    pub attack_bonus: i32,
    pub defense_bonus: i32,
    pub hp_bonus: i32,
    pub buy_price: u32,
    pub icon: String,
    pub description: String,
    #[serde(default = "default_durability")]
    pub durability: u32,
    #[serde(default = "default_durability")]
    pub max_durability: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Quest {
    pub id: String,
    pub title: String,
    pub description: String,
    pub target_mob_type: String, // "wild_dog" o "metin_stone"
    pub target_count: u32,
    pub current_count: u32,
    pub reward_exp: u32,
    pub reward_yang: u32,
    pub reward_item: Option<Item>,
    pub is_completed: bool,
    pub is_turned_in: bool,
}

fn default_gender() -> String { "male".to_string() }
fn default_outfit() -> u8 { 1 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldPlayer {
    pub id: String,
    pub name: String,
    pub class: CharacterClass,
    pub kingdom: String,
    pub team: u8,
    pub pos: Vec2,
    pub target_pos: Option<Vec2>,
    pub speed: f32,
    pub level: u32,
    pub exp: u32,
    pub max_exp: u32,
    pub yang: u32,
    pub hp: i32,
    pub max_hp: i32,
    pub stat_points: u32,
    pub vit: u32,
    pub int_stat: u32,
    pub str_stat: u32,
    pub dex: u32,
    #[serde(default)]
    pub skill_points: u32,
    #[serde(default)]
    pub subclass: Option<String>,
    #[serde(default)]
    pub skill_levels: std::collections::HashMap<String, u8>,
    pub party_id: Option<String>,
    pub in_combat_id: Option<String>,
    pub inventory: Vec<Option<Item>>,
    pub equipped_weapon: Option<Item>,
    pub equipped_armor: Option<Item>,
    pub quests: Vec<Quest>,
    pub stash: Vec<Option<Item>>,
    pub stash_yang: u32,
    #[serde(default)]
    pub account_id: Option<i64>,
    #[serde(default = "default_gender")]
    pub gender: String,
    #[serde(default = "default_outfit")]
    pub outfit: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub enum GatherNodeType {
    Mining,
    Woodcutting,
    Fishing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldGatherNode {
    pub id: String,
    pub name: String,
    pub node_type: GatherNodeType,
    pub pos: Vec2,
    pub resource_name: String,
    pub is_depleted: bool,
    pub respawn_timer: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketListing {
    pub id: String,
    pub seller_id: String,
    pub seller_name: String,
    pub item: Item,
    pub price: u32,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CraftingRecipe {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub required_materials: Vec<(String, u32)>,
    pub required_yang: u32,
    pub result_item: Item,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldMob {
    pub id: String,
    pub name: String,
    pub mob_type: String, // "wild_dog", "wolf", "metin_stone"
    pub pos: Vec2,
    pub spawn_pos: Vec2,
    pub level: u32,
    pub hp: i32,
    pub max_hp: i32,
    pub is_alive: bool,
    pub in_combat_id: Option<String>,
    pub wander_target: Option<Vec2>,
    #[serde(default)]
    pub respawn_timer: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldNPC {
    pub id: String,
    pub name: String,
    pub title: String,
    pub pos: Vec2,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum CombatPhase {
    Preparation { countdown: f32 },
    Battle,
    Finished { winner_team: u8, exp_reward: u32, yang_reward: u32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveCombatMarker {
    pub combat_id: String,
    pub mob_name: String,
    pub leader_name: String,
    pub pos: Vec2,
    pub prep_time_left: f32,
    pub participants_count: usize,
    pub is_preparation: bool,
}

pub struct CombatRoom {
    pub id: String,
    pub mob_id: String,
    pub mob_name: String,
    pub mob_level: u32,
    pub leader_id: String,
    pub world_pos: Vec2,
    pub participant_ids: Vec<String>,
    pub phase: CombatPhase,
    pub game_state: GameState,
    pub turn_timer: f32, // Temporizador de turno (ej. 25s)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartyMemberInfo {
    pub id: String,
    pub name: String,
    pub level: u32,
    pub hp: i32,
    pub max_hp: i32,
    pub class: CharacterClass,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Party {
    pub id: String,
    pub leader_id: String,
    pub member_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopOffer {
    pub slot_index: usize,
    pub price: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShopItemListing {
    pub slot_index: usize,
    pub item: Item,
    pub price: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorldPrivateShop {
    pub seller_id: String,
    pub seller_name: String,
    pub title: String,
    pub pos: Vec2,
    pub items: Vec<ShopItemListing>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveTradeSession {
    pub trade_id: String,
    pub p1_id: String,
    pub p2_id: String,
    pub p1_items: Vec<Item>,
    pub p1_yang: u32,
    pub p1_locked: bool,
    pub p1_confirmed: bool,
    pub p2_items: Vec<Item>,
    pub p2_yang: u32,
    pub p2_locked: bool,
    pub p2_confirmed: bool,
}
