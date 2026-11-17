use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use crate::game::state::{GameStatus, GameState};
use crate::game::types::{CharacterClass, Position};
use super::types::{
    ActiveCombatMarker, ActiveTradeSession, CombatPhase, CombatRoom, CraftingRecipe,
    GatherNodeType, Item, ItemType, MarketListing, Party, PartyMemberInfo, Quest, ShopOffer, Vec2,
    WorldGatherNode, WorldMob, WorldNPC, WorldPlayer, WorldPrivateShop,
};

static COMBAT_COUNTER: AtomicUsize = AtomicUsize::new(1);
static ITEM_COUNTER: AtomicUsize = AtomicUsize::new(100);
static LISTING_COUNTER: AtomicUsize = AtomicUsize::new(1);

#[derive(Debug, Default)]
pub struct WorldTickEvents {
    pub battles_started: Vec<(String, GameState, String)>, // (combat_id, state, active_id)
    pub turns_timed_out: Vec<(String, String, u32)>,       // (combat_id, next_active_id, turn_count)
    pub finished_combats: Vec<(String, bool, u32, u32, Vec<Item>, Vec<String>)>, // (combat_id, is_victory, exp, yang, drops, participants)
}

pub struct WorldManager {
    pub players: HashMap<String, WorldPlayer>,
    pub mobs: Vec<WorldMob>,
    pub npcs: Vec<WorldNPC>,
    pub combats: HashMap<String, CombatRoom>,
    pub chat_history: Vec<String>,
    pub parties: HashMap<String, Party>,
    pub trades: HashMap<String, ActiveTradeSession>,
    pub private_shops: HashMap<String, WorldPrivateShop>,
    pub gather_nodes: Vec<WorldGatherNode>,
    pub market_listings: Vec<MarketListing>,
    pub crafting_recipes: Vec<CraftingRecipe>,
    pub world_time: f32,
}

impl WorldManager {
    pub fn new() -> Self {
        let mut mobs = Vec::new();

        // Mobs iniciales patrullando en los campos y laderas fuera de la aldea
        let mob_configs = [
            ("mob_1", "Perro Salvaje", "wild_dog", 1, Vec2::new(14.0, 32.0)),
            ("mob_2", "Perro Salvaje", "wild_dog", 1, Vec2::new(-14.0, 32.0)),
            ("mob_3", "Perro Salvaje", "wild_dog", 1, Vec2::new(32.0, -32.0)),
            ("mob_4", "Lobo Hambriento", "wolf", 3, Vec2::new(-34.0, -30.0)),
            ("mob_5", "Lobo Hambriento", "wolf", 3, Vec2::new(28.0, 26.0)),
            ("mob_6", "Lobo Alfa", "wolf", 5, Vec2::new(-32.0, 26.0)),
            ("mob_7", "Piedra Metin de Dolor", "metin_stone", 5, Vec2::new(0.0, 68.0)),
        ];

        for (id, name, m_type, lvl, pos) in mob_configs {
            let (m_hp, m_max_hp) = match m_type {
                "wild_dog" => (60, 60),
                "wolf" => (if lvl == 5 { 160 } else { 110 }, if lvl == 5 { 160 } else { 110 }),
                "metin_stone" => (260, 260),
                _ => (80, 80),
            };

            mobs.push(WorldMob {
                id: id.to_string(),
                name: name.to_string(),
                mob_type: m_type.to_string(),
                pos,
                spawn_pos: pos,
                level: lvl,
                hp: m_hp,
                max_hp: m_max_hp,
                is_alive: true,
                in_combat_id: None,
                wander_target: None,
                respawn_timer: 0.0,
            });
        }

        // NPCs de la Aldea
        let npcs = vec![
            WorldNPC {
                id: "npc_guardian".to_string(),
                name: "Guardián de la Aldea".to_string(),
                title: "Comandante".to_string(),
                pos: Vec2::new(0.0, -5.0),
            },
            WorldNPC {
                id: "npc_blacksmith".to_string(),
                name: "Herrero".to_string(),
                title: "Mejora de Equipamiento".to_string(),
                pos: Vec2::new(-12.0, 0.0),
            },
            WorldNPC {
                id: "npc_store".to_string(),
                name: "Vendedora".to_string(),
                title: "Pociones y Vituallas".to_string(),
                pos: Vec2::new(12.0, 0.0),
            },
            WorldNPC {
                id: "npc_storekeeper".to_string(),
                name: "Almacenero".to_string(),
                title: "Depósito Seguro y Yang".to_string(),
                pos: Vec2::new(-6.0, -10.0),
            },
            WorldNPC {
                id: "npc_market_board".to_string(),
                name: "Tablón de Mercado".to_string(),
                title: "Casa de Subastas Central".to_string(),
                pos: Vec2::new(6.0, -10.0),
            },
            WorldNPC {
                id: "npc_furnace".to_string(),
                name: "Horno de Fundición".to_string(),
                title: "Refinado y Crafteo".to_string(),
                pos: Vec2::new(-16.0, -2.0),
            },
        ];

        // Nodos de Recolección en el Valle
        let gather_nodes = vec![
            WorldGatherNode {
                id: "node_copper_1".to_string(),
                name: "Veta de Cobre".to_string(),
                node_type: GatherNodeType::Mining,
                pos: Vec2::new(26.0, -26.0),
                resource_name: "Mena de Cobre".to_string(),
                is_depleted: false,
                respawn_timer: 0.0,
            },
            WorldGatherNode {
                id: "node_copper_2".to_string(),
                name: "Veta de Cobre".to_string(),
                node_type: GatherNodeType::Mining,
                pos: Vec2::new(-26.0, -26.0),
                resource_name: "Mena de Cobre".to_string(),
                is_depleted: false,
                respawn_timer: 0.0,
            },
            WorldGatherNode {
                id: "node_iron_1".to_string(),
                name: "Veta de Hierro".to_string(),
                node_type: GatherNodeType::Mining,
                pos: Vec2::new(34.0, -8.0),
                resource_name: "Mena de Hierro".to_string(),
                is_depleted: false,
                respawn_timer: 0.0,
            },
            WorldGatherNode {
                id: "node_iron_2".to_string(),
                name: "Veta de Hierro".to_string(),
                node_type: GatherNodeType::Mining,
                pos: Vec2::new(-34.0, -8.0),
                resource_name: "Mena de Hierro".to_string(),
                is_depleted: false,
                respawn_timer: 0.0,
            },
            WorldGatherNode {
                id: "node_ebony_1".to_string(),
                name: "Veta de Ébano".to_string(),
                node_type: GatherNodeType::Mining,
                pos: Vec2::new(32.0, 22.0),
                resource_name: "Mena de Ébano".to_string(),
                is_depleted: false,
                respawn_timer: 0.0,
            },
            WorldGatherNode {
                id: "node_wood_1".to_string(),
                name: "Sauce Místico".to_string(),
                node_type: GatherNodeType::Woodcutting,
                pos: Vec2::new(-28.0, 22.0),
                resource_name: "Madera de Sauce".to_string(),
                is_depleted: false,
                respawn_timer: 0.0,
            },
            WorldGatherNode {
                id: "node_wood_2".to_string(),
                name: "Pino Antiguo".to_string(),
                node_type: GatherNodeType::Woodcutting,
                pos: Vec2::new(22.0, 32.0),
                resource_name: "Madera de Sauce".to_string(),
                is_depleted: false,
                respawn_timer: 0.0,
            },
            WorldGatherNode {
                id: "node_fish_1".to_string(),
                name: "Orilla de Pesca Oeste".to_string(),
                node_type: GatherNodeType::Fishing,
                pos: Vec2::new(-24.0, 46.2),
                resource_name: "Carpa Plateada".to_string(),
                is_depleted: false,
                respawn_timer: 0.0,
            },
            WorldGatherNode {
                id: "node_fish_2".to_string(),
                name: "Muelle de Pesca Central".to_string(),
                node_type: GatherNodeType::Fishing,
                pos: Vec2::new(-8.0, 48.5),
                resource_name: "Carpa Dorada".to_string(),
                is_depleted: false,
                respawn_timer: 0.0,
            },
            WorldGatherNode {
                id: "node_fish_3".to_string(),
                name: "Orilla de Pesca Este".to_string(),
                node_type: GatherNodeType::Fishing,
                pos: Vec2::new(16.0, 46.2),
                resource_name: "Carpa Dorada".to_string(),
                is_depleted: false,
                respawn_timer: 0.0,
            },
        ];

        let market_listings = vec![
            MarketListing {
                id: "mkt_init_1".to_string(),
                seller_id: "npc_trader".to_string(),
                seller_name: "Caravana Jinno".to_string(),
                item: Item {
                    id: "mkt_item_1".to_string(),
                    name: "Lingote de Hierro".to_string(),
                    item_type: ItemType::Material,
                    upgrade_level: 0,
                    attack_bonus: 0,
                    defense_bonus: 0,
                    hp_bonus: 0,
                    buy_price: 350,
                    icon: "⛓️".to_string(),
                    description: "Lingote refinado de alta pureza para crafteo de armas.".to_string(),
                    durability: 100,
                    max_durability: 100,
                },
                price: 350,
                created_at: 0,
            },
            MarketListing {
                id: "mkt_init_2".to_string(),
                seller_id: "npc_trader".to_string(),
                seller_name: "Maestro Pescador".to_string(),
                item: Item {
                    id: "mkt_item_2".to_string(),
                    name: "Elixir de Carpa Asada".to_string(),
                    item_type: ItemType::Consumable,
                    upgrade_level: 0,
                    attack_bonus: 0,
                    defense_bonus: 0,
                    hp_bonus: 300,
                    buy_price: 280,
                    icon: "🐟".to_string(),
                    description: "Pescado nutritivo preparado al fuego. Restaura 300 HP.".to_string(),
                    durability: 100,
                    max_durability: 100,
                },
                price: 280,
                created_at: 0,
            },
        ];

        let crafting_recipes = vec![
            CraftingRecipe {
                id: "refine_iron".to_string(),
                name: "Fundir Lingote de Hierro".to_string(),
                description: "Funde 4 menas de hierro en un lingote purificado.".to_string(),
                category: "smelting".to_string(),
                required_materials: vec![("Mena de Hierro".to_string(), 4)],
                required_yang: 200,
                result_item: Item {
                    id: "ingot_iron".to_string(),
                    name: "Lingote de Hierro".to_string(),
                    item_type: ItemType::Material,
                    upgrade_level: 0,
                    attack_bonus: 0,
                    defense_bonus: 0,
                    hp_bonus: 0,
                    buy_price: 300,
                    icon: "⛓️".to_string(),
                    description: "Hierro templado de alta resistencia.".to_string(),
                    durability: 100,
                    max_durability: 100,
                },
            },
            CraftingRecipe {
                id: "refine_copper".to_string(),
                name: "Fundir Lingote de Cobre".to_string(),
                description: "Funde 4 menas de cobre en un lingote maleable.".to_string(),
                category: "smelting".to_string(),
                required_materials: vec![("Mena de Cobre".to_string(), 4)],
                required_yang: 150,
                result_item: Item {
                    id: "ingot_copper".to_string(),
                    name: "Lingote de Cobre".to_string(),
                    item_type: ItemType::Material,
                    upgrade_level: 0,
                    attack_bonus: 0,
                    defense_bonus: 0,
                    hp_bonus: 0,
                    buy_price: 200,
                    icon: "🟧".to_string(),
                    description: "Cobre refinado listo para armaduras ligeras.".to_string(),
                    durability: 100,
                    max_durability: 100,
                },
            },
            CraftingRecipe {
                id: "refine_ebony".to_string(),
                name: "Fundir Lingote de Ébano".to_string(),
                description: "Funde 3 menas de ébano oscuro en metal de élite.".to_string(),
                category: "smelting".to_string(),
                required_materials: vec![("Mena de Ébano".to_string(), 3)],
                required_yang: 400,
                result_item: Item {
                    id: "ingot_ebony".to_string(),
                    name: "Lingote de Ébano".to_string(),
                    item_type: ItemType::Material,
                    upgrade_level: 0,
                    attack_bonus: 0,
                    defense_bonus: 0,
                    hp_bonus: 0,
                    buy_price: 600,
                    icon: "⬛".to_string(),
                    description: "Metal oscuro de grado militar para equipamiento avanzado.".to_string(),
                    durability: 100,
                    max_durability: 100,
                },
            },
            CraftingRecipe {
                id: "craft_plank".to_string(),
                name: "Cepillar Tablón de Sauce".to_string(),
                description: "Procesa 3 maderas de sauce en tablones pulidos.".to_string(),
                category: "wood".to_string(),
                required_materials: vec![("Madera de Sauce".to_string(), 3)],
                required_yang: 100,
                result_item: Item {
                    id: "plank_wood".to_string(),
                    name: "Tablón de Sauce Pulido".to_string(),
                    item_type: ItemType::Material,
                    upgrade_level: 0,
                    attack_bonus: 0,
                    defense_bonus: 0,
                    hp_bonus: 0,
                    buy_price: 150,
                    icon: "🪵".to_string(),
                    description: "Tablón ligero y flexible para mangos y empuñaduras.".to_string(),
                    durability: 100,
                    max_durability: 100,
                },
            },
            CraftingRecipe {
                id: "craft_elixir".to_string(),
                name: "Cocinar Carpa Asada".to_string(),
                description: "Cocina 2 carpas doradas en las brasas del horno.".to_string(),
                category: "alchemy".to_string(),
                required_materials: vec![("Carpa Dorada".to_string(), 2)],
                required_yang: 150,
                result_item: Item {
                    id: "food_carp".to_string(),
                    name: "Elixir de Carpa Asada".to_string(),
                    item_type: ItemType::Consumable,
                    upgrade_level: 0,
                    attack_bonus: 0,
                    defense_bonus: 0,
                    hp_bonus: 300,
                    buy_price: 250,
                    icon: "🐟".to_string(),
                    description: "Restaura 300 HP de golpe en o fuera de combate.".to_string(),
                    durability: 100,
                    max_durability: 100,
                },
            },
            CraftingRecipe {
                id: "craft_fms".to_string(),
                name: "Forjar Espada de Luna Llena (FMS)".to_string(),
                description: "Forja la legendaria espada curva con acero y ébano.".to_string(),
                category: "forge".to_string(),
                required_materials: vec![
                    ("Lingote de Hierro".to_string(), 2),
                    ("Lingote de Ébano".to_string(), 1),
                    ("Tablón de Sauce Pulido".to_string(), 1),
                ],
                required_yang: 2500,
                result_item: Item {
                    id: "crafted_fms".to_string(),
                    name: "Espada de Luna Llena".to_string(),
                    item_type: ItemType::Weapon,
                    upgrade_level: 0,
                    attack_bonus: 24,
                    defense_bonus: 0,
                    hp_bonus: 0,
                    buy_price: 2000,
                    icon: "🌙".to_string(),
                    description: "Legendaria hoja lunar con filo de media luna. +24 Daño.".to_string(),
                    durability: 100,
                    max_durability: 100,
                },
            },
            CraftingRecipe {
                id: "craft_dragon_armor".to_string(),
                name: "Forjar Armadura de Placas Dragón".to_string(),
                description: "Forja la coraza carmesí con placas de ébano y cobre.".to_string(),
                category: "forge".to_string(),
                required_materials: vec![
                    ("Lingote de Ébano".to_string(), 2),
                    ("Lingote de Cobre".to_string(), 2),
                ],
                required_yang: 3000,
                result_item: Item {
                    id: "crafted_dragon_armor".to_string(),
                    name: "Armadura de Placas Dragón".to_string(),
                    item_type: ItemType::Armor,
                    upgrade_level: 0,
                    attack_bonus: 0,
                    defense_bonus: 18,
                    hp_bonus: 100,
                    buy_price: 3500,
                    icon: "🐉".to_string(),
                    description: "Coraza imperial con hombreras doradas reforzadas. +18 Def, +100 HP.".to_string(),
                    durability: 100,
                    max_durability: 100,
                },
            },
        ];

        Self {
            players: HashMap::new(),
            mobs,
            npcs,
            combats: HashMap::new(),
            chat_history: vec!["¡Bienvenidos a la Aldea 1 de Dotin!".to_string()],
            parties: HashMap::new(),
            trades: HashMap::new(),
            private_shops: HashMap::new(),
            gather_nodes,
            market_listings,
            crafting_recipes,
            world_time: 0.0,
        }
    }

    pub fn add_player(&mut self, id: String, name: String, class: CharacterClass, team: u8) {
        let kingdom = if team == 0 { "Jinno".to_string() } else { "Shinsoo".to_string() };
        let offset = (self.players.len() as f32) * 1.5;
        let pos = Vec2::new(-3.0 + offset, 2.0);

        let max_hp = match class {
            CharacterClass::Warrior => 160,
            CharacterClass::Sura => 140,
            CharacterClass::Ninja => 130,
            CharacterClass::Shaman => 120,
        };

        let mut inventory: Vec<Option<Item>> = vec![None; 20];
        let (weapon_id, weapon_name, weapon_icon, weapon_desc) = match class {
            CharacterClass::Warrior => (
                "starter_sword_warrior".to_string(),
                "Espada +0".to_string(),
                "/assets/icons/item/00010.png".to_string(),
                "Espada tradicional de principiante (+0). El filo básico del guerrero.".to_string(),
            ),
            CharacterClass::Sura => (
                "starter_sword_sura".to_string(),
                "Espada +0".to_string(),
                "/assets/icons/item/00010.png".to_string(),
                "Espada inicial recta para Sura (+0). Canaliza poder espiritual.".to_string(),
            ),
            CharacterClass::Ninja => (
                "starter_dagger_ninja".to_string(),
                "Dagas +0".to_string(),
                "/assets/icons/item/01000.png".to_string(),
                "Par de dagas iniciales de aprendiz Ninja (+0). Ligeras y punzantes.".to_string(),
            ),
            CharacterClass::Shaman => (
                "starter_fan_shaman".to_string(),
                "Abanico +0".to_string(),
                "/assets/icons/item/07000.png".to_string(),
                "Abanico tradicional de seda inicial para Chamán (+0). Canaliza bendiciones.".to_string(),
            ),
        };

        let starter_weapon = Item {
            id: weapon_id,
            name: weapon_name,
            item_type: ItemType::Weapon,
            upgrade_level: 0,
            attack_bonus: 10,
            defense_bonus: 0,
            hp_bonus: 0,
            buy_price: 100,
            icon: weapon_icon,
            description: weapon_desc,
                    durability: 100,
                    max_durability: 100,
        };
        inventory[0] = Some(Item {
            id: "starter_pot_1".to_string(),
            name: "Poción Roja (P)".to_string(),
            item_type: ItemType::Consumable,
            upgrade_level: 0,
            attack_bonus: 0,
            defense_bonus: 0,
            hp_bonus: 60,
            buy_price: 50,
            icon: "/assets/icons/item/27001.png".to_string(),
            description: "Restaura 60 HP al instante.".to_string(),
                    durability: 100,
                    max_durability: 100,
        });
        inventory[1] = Some(Item {
            id: "starter_pot_2".to_string(),
            name: "Poción Roja (P)".to_string(),
            item_type: ItemType::Consumable,
            upgrade_level: 0,
            attack_bonus: 0,
            defense_bonus: 0,
            hp_bonus: 60,
            buy_price: 50,
            icon: "/assets/icons/item/27001.png".to_string(),
            description: "Restaura 60 HP al instante.".to_string(),
                    durability: 100,
                    max_durability: 100,
        });
        inventory[2] = Some(Item {
            id: "starter_pot_blue_1".to_string(),
            name: "Poción Azul (P)".to_string(),
            item_type: ItemType::Consumable,
            upgrade_level: 0,
            attack_bonus: 0,
            defense_bonus: 0,
            hp_bonus: 40,
            buy_price: 60,
            icon: "/assets/icons/item/27004.png".to_string(),
            description: "Restaura 40 MP al instante.".to_string(),
                    durability: 100,
                    max_durability: 100,
        });
        inventory[3] = Some(Item {
            id: "starter_pot_blue_2".to_string(),
            name: "Poción Azul (P)".to_string(),
            item_type: ItemType::Consumable,
            upgrade_level: 0,
            attack_bonus: 0,
            defense_bonus: 0,
            hp_bonus: 40,
            buy_price: 60,
            icon: "/assets/icons/item/27004.png".to_string(),
            description: "Restaura 40 MP al instante.".to_string(),
                    durability: 100,
                    max_durability: 100,
        });
        inventory[4] = Some(Item {
            id: "starter_pickaxe".to_string(),
            name: "Pico de Minero".to_string(),
            item_type: ItemType::Material,
            upgrade_level: 0,
            attack_bonus: 2,
            defense_bonus: 0,
            hp_bonus: 0,
            buy_price: 150,
            icon: "/assets/icons/item/29101.png".to_string(),
            description: "Herramienta básica para extraer minerales de las vetas del valle.".to_string(),
            durability: 100,
            max_durability: 100,
        });

        let quests = vec![
            Quest {
                id: "quest_wild_dogs".to_string(),
                title: "Caza de Bestias".to_string(),
                description: "Derrota a 3 Perros Salvajes para proteger la Aldea 1.".to_string(),
                target_mob_type: "wild_dog".to_string(),
                target_count: 3,
                current_count: 0,
                reward_exp: 500,
                reward_yang: 750,
                reward_item: Some(Item {
                    id: "reward_fms".to_string(),
                    name: "Espada de Luna Llena".to_string(),
                    item_type: ItemType::Weapon,
                    upgrade_level: 0,
                    attack_bonus: 24,
                    defense_bonus: 0,
                    hp_bonus: 0,
                    buy_price: 1200,
                    icon: "🗡️".to_string(),
                    description: "Espada legendaria con media de habilidad. +24 Daño.".to_string(),
                    durability: 100,
                    max_durability: 100,
                }),
                is_completed: false,
                is_turned_in: false,
            },
            Quest {
                id: "quest_metin_stone".to_string(),
                title: "La Amenaza Metin".to_string(),
                description: "Destruye la Piedra Metin de Dolor al norte de la aldea.".to_string(),
                target_mob_type: "metin_stone".to_string(),
                target_count: 1,
                current_count: 0,
                reward_exp: 1500,
                reward_yang: 2000,
                reward_item: Some(Item {
                    id: "reward_iron_armor".to_string(),
                    name: "Armadura de Placas de Hierro".to_string(),
                    item_type: ItemType::Armor,
                    upgrade_level: 3,
                    attack_bonus: 0,
                    defense_bonus: 14,
                    hp_bonus: 90,
                    buy_price: 2500,
                    icon: "🦺".to_string(),
                    description: "Poderosa armadura de infantería pesada. +14 Def, +90 HP.".to_string(),
                    durability: 100,
                    max_durability: 100,
                }),
                is_completed: false,
                is_turned_in: false,
            },
        ];

        let player = WorldPlayer {
            id: id.clone(),
            name: name.clone(),
            class,
            kingdom,
            team,
            pos,
            target_pos: None,
            speed: 7.5, // 7.5 unidades por segundo en el overworld
            level: 1,
            exp: 0,
            max_exp: 100,
            yang: 250,
            skill_points: 0,
            subclass: None,
            skill_levels: std::collections::HashMap::new(),
            hp: max_hp,
            max_hp,
            stat_points: 0,
            vit: 10,
            int_stat: 10,
            str_stat: 10,
            dex: 10,
            party_id: None,
            in_combat_id: None,
            inventory,
            equipped_weapon: Some(starter_weapon),
            equipped_armor: None,
            quests,
            stash: vec![None; 24],
            stash_yang: 0,
            account_id: None,
            gender: "male".to_string(),
            outfit: 1,
        };

        self.players.insert(id, player);
        self.chat_history.push(format!("{} ha entrado al reino.", name));
    }

    pub fn add_existing_player(&mut self, mut player: WorldPlayer, id: String) {
        player.id = id.clone();
        player.target_pos = None;
        player.in_combat_id = None;
        player.party_id = None;
        let name = player.name.clone();
        self.players.insert(id, player);
        self.chat_history.push(format!("{} ha entrado al reino.", name));
    }

    pub fn remove_player(&mut self, id: &str) -> Option<WorldPlayer> {
        self.private_shops.remove(id);
        if let Some(party_id) = self.players.get(id).and_then(|p| p.party_id.clone()) {
            if let Some(party) = self.parties.get_mut(&party_id) {
                party.member_ids.retain(|m| m != id);
            }
        }
        let removed = self.players.remove(id);
        if let Some(ref p) = removed {
            self.chat_history.push(format!("{} se ha desconectado.", p.name));
            // Si estaba en combate, remover de la sala
            if let Some(combat_id) = &p.in_combat_id {
                if let Some(room) = self.combats.get_mut(combat_id) {
                    room.game_state.players.retain(|gp| gp.id != id);
                    room.participant_ids.retain(|p_id| p_id != id);
                }
            }
        }
        removed
    }

    pub fn clamp_bounds(pos: Vec2) -> Vec2 {
        let is_north_corridor = pos.x.abs() <= 5.0 && pos.z <= -50.0;
        let is_east_corridor = pos.z.abs() <= 5.0 && pos.x >= 50.0;

        if is_north_corridor {
            Vec2::new(pos.x.clamp(-4.8, 4.8), pos.z.clamp(-63.0, -50.0))
        } else if is_east_corridor {
            Vec2::new(pos.x.clamp(50.0, 63.0), pos.z.clamp(-4.8, 4.8))
        } else {
            Vec2::new(pos.x.clamp(-55.0, 55.0), pos.z.clamp(-55.0, 72.0))
        }
    }

    pub fn set_player_destination(&mut self, player_id: &str, target: Vec2) {
        if let Some(p) = self.players.get_mut(player_id) {
            if p.in_combat_id.is_none() {
                p.target_pos = Some(Self::clamp_bounds(target));
            }
        }
    }

    pub fn sync_player_position(&mut self, player_id: &str, pos: Vec2, target: Option<Vec2>) {
        if let Some(p) = self.players.get_mut(player_id) {
            if p.in_combat_id.is_none() {
                p.pos = Self::clamp_bounds(pos);
                p.target_pos = target.map(Self::clamp_bounds);
            }
        }
    }

    pub fn start_combat_with_mob(&mut self, player_id: &str, mob_id: &str) -> Result<String, String> {
        let player = self.players.get(player_id).ok_or("Jugador no encontrado")?;
        if player.in_combat_id.is_some() {
            return Err("Ya estás en combate".to_string());
        }

        let mob = self.mobs.iter().find(|m| m.id == mob_id).ok_or("Monstruo no encontrado")?;
        if !mob.is_alive {
            return Err("Este monstruo ya ha sido derrotado".to_string());
        }
        if mob.in_combat_id.is_some() {
            return Err("Este monstruo ya está en combate con otro grupo".to_string());
        }

        if player.pos.distance(&mob.pos) > 6.0 {
            return Err("Estás demasiado lejos del monstruo para iniciar combate".to_string());
        }

        let combat_id = format!("combat_{}", COMBAT_COUNTER.fetch_add(1, Ordering::Relaxed));
        let mob_name = mob.name.clone();
        let mob_lvl = mob.level;
        let mob_type = mob.mob_type.clone();
        let mob_world_pos = mob.pos;
        let player_name = player.name.clone();
        let player_class = player.class;

        // Construir instancia de GameState para el combate por turnos
        let mut battle_state = GameState::new();
        // Equipo 0: Jugadores (Aliados)
        battle_state.add_player(player_id.to_string(), player_name.clone(), player_class, 0, false)?;
        if player.level >= 5 {
            battle_state.set_player_spells(player_id, crate::game::spells::get_subclass_spells(player_class, "corporal"));
        }

        // Equipo 1: Monstruo (Bot con clase y stats acordes)
        let bot_class = match mob_type.as_str() {
            "wild_dog" => CharacterClass::Ninja,
            "wolf" => CharacterClass::Warrior,
            "metin_stone" => CharacterClass::Sura,
            _ => CharacterClass::Warrior,
        };
        let bot_id = format!("bot_{}", mob_id);
        battle_state.add_player(bot_id.clone(), mob_name.clone(), bot_class, 1, true)?;

        // Aplicar bonificaciones de equipo del héroe al combate
        let (bonus_atk, bonus_def, bonus_hp) = {
            let p = self.players.get(player_id).unwrap();
            let atk = p.equipped_weapon.as_ref().map(|w| w.attack_bonus).unwrap_or(0);
            let def = p.equipped_armor.as_ref().map(|a| a.defense_bonus).unwrap_or(0);
            let hp = p.equipped_armor.as_ref().map(|a| a.hp_bonus).unwrap_or(0);
            (atk, def, hp)
        };

        if let Some(combat_p) = battle_state.players.iter_mut().find(|p| p.id == player_id) {
            combat_p.attack_bonus = bonus_atk;
            combat_p.defense_bonus = bonus_def;
            combat_p.max_hp += bonus_hp;
            combat_p.hp = combat_p.max_hp;
            combat_p.gender = Some(player.gender.clone());
            combat_p.outfit = Some(player.outfit);
        }

        // Asignar vida y atributos precisos al monstruo según su tipo
        if let Some(bot_p) = battle_state.players.iter_mut().find(|p| p.id == bot_id) {
            match mob_type.as_str() {
                "wild_dog" => {
                    bot_p.max_hp = 60;
                    bot_p.hp = 60;
                }
                "wolf" => {
                    let hp = if mob_lvl >= 5 { 160 } else { 110 };
                    bot_p.max_hp = hp;
                    bot_p.hp = hp;
                }
                "metin_stone" => {
                    bot_p.max_hp = 260;
                    bot_p.hp = 260;
                    bot_p.max_pm = 0;
                    bot_p.pm = 0;
                    bot_p.max_ap = 0;
                    bot_p.ap = 0;
                    bot_p.spells.clear(); // La Piedra Metin no ataca directamente, solo invoca esbirros
                }
                _ => {}
            }
        }

        // Si el jugador está en un grupo (Party), sus compañeros se unen automáticamente al combate
        let mut participants = vec![player_id.to_string()];
        if let Some(ref party_id) = player.party_id {
            if let Some(party) = self.parties.get(party_id) {
                for member_id in &party.member_ids {
                    if member_id != player_id {
                        if let Some(m) = self.players.get_mut(member_id) {
                            if m.in_combat_id.is_none() {
                                m.in_combat_id = Some(combat_id.clone());
                                participants.push(member_id.clone());
                                let _ = battle_state.add_player(member_id.clone(), m.name.clone(), m.class, 0, false);
                                if let Some(combat_m) = battle_state.players.iter_mut().find(|p| p.id == *member_id) {
                                    combat_m.gender = Some(m.gender.clone());
                                    combat_m.outfit = Some(m.outfit);
                                }
                            }
                        }
                    }
                }
            }
        }

        let room = CombatRoom {
            id: combat_id.clone(),
            mob_id: mob_id.to_string(),
            mob_name: mob_name.clone(),
            mob_level: mob_lvl,
            leader_id: player_id.to_string(),
            world_pos: mob_world_pos,
            participant_ids: participants,
            phase: CombatPhase::Preparation { countdown: 6.0 }, // 6 segundos de preparación o inicio instantáneo
            game_state: battle_state,
            turn_timer: 25.0,
        };

        // Marcar jugador y mob
        self.players.get_mut(player_id).unwrap().in_combat_id = Some(combat_id.clone());
        self.mobs.iter_mut().find(|m| m.id == mob_id).unwrap().in_combat_id = Some(combat_id.clone());

        self.chat_history.push(format!("⚔️ ¡{} retó a [{}]! Fase de preparación iniciada (12s para unirse).", player_name, mob_name));
        self.combats.insert(combat_id.clone(), room);

        Ok(combat_id)
    }

    pub fn join_combat_instance(&mut self, player_id: &str, combat_id: &str) -> Result<(), String> {
        let player = self.players.get(player_id).ok_or("Jugador no encontrado")?;
        if player.in_combat_id.is_some() {
            return Err("Ya estás en un combate".to_string());
        }

        let player_name = player.name.clone();
        let player_class = player.class;

        let room = self.combats.get_mut(combat_id).ok_or("Combate no encontrado")?;

        match room.phase {
            CombatPhase::Preparation { .. } => {
                if room.participant_ids.len() >= 4 {
                    return Err("El grupo ya está lleno (máximo 4 jugadores)".to_string());
                }
                // Añadir al combate
                room.game_state.add_player(player_id.to_string(), player_name.clone(), player_class, 0, false)?;
                if let Some(combat_p) = room.game_state.players.iter_mut().find(|p| p.id == player_id) {
                    combat_p.gender = Some(player.gender.clone());
                    combat_p.outfit = Some(player.outfit);
                }
                if player.level >= 5 {
                    room.game_state.set_player_spells(player_id, crate::game::spells::get_subclass_spells(player_class, "corporal"));
                }
                room.participant_ids.push(player_id.to_string());

                self.players.get_mut(player_id).unwrap().in_combat_id = Some(combat_id.to_string());
                self.chat_history.push(format!("🛡️ {} se unió al combate contra [{}].", player_name, room.mob_name));
                Ok(())
            }
            _ => Err("El combate ya comenzó o ha terminado".to_string()),
        }
    }

    pub fn start_combat_now(&mut self, player_id: &str, combat_id: &str) -> Result<String, String> {
        let room = self.combats.get_mut(combat_id).ok_or("Combate no encontrado")?;
        if room.leader_id != player_id {
            return Err("Solo el líder del combate puede forzar el inicio".to_string());
        }

        room.phase = CombatPhase::Battle;
        room.game_state.start_battle();
        room.turn_timer = 25.0;
        let active_id = room.game_state.current_player_id().cloned().unwrap_or_default();
        self.chat_history.push(format!("⚔️ ¡Comienza el combate táctico contra [{}]!", room.mob_name));
        Ok(active_id)
    }

    pub fn start_duel(&mut self, p1_id: &str, p2_id: &str) -> Result<String, String> {
        let p1 = self.players.get(p1_id).ok_or("Jugador 1 no encontrado")?;
        let p2 = self.players.get(p2_id).ok_or("Jugador 2 no encontrado")?;

        if p1.in_combat_id.is_some() || p2.in_combat_id.is_some() {
            return Err("Uno de los jugadores ya está en combate".to_string());
        }

        let combat_id = format!("duel_{}", COMBAT_COUNTER.fetch_add(1, Ordering::Relaxed));
        let p1_name = p1.name.clone();
        let p1_class = p1.class;
        let p2_name = p2.name.clone();
        let p2_class = p2.class;

        let mut battle_state = GameState::new();
        // Equipo 0: Jugador 1
        battle_state.add_player(p1_id.to_string(), p1_name.clone(), p1_class, 0, false)?;
        // Equipo 1: Jugador 2
        battle_state.add_player(p2_id.to_string(), p2_name.clone(), p2_class, 1, false)?;

        // Aplicar bonificaciones de equipo
        for pid in [p1_id, p2_id] {
            let p = self.players.get(pid).unwrap();
            let atk = p.equipped_weapon.as_ref().map(|w| w.attack_bonus).unwrap_or(0);
            let def = p.equipped_armor.as_ref().map(|a| a.defense_bonus).unwrap_or(0);
            let hp = p.equipped_armor.as_ref().map(|a| a.hp_bonus).unwrap_or(0);

            if let Some(fighter) = battle_state.players.iter_mut().find(|f| f.id == pid) {
                fighter.attack_bonus = atk;
                fighter.defense_bonus = def;
                fighter.max_hp += hp;
                fighter.hp = fighter.max_hp;
                fighter.gender = Some(p.gender.clone());
                fighter.outfit = Some(p.outfit);
            }
        }

        // Posicionar a los duelistas en extremos opuestos del tablero táctico (14x10)
        if let Some(f1) = battle_state.players.iter_mut().find(|f| f.id == p1_id) {
            f1.pos = Position { x: 3, y: 5 };
        }
        if let Some(f2) = battle_state.players.iter_mut().find(|f| f.id == p2_id) {
            f2.pos = Position { x: 10, y: 5 };
        }

        battle_state.start_battle();

        let room = CombatRoom {
            id: combat_id.clone(),
            mob_id: "duel".to_string(),
            mob_name: format!("Duelo: {} vs {}", p1_name, p2_name),
            mob_level: 1,
            leader_id: p1_id.to_string(),
            world_pos: Vec2::new(0.0, 0.0),
            participant_ids: vec![p1_id.to_string(), p2_id.to_string()],
            phase: CombatPhase::Battle,
            game_state: battle_state,
            turn_timer: 25.0,
        };

        self.players.get_mut(p1_id).unwrap().in_combat_id = Some(combat_id.clone());
        self.players.get_mut(p2_id).unwrap().in_combat_id = Some(combat_id.clone());

        self.chat_history.push(format!("⚔️ ¡HA COMENZADO UN DUELO DE HONOR entre {} y {}!", p1_name, p2_name));
        self.combats.insert(combat_id.clone(), room);

        Ok(combat_id)
    }

    pub fn get_active_markers(&self) -> Vec<ActiveCombatMarker> {
        self.combats
            .values()
            .map(|r| {
                let prep_time = match r.phase {
                    CombatPhase::Preparation { countdown } => countdown,
                    _ => 0.0,
                };
                let leader_name = self.players.get(&r.leader_id).map(|p| p.name.clone()).unwrap_or_else(|| "Líder".to_string());

                ActiveCombatMarker {
                    combat_id: r.id.clone(),
                    mob_name: r.mob_name.clone(),
                    leader_name,
                    pos: r.world_pos,
                    prep_time_left: prep_time,
                    participants_count: r.participant_ids.len(),
                    is_preparation: matches!(r.phase, CombatPhase::Preparation { .. }),
                }
            })
            .collect()
    }

    pub fn update(&mut self, delta: f32) -> WorldTickEvents {
        let mut events = WorldTickEvents::default();

        // 0. Regeneración de nodos de recolección agotados (Vetas, Árboles, Pesca)
        for node in self.gather_nodes.iter_mut() {
            if node.is_depleted {
                node.respawn_timer -= delta;
                if node.respawn_timer <= 0.0 {
                    node.is_depleted = false;
                    node.respawn_timer = 0.0;
                }
            }
        }

        // 1. Movimiento de jugadores en el overworld
        for player in self.players.values_mut() {
            if player.in_combat_id.is_some() {
                continue;
            }
            if let Some(target) = player.target_pos {
                let dist = player.pos.distance(&target);
                let step = player.speed * delta;
                if dist <= step {
                    player.pos = target;
                    player.target_pos = None;
                } else {
                    let dir_x = (target.x - player.pos.x) / dist;
                    let dir_z = (target.z - player.pos.z) / dist;
                    player.pos.x += dir_x * step;
                    player.pos.z += dir_z * step;
                }
            }
        }

        self.world_time += delta;

        // 1.5. Respawn de monstruos derrotados en el overworld
        for mob in self.mobs.iter_mut() {
            if !mob.is_alive {
                mob.respawn_timer -= delta;
                if mob.respawn_timer <= 0.0 {
                    mob.is_alive = true;
                    mob.hp = mob.max_hp;
                    mob.pos = mob.spawn_pos;
                    mob.in_combat_id = None;
                    mob.respawn_timer = 0.0;
                }
            }
        }

        // 2. Patrulla aleatoria y merodeo de los mobs que no están en combate
        for (i, mob) in self.mobs.iter_mut().enumerate() {
            if !mob.is_alive || mob.in_combat_id.is_some() || mob.mob_type == "metin_stone" {
                continue;
            }

            // Pseudo-random timing por mob
            let mob_phase = (self.world_time * 0.4 + (i as f32) * 1.7).sin();
            let d_spawn = mob.pos.distance(&mob.spawn_pos);

            // Si está muy lejos de su spawn, regresar
            if d_spawn > 7.0 {
                let dir_x = (mob.spawn_pos.x - mob.pos.x) / d_spawn;
                let dir_z = (mob.spawn_pos.z - mob.pos.z) / d_spawn;
                mob.pos.x += dir_x * 2.0 * delta;
                mob.pos.z += dir_z * 2.0 * delta;
                continue;
            }

            // Si el temporizador de fase activa merodeo (camina intermitentemente)
            if mob_phase > 0.25 {
                let angle = (self.world_time * 0.2 + (i as f32) * 2.3).sin() * std::f32::consts::PI;
                let target_x = mob.spawn_pos.x + angle.cos() * 4.5;
                let target_z = mob.spawn_pos.z + angle.sin() * 4.5;
                let dx = target_x - mob.pos.x;
                let dz = target_z - mob.pos.z;
                let d = (dx * dx + dz * dz).sqrt();
                if d > 0.2 {
                    mob.pos.x += (dx / d) * 1.6 * delta;
                    mob.pos.z += (dz / d) * 1.6 * delta;
                }
            }
        }

        // 3. Actualizar fases de combate y temporizadores
        let mut finished_combats = Vec::new();

        for (c_id, room) in self.combats.iter_mut() {
            match &mut room.phase {
                CombatPhase::Preparation { countdown } => {
                    *countdown -= delta;
                    if *countdown <= 0.0 {
                        room.phase = CombatPhase::Battle;
                        room.game_state.start_battle();
                        room.turn_timer = 25.0;
                        let active_id = room.game_state.current_player_id().cloned().unwrap_or_default();
                        events.battles_started.push((c_id.clone(), room.game_state.clone(), active_id));
                    }
                }
                CombatPhase::Battle => {
                    // Si el GameState detectó Game Over
                    if let GameStatus::GameOver { winner_team, .. } = room.game_state.status {
                        let exp_rew = room.mob_level * 150;
                        let yang_rew = room.mob_level * 300;
                        room.phase = CombatPhase::Finished {
                            winner_team,
                            exp_reward: exp_rew,
                            yang_reward: yang_rew,
                        };
                        finished_combats.push(c_id.clone());
                    } else if room.game_state.status == GameStatus::InBattle {
                        // Temporizador de turno autoritativo
                        room.turn_timer -= delta;
                        if room.turn_timer <= 0.0 {
                            room.turn_timer = 25.0;
                            if let Ok(next_active_id) = room.game_state.pass_turn() {
                                let turn_count = room.game_state.turn_count;
                                events.turns_timed_out.push((c_id.clone(), next_active_id, turn_count));
                            }
                        }
                    }
                }
                CombatPhase::Finished { .. } => {
                    finished_combats.push(c_id.clone());
                }
            }
        }

        // 4. Limpieza de combates finalizados y entrega de recompensas
        for c_id in finished_combats {
            if let Some(room) = self.combats.remove(&c_id) {
                let participant_ids = room.participant_ids.clone();

                if room.mob_id == "duel" {
                    let winner_team = match room.phase {
                        CombatPhase::Finished { winner_team, .. } => winner_team,
                        _ => 0,
                    };

                    let p1_name = self.players.get(&participant_ids[0]).map(|p| p.name.clone()).unwrap_or_default();
                    let p2_name = participant_ids.get(1).and_then(|id| self.players.get(id)).map(|p| p.name.clone()).unwrap_or_default();
                    let winner_name = if winner_team == 0 { &p1_name } else { &p2_name };

                    self.chat_history.push(format!("🏆 ¡{} ha salido victorioso en el Duelo de Honor!", winner_name));

                    for (idx, p_id) in participant_ids.iter().enumerate() {
                        let is_winner = (idx as u8) == winner_team;
                        if let Some(p) = self.players.get_mut(p_id) {
                            p.in_combat_id = None;
                            if is_winner {
                                p.exp += 300;
                                p.yang += 500;
                            }
                        }
                    }

                    events.finished_combats.push((c_id, true, 300, 500, Vec::new(), participant_ids));
                    continue;
                }

                let is_victory = match room.phase {
                    CombatPhase::Finished { winner_team: 0, .. } => true,
                    _ => false,
                };

                let mob_type = self.mobs.iter().find(|m| m.id == room.mob_id).map(|m| m.mob_type.clone()).unwrap_or_default();
                let (yang, exp, drops) = if is_victory {
                    self.generate_mob_drops(&mob_type, room.mob_level)
                } else {
                    (0, 0, Vec::new())
                };

                // Liberar mob y programar respawn con tiempo
                if let Some(mob) = self.mobs.iter_mut().find(|m| m.id == room.mob_id) {
                    mob.in_combat_id = None;
                    if is_victory {
                        mob.is_alive = false;
                        mob.pos = mob.spawn_pos;
                        // Tiempo de respawn: 75s para Piedra Metin, 35s para lobos y perros salvajes
                        mob.respawn_timer = if mob.mob_type == "metin_stone" { 75.0 } else { 35.0 };
                    }
                }

                // Liberar jugadores y depositar Yang, EXP y Objetos de Botín
                for p_id in &participant_ids {
                    if let Some(p) = self.players.get_mut(p_id) {
                        p.in_combat_id = None;
                        if is_victory {
                            p.exp += exp;
                            p.yang += yang;

                            // Depositar cada objeto de drop en el primer hueco vacío del inventario
                            for item in &drops {
                                for slot in p.inventory.iter_mut() {
                                    if slot.is_none() {
                                        *slot = Some(item.clone());
                                        break;
                                    }
                                }
                            }

                            while p.exp >= p.max_exp {
                                p.level += 1;
                                p.stat_points += 3;
                                if p.level >= 5 {
                                    p.skill_points += 1;
                                }
                                p.max_exp = p.level * 300;
                                p.max_hp += 20;
                                p.hp = p.max_hp;
                                self.chat_history.push(format!("🌟 ¡{} ha subido al Nivel {}! (+3 Puntos de Estado, +1 Habilidad)", p.name, p.level));
                            }

                            // Desgaste de durabilidad de armas y armaduras equipadas tras el combate
                            if let Some(wep) = p.equipped_weapon.as_mut() {
                                wep.durability = wep.durability.saturating_sub(2);
                            }
                            if let Some(arm) = p.equipped_armor.as_mut() {
                                arm.durability = arm.durability.saturating_sub(2);
                            }
                        }
                    }
                }

                if is_victory {
                    // Actualizar progreso de misiones de los participantes
                    for p_id in &participant_ids {
                        if let Some(p) = self.players.get_mut(p_id) {
                            for q in p.quests.iter_mut() {
                                if !q.is_completed && q.target_mob_type == mob_type {
                                    q.current_count += 1;
                                    if q.current_count >= q.target_count {
                                        q.is_completed = true;
                                        self.chat_history.push(format!("📜 ¡Misión cumplida: [{}]! Habla con el Guardián.", q.title));
                                    }
                                }
                            }
                        }
                    }

                    if !drops.is_empty() {
                        let drop_names = drops.iter().map(|d| format!("[{}]", d.name)).collect::<Vec<_>>().join(", ");
                        self.chat_history.push(format!("🎁 ¡Botín de [{}]: {} (+{} Yang, +{} EXP)!", room.mob_name, drop_names, yang, exp));
                    } else {
                        self.chat_history.push(format!("🏆 ¡Victoria contra [{}]! Recompensa: +{} EXP, +{} Yang.", room.mob_name, exp, yang));
                    }
                }

                events.finished_combats.push((c_id, is_victory, exp, yang, drops, participant_ids));
            }
        }

        events
    }

    pub fn generate_mob_drops(&self, mob_type: &str, mob_level: u32) -> (u32, u32, Vec<Item>) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let pseudo_rand = |offset: u64| -> u64 {
            let mut x = now ^ offset ^ 0x9e3779b97f4a7c15;
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            x
        };

        let rand_chance = |pct: u32, offset: u64| -> bool {
            (pseudo_rand(offset) % 100) < (pct as u64)
        };

        let rand_range = |min: u32, max: u32, offset: u64| -> u32 {
            if min >= max { return min; }
            let range = (max - min + 1) as u64;
            min + ((pseudo_rand(offset) % range) as u32)
        };

        let mut drops = Vec::new();

        match mob_type {
            "wild_dog" => {
                let yang = rand_range(120, 260, 10);
                let exp = 150;

                if rand_chance(80, 20) {
                    drops.push(Item {
                        id: format!("drop_fur_{}", now),
                        name: "Piel de Animal".to_string(),
                        item_type: ItemType::Material,
                        upgrade_level: 0,
                        attack_bonus: 0,
                        defense_bonus: 0,
                        hp_bonus: 0,
                        buy_price: 60,
                        icon: "🦊".to_string(),
                        description: "Piel suave de bestia salvaje. Material de forja.".to_string(),
                    durability: 100,
                    max_durability: 100,
                    });
                }
                if rand_chance(65, 30) {
                    drops.push(Item {
                        id: format!("drop_fang_{}", now),
                        name: "Diente de Perro".to_string(),
                        item_type: ItemType::Material,
                        upgrade_level: 0,
                        attack_bonus: 0,
                        defense_bonus: 0,
                        hp_bonus: 0,
                        buy_price: 90,
                        icon: "🦷".to_string(),
                        description: "Colmillo afilado de perro salvaje. Material de forja.".to_string(),
                    durability: 100,
                    max_durability: 100,
                    });
                }
                if rand_chance(45, 40) {
                    drops.push(Item {
                        id: format!("drop_pot_{}", now),
                        name: "Poción Roja (P)".to_string(),
                        item_type: ItemType::Consumable,
                        upgrade_level: 0,
                        attack_bonus: 0,
                        defense_bonus: 0,
                        hp_bonus: 60,
                        buy_price: 50,
                        icon: "🧪".to_string(),
                        description: "Restaura 60 HP al instante.".to_string(),
                    durability: 100,
                    max_durability: 100,
                    });
                }
                if rand_chance(30, 50) {
                    drops.push(Item {
                        id: format!("drop_sword_{}", now),
                        name: "Espada Corta +0".to_string(),
                        item_type: ItemType::Weapon,
                        upgrade_level: 0,
                        attack_bonus: 6,
                        defense_bonus: 0,
                        hp_bonus: 0,
                        buy_price: 150,
                        icon: "🗡️".to_string(),
                        description: "Espada básica ligera. +6 Daño.".to_string(),
                    durability: 100,
                    max_durability: 100,
                    });
                }
                (yang, exp, drops)
            }
            "wolf" => {
                let yang = rand_range(280, 580, 11);
                let exp = if mob_level >= 5 { 450 } else { 320 };

                if rand_chance(85, 21) {
                    drops.push(Item {
                        id: format!("drop_wolffur_{}", now),
                        name: "Piel de Lobo".to_string(),
                        item_type: ItemType::Material,
                        upgrade_level: 0,
                        attack_bonus: 0,
                        defense_bonus: 0,
                        hp_bonus: 0,
                        buy_price: 140,
                        icon: "🐺".to_string(),
                        description: "Gruesa piel de lobo. Requerida para armaduras medias.".to_string(),
                    durability: 100,
                    max_durability: 100,
                    });
                }
                if rand_chance(70, 31) {
                    drops.push(Item {
                        id: format!("drop_wolfclaw_{}", now),
                        name: "Garra de Lobo".to_string(),
                        item_type: ItemType::Material,
                        upgrade_level: 0,
                        attack_bonus: 0,
                        defense_bonus: 0,
                        hp_bonus: 0,
                        buy_price: 180,
                        icon: "🐾".to_string(),
                        description: "Garra de depredador. Requerida por el Herrero.".to_string(),
                    durability: 100,
                    max_durability: 100,
                    });
                }
                if rand_chance(50, 41) {
                    drops.push(Item {
                        id: format!("drop_potm_{}", now),
                        name: "Poción Roja (M)".to_string(),
                        item_type: ItemType::Consumable,
                        upgrade_level: 0,
                        attack_bonus: 0,
                        defense_bonus: 0,
                        hp_bonus: 120,
                        buy_price: 100,
                        icon: "🧪".to_string(),
                        description: "Restaura 120 HP al instante.".to_string(),
                    durability: 100,
                    max_durability: 100,
                    });
                }
                if rand_chance(35, 51) {
                    drops.push(Item {
                        id: format!("drop_longsword_{}", now),
                        name: "Espada Larga +0".to_string(),
                        item_type: ItemType::Weapon,
                        upgrade_level: 0,
                        attack_bonus: 14,
                        defense_bonus: 0,
                        hp_bonus: 0,
                        buy_price: 350,
                        icon: "⚔️".to_string(),
                        description: "Espada de hierro forjado. +14 Daño.".to_string(),
                    durability: 100,
                    max_durability: 100,
                    });
                }
                (yang, exp, drops)
            }
            "metin_stone" => {
                let yang = rand_range(2000, 3500, 12);
                let exp = 1800;

                drops.push(Item {
                    id: format!("drop_fms_{}", now),
                    name: "Espada de Luna Llena +0".to_string(),
                    item_type: ItemType::Weapon,
                    upgrade_level: 0,
                    attack_bonus: 24,
                    defense_bonus: 0,
                    hp_bonus: 0,
                    buy_price: 1500,
                    icon: "🗡️".to_string(),
                    description: "Mítica espada de hoja curva. Gran potencia de corte. +24 Daño.".to_string(),
                    durability: 100,
                    max_durability: 100,
                });
                drops.push(Item {
                    id: format!("drop_ghoststone_{}", now),
                    name: "Piedra Fantasma".to_string(),
                    item_type: ItemType::Material,
                    upgrade_level: 0,
                    attack_bonus: 0,
                    defense_bonus: 0,
                    hp_bonus: 0,
                    buy_price: 500,
                    icon: "🔮".to_string(),
                    description: "Fragmento astral caído del núcleo de la Piedra Metin.".to_string(),
                    durability: 100,
                    max_durability: 100,
                });
                drops.push(Item {
                    id: format!("drop_dragonarmor_{}", now),
                    name: "Armadura Dragón +0".to_string(),
                    item_type: ItemType::Armor,
                    upgrade_level: 0,
                    attack_bonus: 0,
                    defense_bonus: 16,
                    hp_bonus: 90,
                    buy_price: 1800,
                    icon: "🛡️".to_string(),
                    description: "Armadura legendaria de escamas de dragón. +16 Def, +90 HP.".to_string(),
                    durability: 100,
                    max_durability: 100,
                });
                drops.push(Item {
                    id: format!("drop_potg_{}", now),
                    name: "Poción Roja (G)".to_string(),
                    item_type: ItemType::Consumable,
                    upgrade_level: 0,
                    attack_bonus: 0,
                    defense_bonus: 0,
                    hp_bonus: 220,
                    buy_price: 200,
                    icon: "🧪".to_string(),
                    description: "Restaura 220 HP al instante.".to_string(),
                    durability: 100,
                    max_durability: 100,
                });
                drops.push(Item {
                    id: format!("drop_skillbook_{}", now),
                    name: "Libro: Aura de Espada".to_string(),
                    item_type: ItemType::SkillBook,
                    upgrade_level: 1,
                    attack_bonus: 20,
                    defense_bonus: 0,
                    hp_bonus: 0,
                    buy_price: 3500,
                    icon: "📜".to_string(),
                    description: "Tomo antiguo de artes marciales. Aumenta permanentemente tus atributos (+2 STR, +1 Punto de Estado).".to_string(),
                    durability: 100,
                    max_durability: 100,
                });

                (yang, exp, drops)
            }
            _ => (150, 150, drops),
        }
    }

    pub fn get_npc_dialog(&self, npc_id: &str, player_id: &str) -> Option<crate::protocol::ServerMessage> {
        let player = self.players.get(player_id)?;

        match npc_id {
            "npc_blacksmith" => {
                Some(crate::protocol::ServerMessage::NPCDialog {
                    npc_id: npc_id.to_string(),
                    name: "Herrero de Joan".to_string(),
                    text: "¡Saludos guerrero! Soy el Herrero de la Aldea. Puedo mejorar tus armas y armaduras desde +0 hasta +9 para multiplicar su poder en combate... pero ten cuidado, a niveles altos existe el riesgo de que el temple falle.".to_string(),
                    dialog_type: "blacksmith".to_string(),
                    shop_items: Vec::new(),
                    available_quests: Vec::new(),
                })
            }
            "npc_store" => {
                let shop_items = vec![
                    Item {
                        id: "shop_red_pot".to_string(),
                        name: "Poción Roja (P)".to_string(),
                        item_type: ItemType::Consumable,
                        upgrade_level: 0,
                        attack_bonus: 0,
                        defense_bonus: 0,
                        hp_bonus: 60,
                        buy_price: 50,
                        icon: "🧪".to_string(),
                        description: "Restaura 60 Puntos de Vida (HP).".to_string(),
                    durability: 100,
                    max_durability: 100,
                    },
                    Item {
                        id: "shop_blue_pot".to_string(),
                        name: "Poción Azul (P)".to_string(),
                        item_type: ItemType::Consumable,
                        upgrade_level: 0,
                        attack_bonus: 0,
                        defense_bonus: 0,
                        hp_bonus: 0,
                        buy_price: 80,
                        icon: "💧".to_string(),
                        description: "Restaura energía de combate.".to_string(),
                    durability: 100,
                    max_durability: 100,
                    },
                    Item {
                        id: "shop_sword".to_string(),
                        name: "Espada de Bambú".to_string(),
                        item_type: ItemType::Weapon,
                        upgrade_level: 0,
                        attack_bonus: 14,
                        defense_bonus: 0,
                        hp_bonus: 0,
                        buy_price: 250,
                        icon: "🎋".to_string(),
                        description: "Espada ligera reforzada de Joan. +14 Daño.".to_string(),
                    durability: 100,
                    max_durability: 100,
                    },
                    Item {
                        id: "shop_armor".to_string(),
                        name: "Armadura de Hierro Ligero".to_string(),
                        item_type: ItemType::Armor,
                        upgrade_level: 0,
                        attack_bonus: 0,
                        defense_bonus: 8,
                        hp_bonus: 50,
                        buy_price: 350,
                        icon: "🛡️".to_string(),
                        description: "Cota de malla para soldados de Jinno. +8 Def, +50 HP.".to_string(),
                    durability: 100,
                    max_durability: 100,
                    },
                    Item {
                        id: "shop_pickaxe".to_string(),
                        name: "Pico de Minero".to_string(),
                        item_type: ItemType::Material,
                        upgrade_level: 0,
                        attack_bonus: 2,
                        defense_bonus: 0,
                        hp_bonus: 0,
                        buy_price: 150,
                        icon: "⛏️".to_string(),
                        description: "Herramienta para extraer minerales en las vetas de la aldea.".to_string(),
                    durability: 100,
                    max_durability: 100,
                    },
                    Item {
                        id: "shop_axe".to_string(),
                        name: "Hacha de Leñador".to_string(),
                        item_type: ItemType::Material,
                        upgrade_level: 0,
                        attack_bonus: 4,
                        defense_bonus: 0,
                        hp_bonus: 0,
                        buy_price: 150,
                        icon: "🪓".to_string(),
                        description: "Hacha afilada para talar sauces y pinos.".to_string(),
                    durability: 100,
                    max_durability: 100,
                    },
                    Item {
                        id: "shop_rod".to_string(),
                        name: "Caña de Pescar".to_string(),
                        item_type: ItemType::Material,
                        upgrade_level: 0,
                        attack_bonus: 0,
                        defense_bonus: 0,
                        hp_bonus: 0,
                        buy_price: 150,
                        icon: "🎣".to_string(),
                        description: "Caña de bambú y sedal para pescar carpas en el estanque.".to_string(),
                    durability: 100,
                    max_durability: 100,
                    },
                ];

                Some(crate::protocol::ServerMessage::NPCDialog {
                    npc_id: npc_id.to_string(),
                    name: "Vendedora de la Aldea".to_string(),
                    text: "¡Bienvenido a mi botica! Vendo pociones curativas, pertrechos y herramientas de recolección (picos, hachas, cañas). ¡Gasta tu Yang sabiamente!".to_string(),
                    dialog_type: "merchant".to_string(),
                    shop_items,
                    available_quests: Vec::new(),
                })
            }
            "npc_storekeeper" => {
                Some(crate::protocol::ServerMessage::NPCDialog {
                    npc_id: npc_id.to_string(),
                    name: "Almacenero de la Aldea".to_string(),
                    text: "¡Saludos aventurero! Aquí tus minerales valiosos y tu fortuna en Yang estarán 100% seguros de ladrones y peligros del exterior. ¿Quieres abrir tu Almacén?".to_string(),
                    dialog_type: "storekeeper".to_string(),
                    shop_items: Vec::new(),
                    available_quests: Vec::new(),
                })
            }
            "npc_market_board" => {
                Some(crate::protocol::ServerMessage::NPCDialog {
                    npc_id: npc_id.to_string(),
                    name: "Tablón de Mercado Central".to_string(),
                    text: "Casa de Subastas y Comercio Central del Reino. Publica tus materiales y equipo para venderlos aunque estés desconectado, o compra las mejores gangas con una tasa de impuesto justa.".to_string(),
                    dialog_type: "market_board".to_string(),
                    shop_items: Vec::new(),
                    available_quests: Vec::new(),
                })
            }
            "npc_furnace" => {
                Some(crate::protocol::ServerMessage::NPCDialog {
                    npc_id: npc_id.to_string(),
                    name: "Horno de Fundición y Crafteo".to_string(),
                    text: "El fuego eterno de la fragua está ardiendo. Trae tus menas de cobre, hierro, ébano y madera para fundir lingotes y forjar equipo imperial como la Espada Luna Llena.".to_string(),
                    dialog_type: "furnace".to_string(),
                    shop_items: Vec::new(),
                    available_quests: Vec::new(),
                })
            }
            "npc_guardian" => {
                Some(crate::protocol::ServerMessage::NPCDialog {
                    npc_id: npc_id.to_string(),
                    name: "Guardián de la Aldea".to_string(),
                    text: "¡Firmes! La caída de las piedras Metin ha perturbado la paz del Reino. Si buscas gloria, oro y la mítica Espada de Luna Llena, tengo misiones para ti.".to_string(),
                    dialog_type: "guardian".to_string(),
                    shop_items: Vec::new(),
                    available_quests: player.quests.clone(),
                })
            }
            _ => None,
        }
    }

    pub fn get_inventory_sync(&self, player_id: &str) -> Option<crate::protocol::ServerMessage> {
        let player = self.players.get(player_id)?;
        Some(crate::protocol::ServerMessage::InventorySync {
            player_id: Some(player_id.to_string()),
            inventory: player.inventory.clone(),
            equipped_weapon: player.equipped_weapon.clone(),
            equipped_armor: player.equipped_armor.clone(),
            yang: player.yang,
            quests: player.quests.clone(),
        })
    }

    pub fn buy_shop_item(&mut self, player_id: &str, item_id: &str) -> Result<crate::protocol::ServerMessage, String> {
        let player = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;

        let catalog_item = match item_id {
            "shop_red_pot" => Item {
                id: format!("item_pot_red_{}", player.inventory.iter().filter(|i| i.is_some()).count() + 1),
                name: "Poción Roja (P)".to_string(),
                item_type: ItemType::Consumable,
                upgrade_level: 0,
                attack_bonus: 0,
                defense_bonus: 0,
                hp_bonus: 60,
                buy_price: 50,
                icon: "🧪".to_string(),
                description: "Restaura 60 Puntos de Vida (HP).".to_string(),
                    durability: 100,
                    max_durability: 100,
            },
            "shop_blue_pot" => Item {
                id: format!("item_pot_blue_{}", player.inventory.iter().filter(|i| i.is_some()).count() + 1),
                name: "Poción Azul (P)".to_string(),
                item_type: ItemType::Consumable,
                upgrade_level: 0,
                attack_bonus: 0,
                defense_bonus: 0,
                hp_bonus: 0,
                buy_price: 80,
                icon: "💧".to_string(),
                description: "Restaura energía de combate.".to_string(),
                    durability: 100,
                    max_durability: 100,
            },
            "shop_sword" => Item {
                id: format!("item_sword_{}", player.inventory.iter().filter(|i| i.is_some()).count() + 1),
                name: "Espada de Bambú".to_string(),
                item_type: ItemType::Weapon,
                upgrade_level: 0,
                attack_bonus: 14,
                defense_bonus: 0,
                hp_bonus: 0,
                buy_price: 250,
                icon: "🎋".to_string(),
                description: "Espada ligera reforzada de Joan. +14 Daño.".to_string(),
                    durability: 100,
                    max_durability: 100,
            },
            "shop_armor" => Item {
                id: format!("item_armor_{}", player.inventory.iter().filter(|i| i.is_some()).count() + 1),
                name: "Armadura de Hierro Ligero".to_string(),
                item_type: ItemType::Armor,
                upgrade_level: 0,
                attack_bonus: 0,
                defense_bonus: 8,
                hp_bonus: 50,
                buy_price: 350,
                icon: "🛡️".to_string(),
                description: "Cota de malla para soldados de Jinno. +8 Def, +50 HP.".to_string(),
                    durability: 100,
                    max_durability: 100,
            },
            _ => return Err("Objeto no disponible en la tienda".to_string()),
        };

        if player.yang < catalog_item.buy_price {
            return Err("No tienes suficiente Yang".to_string());
        }

        let empty_idx = player.inventory.iter().position(|slot| slot.is_none())
            .ok_or("Tu inventario está lleno (máximo 20 objetos)")?;

        player.yang -= catalog_item.buy_price;
        let item_name = catalog_item.name.clone();
        player.inventory[empty_idx] = Some(catalog_item);

        self.chat_history.push(format!("🛍️ Compraste [{}] por {} Yang.", item_name, 50));

        Ok(crate::protocol::ServerMessage::InventorySync {
            player_id: Some(player_id.to_string()),
            inventory: player.inventory.clone(),
            equipped_weapon: player.equipped_weapon.clone(),
            equipped_armor: player.equipped_armor.clone(),
            yang: player.yang,
            quests: player.quests.clone(),
        })
    }

    pub fn upgrade_item(&mut self, player_id: &str, slot_index: usize) -> Result<(crate::protocol::ServerMessage, crate::protocol::ServerMessage), String> {
        let player = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;

        if slot_index >= player.inventory.len() {
            return Err("Ranura de inventario inválida".to_string());
        }

        let (current_lvl, is_weapon, initial_name) = {
            let item = player.inventory[slot_index].as_ref().ok_or("No hay ningún objeto en esa ranura")?;
            if item.item_type != ItemType::Weapon && item.item_type != ItemType::Armor {
                return Err("Solo se pueden mejorar armas y armaduras".to_string());
            }
            if item.upgrade_level >= 9 {
                return Err("¡Este objeto ya ha alcanzado el nivel máximo (+9)!".to_string());
            }
            (item.upgrade_level, item.item_type == ItemType::Weapon, item.name.clone())
        };

        // Costo en Yang y Material requerido por nivel de mejora (+0 a +9)
        let (cost, req_mat_name, chance) = match current_lvl {
            0 => (200, None, 100),
            1 => (400, None, 100),
            2 => (800, None, 100),
            3 => (1500, Some("Piel de Animal"), 75),
            4 => (2500, Some(if is_weapon { "Diente de Perro" } else { "Piel de Animal" }), 65),
            5 => (4000, Some("Lingote de Cobre"), 55),
            6 => (7000, Some(if is_weapon { "Piel de Lobo" } else { "Piel de Lobo" }), 45),
            7 => (12000, Some(if is_weapon { "Garra de Lobo" } else { "Garra de Lobo" }), 35),
            8 => (20000, Some("Lingote de Hierro"), 25),
            _ => (50000, None, 10),
        };

        if player.yang < cost {
            return Err(format!("Necesitas {} Yang para intentar la mejora a +{} (tienes {}).", cost, current_lvl + 1, player.yang));
        }

        // Verificar si posee el material requerido en el inventario
        let mut mat_slot_opt: Option<usize> = None;
        if let Some(mat_name) = req_mat_name {
            for (idx, slot) in player.inventory.iter().enumerate() {
                if let Some(inv_item) = slot {
                    if inv_item.name == mat_name {
                        mat_slot_opt = Some(idx);
                        break;
                    }
                }
            }
            if mat_slot_opt.is_none() {
                return Err(format!("Para mejorar a +{} necesitas 1x [{}] además de {} Yang. ¡Derrota monstruos o extrae menas para conseguirlo!", current_lvl + 1, mat_name, cost));
            }
        }

        // Consumir Yang y material
        player.yang -= cost;
        if let Some(mat_idx) = mat_slot_opt {
            player.inventory[mat_idx] = None;
        }

        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis();
        let roll = ((now % 100) + 1) as u32;
        let success = roll <= chance;

        let upgrade_res = if success {
            let item = player.inventory[slot_index].as_mut().unwrap();
            item.upgrade_level += 1;
            if item.item_type == ItemType::Weapon {
                item.attack_bonus += 6;
            } else {
                item.defense_bonus += 4;
                item.hp_bonus += 35;
            }

            let base_name = item.name.split('+').next().unwrap_or(&item.name).trim();
            item.name = format!("{} +{}", base_name, item.upgrade_level);

            let msg = format!("✨ ¡ÉXITO! Tu objeto ha ascendido a +{}.", item.upgrade_level);
            self.chat_history.push(format!("🔨 ¡El Herrero mejoró con éxito [{}]!", item.name));
            crate::protocol::ServerMessage::UpgradeResult {
                success: true,
                message: msg,
                item: Some(item.clone()),
            }
        } else {
            // Mecánica Metin2 auténtica de fallo:
            // +1..+3: no fallan
            // +4..+6: 50% downgrade, 50% destrucción
            // +7..+9: 100% destrucción
            let destroyed = if current_lvl >= 6 {
                true
            } else if current_lvl >= 3 {
                (now % 2) == 0
            } else {
                false
            };

            if destroyed {
                player.inventory[slot_index] = None;
                let msg = format!("💥 ¡CRACK! El Herrero martilló con demasiada fuerza... ¡[{}] se ha roto y ha desaparecido para siempre!", initial_name);
                self.chat_history.push(format!("🔨 ¡El Herrero rompió el objeto [{}] de {}!", initial_name, player.name));
                crate::protocol::ServerMessage::UpgradeResult {
                    success: false,
                    message: msg,
                    item: None,
                }
            } else {
                let item = player.inventory[slot_index].as_mut().unwrap();
                item.upgrade_level = item.upgrade_level.saturating_sub(1);
                let base_name = item.name.split('+').next().unwrap_or(&item.name).trim();
                item.name = format!("{} +{}", base_name, item.upgrade_level);
                let msg = format!("💥 ¡El Herrero ha fallado! Por fortuna el objeto no se rompió, pero ha bajado a +{}.", item.upgrade_level);
                self.chat_history.push(format!("🔨 ¡El Herrero falló al mejorar [{}]!", item.name));
                crate::protocol::ServerMessage::UpgradeResult {
                    success: false,
                    message: msg,
                    item: Some(item.clone()),
                }
            }
        };

        let sync = crate::protocol::ServerMessage::InventorySync {
            player_id: Some(player_id.to_string()),
            inventory: player.inventory.clone(),
            equipped_weapon: player.equipped_weapon.clone(),
            equipped_armor: player.equipped_armor.clone(),
            yang: player.yang,
            quests: player.quests.clone(),
        };

        Ok((upgrade_res, sync))
    }

    pub fn equip_item(&mut self, player_id: &str, slot_index: usize) -> Result<crate::protocol::ServerMessage, String> {
        let player = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;

        if slot_index >= player.inventory.len() {
            return Err("Ranura inválida".to_string());
        }

        let item = player.inventory[slot_index].take().ok_or("No hay ningún objeto en esa ranura")?;

        match item.item_type {
            ItemType::Weapon => {
                let old_weapon = player.equipped_weapon.take();
                player.equipped_weapon = Some(item);
                player.inventory[slot_index] = old_weapon;
            }
            ItemType::Armor => {
                let old_armor = player.equipped_armor.take();
                let old_hp_bonus = old_armor.as_ref().map(|a| a.hp_bonus).unwrap_or(0);
                let new_hp_bonus = item.hp_bonus;
                player.equipped_armor = Some(item);
                player.max_hp = player.max_hp - old_hp_bonus + new_hp_bonus;
                player.hp = player.hp.min(player.max_hp);
                player.inventory[slot_index] = old_armor;
            }
            ItemType::Consumable => {
                player.inventory[slot_index] = Some(item);
                return Err("Las pociones y consumibles se usan, no se equipan".to_string());
            }
            ItemType::Material => {
                player.inventory[slot_index] = Some(item);
                return Err("Los materiales de mejora no se equipan, se usan en el Herrero".to_string());
            }
            ItemType::SkillBook => {
                player.inventory[slot_index] = Some(item);
                return Err("Los libros de habilidad se leen desde el inventario, no se equipan".to_string());
            }
        }

        Ok(crate::protocol::ServerMessage::InventorySync {
            player_id: Some(player_id.to_string()),
            inventory: player.inventory.clone(),
            equipped_weapon: player.equipped_weapon.clone(),
            equipped_armor: player.equipped_armor.clone(),
            yang: player.yang,
            quests: player.quests.clone(),
        })
    }

    pub fn unequip_item(&mut self, player_id: &str, slot_type: &str) -> Result<crate::protocol::ServerMessage, String> {
        let player = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;

        let empty_idx = player.inventory.iter().position(|s| s.is_none())
            .ok_or("Tu inventario está lleno para desequipar este objeto")?;

        if slot_type == "weapon" {
            let weapon = player.equipped_weapon.take().ok_or("No tienes ningún arma equipada")?;
            player.inventory[empty_idx] = Some(weapon);
        } else if slot_type == "armor" {
            let armor = player.equipped_armor.take().ok_or("No tienes ninguna armadura equipada")?;
            player.max_hp = (player.max_hp - armor.hp_bonus).max(100);
            player.hp = player.hp.min(player.max_hp);
            player.inventory[empty_idx] = Some(armor);
        } else {
            return Err("Tipo de ranura desconocido".to_string());
        }

        Ok(crate::protocol::ServerMessage::InventorySync {
            player_id: Some(player_id.to_string()),
            inventory: player.inventory.clone(),
            equipped_weapon: player.equipped_weapon.clone(),
            equipped_armor: player.equipped_armor.clone(),
            yang: player.yang,
            quests: player.quests.clone(),
        })
    }

    pub fn use_item(&mut self, player_id: &str, slot_index: usize) -> Result<(String, crate::protocol::ServerMessage), String> {
        let player = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;

        if slot_index >= player.inventory.len() {
            return Err("Ranura inválida".to_string());
        }

        let item = player.inventory[slot_index].as_ref().ok_or("No hay objeto en esa ranura")?;
        if item.item_type != ItemType::Consumable && item.item_type != ItemType::SkillBook {
            return Err("Solo puedes usar consumibles como pociones o libros de habilidad".to_string());
        }

        if item.item_type == ItemType::SkillBook {
            let item_name = item.name.clone();

            // Buscar una habilidad aprendida que esté en rango Máster (nivel 20 a 29 = M1 a M10)
            let master_skill = player.skill_levels.iter()
                .find(|(_, lvl)| **lvl >= 20 && **lvl < 30)
                .map(|(k, v)| (k.clone(), *v));

            let (target_skill_id, current_lvl) = match master_skill {
                Some((s, lvl)) => (s, lvl),
                None => {
                    return Err(format!("Para leer [{}] necesitas tener al menos una habilidad en rango Máster (M1..M10 alcanzado al nivel 20 con puntos).", item_name));
                }
            };

            // Consumir el libro
            player.inventory[slot_index] = None;

            let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis();
            let roll = ((now % 100) + 1) as u32;
            let success = roll <= 65;

            let msg = if success {
                let next_lvl = current_lvl + 1;
                player.skill_levels.insert(target_skill_id.clone(), next_lvl);

                let rank_str = if next_lvl >= 30 {
                    "Gran Máster (G1)".to_string()
                } else {
                    format!("Máster M{}", next_lvl - 19)
                };
                let success_text = format!("✨ ¡Has comprendido los secretos de [{}]! La habilidad asciende a {}.", item_name, rank_str);
                self.chat_history.push(format!("📜 ¡{} mejoró su habilidad a {} con [{}]!", player.name, rank_str, item_name));
                success_text
            } else {
                let fail_text = format!("💥 ¡El libro [{}] ardió en cenizas antes de que pudieras asimilar su poder!", item_name);
                self.chat_history.push(format!("💨 ¡La lectura de [{}] de {} ha fallado!", item_name, player.name));
                fail_text
            };

            let sync = crate::protocol::ServerMessage::InventorySync {
                player_id: Some(player_id.to_string()),
                inventory: player.inventory.clone(),
                equipped_weapon: player.equipped_weapon.clone(),
                equipped_armor: player.equipped_armor.clone(),
                yang: player.yang,
                quests: player.quests.clone(),
            };

            return Ok((msg, sync));
        }

        let heal = item.hp_bonus;
        let item_name = item.name.clone();
        player.inventory[slot_index] = None;
        player.hp = (player.hp + heal).min(player.max_hp);

        let msg = format!("🧪 Bebiste [{}] y recuperaste {} HP (Salud actual: {}/{}).", item_name, heal, player.hp, player.max_hp);
        self.chat_history.push(msg.clone());

        let sync = crate::protocol::ServerMessage::InventorySync {
            player_id: Some(player_id.to_string()),
            inventory: player.inventory.clone(),
            equipped_weapon: player.equipped_weapon.clone(),
            equipped_armor: player.equipped_armor.clone(),
            yang: player.yang,
            quests: player.quests.clone(),
        };

        Ok((msg, sync))
    }

    pub fn allocate_stat(&mut self, player_id: &str, stat: &str) -> Result<crate::protocol::ServerMessage, String> {
        let p = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;
        if p.stat_points == 0 {
            return Err("No tienes puntos de estado disponibles".to_string());
        }
        match stat {
            "vit" => {
                p.vit += 1;
                p.max_hp += 20;
                p.hp = (p.hp + 20).min(p.max_hp);
            }
            "int" => {
                p.int_stat += 1;
            }
            "str" => {
                p.str_stat += 1;
            }
            "dex" => {
                p.dex += 1;
            }
            _ => return Err("Atributo desconocido".to_string()),
        }
        p.stat_points -= 1;

        Ok(crate::protocol::ServerMessage::StatsSync {
            player_id: Some(player_id.to_string()),
            level: p.level,
            exp: p.exp,
            max_exp: p.max_exp,
            stat_points: p.stat_points,
            vit: p.vit,
            int_stat: p.int_stat,
            str_stat: p.str_stat,
            dex: p.dex,
            hp: p.hp,
            max_hp: p.max_hp,
            skill_points: p.skill_points,
            subclass: p.subclass.clone(),
            skill_levels: p.skill_levels.clone(),
        })
    }


    pub fn repair_item(&mut self, player_id: &str, slot_index: usize, is_equipped: bool) -> Result<crate::protocol::ServerMessage, String> {
        let player = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;

        let item = if is_equipped {
            if slot_index == 0 {
                player.equipped_weapon.as_mut().ok_or("No tienes un arma equipada")?
            } else {
                player.equipped_armor.as_mut().ok_or("No tienes una armadura equipada")?
            }
        } else {
            if slot_index >= player.inventory.len() {
                return Err("Ranura inválida".to_string());
            }
            player.inventory[slot_index].as_mut().ok_or("No hay ningún objeto en esa ranura")?
        };

        if item.item_type != ItemType::Weapon && item.item_type != ItemType::Armor {
            return Err("Solo se pueden reparar armas y armaduras".to_string());
        }

        if item.durability >= item.max_durability {
            return Err(format!("El objeto [{}] ya se encuentra al 100% de durabilidad.", item.name));
        }

        let missing = item.max_durability - item.durability;
        let cost = missing * 2;
        if player.yang < cost {
            return Err(format!("Necesitas {} Yang para restaurar la durabilidad (tienes {}).", cost, player.yang));
        }

        player.yang -= cost;
        item.durability = item.max_durability;
        let item_name = item.name.clone();

        self.chat_history.push(format!("🔨 El Herrero reparó la durabilidad de [{}] de {} al 100% por {} Yang.", item_name, player.name, cost));

        Ok(crate::protocol::ServerMessage::RepairResult {
            success: true,
            message: format!("✨ ¡[{}] ha sido reparado al 100% de durabilidad ({}/{}) por {} Yang!", item_name, item.durability, item.max_durability, cost),
            yang: player.yang,
        })
    }

    pub fn upgrade_skill_with_point(&mut self, player_id: &str, skill_id: &str) -> Result<crate::protocol::ServerMessage, String> {
        let p = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;

        if p.skill_points == 0 {
            return Err("No tienes puntos de habilidad disponibles para repartir.".to_string());
        }

        let current_lvl = *p.skill_levels.get(skill_id).unwrap_or(&0);
        if current_lvl >= 20 {
            return Err("Esta habilidad ya es Máster (M1). Debes leer Libros de Habilidad para seguir mejorándola.".to_string());
        }

        let next_lvl = current_lvl + 1;
        p.skill_levels.insert(skill_id.to_string(), next_lvl);
        p.skill_points -= 1;

        if next_lvl == 20 {
            self.chat_history.push(format!("🥋 ¡{} ha alcanzado el rango MÁSTER (M1) en [{}]!", p.name, skill_id));
        }

        Ok(crate::protocol::ServerMessage::StatsSync {
            player_id: Some(player_id.to_string()),
            level: p.level,
            exp: p.exp,
            max_exp: p.max_exp,
            stat_points: p.stat_points,
            vit: p.vit,
            int_stat: p.int_stat,
            str_stat: p.str_stat,
            dex: p.dex,
            hp: p.hp,
            max_hp: p.max_hp,
            skill_points: p.skill_points,
            subclass: p.subclass.clone(),
            skill_levels: p.skill_levels.clone(),
        })
    }

    pub fn select_subclass(&mut self, player_id: &str, subclass: &str) -> Result<crate::protocol::ServerMessage, String> {
        let p = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;

        if p.level < 5 {
            return Err("Debes alcanzar el nivel 5 para elegir una doctrina de combate.".to_string());
        }
        if p.subclass.is_some() {
            return Err(format!("Ya has elegido la doctrina [{}]. La elección es permanente.", p.subclass.as_ref().unwrap()));
        }

        p.subclass = Some(subclass.to_string());
        if p.skill_points == 0 {
            p.skill_points = p.level.saturating_sub(4);
        }

        self.chat_history.push(format!("📜 ¡{} ha elegido el camino de la doctrina [{}]!", p.name, subclass));

        Ok(crate::protocol::ServerMessage::StatsSync {
            player_id: Some(player_id.to_string()),
            level: p.level,
            exp: p.exp,
            max_exp: p.max_exp,
            stat_points: p.stat_points,
            vit: p.vit,
            int_stat: p.int_stat,
            str_stat: p.str_stat,
            dex: p.dex,
            hp: p.hp,
            max_hp: p.max_hp,
            skill_points: p.skill_points,
            subclass: p.subclass.clone(),
            skill_levels: p.skill_levels.clone(),
        })
    }

    pub fn get_stats_sync(&self, player_id: &str) -> Option<crate::protocol::ServerMessage> {
        let p = self.players.get(player_id)?;
        Some(crate::protocol::ServerMessage::StatsSync {
            player_id: Some(player_id.to_string()),
            level: p.level,
            exp: p.exp,
            max_exp: p.max_exp,
            stat_points: p.stat_points,
            vit: p.vit,
            int_stat: p.int_stat,
            str_stat: p.str_stat,
            dex: p.dex,
            hp: p.hp,
            max_hp: p.max_hp,
            skill_points: p.skill_points,
            subclass: p.subclass.clone(),
            skill_levels: p.skill_levels.clone(),
        })
    }

    // --- PARTIES ---
    pub fn get_party_members_info(&self, party_id: &str) -> Vec<crate::mmo::types::PartyMemberInfo> {
        if let Some(party) = self.parties.get(party_id) {
            party.member_ids.iter().filter_map(|m_id| {
                self.players.get(m_id).map(|p| crate::mmo::types::PartyMemberInfo {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    level: p.level,
                    hp: p.hp,
                    max_hp: p.max_hp,
                    class: p.class,
                })
            }).collect()
        } else {
            Vec::new()
        }
    }

    pub fn invite_party(&mut self, leader_id: &str, target_id: &str) -> Result<(String, String), String> {
        let leader_name = self.players.get(leader_id).ok_or("Líder no encontrado")?.name.clone();
        let target = self.players.get(target_id).ok_or("Jugador objetivo no encontrado")?;
        if target.party_id.is_some() {
            return Err(format!("{} ya pertenece a otro grupo.", target.name));
        }
        Ok((leader_name, target.name.clone()))
    }

    pub fn accept_party(&mut self, leader_id: &str, member_id: &str) -> Result<String, String> {
        let party_id = if let Some(p_id) = self.players.get(leader_id).and_then(|p| p.party_id.clone()) {
            p_id
        } else {
            let new_id = format!("party_{}", leader_id);
            self.parties.insert(new_id.clone(), crate::mmo::types::Party {
                id: new_id.clone(),
                leader_id: leader_id.to_string(),
                member_ids: vec![leader_id.to_string()],
            });
            if let Some(leader) = self.players.get_mut(leader_id) {
                leader.party_id = Some(new_id.clone());
            }
            new_id
        };

        if let Some(party) = self.parties.get_mut(&party_id) {
            if !party.member_ids.contains(&member_id.to_string()) {
                party.member_ids.push(member_id.to_string());
            }
        }
        if let Some(member) = self.players.get_mut(member_id) {
            member.party_id = Some(party_id.clone());
        }

        let l_name = self.players.get(leader_id).map(|p| p.name.clone()).unwrap_or_default();
        let m_name = self.players.get(member_id).map(|p| p.name.clone()).unwrap_or_default();
        self.chat_history.push(format!("🛡️ ¡{} se ha unido al grupo de {}!", m_name, l_name));

        Ok(party_id)
    }

    pub fn leave_party(&mut self, player_id: &str) -> Result<Option<String>, String> {
        let player = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;
        let party_id = player.party_id.take().ok_or("No estás en ningún grupo")?;
        let p_name = player.name.clone();

        let mut disband = false;
        if let Some(party) = self.parties.get_mut(&party_id) {
            party.member_ids.retain(|id| id != player_id);
            if party.member_ids.len() <= 1 {
                disband = true;
            }
        }

        if disband {
            if let Some(party) = self.parties.remove(&party_id) {
                for m_id in party.member_ids {
                    if let Some(m) = self.players.get_mut(&m_id) {
                        m.party_id = None;
                    }
                }
            }
            self.chat_history.push(format!("🛡️ El grupo se ha disuelto tras la salida de {}.", p_name));
            Ok(None)
        } else {
            self.chat_history.push(format!("🛡️ {} ha abandonado el grupo.", p_name));
            Ok(Some(party_id))
        }
    }

    // --- TIENDAS PRIVADAS ---
    pub fn open_private_shop(&mut self, seller_id: &str, title: String, offers: Vec<crate::mmo::types::ShopOffer>) -> Result<(), String> {
        let p = self.players.get(seller_id).ok_or("Jugador no encontrado")?;
        if p.in_combat_id.is_some() {
            return Err("No puedes abrir tienda en combate".to_string());
        }
        let seller_name = p.name.clone();
        let pos = p.pos;

        let mut items = Vec::new();
        for offer in offers {
            if offer.slot_index < p.inventory.len() {
                if let Some(ref it) = p.inventory[offer.slot_index] {
                    items.push(crate::mmo::types::ShopItemListing {
                        slot_index: offer.slot_index,
                        item: it.clone(),
                        price: offer.price,
                    });
                }
            }
        }

        if items.is_empty() {
            return Err("Debes poner al menos 1 objeto a la venta".to_string());
        }

        self.private_shops.insert(seller_id.to_string(), crate::mmo::types::WorldPrivateShop {
            seller_id: seller_id.to_string(),
            seller_name: seller_name.clone(),
            title: title.clone(),
            pos,
            items,
        });

        self.chat_history.push(format!("🏪 ¡{} ha abierto una tienda privada: \"{}\"!", seller_name, title));
        Ok(())
    }

    pub fn close_private_shop(&mut self, seller_id: &str) -> bool {
        if let Some(shop) = self.private_shops.remove(seller_id) {
            self.chat_history.push(format!("🏪 {} ha cerrado su tienda privada.", shop.seller_name));
            true
        } else {
            false
        }
    }

    pub fn buy_private_shop_item(&mut self, buyer_id: &str, seller_id: &str, shop_slot_index: usize) -> Result<(String, Item, u32), String> {
        if buyer_id == seller_id {
            return Err("No puedes comprar en tu propia tienda".to_string());
        }

        let shop = self.private_shops.get_mut(seller_id).ok_or("Tienda no encontrada")?;
        let listing_idx = shop.items.iter().position(|it| it.slot_index == shop_slot_index)
            .ok_or("Objeto no disponible en la tienda")?;
        let price = shop.items[listing_idx].price;
        let item = shop.items[listing_idx].item.clone();

        let buyer = self.players.get_mut(buyer_id).ok_or("Comprador no encontrado")?;
        if buyer.yang < price {
            return Err("No tienes suficiente Yang".to_string());
        }

        let empty_slot = buyer.inventory.iter().position(|s| s.is_none())
            .ok_or("Tu inventario está lleno")?;

        buyer.yang -= price;
        buyer.inventory[empty_slot] = Some(item.clone());

        // Quitar objeto del vendedor y darle el Yang
        if let Some(seller) = self.players.get_mut(seller_id) {
            seller.yang += price;
            if shop_slot_index < seller.inventory.len() {
                seller.inventory[shop_slot_index] = None;
            }
        }

        // Quitar de la tienda
        let mut shop_empty = false;
        if let Some(shop) = self.private_shops.get_mut(seller_id) {
            shop.items.remove(listing_idx);
            if shop.items.is_empty() {
                shop_empty = true;
            }
        }
        if shop_empty {
            self.private_shops.remove(seller_id);
        }

        let seller_name = self.players.get(seller_id).map(|p| p.name.clone()).unwrap_or_default();
        let buyer_name = self.players.get(buyer_id).map(|p| p.name.clone()).unwrap_or_default();
        let msg = format!("💰 ¡{} compró [{}] por {} Yang en la tienda de {}!", buyer_name, item.name, price, seller_name);
        self.chat_history.push(msg.clone());

        Ok((msg, item, price))
    }

    // --- COMERCIO 1v1 ---
    pub fn start_trade(&mut self, p1_id: &str, p2_id: &str) -> String {
        let trade_id = format!("trade_{}_{}", p1_id, p2_id);
        self.trades.insert(trade_id.clone(), crate::mmo::types::ActiveTradeSession {
            trade_id: trade_id.clone(),
            p1_id: p1_id.to_string(),
            p2_id: p2_id.to_string(),
            p1_items: Vec::new(),
            p1_yang: 0,
            p1_locked: false,
            p1_confirmed: false,
            p2_items: Vec::new(),
            p2_yang: 0,
            p2_locked: false,
            p2_confirmed: false,
        });
        trade_id
    }

    pub fn get_trade_update(&self, trade_id: &str) -> Option<crate::protocol::ServerMessage> {
        let t = self.trades.get(trade_id)?;
        let p1_name = self.players.get(&t.p1_id).map(|p| p.name.clone()).unwrap_or_default();
        let p2_name = self.players.get(&t.p2_id).map(|p| p.name.clone()).unwrap_or_default();
        Some(crate::protocol::ServerMessage::TradeUpdate {
            trade_id: t.trade_id.clone(),
            p1_id: t.p1_id.clone(),
            p2_id: t.p2_id.clone(),
            p1_name,
            p2_name,
            p1_items: t.p1_items.clone(),
            p1_yang: t.p1_yang,
            p1_locked: t.p1_locked,
            p1_confirmed: t.p1_confirmed,
            p2_items: t.p2_items.clone(),
            p2_yang: t.p2_yang,
            p2_locked: t.p2_locked,
            p2_confirmed: t.p2_confirmed,
        })
    }

    pub fn offer_trade_item(&mut self, player_id: &str, slot_index: usize) -> Result<crate::protocol::ServerMessage, String> {
        let trade_id = self.trades.iter()
            .find(|(_, t)| t.p1_id == player_id || t.p2_id == player_id)
            .map(|(id, _)| id.clone())
            .ok_or("No estás en ninguna sesión de comercio activa")?;

        let player = self.players.get(player_id).ok_or("Jugador no encontrado")?;
        let item = player.inventory.get(slot_index).and_then(|s| s.clone()).ok_or("No hay ningún objeto en esa ranura")?;

        let t = self.trades.get_mut(&trade_id).unwrap();
        if t.p1_id == player_id {
            if t.p1_items.len() >= 6 {
                return Err("Máximo 6 objetos por comercio".to_string());
            }
            if !t.p1_items.iter().any(|it| it.id == item.id) {
                t.p1_items.push(item);
            }
            t.p1_confirmed = false;
            t.p2_confirmed = false;
        } else {
            if t.p2_items.len() >= 6 {
                return Err("Máximo 6 objetos por comercio".to_string());
            }
            if !t.p2_items.iter().any(|it| it.id == item.id) {
                t.p2_items.push(item);
            }
            t.p1_confirmed = false;
            t.p2_confirmed = false;
        }

        self.get_trade_update(&trade_id).ok_or("Error generando actualización de comercio".to_string())
    }

    pub fn offer_trade_yang(&mut self, player_id: &str, yang: u32) -> Result<crate::protocol::ServerMessage, String> {
        let trade_id = self.trades.iter()
            .find(|(_, t)| t.p1_id == player_id || t.p2_id == player_id)
            .map(|(id, _)| id.clone())
            .ok_or("No estás en ninguna sesión de comercio activa")?;

        let player = self.players.get(player_id).ok_or("Jugador no encontrado")?;
        if yang > player.yang {
            return Err("No tienes suficiente Yang".to_string());
        }

        let t = self.trades.get_mut(&trade_id).unwrap();
        if t.p1_id == player_id {
            t.p1_yang = yang;
            t.p1_confirmed = false;
            t.p2_confirmed = false;
        } else {
            t.p2_yang = yang;
            t.p1_confirmed = false;
            t.p2_confirmed = false;
        }

        self.get_trade_update(&trade_id).ok_or("Error generando actualización de comercio".to_string())
    }

    pub fn confirm_trade(&mut self, player_id: &str) -> Result<(crate::protocol::ServerMessage, Option<(crate::protocol::ServerMessage, crate::protocol::ServerMessage)>), String> {
        let trade_id = self.trades.iter()
            .find(|(_, t)| t.p1_id == player_id || t.p2_id == player_id)
            .map(|(id, _)| id.clone())
            .ok_or("No estás en ninguna sesión de comercio activa")?;

        let (p1_confirmed, p2_confirmed, p1_id, p2_id, p1_items, p2_items, p1_yang, p2_yang) = {
            let t = self.trades.get_mut(&trade_id).unwrap();
            if t.p1_id == player_id {
                t.p1_confirmed = true;
            } else {
                t.p2_confirmed = true;
            }
            (t.p1_confirmed, t.p2_confirmed, t.p1_id.clone(), t.p2_id.clone(), t.p1_items.clone(), t.p2_items.clone(), t.p1_yang, t.p2_yang)
        };

        if p1_confirmed && p2_confirmed {
            // Verificar espacio en inventario de ambos jugadores
            let p1 = self.players.get(&p1_id).ok_or("Jugador 1 desconectado")?;
            let p2 = self.players.get(&p2_id).ok_or("Jugador 2 desconectado")?;

            if p1.yang < p1_yang || p2.yang < p2_yang {
                self.trades.remove(&trade_id);
                return Err("Fondos de Yang insuficientes para completar el intercambio".to_string());
            }

            // Realizar intercambio atómico
            let p1_mut = self.players.get_mut(&p1_id).unwrap();
            p1_mut.yang = p1_mut.yang - p1_yang + p2_yang;
            for item in &p1_items {
                if let Some(pos) = p1_mut.inventory.iter().position(|slot| slot.as_ref().map(|i| &i.id) == Some(&item.id)) {
                    p1_mut.inventory[pos] = None;
                }
            }
            for item in &p2_items {
                if let Some(pos) = p1_mut.inventory.iter().position(|slot| slot.is_none()) {
                    p1_mut.inventory[pos] = Some(item.clone());
                }
            }

            let p2_mut = self.players.get_mut(&p2_id).unwrap();
            p2_mut.yang = p2_mut.yang - p2_yang + p1_yang;
            for item in &p2_items {
                if let Some(pos) = p2_mut.inventory.iter().position(|slot| slot.as_ref().map(|i| &i.id) == Some(&item.id)) {
                    p2_mut.inventory[pos] = None;
                }
            }
            for item in &p1_items {
                if let Some(pos) = p2_mut.inventory.iter().position(|slot| slot.is_none()) {
                    p2_mut.inventory[pos] = Some(item.clone());
                }
            }

            self.trades.remove(&trade_id);

            let sync1 = self.get_inventory_sync(&p1_id).unwrap();
            let sync2 = self.get_inventory_sync(&p2_id).unwrap();

            let complete_msg = crate::protocol::ServerMessage::TradeCompleted {
                message: "🤝 ¡Comercio realizado con éxito entre ambos héroes!".to_string(),
            };

            Ok((complete_msg, Some((sync1, sync2))))
        } else {
            let update = self.get_trade_update(&trade_id).unwrap();
            Ok((update, None))
        }
    }

    pub fn cancel_trade(&mut self, player_id: &str) -> Option<crate::protocol::ServerMessage> {
        let trade_id = self.trades.iter()
            .find(|(_, t)| t.p1_id == player_id || t.p2_id == player_id)
            .map(|(id, _)| id.clone())?;

        self.trades.remove(&trade_id);
        Some(crate::protocol::ServerMessage::TradeCancelled)
    }

    pub fn turn_in_quest(&mut self, player_id: &str, quest_id: &str) -> Result<(String, crate::protocol::ServerMessage), String> {
        let player = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;

        let quest = player.quests.iter_mut().find(|q| q.id == quest_id).ok_or("Misión no encontrada")?;
        if !quest.is_completed {
            return Err("Aún no has completado los objetivos de esta misión".to_string());
        }
        if quest.is_turned_in {
            return Err("Ya has reclamado la recompensa de esta misión".to_string());
        }

        quest.is_turned_in = true;
        let exp = quest.reward_exp;
        let yang = quest.reward_yang;
        let title = quest.title.clone();
        let reward_item = quest.reward_item.clone();

        player.exp += exp;
        player.yang += yang;

        while player.exp >= player.max_exp {
            player.level += 1;
            player.stat_points += 3;
            player.max_exp = player.level * 300;
            player.max_hp += 20;
            player.hp = player.max_hp;
            self.chat_history.push(format!("🌟 ¡{} ha subido al Nivel {}! (+3 Puntos de Estado)", player.name, player.level));
        }

        let mut item_note = String::new();
        if let Some(item) = reward_item {
            if let Some(empty_idx) = player.inventory.iter().position(|s| s.is_none()) {
                let iname = item.name.clone();
                player.inventory[empty_idx] = Some(item);
                item_note = format!(" +[{}]", iname);
            }
        }

        let msg = format!("🏆 ¡Recompensa entregada por [{}]: +{} EXP, +{} Yang{}!", title, exp, yang, item_note);
        self.chat_history.push(msg.clone());

        let sync = crate::protocol::ServerMessage::InventorySync {
            player_id: Some(player_id.to_string()),
            inventory: player.inventory.clone(),
            equipped_weapon: player.equipped_weapon.clone(),
            equipped_armor: player.equipped_armor.clone(),
            yang: player.yang,
            quests: player.quests.clone(),
        };

        Ok((msg, sync))
    }

    // ==========================================
    // RECOLECCIÓN Y MINERÍA (GATHERING)
    // ==========================================
    pub fn gather_resource(&mut self, player_id: &str, node_id: &str) -> Result<(String, Item, u32), String> {
        let player = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;
        if player.in_combat_id.is_some() {
            return Err("No puedes recolectar mientras estás en combate".to_string());
        }

        let node = self.gather_nodes.iter_mut().find(|n| n.id == node_id).ok_or("Nodo de recolección no encontrado")?;
        if node.is_depleted {
            return Err("Este recurso está agotado temporalmente. Espera a que se regenere.".to_string());
        }

        if player.pos.distance(&node.pos) > 6.5 {
            return Err("Estás demasiado lejos del recurso para recolectar".to_string());
        }

        let next_id = ITEM_COUNTER.fetch_add(1, Ordering::Relaxed);
        let (item, count) = match node.node_type {
            GatherNodeType::Mining => {
                if node.id.contains("copper") {
                    (Item {
                        id: format!("ore_copper_{}", next_id),
                        name: "Mena de Cobre".to_string(),
                        item_type: ItemType::Material,
                        upgrade_level: 0,
                        attack_bonus: 0,
                        defense_bonus: 0,
                        hp_bonus: 0,
                        buy_price: 30,
                        icon: "🟧".to_string(),
                        description: "Mineral de cobre en bruto extraído de las canteras de la aldea.".to_string(),
                    durability: 100,
                    max_durability: 100,
                    }, 4)
                } else if node.id.contains("ebony") {
                    (Item {
                        id: format!("ore_ebony_{}", next_id),
                        name: "Mena de Ébano".to_string(),
                        item_type: ItemType::Material,
                        upgrade_level: 0,
                        attack_bonus: 0,
                        defense_bonus: 0,
                        hp_bonus: 0,
                        buy_price: 80,
                        icon: "⬛".to_string(),
                        description: "Mena oscura y densa de ébano, codiciada para forja militar.".to_string(),
                    durability: 100,
                    max_durability: 100,
                    }, 2)
                } else {
                    (Item {
                        id: format!("ore_iron_{}", next_id),
                        name: "Mena de Hierro".to_string(),
                        item_type: ItemType::Material,
                        upgrade_level: 0,
                        attack_bonus: 0,
                        defense_bonus: 0,
                        hp_bonus: 0,
                        buy_price: 50,
                        icon: "⛓️".to_string(),
                        description: "Trozo de mineral de hierro puro extraído de las rocas.".to_string(),
                    durability: 100,
                    max_durability: 100,
                    }, 3)
                }
            }
            GatherNodeType::Woodcutting => {
                (Item {
                    id: format!("wood_raw_{}", next_id),
                    name: "Madera de Sauce".to_string(),
                    item_type: ItemType::Material,
                    upgrade_level: 0,
                    attack_bonus: 0,
                    defense_bonus: 0,
                    hp_bonus: 0,
                    buy_price: 25,
                    icon: "🪵".to_string(),
                    description: "Tronco de madera noble apto para carpintería y forja.".to_string(),
                    durability: 100,
                    max_durability: 100,
                }, 4)
            }
            GatherNodeType::Fishing => {
                (Item {
                    id: format!("fish_carp_{}", next_id),
                    name: "Carpa Dorada".to_string(),
                    item_type: ItemType::Material,
                    upgrade_level: 0,
                    attack_bonus: 0,
                    defense_bonus: 0,
                    hp_bonus: 0,
                    buy_price: 40,
                    icon: "🐟".to_string(),
                    description: "Pez de agua dulce recién pescado. Puede cocinarse para elixires.".to_string(),
                    durability: 100,
                    max_durability: 100,
                }, 2)
            }
        };

        let free_slot = player.inventory.iter().position(|s| s.is_none()).ok_or("¡Inventario lleno! Guarda objetos en tu Almacén.")?;
        player.inventory[free_slot] = Some(item.clone());

        node.is_depleted = true;
        node.respawn_timer = 25.0;

        let msg = format!("⛏️ ¡Has extraído [{}] x{} de {}!", item.name, count, node.name);
        Ok((msg, item, count))
    }

    // ==========================================
    // CRAFTEO Y REFINADO (HORNO DE FUNDICIÓN)
    // ==========================================
    pub fn craft_item(&mut self, player_id: &str, recipe_id: &str) -> Result<(String, Item), String> {
        let player = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;

        let recipe = self.crafting_recipes.iter().find(|r| r.id == recipe_id).ok_or("Receta no encontrada")?.clone();

        if player.yang < recipe.required_yang {
            return Err(format!("Yang insuficiente. Necesitas {} Yang para esta forja.", recipe.required_yang));
        }

        // Comprobar materiales
        for (mat_name, required_count) in &recipe.required_materials {
            let available_count = player.inventory.iter()
                .filter_map(|s| s.as_ref())
                .filter(|item| item.name == *mat_name)
                .count() as u32;

            if available_count < *required_count {
                return Err(format!("Materiales insuficientes: necesitas {}x '{}' (tienes {}x).", required_count, mat_name, available_count));
            }
        }

        let free_slot = player.inventory.iter().position(|s| s.is_none()).ok_or("Inventario lleno. Necesitas al menos 1 espacio libre.")?;

        // Consumir materiales
        for (mat_name, required_count) in &recipe.required_materials {
            let mut to_remove = *required_count;
            for slot in player.inventory.iter_mut() {
                if to_remove == 0 {
                    break;
                }
                if let Some(item) = slot {
                    if item.name == *mat_name {
                        *slot = None;
                        to_remove -= 1;
                    }
                }
            }
        }

        player.yang -= recipe.required_yang;
        player.inventory[free_slot] = Some(recipe.result_item.clone());

        let msg = format!("🔥 ¡Has forjado con éxito: [{}]!", recipe.result_item.name);
        Ok((msg, recipe.result_item))
    }

    // ==========================================
    // ALMACÉN Y DEPÓSITO DE RECURSOS (STASH)
    // ==========================================
    pub fn get_stash_sync(&self, player_id: &str) -> Option<crate::protocol::ServerMessage> {
        let player = self.players.get(player_id)?;
        Some(crate::protocol::ServerMessage::StashSync {
            stash: player.stash.clone(),
            stash_yang: player.stash_yang,
        })
    }

    pub fn deposit_stash_item(&mut self, player_id: &str, slot_index: usize) -> Result<(), String> {
        let player = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;
        if slot_index >= player.inventory.len() {
            return Err("Slot de inventario inválido".to_string());
        }
        let item = player.inventory[slot_index].take().ok_or("No hay ningún objeto en ese espacio")?;
        let free_stash_slot = player.stash.iter().position(|s| s.is_none()).ok_or("Tu Almacén está lleno (máximo 24 objetos)")?;
        player.stash[free_stash_slot] = Some(item);
        Ok(())
    }

    pub fn withdraw_stash_item(&mut self, player_id: &str, stash_slot_index: usize) -> Result<(), String> {
        let player = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;
        if stash_slot_index >= player.stash.len() {
            return Err("Slot de almacén inválido".to_string());
        }
        let item = player.stash[stash_slot_index].take().ok_or("No hay ningún objeto en ese casillero del almacén")?;
        let free_inv_slot = player.inventory.iter().position(|s| s.is_none()).ok_or("Tu inventario está lleno")?;
        player.inventory[free_inv_slot] = Some(item);
        Ok(())
    }

    pub fn deposit_stash_yang(&mut self, player_id: &str, amount: u32) -> Result<(), String> {
        let player = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;
        if amount == 0 || player.yang < amount {
            return Err("No tienes suficiente Yang para depositar".to_string());
        }
        player.yang -= amount;
        player.stash_yang += amount;
        Ok(())
    }

    pub fn withdraw_stash_yang(&mut self, player_id: &str, amount: u32) -> Result<(), String> {
        let player = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;
        if amount == 0 || player.stash_yang < amount {
            return Err("No tienes suficiente Yang en el Almacén para retirar".to_string());
        }
        player.stash_yang -= amount;
        player.yang += amount;
        Ok(())
    }

    // ==========================================
    // MERCADO CENTRAL / CASA DE SUBASTAS
    // ==========================================
    pub fn list_market_item(&mut self, player_id: &str, slot_index: usize, price: u32) -> Result<String, String> {
        let player = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;
        if price == 0 {
            return Err("El precio debe ser superior a 0 Yang".to_string());
        }
        const LISTING_FEE: u32 = 50;
        if player.yang < LISTING_FEE {
            return Err(format!("Necesitas al menos {} Yang para pagar la tasa de listado de subasta.", LISTING_FEE));
        }
        if slot_index >= player.inventory.len() {
            return Err("Espacio de inventario no válido".to_string());
        }
        let item = player.inventory[slot_index].take().ok_or("No hay ningún objeto en ese espacio")?;
        player.yang -= LISTING_FEE;

        let listing_id = format!("mkt_{}", LISTING_COUNTER.fetch_add(1, Ordering::Relaxed));
        let item_name = item.name.clone();
        let seller_name = player.name.clone();

        self.market_listings.push(MarketListing {
            id: listing_id,
            seller_id: player_id.to_string(),
            seller_name,
            item,
            price,
            created_at: 0,
        });

        Ok(format!("🏷️ Has publicado [{}] en el Mercado Central por {} Yang (tasa: {} Yang).", item_name, price, LISTING_FEE))
    }

    pub fn buy_market_item(&mut self, buyer_id: &str, listing_id: &str) -> Result<(String, Option<String>), String> {
        let listing_idx = self.market_listings.iter().position(|l| l.id == listing_id).ok_or("Esta oferta ya no está disponible o ha sido comprada")?;
        let listing = self.market_listings[listing_idx].clone();

        if listing.seller_id == buyer_id {
            return Err("No puedes comprar tu propia oferta. Usa 'Cancelar Oferta' si quieres recuperarla.".to_string());
        }

        let buyer = self.players.get_mut(buyer_id).ok_or("Comprador no encontrado")?;
        if buyer.yang < listing.price {
            return Err(format!("Yang insuficiente. Este objeto cuesta {} Yang (tienes {}).", listing.price, buyer.yang));
        }

        let free_slot = buyer.inventory.iter().position(|s| s.is_none()).ok_or("Inventario lleno. Necesitas 1 espacio libre para recibir el objeto.")?;

        // Descontar Yang al comprador
        buyer.yang -= listing.price;
        buyer.inventory[free_slot] = Some(listing.item.clone());

        // Sumidero de economía (Tax Sink): 8% se destruye de la economía
        let tax = (listing.price as f32 * 0.08) as u32;
        let seller_payout = listing.price.saturating_sub(tax);

        let seller_id = listing.seller_id.clone();
        if let Some(seller) = self.players.get_mut(&seller_id) {
            seller.yang += seller_payout;
        }

        self.market_listings.remove(listing_idx);

        let msg = format!("🛒 ¡Has comprado [{}] por {} Yang! (Tasa de mercado quemada: {} Yang).", listing.item.name, listing.price, tax);
        Ok((msg, Some(seller_id)))
    }

    pub fn cancel_market_listing(&mut self, player_id: &str, listing_id: &str) -> Result<String, String> {
        let listing_idx = self.market_listings.iter().position(|l| l.id == listing_id).ok_or("Oferta no encontrada")?;
        if self.market_listings[listing_idx].seller_id != player_id {
            return Err("Solo el vendedor puede cancelar su propia oferta".to_string());
        }

        let player = self.players.get_mut(player_id).ok_or("Jugador no encontrado")?;
        let free_slot = player.inventory.iter().position(|s| s.is_none()).ok_or("Inventario lleno. Libera un espacio para recuperar tu objeto.")?;

        let listing = self.market_listings.remove(listing_idx);
        let item_name = listing.item.name.clone();
        player.inventory[free_slot] = Some(listing.item);

        Ok(format!("↩️ Oferta cancelada. [{}] ha vuelto a tu inventario.", item_name))
    }
}
