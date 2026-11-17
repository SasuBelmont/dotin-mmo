use rusqlite::{params, Connection, Result};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tracing::info;

use crate::game::types::CharacterClass;
use crate::mmo::types::{Item, ItemType, Quest, Vec2, WorldPlayer};

pub struct Database {
    conn: Connection,
}

fn hash_password(password: &str, salt: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(salt.as_bytes());
    hasher.update(password.as_bytes());
    let result = hasher.finalize();
    result.iter().map(|b| format!("{:02x}", b)).collect()
}

fn generate_salt() -> String {
    (0..16)
        .map(|_| format!("{:02x}", rand::random::<u8>()))
        .collect()
}

impl Database {
    pub fn open(db_path: &Path) -> Result<Self, String> {
        info!("Abriendo base de datos SQLite en: {:?}", db_path);
        let conn = Connection::open(db_path).map_err(|e| format!("Error abriendo SQLite: {}", e))?;

        // Configuración WAL para alto rendimiento y tolerancia a concurrencia
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA synchronous = NORMAL;"
        ).map_err(|e| format!("Error configurando PRAGMAs: {}", e))?;

        // Crear tablas necesarias
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS characters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_id INTEGER UNIQUE NOT NULL,
                name TEXT UNIQUE NOT NULL COLLATE NOCASE,
                class TEXT NOT NULL,
                gender TEXT NOT NULL DEFAULT 'male',
                outfit INTEGER NOT NULL DEFAULT 1,
                team INTEGER NOT NULL DEFAULT 0,
                kingdom TEXT NOT NULL DEFAULT 'Jinno',
                level INTEGER NOT NULL DEFAULT 1,
                exp INTEGER NOT NULL DEFAULT 0,
                max_exp INTEGER NOT NULL DEFAULT 100,
                yang INTEGER NOT NULL DEFAULT 250,
                hp INTEGER NOT NULL DEFAULT 160,
                max_hp INTEGER NOT NULL DEFAULT 160,
                stat_points INTEGER NOT NULL DEFAULT 0,
                skill_points INTEGER NOT NULL DEFAULT 0,
                vit INTEGER NOT NULL DEFAULT 10,
                int_stat INTEGER NOT NULL DEFAULT 10,
                str_stat INTEGER NOT NULL DEFAULT 10,
                dex INTEGER NOT NULL DEFAULT 10,
                subclass TEXT,
                skill_levels_json TEXT NOT NULL DEFAULT '{}',
                pos_x REAL NOT NULL DEFAULT -3.0,
                pos_z REAL NOT NULL DEFAULT 2.0,
                inventory_json TEXT NOT NULL DEFAULT '[]',
                equipped_weapon_json TEXT,
                equipped_armor_json TEXT,
                stash_json TEXT NOT NULL DEFAULT '[]',
                stash_yang INTEGER NOT NULL DEFAULT 0,
                quests_json TEXT NOT NULL DEFAULT '[]',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
            );"
        ).map_err(|e| format!("Error inicializando tablas en SQLite: {}", e))?;

        info!("Base de datos SQLite inicializada exitosamente.");
        Ok(Self { conn })
    }

    pub fn register(&mut self, username: &str, password: &str) -> Result<i64, String> {
        let username = username.trim();
        let password = password.trim();

        if username.len() < 3 || username.len() > 20 {
            return Err("El usuario debe tener entre 3 y 20 caracteres.".to_string());
        }
        if !username.chars().all(|c| c.is_alphanumeric() || c == '_') {
            return Err("El usuario solo puede contener letras, números y guión bajo (_).".to_string());
        }
        if password.len() < 4 || password.len() > 50 {
            return Err("La contraseña debe tener entre 4 y 50 caracteres.".to_string());
        }

        // Verificar si ya existe
        let mut stmt = self.conn.prepare("SELECT COUNT(*) FROM accounts WHERE username = ? COLLATE NOCASE")
            .map_err(|e| e.to_string())?;
        let count: i64 = stmt.query_row(params![username], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        if count > 0 {
            return Err("El nombre de usuario ya está registrado.".to_string());
        }

        let salt = generate_salt();
        let hash = hash_password(password, &salt);

        self.conn.execute(
            "INSERT INTO accounts (username, password_hash, salt) VALUES (?, ?, ?)",
            params![username, hash, salt],
        ).map_err(|e| format!("Error registrando cuenta: {}", e))?;

        let account_id = self.conn.last_insert_rowid();
        info!("Cuenta registrada exitosamente: {} (ID: {})", username, account_id);
        Ok(account_id)
    }

    pub fn login(&mut self, username: &str, password: &str) -> Result<i64, String> {
        let username = username.trim();
        let password = password.trim();

        let mut stmt = self.conn.prepare(
            "SELECT id, password_hash, salt FROM accounts WHERE username = ? COLLATE NOCASE"
        ).map_err(|e| e.to_string())?;

        let account_result = stmt.query_row(params![username], |row| {
            let id: i64 = row.get(0)?;
            let hash: String = row.get(1)?;
            let salt: String = row.get(2)?;
            Ok((id, hash, salt))
        });

        match account_result {
            Ok((id, expected_hash, salt)) => {
                let actual_hash = hash_password(password, &salt);
                if actual_hash == expected_hash {
                    info!("Login exitoso para usuario: {} (ID: {})", username, id);
                    Ok(id)
                } else {
                    Err("Usuario o contraseña incorrectos.".to_string())
                }
            }
            Err(_) => Err("Usuario o contraseña incorrectos.".to_string()),
        }
    }

    pub fn get_character_for_account(&mut self, account_id: i64) -> Result<Option<WorldPlayer>, String> {
        let mut stmt = self.conn.prepare(
            "SELECT id, account_id, name, class, gender, outfit, team, kingdom, level, exp, max_exp,
                    yang, hp, max_hp, stat_points, skill_points, vit, int_stat, str_stat, dex,
                    subclass, skill_levels_json, pos_x, pos_z, inventory_json, equipped_weapon_json,
                    equipped_armor_json, stash_json, stash_yang, quests_json
             FROM characters WHERE account_id = ?"
        ).map_err(|e| e.to_string())?;

        let mut rows = stmt.query(params![account_id]).map_err(|e| e.to_string())?;

        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let class_str: String = row.get(3).unwrap_or_default();
            let class = match class_str.as_str() {
                "Sura" => CharacterClass::Sura,
                "Ninja" => CharacterClass::Ninja,
                "Shaman" => CharacterClass::Shaman,
                _ => CharacterClass::Warrior,
            };

            let skill_levels_str: String = row.get(21).unwrap_or_else(|_| "{}".to_string());
            let skill_levels: HashMap<String, u8> = serde_json::from_str(&skill_levels_str).unwrap_or_default();

            let inventory_str: String = row.get(24).unwrap_or_else(|_| "[]".to_string());
            let mut inventory: Vec<Option<Item>> = serde_json::from_str(&inventory_str).unwrap_or_else(|_| vec![None; 64]);
            if inventory.len() < 64 {
                inventory.resize(64, None);
            }

            let weapon_str: Option<String> = row.get(25).ok();
            let equipped_weapon: Option<Item> = weapon_str.and_then(|s| serde_json::from_str(&s).ok());

            let armor_str: Option<String> = row.get(26).ok();
            let equipped_armor: Option<Item> = armor_str.and_then(|s| serde_json::from_str(&s).ok());

            let stash_str: String = row.get(27).unwrap_or_else(|_| "[]".to_string());
            let stash: Vec<Option<Item>> = serde_json::from_str(&stash_str).unwrap_or_else(|_| vec![None; 24]);

            let quests_str: String = row.get(29).unwrap_or_else(|_| "[]".to_string());
            let quests: Vec<Quest> = serde_json::from_str(&quests_str).unwrap_or_default();

            let player = WorldPlayer {
                id: "".to_string(), // Se asignará el socket client_id al conectarse
                name: row.get(2).map_err(|e| e.to_string())?,
                class,
                kingdom: row.get(7).unwrap_or_else(|_| "Jinno".to_string()),
                team: row.get::<_, i64>(6).unwrap_or(0) as u8,
                pos: Vec2::new(row.get(22).unwrap_or(-3.0), row.get(23).unwrap_or(2.0)),
                target_pos: None,
                speed: 7.5,
                level: row.get::<_, i64>(8).unwrap_or(1) as u32,
                exp: row.get::<_, i64>(9).unwrap_or(0) as u32,
                max_exp: row.get::<_, i64>(10).unwrap_or(100) as u32,
                yang: row.get::<_, i64>(11).unwrap_or(250) as u32,
                hp: row.get(12).unwrap_or(160),
                max_hp: row.get(13).unwrap_or(160),
                stat_points: row.get::<_, i64>(14).unwrap_or(0) as u32,
                skill_points: row.get::<_, i64>(15).unwrap_or(0) as u32,
                vit: row.get::<_, i64>(16).unwrap_or(10) as u32,
                int_stat: row.get::<_, i64>(17).unwrap_or(10) as u32,
                str_stat: row.get::<_, i64>(18).unwrap_or(10) as u32,
                dex: row.get::<_, i64>(19).unwrap_or(10) as u32,
                subclass: row.get(20).ok(),
                skill_levels,
                party_id: None,
                in_combat_id: None,
                inventory,
                equipped_weapon,
                equipped_armor,
                quests,
                stash,
                stash_yang: row.get::<_, i64>(28).unwrap_or(0) as u32,
                account_id: Some(account_id),
                gender: row.get(4).unwrap_or_else(|_| "male".to_string()),
                outfit: row.get::<_, i64>(5).unwrap_or(1) as u8,
            };

            Ok(Some(player))
        } else {
            Ok(None)
        }
    }

    pub fn create_character(
        &mut self,
        account_id: i64,
        name: &str,
        class: CharacterClass,
        gender: &str,
        outfit: u8,
        team: u8,
    ) -> Result<WorldPlayer, String> {
        let name = name.trim();
        if name.len() < 3 || name.len() > 16 {
            return Err("El nombre del personaje debe tener entre 3 y 16 caracteres.".to_string());
        }
        if !name.chars().all(|c| c.is_alphanumeric() || c == '_') {
            return Err("El nombre solo puede contener letras, números y guión bajo (_).".to_string());
        }

        // Verificar si la cuenta ya tiene un personaje (límite 1 ahora mismo)
        let mut stmt = self.conn.prepare("SELECT COUNT(*) FROM characters WHERE account_id = ?")
            .map_err(|e| e.to_string())?;
        let count: i64 = stmt.query_row(params![account_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        if count > 0 {
            return Err("Esta cuenta ya tiene un personaje creado.".to_string());
        }

        // Verificar si el nombre ya está en uso
        let mut stmt_name = self.conn.prepare("SELECT COUNT(*) FROM characters WHERE name = ? COLLATE NOCASE")
            .map_err(|e| e.to_string())?;
        let count_name: i64 = stmt_name.query_row(params![name], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        if count_name > 0 {
            return Err("El nombre de personaje ya está en uso por otro jugador.".to_string());
        }

        let kingdom = if team == 0 { "Jinno".to_string() } else { "Shinsoo".to_string() };
        let max_hp = match class {
            CharacterClass::Warrior => 160,
            CharacterClass::Sura => 140,
            CharacterClass::Ninja => 130,
            CharacterClass::Shaman => 120,
        };

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

        let mut inventory: Vec<Option<Item>> = vec![None; 20];
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

        let class_str = match class {
            CharacterClass::Warrior => "Warrior",
            CharacterClass::Sura => "Sura",
            CharacterClass::Ninja => "Ninja",
            CharacterClass::Shaman => "Shaman",
        };

        let inventory_json = serde_json::to_string(&inventory).unwrap_or_else(|_| "[]".to_string());
        let weapon_json = serde_json::to_string(&starter_weapon).unwrap_or_else(|_| "null".to_string());
        let quests_json = serde_json::to_string(&quests).unwrap_or_else(|_| "[]".to_string());
        let stash_json = serde_json::to_string(&vec![Option::<Item>::None; 24]).unwrap_or_else(|_| "[]".to_string());

        self.conn.execute(
            "INSERT INTO characters (
                account_id, name, class, gender, outfit, team, kingdom,
                level, exp, max_exp, yang, hp, max_hp, stat_points, skill_points,
                vit, int_stat, str_stat, dex, subclass, skill_levels_json,
                pos_x, pos_z, inventory_json, equipped_weapon_json, equipped_armor_json,
                stash_json, stash_yang, quests_json
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?,
                1, 0, 100, 250, ?, ?, 0, 0,
                10, 10, 10, 10, NULL, '{}',
                -3.0, 2.0, ?, ?, NULL,
                ?, 0, ?
            )",
            params![
                account_id, name, class_str, gender, outfit as i64, team as i64, kingdom,
                max_hp, max_hp,
                inventory_json, weapon_json, stash_json, quests_json
            ],
        ).map_err(|e| format!("Error guardando nuevo personaje en DB: {}", e))?;

        let player = WorldPlayer {
            id: "".to_string(),
            name: name.to_string(),
            class,
            kingdom,
            team,
            pos: Vec2::new(-3.0, 2.0),
            target_pos: None,
            speed: 7.5,
            level: 1,
            exp: 0,
            max_exp: 100,
            yang: 250,
            hp: max_hp,
            max_hp,
            stat_points: 0,
            skill_points: 0,
            vit: 10,
            int_stat: 10,
            str_stat: 10,
            dex: 10,
            subclass: None,
            skill_levels: HashMap::new(),
            party_id: None,
            in_combat_id: None,
            inventory,
            equipped_weapon: Some(starter_weapon),
            equipped_armor: None,
            quests,
            stash: vec![None; 24],
            stash_yang: 0,
            account_id: Some(account_id),
            gender: gender.to_string(),
            outfit,
        };

        info!("Personaje creado exitosamente en SQLite: {} para cuenta {}", name, account_id);
        Ok(player)
    }

    pub fn save_character(&mut self, player: &WorldPlayer) -> Result<(), String> {
        let _class_str = match player.class {
            CharacterClass::Warrior => "Warrior",
            CharacterClass::Sura => "Sura",
            CharacterClass::Ninja => "Ninja",
            CharacterClass::Shaman => "Shaman",
        };

        let skill_levels_json = serde_json::to_string(&player.skill_levels).unwrap_or_else(|_| "{}".to_string());
        let inventory_json = serde_json::to_string(&player.inventory).unwrap_or_else(|_| "[]".to_string());
        let weapon_json = player.equipped_weapon.as_ref().map(|w| serde_json::to_string(w).unwrap_or_default());
        let armor_json = player.equipped_armor.as_ref().map(|a| serde_json::to_string(a).unwrap_or_default());
        let stash_json = serde_json::to_string(&player.stash).unwrap_or_else(|_| "[]".to_string());
        let quests_json = serde_json::to_string(&player.quests).unwrap_or_else(|_| "[]".to_string());

        let res = self.conn.execute(
            "UPDATE characters SET
                level = ?,
                exp = ?,
                max_exp = ?,
                yang = ?,
                hp = ?,
                max_hp = ?,
                stat_points = ?,
                skill_points = ?,
                vit = ?,
                int_stat = ?,
                str_stat = ?,
                dex = ?,
                subclass = ?,
                skill_levels_json = ?,
                pos_x = ?,
                pos_z = ?,
                inventory_json = ?,
                equipped_weapon_json = ?,
                equipped_armor_json = ?,
                stash_json = ?,
                stash_yang = ?,
                quests_json = ?,
                updated_at = CURRENT_TIMESTAMP
             WHERE name = ? COLLATE NOCASE",
            params![
                player.level as i64,
                player.exp as i64,
                player.max_exp as i64,
                player.yang as i64,
                player.hp,
                player.max_hp,
                player.stat_points as i64,
                player.skill_points as i64,
                player.vit as i64,
                player.int_stat as i64,
                player.str_stat as i64,
                player.dex as i64,
                player.subclass,
                skill_levels_json,
                player.pos.x,
                player.pos.z,
                inventory_json,
                weapon_json,
                armor_json,
                stash_json,
                player.stash_yang as i64,
                quests_json,
                player.name
            ],
        ).map_err(|e| format!("Error guardando personaje '{}': {}", player.name, e))?;

        if res == 0 {
            // Si no se actualizó por nombre, intentar por account_id si está presente
            if let Some(acc_id) = player.account_id {
                self.conn.execute(
                    "UPDATE characters SET
                        level = ?, exp = ?, max_exp = ?, yang = ?, hp = ?, max_hp = ?,
                        stat_points = ?, skill_points = ?, vit = ?, int_stat = ?, str_stat = ?, dex = ?,
                        subclass = ?, skill_levels_json = ?, pos_x = ?, pos_z = ?, inventory_json = ?,
                        equipped_weapon_json = ?, equipped_armor_json = ?, stash_json = ?, stash_yang = ?,
                        quests_json = ?, updated_at = CURRENT_TIMESTAMP
                     WHERE account_id = ?",
                    params![
                        player.level as i64, player.exp as i64, player.max_exp as i64, player.yang as i64,
                        player.hp, player.max_hp, player.stat_points as i64, player.skill_points as i64,
                        player.vit as i64, player.int_stat as i64, player.str_stat as i64, player.dex as i64,
                        player.subclass, skill_levels_json, player.pos.x, player.pos.z, inventory_json,
                        weapon_json, armor_json, stash_json, player.stash_yang as i64, quests_json, acc_id
                    ],
                ).map_err(|e| format!("Error actualizando por account_id: {}", e))?;
            }
        }

        Ok(())
    }
}

pub fn get_default_db_path() -> PathBuf {
    if let Ok(env_path) = std::env::var("DATABASE_PATH") {
        return PathBuf::from(env_path);
    }
    let dev_path = PathBuf::from("C:\\Users\\JP\\Desktop\\Dotin\\server\\dotin.db");
    if dev_path.parent().map(|p| p.exists()).unwrap_or(false) {
        return dev_path;
    }
    PathBuf::from("dotin.db")
}
