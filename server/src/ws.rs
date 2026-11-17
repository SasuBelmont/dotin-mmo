use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{broadcast, Mutex};
use tracing::{error, info};

use crate::db::Database;
use crate::game::state::GameStatus;
use crate::mmo::world::WorldManager;
use crate::protocol::{CharacterSummary, ClientMessage, ServerMessage};

static NEXT_CLIENT_ID: AtomicUsize = AtomicUsize::new(1);

#[derive(Clone)]
pub struct AppState {
    pub world: Arc<Mutex<WorldManager>>,
    pub tx: broadcast::Sender<ServerMessage>,
    pub db: Arc<Mutex<Database>>,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, app_state: AppState) {
    let client_id = format!("player_{}", NEXT_CLIENT_ID.fetch_add(1, Ordering::Relaxed));
    info!("Nuevo cliente MMO conectado: {}", client_id);

    let (mut sender, mut receiver) = socket.split();
    let mut rx = app_state.tx.subscribe();

    // Enviar bienvenida con el estado inicial del mundo
    {
        let world = app_state.world.lock().await;
        let welcome = ServerMessage::Welcome {
            your_id: client_id.clone(),
            players: world.players.values().cloned().collect(),
            mobs: world.mobs.clone(),
            npcs: world.npcs.clone(),
            markers: world.get_active_markers(),
            gather_nodes: world.gather_nodes.clone(),
            market_listings: world.market_listings.clone(),
        };
        if let Ok(json) = serde_json::to_string(&welcome) {
            let _ = sender.send(Message::Text(json.into())).await;
        }
    }

    // Tarea de envío de mensajes desde broadcast
    let client_id_clone = client_id.clone();
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if let Ok(json) = serde_json::to_string(&msg) {
                if sender.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
        }
    });

    // Tarea de recepción de mensajes del cliente
    let app_state_clone = app_state.clone();
    let current_id = client_id.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(message)) = receiver.next().await {
            if let Message::Text(text) = message {
                match serde_json::from_str::<ClientMessage>(&text) {
                    Ok(client_msg) => {
                        handle_client_message(&current_id, client_msg, &app_state_clone).await;
                    }
                    Err(e) => {
                        error!("Error deserializando mensaje de {}: {}", current_id, e);
                    }
                }
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => {},
        _ = (&mut recv_task) => {},
    }

    // Al desconectarse
    {
        let mut world = app_state.world.lock().await;
        if let Some(removed_player) = world.remove_player(&client_id_clone) {
            if removed_player.account_id.is_some() {
                let db_clone = app_state.db.clone();
                tokio::spawn(async move {
                    let mut db = db_clone.lock().await;
                    if let Err(e) = db.save_character(&removed_player) {
                        error!("Error guardando personaje al desconectar: {}", e);
                    } else {
                        info!("Progreso de '{}' guardado en SQLite al desconectarse.", removed_player.name);
                    }
                });
            }
        }
        let _ = app_state.tx.send(ServerMessage::WorldUpdate {
            players: world.players.values().cloned().collect(),
            mobs: world.mobs.clone(),
            markers: world.get_active_markers(),
            gather_nodes: world.gather_nodes.clone(),
        });
    }

    info!("Cliente desconectado: {}", client_id_clone);
}

async fn handle_client_message(client_id: &str, msg: ClientMessage, app_state: &AppState) {
    match msg {
        ClientMessage::Login { username, password } => {
            let mut db = app_state.db.lock().await;
            match db.login(&username, &password) {
                Ok(account_id) => {
                    let char_opt = match db.get_character_for_account(account_id) {
                        Ok(c) => c,
                        Err(e) => {
                            error!("Error al obtener personaje para cuenta {}: {}", account_id, e);
                            None
                        }
                    };
                    let summary = char_opt.map(|p| CharacterSummary {
                        name: p.name,
                        class: p.class,
                        gender: p.gender,
                        outfit: p.outfit,
                        team: p.team,
                        kingdom: p.kingdom,
                        level: p.level,
                        exp: p.exp,
                        yang: p.yang,
                        hp: p.hp,
                        max_hp: p.max_hp,
                    });
                    let _ = app_state.tx.send(ServerMessage::AuthSuccess {
                        client_id: client_id.to_string(),
                        account_id,
                        username,
                        character: summary,
                    });
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::AuthError {
                        client_id: client_id.to_string(),
                        message: err,
                    });
                }
            }
            return;
        }
        ClientMessage::Register { username, password } => {
            let mut db = app_state.db.lock().await;
            match db.register(&username, &password) {
                Ok(account_id) => {
                    let _ = app_state.tx.send(ServerMessage::AuthSuccess {
                        client_id: client_id.to_string(),
                        account_id,
                        username,
                        character: None,
                    });
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::AuthError {
                        client_id: client_id.to_string(),
                        message: err,
                    });
                }
            }
            return;
        }
        ClientMessage::CreateCharacter { account_id, name, class, gender, outfit, team } => {
            let db_res = {
                let mut db = app_state.db.lock().await;
                db.create_character(account_id, &name, class, &gender, outfit, team)
            };
            match db_res {
                Ok(mut player) => {
                    player.id = client_id.to_string();
                    let player_name = player.name.clone();
                    let mut world = app_state.world.lock().await;
                    world.add_existing_player(player, client_id.to_string());
                    let _ = app_state.tx.send(ServerMessage::WorldUpdate {
                        players: world.players.values().cloned().collect(),
                        mobs: world.mobs.clone(),
                        markers: world.get_active_markers(),
                        gather_nodes: world.gather_nodes.clone(),
                    });
                    if let Some(sync) = world.get_inventory_sync(client_id) {
                        let _ = app_state.tx.send(sync);
                    }
                    if let Some(stats) = world.get_stats_sync(client_id) {
                        let _ = app_state.tx.send(stats);
                    }
                    let shops = world.private_shops.values().cloned().collect();
                    let _ = app_state.tx.send(ServerMessage::PrivateShopsUpdate { shops });
                    let _ = app_state.tx.send(ServerMessage::ChatBroadcast {
                        message: format!("¡Un nuevo héroe ha nacido en el reino: {}!", player_name),
                    });
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
            return;
        }
        ClientMessage::SelectCharacter { account_id, name: _ } => {
            let db_res = {
                let mut db = app_state.db.lock().await;
                db.get_character_for_account(account_id)
            };
            match db_res {
                Ok(Some(mut player)) => {
                    player.id = client_id.to_string();
                    let player_name = player.name.clone();
                    let mut world = app_state.world.lock().await;
                    world.add_existing_player(player, client_id.to_string());
                    let _ = app_state.tx.send(ServerMessage::WorldUpdate {
                        players: world.players.values().cloned().collect(),
                        mobs: world.mobs.clone(),
                        markers: world.get_active_markers(),
                        gather_nodes: world.gather_nodes.clone(),
                    });
                    if let Some(sync) = world.get_inventory_sync(client_id) {
                        let _ = app_state.tx.send(sync);
                    }
                    if let Some(stats) = world.get_stats_sync(client_id) {
                        let _ = app_state.tx.send(stats);
                    }
                    let shops = world.private_shops.values().cloned().collect();
                    let _ = app_state.tx.send(ServerMessage::PrivateShopsUpdate { shops });
                    let _ = app_state.tx.send(ServerMessage::ChatBroadcast {
                        message: format!("¡{} ha regresado a la Aldea!", player_name),
                    });
                }
                Ok(None) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError {
                        message: "No se encontró ningún personaje asociado a esta cuenta.".to_string(),
                    });
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
            return;
        }
        _ => {}
    }

    let mut world = app_state.world.lock().await;

    match msg {
        ClientMessage::Join { name, class, team } => {
            world.add_player(client_id.to_string(), name, class, team);
            let _ = app_state.tx.send(ServerMessage::WorldUpdate {
                players: world.players.values().cloned().collect(),
                mobs: world.mobs.clone(),
                markers: world.get_active_markers(),
                gather_nodes: world.gather_nodes.clone(),
            });
            if let Some(sync) = world.get_inventory_sync(client_id) {
                let _ = app_state.tx.send(sync);
            }
            if let Some(stats) = world.get_stats_sync(client_id) {
                let _ = app_state.tx.send(stats);
            }
            let shops = world.private_shops.values().cloned().collect();
            let _ = app_state.tx.send(ServerMessage::PrivateShopsUpdate { shops });
            let _ = app_state.tx.send(ServerMessage::ChatBroadcast {
                message: format!("¡Un nuevo héroe ha llegado a la Aldea!"),
            });
        }
        ClientMessage::WorldMove { target } => {
            world.set_player_destination(client_id, target);
        }
        ClientMessage::WorldSyncPos { pos, target } => {
            world.sync_player_position(client_id, pos, target);
        }
        ClientMessage::StartMobCombat { mob_id } => {
            match world.start_combat_with_mob(client_id, &mob_id) {
                Ok(combat_id) => {
                    let room = world.combats.get(&combat_id).unwrap();
                    let state = room.game_state.clone();

                    let _ = app_state.tx.send(ServerMessage::EnteredCombat {
                        combat_id: combat_id.clone(),
                        state,
                        is_leader: true,
                        player_id: Some(client_id.to_string()),
                    });
                    let _ = app_state.tx.send(ServerMessage::WorldUpdate {
                        players: world.players.values().cloned().collect(),
                        mobs: world.mobs.clone(),
                        markers: world.get_active_markers(),
                        gather_nodes: world.gather_nodes.clone(),
                    });
                    let _ = app_state.tx.send(ServerMessage::ChatBroadcast {
                        message: format!("⚔️ ¡Combate iniciado en el exterior de la aldea!"),
                    });
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::JoinCombat { combat_id } => {
            match world.join_combat_instance(client_id, &combat_id) {
                Ok(_) => {
                    let room = world.combats.get(&combat_id).unwrap();
                    let state = room.game_state.clone();

                    let _ = app_state.tx.send(ServerMessage::EnteredCombat {
                        combat_id: combat_id.clone(),
                        state: state.clone(),
                        is_leader: false,
                        player_id: Some(client_id.to_string()),
                    });
                    let _ = app_state.tx.send(ServerMessage::CombatStateUpdate {
                        combat_id: combat_id.clone(),
                        state,
                    });
                    let _ = app_state.tx.send(ServerMessage::WorldUpdate {
                        players: world.players.values().cloned().collect(),
                        mobs: world.mobs.clone(),
                        markers: world.get_active_markers(),
                        gather_nodes: world.gather_nodes.clone(),
                    });
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::StartCombatNow { combat_id } => {
            let res = world.start_combat_now(client_id, &combat_id);
            match res {
                Ok(active_id) => {
                    let room = world.combats.get(&combat_id).unwrap();
                    let state = room.game_state.clone();
                    let is_bot = room.game_state.players.iter().find(|p| p.id == active_id).map(|p| p.is_bot).unwrap_or(false);

                    let _ = app_state.tx.send(ServerMessage::CombatStateUpdate {
                        combat_id: combat_id.clone(),
                        state,
                    });
                    let _ = app_state.tx.send(ServerMessage::CombatTurnChanged {
                        combat_id: combat_id.clone(),
                        active_player_id: active_id.clone(),
                        turn_count: 1,
                    });

                    if is_bot {
                        drop(world);
                        let app_state_clone = app_state.clone();
                        let c_id = combat_id.clone();
                        tokio::spawn(async move {
                            process_combat_bot_turn(app_state_clone, c_id).await;
                        });
                    }
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::CombatMove { combat_id, target } => {
            if let Some(room) = world.combats.get_mut(&combat_id) {
                // Silently ignore moves when combat is not actively in battle
                if room.game_state.status != GameStatus::InBattle {
                    return;
                }
                match room.game_state.move_player(client_id, target) {
                    Ok(path) => {
                        let pm = room.game_state.players.iter().find(|p| p.id == client_id).map(|p| p.pm).unwrap_or(0);
                        let _ = app_state.tx.send(ServerMessage::CombatPlayerMoved {
                            combat_id: combat_id.clone(),
                            player_id: client_id.to_string(),
                            path,
                            remaining_pm: pm,
                        });
                        let _ = app_state.tx.send(ServerMessage::CombatStateUpdate {
                            combat_id: combat_id.clone(),
                            state: room.game_state.clone(),
                        });
                    }
                    Err(_err) => {
                        // Silenciosamente ignorar clics fuera de rango en combate (estilo Dofus)
                    }
                }
            }
        }
        ClientMessage::CombatCastSpell { combat_id, spell_id, target } => {
            if let Some(room) = world.combats.get_mut(&combat_id) {
                match room.game_state.cast_spell(client_id, &spell_id, target) {
                    Ok(result) => {
                        let ap = room.game_state.players.iter().find(|p| p.id == client_id).map(|p| p.ap).unwrap_or(0);
                        let _ = app_state.tx.send(ServerMessage::CombatSpellCast {
                            combat_id: combat_id.clone(),
                            result,
                            remaining_ap: ap,
                        });
                        let _ = app_state.tx.send(ServerMessage::CombatStateUpdate {
                            combat_id: combat_id.clone(),
                            state: room.game_state.clone(),
                        });
                    }
                    Err(err) => {
                        let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                    }
                }
            }
        }
        ClientMessage::CombatPassTurn { combat_id } => {
            let mut bot_needed = false;
            if let Some(room) = world.combats.get_mut(&combat_id) {
                match room.game_state.pass_turn() {
                    Ok(next_active_id) => {
                        room.turn_timer = 25.0; // Reiniciar temporizador de turno
                        let turn_count = room.game_state.turn_count;
                        let _ = app_state.tx.send(ServerMessage::CombatTurnChanged {
                            combat_id: combat_id.clone(),
                            active_player_id: next_active_id.clone(),
                            turn_count,
                        });
                        let _ = app_state.tx.send(ServerMessage::CombatStateUpdate {
                            combat_id: combat_id.clone(),
                            state: room.game_state.clone(),
                        });

                        // Chequear si el siguiente turno es un bot
                        if let Some(next_p) = room.game_state.players.iter().find(|p| p.id == next_active_id) {
                            if next_p.is_bot {
                                bot_needed = true;
                            }
                        }
                    }
                    Err(err) => {
                        let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                    }
                }
            }

            if bot_needed {
                drop(world);
                let app_state_clone = app_state.clone();
                let c_id = combat_id.clone();
                tokio::spawn(async move {
                    process_combat_bot_turn(app_state_clone, c_id).await;
                });
            }
        }
        ClientMessage::ChatMessage { text } => {
            let sender_name = world.players.get(client_id)
                .map(|p| p.name.clone())
                .unwrap_or_else(|| "Aventurero".to_string());
            let log_msg = format!("{}: {}", sender_name, text);
            world.chat_history.push(log_msg.clone());
            let _ = app_state.tx.send(ServerMessage::ChatBroadcast { message: log_msg });
        }
        ClientMessage::InteractNPC { npc_id } => {
            if let Some(dialog) = world.get_npc_dialog(&npc_id, client_id) {
                let _ = app_state.tx.send(dialog);
            }
        }
        ClientMessage::BuyShopItem { item_id } => {
            match world.buy_shop_item(client_id, &item_id) {
                Ok(sync) => {
                    let _ = app_state.tx.send(sync);
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::UpgradeItem { slot_index } => {
            match world.upgrade_item(client_id, slot_index) {
                Ok((upgrade_res, sync)) => {
                    let _ = app_state.tx.send(upgrade_res);
                    let _ = app_state.tx.send(sync);
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::EquipItem { slot_index } => {
            match world.equip_item(client_id, slot_index) {
                Ok(sync) => {
                    let _ = app_state.tx.send(sync);
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::UnequipItem { slot_type } => {
            match world.unequip_item(client_id, &slot_type) {
                Ok(sync) => {
                    let _ = app_state.tx.send(sync);
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::UseItem { slot_index } => {
            match world.use_item(client_id, slot_index) {
                Ok((_msg, sync)) => {
                    let _ = app_state.tx.send(sync);
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::AcceptQuest { quest_id: _ } => {
            // Ya vienen asignadas al jugador, pero si en el futuro se requieren más:
            if let Some(sync) = world.get_inventory_sync(client_id) {
                let _ = app_state.tx.send(sync);
            }
        }
        ClientMessage::TurnInQuest { quest_id } => {
            match world.turn_in_quest(client_id, &quest_id) {
                Ok((_msg, sync)) => {
                    let _ = app_state.tx.send(sync);
                    if let Some(stats) = world.get_stats_sync(client_id) {
                        let _ = app_state.tx.send(stats);
                    }
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::RequestDuel { target_player_id } => {
            let challenger_name = world.players.get(client_id).map(|p| p.name.clone()).unwrap_or_default();
            if let Some(target) = world.players.get(&target_player_id) {
                if target.in_combat_id.is_some() {
                    let _ = app_state.tx.send(ServerMessage::ActionError {
                        message: format!("{} ya se encuentra en combate.", target.name),
                    });
                } else {
                    let _ = app_state.tx.send(ServerMessage::DuelRequested {
                        challenger_id: client_id.to_string(),
                        challenger_name: challenger_name.clone(),
                    });
                    let _ = app_state.tx.send(ServerMessage::ChatBroadcast {
                        message: format!("⚔️ ¡{} retó en Duelo de Honor a {}!", challenger_name, target.name),
                    });
                }
            } else {
                let _ = app_state.tx.send(ServerMessage::ActionError {
                    message: "Jugador no encontrado.".to_string(),
                });
            }
        }
        ClientMessage::RespondDuel { challenger_id, accept } => {
            let target_name = world.players.get(client_id).map(|p| p.name.clone()).unwrap_or_default();
            if !accept {
                let _ = app_state.tx.send(ServerMessage::DuelResponse {
                    target_id: client_id.to_string(),
                    target_name: target_name.clone(),
                    accepted: false,
                });
                let _ = app_state.tx.send(ServerMessage::ChatBroadcast {
                    message: format!("❌ {} declinó el Duelo de Honor.", target_name),
                });
            } else {
                match world.start_duel(&challenger_id, client_id) {
                    Ok(duel_id) => {
                        let room = world.combats.get(&duel_id).unwrap();
                        let active_id = room.game_state.current_player_id().cloned().unwrap_or_default();
                        let state = room.game_state.clone();

                        let _ = app_state.tx.send(ServerMessage::EnteredCombat {
                            combat_id: duel_id.clone(),
                            state: state.clone(),
                            is_leader: true,
                            player_id: Some(challenger_id.clone()),
                        });
                        let _ = app_state.tx.send(ServerMessage::EnteredCombat {
                            combat_id: duel_id.clone(),
                            state: state.clone(),
                            is_leader: false,
                            player_id: Some(client_id.to_string()),
                        });
                        let _ = app_state.tx.send(ServerMessage::CombatTurnChanged {
                            combat_id: duel_id.clone(),
                            active_player_id: active_id,
                            turn_count: 1,
                        });
                    }
                    Err(err) => {
                        let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                    }
                }
            }
        }
        ClientMessage::AllocateStat { stat } => {
            match world.allocate_stat(client_id, &stat) {
                Ok(msg) => {
                    let _ = app_state.tx.send(msg);
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::InviteParty { target_player_id } => {
            match world.invite_party(client_id, &target_player_id) {
                Ok((leader_name, target_name)) => {
                    let _ = app_state.tx.send(ServerMessage::PartyInviteReceived {
                        leader_id: client_id.to_string(),
                        leader_name: leader_name.clone(),
                    });
                    let _ = app_state.tx.send(ServerMessage::ChatBroadcast {
                        message: format!("🛡️ {} invitó a {} a formar un grupo.", leader_name, target_name),
                    });
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::RespondParty { leader_id, accept } => {
            if !accept {
                let responder_name = world.players.get(client_id).map(|p| p.name.clone()).unwrap_or_default();
                let _ = app_state.tx.send(ServerMessage::ChatBroadcast {
                    message: format!("❌ {} declinó la invitación de grupo.", responder_name),
                });
            } else {
                match world.accept_party(&leader_id, client_id) {
                    Ok(party_id) => {
                        let members = world.get_party_members_info(&party_id);
                        let _ = app_state.tx.send(ServerMessage::PartyUpdate {
                            party_id,
                            leader_id,
                            members,
                        });
                    }
                    Err(err) => {
                        let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                    }
                }
            }
        }
        ClientMessage::LeaveParty => {
            match world.leave_party(client_id) {
                Ok(Some(party_id)) => {
                    let leader_id = world.parties.get(&party_id).map(|p| p.leader_id.clone()).unwrap_or_default();
                    let members = world.get_party_members_info(&party_id);
                    let _ = app_state.tx.send(ServerMessage::PartyUpdate {
                        party_id,
                        leader_id,
                        members,
                    });
                }
                Ok(None) => {
                    let _ = app_state.tx.send(ServerMessage::PartyDisbanded);
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::OpenPrivateShop { title, items } => {
            match world.open_private_shop(client_id, title, items) {
                Ok(()) => {
                    let shops = world.private_shops.values().cloned().collect();
                    let _ = app_state.tx.send(ServerMessage::PrivateShopsUpdate { shops });
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::ClosePrivateShop => {
            if world.close_private_shop(client_id) {
                let shops = world.private_shops.values().cloned().collect();
                let _ = app_state.tx.send(ServerMessage::PrivateShopsUpdate { shops });
            }
        }
        ClientMessage::BuyPrivateShopItem { seller_id, shop_slot_index } => {
            match world.buy_private_shop_item(client_id, &seller_id, shop_slot_index) {
                Ok((msg, _item, _price)) => {
                    let _ = app_state.tx.send(ServerMessage::ChatBroadcast { message: msg });
                    if let Some(sync) = world.get_inventory_sync(client_id) {
                        let _ = app_state.tx.send(sync);
                    }
                    if let Some(sync_seller) = world.get_inventory_sync(&seller_id) {
                        let _ = app_state.tx.send(sync_seller);
                    }
                    let shops = world.private_shops.values().cloned().collect();
                    let _ = app_state.tx.send(ServerMessage::PrivateShopsUpdate { shops });
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::RequestTrade { target_player_id } => {
            let challenger_name = world.players.get(client_id).map(|p| p.name.clone()).unwrap_or_default();
            if !world.players.contains_key(&target_player_id) {
                let _ = app_state.tx.send(ServerMessage::ActionError { message: "El jugador objetivo no está disponible.".to_string() });
            } else {
                let _ = app_state.tx.send(ServerMessage::TradeRequested {
                    target_id: target_player_id,
                    challenger_id: client_id.to_string(),
                    challenger_name: challenger_name.clone(),
                });
                let _ = app_state.tx.send(ServerMessage::ChatBroadcast {
                    message: format!("🤝 {} envió una solicitud de comercio.", challenger_name),
                });
            }
        }
        ClientMessage::RespondTrade { challenger_id, accept } => {
            if !accept {
                let _ = app_state.tx.send(ServerMessage::TradeCancelled);
            } else {
                let trade_id = world.start_trade(&challenger_id, client_id);
                if let Some(msg) = world.get_trade_update(&trade_id) {
                    let _ = app_state.tx.send(msg);
                }
            }
        }
        ClientMessage::OfferTradeItem { slot_index } => {
            match world.offer_trade_item(client_id, slot_index) {
                Ok(msg) => {
                    let _ = app_state.tx.send(msg);
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::OfferTradeYang { yang } => {
            match world.offer_trade_yang(client_id, yang) {
                Ok(msg) => {
                    let _ = app_state.tx.send(msg);
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::LockTrade => {}
        ClientMessage::ConfirmTrade => {
            match world.confirm_trade(client_id) {
                Ok((msg, maybe_syncs)) => {
                    let _ = app_state.tx.send(msg);
                    if let Some((sync1, sync2)) = maybe_syncs {
                        let _ = app_state.tx.send(sync1);
                        let _ = app_state.tx.send(sync2);
                    }
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::CancelTrade => {
            if let Some(msg) = world.cancel_trade(client_id) {
                let _ = app_state.tx.send(msg);
            }
        }
        // ==========================================
        // RECOLECCIÓN & CRAFTEO
        // ==========================================
        ClientMessage::GatherResource { node_id } => {
            match world.gather_resource(client_id, &node_id) {
                Ok((msg, item, count)) => {
                    let _ = app_state.tx.send(ServerMessage::GatherResult {
                        node_id: node_id.clone(),
                        success: true,
                        message: msg.clone(),
                        item: Some(item),
                        count,
                    });
                    let _ = app_state.tx.send(ServerMessage::ChatBroadcast { message: msg });
                    if let Some(sync) = world.get_inventory_sync(client_id) {
                        let _ = app_state.tx.send(sync);
                    }
                    let _ = app_state.tx.send(ServerMessage::WorldUpdate {
                        players: world.players.values().cloned().collect(),
                        mobs: world.mobs.clone(),
                        markers: world.get_active_markers(),
                        gather_nodes: world.gather_nodes.clone(),
                    });
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::CraftItem { recipe_id } => {
            match world.craft_item(client_id, &recipe_id) {
                Ok((msg, item)) => {
                    let _ = app_state.tx.send(ServerMessage::CraftResult {
                        success: true,
                        message: msg.clone(),
                        item: Some(item),
                    });
                    let _ = app_state.tx.send(ServerMessage::ChatBroadcast { message: msg });
                    if let Some(sync) = world.get_inventory_sync(client_id) {
                        let _ = app_state.tx.send(sync);
                    }
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        // ==========================================
        // ALMACÉN (STASH)
        // ==========================================
        ClientMessage::OpenStash => {
            if let Some(sync) = world.get_stash_sync(client_id) {
                let _ = app_state.tx.send(sync);
            }
        }
        ClientMessage::DepositStashItem { slot_index } => {
            match world.deposit_stash_item(client_id, slot_index) {
                Ok(()) => {
                    if let Some(sync) = world.get_inventory_sync(client_id) {
                        let _ = app_state.tx.send(sync);
                    }
                    if let Some(sync_stash) = world.get_stash_sync(client_id) {
                        let _ = app_state.tx.send(sync_stash);
                    }
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::WithdrawStashItem { stash_slot_index } => {
            match world.withdraw_stash_item(client_id, stash_slot_index) {
                Ok(()) => {
                    if let Some(sync) = world.get_inventory_sync(client_id) {
                        let _ = app_state.tx.send(sync);
                    }
                    if let Some(sync_stash) = world.get_stash_sync(client_id) {
                        let _ = app_state.tx.send(sync_stash);
                    }
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::DepositStashYang { amount } => {
            match world.deposit_stash_yang(client_id, amount) {
                Ok(()) => {
                    if let Some(sync) = world.get_inventory_sync(client_id) {
                        let _ = app_state.tx.send(sync);
                    }
                    if let Some(sync_stash) = world.get_stash_sync(client_id) {
                        let _ = app_state.tx.send(sync_stash);
                    }
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::WithdrawStashYang { amount } => {
            match world.withdraw_stash_yang(client_id, amount) {
                Ok(()) => {
                    if let Some(sync) = world.get_inventory_sync(client_id) {
                        let _ = app_state.tx.send(sync);
                    }
                    if let Some(sync_stash) = world.get_stash_sync(client_id) {
                        let _ = app_state.tx.send(sync_stash);
                    }
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        // ==========================================
        // MERCADO CENTRAL / CASA DE SUBASTAS
        // ==========================================
        ClientMessage::RequestMarketListings => {
            let _ = app_state.tx.send(ServerMessage::MarketSync {
                listings: world.market_listings.clone(),
            });
        }
        ClientMessage::ListMarketItem { slot_index, price } => {
            match world.list_market_item(client_id, slot_index, price) {
                Ok(msg) => {
                    let _ = app_state.tx.send(ServerMessage::ChatBroadcast { message: msg });
                    if let Some(sync) = world.get_inventory_sync(client_id) {
                        let _ = app_state.tx.send(sync);
                    }
                    let _ = app_state.tx.send(ServerMessage::MarketSync {
                        listings: world.market_listings.clone(),
                    });
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::BuyMarketItem { listing_id } => {
            match world.buy_market_item(client_id, &listing_id) {
                Ok((msg, maybe_seller_id)) => {
                    let _ = app_state.tx.send(ServerMessage::MarketBuyResult {
                        success: true,
                        message: msg.clone(),
                    });
                    let _ = app_state.tx.send(ServerMessage::ChatBroadcast { message: msg });
                    if let Some(sync) = world.get_inventory_sync(client_id) {
                        let _ = app_state.tx.send(sync);
                    }
                    if let Some(seller_id) = maybe_seller_id {
                        if let Some(seller_sync) = world.get_inventory_sync(&seller_id) {
                            let _ = app_state.tx.send(seller_sync);
                        }
                    }
                    let _ = app_state.tx.send(ServerMessage::MarketSync {
                        listings: world.market_listings.clone(),
                    });
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::CancelMarketListing { listing_id } => {
            match world.cancel_market_listing(client_id, &listing_id) {
                Ok(msg) => {
                    let _ = app_state.tx.send(ServerMessage::ChatBroadcast { message: msg });
                    if let Some(sync) = world.get_inventory_sync(client_id) {
                        let _ = app_state.tx.send(sync);
                    }
                    let _ = app_state.tx.send(ServerMessage::MarketSync {
                        listings: world.market_listings.clone(),
                    });
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::RepairItem { slot_index, is_equipped } => {
            match world.repair_item(client_id, slot_index, is_equipped) {
                Ok(repair_msg) => {
                    let _ = app_state.tx.send(repair_msg);
                    if let Some(sync) = world.get_inventory_sync(client_id) {
                        let _ = app_state.tx.send(sync);
                    }
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::UpgradeSkillWithPoint { skill_id } => {
            match world.upgrade_skill_with_point(client_id, &skill_id) {
                Ok(stats_msg) => {
                    let _ = app_state.tx.send(stats_msg);
                    let _ = app_state.tx.send(ServerMessage::ChatBroadcast {
                        message: format!("⚡ ¡Habilidad [{}] mejorada con éxito!", skill_id),
                    });
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::SelectSubclass { subclass } => {
            match world.select_subclass(client_id, &subclass) {
                Ok(stats_msg) => {
                    let _ = app_state.tx.send(stats_msg);
                    let _ = app_state.tx.send(ServerMessage::ChatBroadcast {
                        message: format!("📜 ¡El héroe ha elegido el camino de la doctrina [{}]!", subclass),
                    });
                }
                Err(err) => {
                    let _ = app_state.tx.send(ServerMessage::ActionError { message: err });
                }
            }
        }
        ClientMessage::Login { .. }
        | ClientMessage::Register { .. }
        | ClientMessage::CreateCharacter { .. }
        | ClientMessage::SelectCharacter { .. } => {}
    }
}

pub async fn process_combat_bot_turn(app_state: AppState, combat_id: String) {
    loop {
        tokio::time::sleep(Duration::from_millis(500)).await;

        let (bot_id, maybe_path, cast_results) = {
            let mut world = app_state.world.lock().await;
            let room = match world.combats.get_mut(&combat_id) {
                Some(r) => r,
                None => return,
            };

            if room.game_state.status != GameStatus::InBattle {
                return;
            }

            let active_id = match room.game_state.current_player_id() {
                Some(id) => id.clone(),
                None => return,
            };

            let is_bot = room.game_state.players.iter().find(|p| p.id == active_id).map(|p| p.is_bot).unwrap_or(false);
            if !is_bot {
                return;
            }

            let bot_action = room.game_state.try_run_bot_ai();
            match bot_action {
                Some((path, casts)) => (active_id, path, casts),
                None => (active_id, None, Vec::new()),
            }
        };

        // 1. Si el bot se desplazó, notificar
        if let Some(path) = maybe_path {
            {
                let mut world = app_state.world.lock().await;
                if let Some(room) = world.combats.get_mut(&combat_id) {
                    let pm = room.game_state.players.iter().find(|p| p.id == bot_id).map(|p| p.pm).unwrap_or(0);
                    let _ = app_state.tx.send(ServerMessage::CombatPlayerMoved {
                        combat_id: combat_id.clone(),
                        player_id: bot_id.clone(),
                        path,
                        remaining_pm: pm,
                    });
                    let _ = app_state.tx.send(ServerMessage::CombatStateUpdate {
                        combat_id: combat_id.clone(),
                        state: room.game_state.clone(),
                    });
                }
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }

        // 2. Si el bot ejecutó ataques, notificar cada uno
        for cast_res in cast_results {
            {
                let mut world = app_state.world.lock().await;
                if let Some(room) = world.combats.get_mut(&combat_id) {
                    let ap = room.game_state.players.iter().find(|p| p.id == bot_id).map(|p| p.ap).unwrap_or(0);
                    let _ = app_state.tx.send(ServerMessage::CombatSpellCast {
                        combat_id: combat_id.clone(),
                        result: cast_res,
                        remaining_ap: ap,
                    });
                    let _ = app_state.tx.send(ServerMessage::CombatStateUpdate {
                        combat_id: combat_id.clone(),
                        state: room.game_state.clone(),
                    });
                }
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }

        // 3. Forzar el pase de turno autoritativo
        let next_is_bot = {
            let mut world = app_state.world.lock().await;
            let room = match world.combats.get_mut(&combat_id) {
                Some(r) => r,
                None => return,
            };

            if room.game_state.status != GameStatus::InBattle {
                return;
            }

            if room.game_state.current_player_id() == Some(&bot_id) {
                if let Ok(next_active_id) = room.game_state.pass_turn() {
                    room.turn_timer = 25.0; // Resetear reloj de 25s
                    let turn_count = room.game_state.turn_count;
                    let _ = app_state.tx.send(ServerMessage::CombatTurnChanged {
                        combat_id: combat_id.clone(),
                        active_player_id: next_active_id.clone(),
                        turn_count,
                    });
                    let _ = app_state.tx.send(ServerMessage::CombatStateUpdate {
                        combat_id: combat_id.clone(),
                        state: room.game_state.clone(),
                    });

                    room.game_state.players.iter().find(|p| p.id == next_active_id).map(|p| p.is_bot).unwrap_or(false)
                } else {
                    false
                }
            } else {
                false
            }
        };

        if !next_is_bot {
            break;
        }
    }
}
