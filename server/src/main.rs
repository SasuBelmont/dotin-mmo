use std::sync::Arc;
use std::time::Duration;
use axum::{routing::get, Router};
use tokio::sync::{broadcast, Mutex};
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

mod db;
mod game;
mod mmo;
mod protocol;
mod ws;

use mmo::world::WorldManager;
use protocol::ServerMessage;
use ws::{ws_handler, AppState};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    info!("Iniciando Servidor MiniMMO Dotin (Overworld + Dofus Combat en Rust)...");

    let db_path = db::get_default_db_path();
    let database = db::Database::open(&db_path)
        .expect("Error al inicializar la base de datos SQLite");
    let db_arc = Arc::new(Mutex::new(database));

    let world_manager = Arc::new(Mutex::new(WorldManager::new()));
    let (tx, _rx) = broadcast::channel(200);

    let app_state = AppState {
        world: world_manager.clone(),
        tx: tx.clone(),
        db: db_arc.clone(),
    };

    // Bucle de simulación del mundo en segundo plano (20 ticks/segundo)
    let world_clone = world_manager.clone();
    let tx_clone = tx.clone();
    let app_state_for_tick = app_state.clone();
    let db_for_tick = db_arc.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(50));
        let mut broadcast_counter = 0;
        let mut autosave_counter = 0;

        loop {
            interval.tick().await;

            let mut world = world_clone.lock().await;
            let events = world.update(0.05);

            for (c_id, state, active_id) in events.battles_started {
                let _ = tx_clone.send(ServerMessage::CombatStateUpdate {
                    combat_id: c_id.clone(),
                    state: state.clone(),
                });
                let _ = tx_clone.send(ServerMessage::CombatTurnChanged {
                    combat_id: c_id.clone(),
                    active_player_id: active_id.clone(),
                    turn_count: 1,
                });
                let is_bot = state.players.iter().find(|p| p.id == active_id).map(|p| p.is_bot).unwrap_or(false);
                if is_bot {
                    let app_state_sub = app_state_for_tick.clone();
                    let combat_id_sub = c_id.clone();
                    tokio::spawn(async move {
                        ws::process_combat_bot_turn(app_state_sub, combat_id_sub).await;
                    });
                }
            }

            for (c_id, next_active_id, turn_count) in events.turns_timed_out {
                let _ = tx_clone.send(ServerMessage::CombatTurnChanged {
                    combat_id: c_id.clone(),
                    active_player_id: next_active_id.clone(),
                    turn_count,
                });
                if let Some(room) = world.combats.get(&c_id) {
                    let _ = tx_clone.send(ServerMessage::CombatStateUpdate {
                        combat_id: c_id.clone(),
                        state: room.game_state.clone(),
                    });
                    let is_bot = room.game_state.players.iter().find(|p| p.id == next_active_id).map(|p| p.is_bot).unwrap_or(false);
                    if is_bot {
                        let app_state_sub = app_state_for_tick.clone();
                        let combat_id_sub = c_id.clone();
                        tokio::spawn(async move {
                            ws::process_combat_bot_turn(app_state_sub, combat_id_sub).await;
                        });
                    }
                }
            }

            for (_c_id, is_victory, exp_gained, yang_gained, drops, participants) in events.finished_combats {
                // Enviar ExitedCombat, InventorySync y StatsSync actualizados a cada participante individual
                for p_id in &participants {
                    let _ = tx_clone.send(ServerMessage::ExitedCombat {
                        player_id: Some(p_id.clone()),
                        is_victory,
                        exp_gained,
                        yang_gained,
                        dropped_items: drops.clone(),
                    });
                    if let Some(sync) = world.get_inventory_sync(p_id) {
                        let _ = tx_clone.send(sync);
                    }
                    if let Some(stats) = world.get_stats_sync(p_id) {
                        let _ = tx_clone.send(stats);
                    }
                    if let Some(player) = world.players.get(p_id) {
                        if player.account_id.is_some() {
                            let p_clone = player.clone();
                            let db_clone = db_for_tick.clone();
                            tokio::spawn(async move {
                                let mut db = db_clone.lock().await;
                                let _ = db.save_character(&p_clone);
                            });
                        }
                    }
                }

                // Inmediatamente difundir WorldUpdate para que el mob derrotado desaparezca de inmediato del overworld
                let msg = ServerMessage::WorldUpdate {
                    players: world.players.values().cloned().collect(),
                    mobs: world.mobs.clone(),
                    markers: world.get_active_markers(),
                    gather_nodes: world.gather_nodes.clone(),
                };
                let _ = tx_clone.send(msg);
            }

            broadcast_counter += 1;
            // Difundir estado del mundo a todos los jugadores cada 100ms (10Hz)
            if broadcast_counter >= 2 {
                broadcast_counter = 0;
                let msg = ServerMessage::WorldUpdate {
                    players: world.players.values().cloned().collect(),
                    mobs: world.mobs.clone(),
                    markers: world.get_active_markers(),
                    gather_nodes: world.gather_nodes.clone(),
                };
                let _ = tx_clone.send(msg);

                let shops = world.private_shops.values().cloned().collect();
                let _ = tx_clone.send(ServerMessage::PrivateShopsUpdate { shops });
            }

            // Guardado automático periódico en SQLite cada 10s (200 ticks de 50ms)
            autosave_counter += 1;
            if autosave_counter >= 200 {
                autosave_counter = 0;
                let players_to_save: Vec<crate::mmo::types::WorldPlayer> = world.players.values()
                    .filter(|p| p.account_id.is_some())
                    .cloned()
                    .collect();
                if !players_to_save.is_empty() {
                    let db_clone = db_for_tick.clone();
                    tokio::spawn(async move {
                        let mut db = db_clone.lock().await;
                        for p in players_to_save {
                            let _ = db.save_character(&p);
                        }
                    });
                }
            }
        }
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/health", get(|| async { "Dotin MiniMMO Server OK" }))
        .layer(cors)
        .with_state(app_state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|_| panic!("No se pudo enlazar el puerto {}", port));

    info!("Servidor MiniMMO Dotin activo en http://{}", addr);
    info!("WebSocket Overworld listo en ws://127.0.0.1:{}/ws", port);

    axum::serve(listener, app)
        .await
        .expect("Error al ejecutar el servidor HTTP");
}
