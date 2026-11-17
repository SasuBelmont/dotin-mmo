use super::types::{CharacterClass, Spell};

pub fn get_basic_attack() -> Spell {
    Spell {
        id: "ataque_basico".to_string(),
        name: "Ataque Básico".to_string(),
        description: "Golpe físico básico con el arma equipada.".to_string(),
        ap_cost: 3,
        min_range: 1,
        max_range: 1,
        requires_los: true,
        is_linear: false,
        base_damage_min: 16,
        base_damage_max: 24,
        is_heal: false,
        is_self_buff: false,
        effect_key: "slash_red".to_string(),
    }
}

pub fn get_subclass_spells(class: CharacterClass, subclass: &str) -> Vec<Spell> {
    let mut spells = vec![get_basic_attack()];

    match (class, subclass.to_lowercase().as_str()) {
        // GUERRERO
        (CharacterClass::Warrior, "corporal") => {
            spells.push(Spell {
                id: "aura_espada".to_string(),
                name: "Aura de Espada".to_string(),
                description: "Canaliza tu energía marcial. Aumenta tu daño en +14 por 2 turnos.".to_string(),
                ap_cost: 2,
                min_range: 0,
                max_range: 0,
                requires_los: false,
                is_linear: false,
                base_damage_min: 0,
                base_damage_max: 0,
                is_heal: false,
                is_self_buff: true,
                effect_key: "aura_glow".to_string(),
            });
            spells.push(Spell {
                id: "giro_espada".to_string(),
                name: "Giro de Espada".to_string(),
                description: "Giro giratorio devastador que barre a los enemigos cercanos.".to_string(),
                ap_cost: 3,
                min_range: 1,
                max_range: 2,
                requires_los: true,
                is_linear: false,
                base_damage_min: 24,
                base_damage_max: 34,
                is_heal: false,
                is_self_buff: false,
                effect_key: "slash_red".to_string(),
            });
            spells.push(Spell {
                id: "corte_tres_maneras".to_string(),
                name: "Corte de Tres Vías".to_string(),
                description: "Tres rápidos tajos mortales cuerpo a cuerpo.".to_string(),
                ap_cost: 4,
                min_range: 1,
                max_range: 1,
                requires_los: true,
                is_linear: false,
                base_damage_min: 32,
                base_damage_max: 42,
                is_heal: false,
                is_self_buff: false,
                effect_key: "slash_red".to_string(),
            });
            spells.push(Spell {
                id: "berserk".to_string(),
                name: "Berserk".to_string(),
                description: "Furia ciega. Aumenta tu daño en +10 pero reduce defensa.".to_string(),
                ap_cost: 2,
                min_range: 0,
                max_range: 0,
                requires_los: false,
                is_linear: false,
                base_damage_min: 0,
                base_damage_max: 0,
                is_heal: false,
                is_self_buff: true,
                effect_key: "aura_glow".to_string(),
            });
        }
        (CharacterClass::Warrior, "mental") | (CharacterClass::Warrior, _) => {
            spells.push(Spell {
                id: "cuerpo_fuerte".to_string(),
                name: "Cuerpo Fuerte".to_string(),
                description: "Endurece el cuerpo como el acero. Reduce el daño recibido en 14 por 2 turnos.".to_string(),
                ap_cost: 2,
                min_range: 0,
                max_range: 0,
                requires_los: false,
                is_linear: false,
                base_damage_min: 0,
                base_damage_max: 0,
                is_heal: false,
                is_self_buff: true,
                effect_key: "dark_shield".to_string(),
            });
            spells.push(Spell {
                id: "pulso_espiritual".to_string(),
                name: "Pulso Espiritual".to_string(),
                description: "Golpe destructivo concentrado que hace temblar el suelo.".to_string(),
                ap_cost: 4,
                min_range: 1,
                max_range: 2,
                requires_los: true,
                is_linear: false,
                base_damage_min: 30,
                base_damage_max: 44,
                is_heal: false,
                is_self_buff: false,
                effect_key: "shockwave".to_string(),
            });
            spells.push(Spell {
                id: "golpe_espada".to_string(),
                name: "Golpe de Espada".to_string(),
                description: "Onda de choque penetrante en línea recta.".to_string(),
                ap_cost: 3,
                min_range: 2,
                max_range: 4,
                requires_los: true,
                is_linear: true,
                base_damage_min: 22,
                base_damage_max: 32,
                is_heal: false,
                is_self_buff: false,
                effect_key: "shockwave".to_string(),
            });
            spells.push(Spell {
                id: "tocon".to_string(),
                name: "Tocón".to_string(),
                description: "Pisotón atronador en área que aturde a los rivales.".to_string(),
                ap_cost: 3,
                min_range: 1,
                max_range: 2,
                requires_los: true,
                is_linear: false,
                base_damage_min: 20,
                base_damage_max: 28,
                is_heal: false,
                is_self_buff: false,
                effect_key: "shockwave".to_string(),
            });
        }

        // NINJA
        (CharacterClass::Ninja, "asesino") | (CharacterClass::Ninja, _) => {
            spells.push(Spell {
                id: "emboscada".to_string(),
                name: "Emboscada".to_string(),
                description: "Apuñalamiento por la espalda con daño crítico masivo.".to_string(),
                ap_cost: 3,
                min_range: 1,
                max_range: 1,
                requires_los: true,
                is_linear: false,
                base_damage_min: 30,
                base_damage_max: 46,
                is_heal: false,
                is_self_buff: false,
                effect_key: "dagger_slash".to_string(),
            });
            spells.push(Spell {
                id: "ataque_rapido".to_string(),
                name: "Ataque Rápido".to_string(),
                description: "Te deslizas velozmente tras la víctima y atacas.".to_string(),
                ap_cost: 3,
                min_range: 1,
                max_range: 3,
                requires_los: true,
                is_linear: false,
                base_damage_min: 24,
                base_damage_max: 34,
                is_heal: false,
                is_self_buff: false,
                effect_key: "dagger_slash".to_string(),
            });
            spells.push(Spell {
                id: "nube_venenosa".to_string(),
                name: "Nube Venenosa".to_string(),
                description: "Exhala una nube tóxica que daña ignorando obstáculos.".to_string(),
                ap_cost: 3,
                min_range: 1,
                max_range: 4,
                requires_los: false,
                is_linear: false,
                base_damage_min: 20,
                base_damage_max: 30,
                is_heal: false,
                is_self_buff: false,
                effect_key: "poison_smoke".to_string(),
            });
        }

        // SURA
        (CharacterClass::Sura, "magia negra") | (CharacterClass::Sura, _) => {
            spells.push(Spell {
                id: "golpe_llama".to_string(),
                name: "Golpe de Llama".to_string(),
                description: "Llama infernal concentrada que calcina a corta distancia.".to_string(),
                ap_cost: 3,
                min_range: 1,
                max_range: 2,
                requires_los: true,
                is_linear: false,
                base_damage_min: 26,
                base_damage_max: 38,
                is_heal: false,
                is_self_buff: false,
                effect_key: "flame_burst".to_string(),
            });
            spells.push(Spell {
                id: "espiritu_llama".to_string(),
                name: "Espíritu de la Llama".to_string(),
                description: "Orbe ígneo guiado por almas en pena a larga distancia.".to_string(),
                ap_cost: 4,
                min_range: 2,
                max_range: 5,
                requires_los: true,
                is_linear: false,
                base_damage_min: 28,
                base_damage_max: 40,
                is_heal: false,
                is_self_buff: false,
                effect_key: "fireball".to_string(),
            });
            spells.push(Spell {
                id: "proteccion_oscura".to_string(),
                name: "Protección Oscura".to_string(),
                description: "Escudo místico que absorbe daño por 2 turnos.".to_string(),
                ap_cost: 2,
                min_range: 0,
                max_range: 0,
                requires_los: false,
                is_linear: false,
                base_damage_min: 0,
                base_damage_max: 0,
                is_heal: false,
                is_self_buff: true,
                effect_key: "dark_shield".to_string(),
            });
        }

        // CHAMÁN
        (CharacterClass::Shaman, _) => {
            spells.push(Spell {
                id: "disparo_dragon".to_string(),
                name: "Disparo de Dragón".to_string(),
                description: "Canaliza las llamas de los dragones celestiales.".to_string(),
                ap_cost: 3,
                min_range: 1,
                max_range: 4,
                requires_los: true,
                is_linear: false,
                base_damage_min: 22,
                base_damage_max: 34,
                is_heal: false,
                is_self_buff: false,
                effect_key: "dragon_flame".to_string(),
            });
            spells.push(Spell {
                id: "curacion".to_string(),
                name: "Curación Divina".to_string(),
                description: "Restaura salud a un aliado o a ti mismo.".to_string(),
                ap_cost: 3,
                min_range: 0,
                max_range: 4,
                requires_los: false,
                is_linear: false,
                base_damage_min: 26,
                base_damage_max: 42,
                is_heal: true,
                is_self_buff: false,
                effect_key: "holy_light".to_string(),
            });
            spells.push(Spell {
                id: "bendicion".to_string(),
                name: "Bendición".to_string(),
                description: "Protección divina que reduce el daño recibido por 2 turnos.".to_string(),
                ap_cost: 2,
                min_range: 0,
                max_range: 3,
                requires_los: true,
                is_linear: false,
                base_damage_min: 0,
                base_damage_max: 0,
                is_heal: false,
                is_self_buff: true,
                effect_key: "blessing_glow".to_string(),
            });
        }
    }

    spells
}

pub fn get_class_spells(class: CharacterClass) -> Vec<Spell> {
    // Por defecto devuelve el ataque básico
    vec![get_basic_attack()]
}
