use serde::{Deserialize, Serialize};
use crate::game::state::{CastResult, GameState};
use crate::game::types::{CharacterClass, Position};
use crate::mmo::types::{
    ActiveCombatMarker, Item, MarketListing, PartyMemberInfo, Quest, ShopOffer, Vec2,
    WorldGatherNode, WorldMob, WorldNPC, WorldPlayer, WorldPrivateShop,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CharacterSummary {
    pub name: String,
    pub class: CharacterClass,
    pub gender: String,
    pub outfit: u8,
    pub team: u8,
    pub kingdom: String,
    pub level: u32,
    pub exp: u32,
    pub yang: u32,
    pub hp: i32,
    pub max_hp: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ClientMessage {
    // Autenticación y Cuentas
    Login {
        username: String,
        password: String,
    },
    Register {
        username: String,
        password: String,
    },
    CreateCharacter {
        account_id: i64,
        name: String,
        class: CharacterClass,
        gender: String,
        outfit: u8,
        team: u8,
    },
    SelectCharacter {
        account_id: i64,
        name: String,
    },
    // Compatibilidad y Juego
    Join {
        name: String,
        class: CharacterClass,
        team: u8,
    },
    WorldMove {
        target: Vec2,
    },
    WorldSyncPos {
        pos: Vec2,
        target: Option<Vec2>,
    },
    StartMobCombat {
        mob_id: String,
    },
    JoinCombat {
        combat_id: String,
    },
    StartCombatNow {
        combat_id: String,
    },
    CombatMove {
        combat_id: String,
        target: Position,
    },
    CombatCastSpell {
        combat_id: String,
        spell_id: String,
        target: Position,
    },
    CombatPassTurn {
        combat_id: String,
    },
    ChatMessage {
        text: String,
    },
    // Nuevos mensajes para NPCs, Tienda, Herrero y Misiones
    InteractNPC {
        npc_id: String,
    },
    BuyShopItem {
        item_id: String,
    },
    UpgradeItem {
        slot_index: usize,
    },
    EquipItem {
        slot_index: usize,
    },
    UnequipItem {
        slot_type: String, // "weapon" o "armor"
    },
    UseItem {
        slot_index: usize,
    },
    AcceptQuest {
        quest_id: String,
    },
    TurnInQuest {
        quest_id: String,
    },
    // Duelos PvP entre jugadores
    RequestDuel {
        target_player_id: String,
    },
    RespondDuel {
        challenger_id: String,
        accept: bool,
    },
    // Asignación de puntos de estado
    AllocateStat {
        stat: String,
    },
    // Grupos / Party
    InviteParty {
        target_player_id: String,
    },
    RespondParty {
        leader_id: String,
        accept: bool,
    },
    LeaveParty,
    // Comercio 1v1
    RequestTrade {
        target_player_id: String,
    },
    RespondTrade {
        challenger_id: String,
        accept: bool,
    },
    OfferTradeItem {
        slot_index: usize,
    },
    OfferTradeYang {
        yang: u32,
    },
    LockTrade,
    ConfirmTrade,
    CancelTrade,
    // Tiendas Privadas
    OpenPrivateShop {
        title: String,
        items: Vec<ShopOffer>,
    },
    ClosePrivateShop,
    BuyPrivateShopItem {
        seller_id: String,
        shop_slot_index: usize,
    },
    // Recolección y Crafteo / Horno
    GatherResource {
        node_id: String,
    },
    CraftItem {
        recipe_id: String,
    },
    // Almacén / Depósito de Recursos
    OpenStash,
    DepositStashItem {
        slot_index: usize,
    },
    WithdrawStashItem {
        stash_slot_index: usize,
    },
    DepositStashYang {
        amount: u32,
    },
    WithdrawStashYang {
        amount: u32,
    },
    // Mercado Central / Casa de Subastas
    RequestMarketListings,
    ListMarketItem {
        slot_index: usize,
        price: u32,
    },
    BuyMarketItem {
        listing_id: String,
    },
    CancelMarketListing {
        listing_id: String,
    },
    // Herrero: Reparación de Durabilidad
    RepairItem {
        slot_index: usize,
        is_equipped: bool,
    },
    // Habilidades: Asignar punto y selección de doctrina
    UpgradeSkillWithPoint {
        skill_id: String,
    },
    SelectSubclass {
        subclass: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum ServerMessage {
    Welcome {
        your_id: String,
        players: Vec<WorldPlayer>,
        mobs: Vec<WorldMob>,
        npcs: Vec<WorldNPC>,
        markers: Vec<ActiveCombatMarker>,
        gather_nodes: Vec<WorldGatherNode>,
        market_listings: Vec<MarketListing>,
    },
    WorldUpdate {
        players: Vec<WorldPlayer>,
        mobs: Vec<WorldMob>,
        markers: Vec<ActiveCombatMarker>,
        gather_nodes: Vec<WorldGatherNode>,
    },
    EnteredCombat {
        combat_id: String,
        state: GameState,
        is_leader: bool,
        #[serde(default)]
        player_id: Option<String>,
    },
    CombatStateUpdate {
        combat_id: String,
        state: GameState,
    },
    CombatPlayerMoved {
        combat_id: String,
        player_id: String,
        path: Vec<Position>,
        remaining_pm: i32,
    },
    CombatSpellCast {
        combat_id: String,
        result: CastResult,
        remaining_ap: i32,
    },
    CombatTurnChanged {
        combat_id: String,
        active_player_id: String,
        turn_count: u32,
    },
    ExitedCombat {
        #[serde(default)]
        player_id: Option<String>,
        is_victory: bool,
        exp_gained: u32,
        yang_gained: u32,
        dropped_items: Vec<Item>,
    },
    ChatBroadcast {
        message: String,
    },
    ActionError {
        message: String,
    },
    // Respuestas de Autenticación
    AuthSuccess {
        client_id: String,
        account_id: i64,
        username: String,
        character: Option<CharacterSummary>,
    },
    AuthError {
        client_id: String,
        message: String,
    },
    // Respuestas de NPCs e Inventario
    NPCDialog {
        npc_id: String,
        name: String,
        text: String,
        dialog_type: String, // "blacksmith", "merchant", "guardian"
        shop_items: Vec<Item>,
        available_quests: Vec<Quest>,
    },
    UpgradeResult {
        success: bool,
        message: String,
        item: Option<Item>,
    },
    InventorySync {
        #[serde(default)]
        player_id: Option<String>,
        inventory: Vec<Option<Item>>,
        equipped_weapon: Option<Item>,
        equipped_armor: Option<Item>,
        yang: u32,
        quests: Vec<Quest>,
    },
    // Notificaciones de Duelo PvP
    DuelRequested {
        challenger_id: String,
        challenger_name: String,
    },
    DuelResponse {
        target_id: String,
        target_name: String,
        accepted: bool,
    },
    // Estadísticas del Personaje (VIT, INT, STR, DEX y Habilidades)
    StatsSync {
        #[serde(default)]
        player_id: Option<String>,
        level: u32,
        exp: u32,
        max_exp: u32,
        stat_points: u32,
        vit: u32,
        int_stat: u32,
        str_stat: u32,
        dex: u32,
        hp: i32,
        max_hp: i32,
        skill_points: u32,
        subclass: Option<String>,
        skill_levels: std::collections::HashMap<String, u8>,
    },
    // Resultado de Reparación
    RepairResult {
        success: bool,
        message: String,
        yang: u32,
    },
    // Grupos / Party
    PartyInviteReceived {
        leader_id: String,
        leader_name: String,
    },
    PartyUpdate {
        party_id: String,
        leader_id: String,
        members: Vec<PartyMemberInfo>,
    },
    PartyDisbanded,
    // Comercio 1v1
    TradeRequested {
        target_id: String,
        challenger_id: String,
        challenger_name: String,
    },
    TradeUpdate {
        trade_id: String,
        p1_id: String,
        p2_id: String,
        p1_name: String,
        p2_name: String,
        p1_items: Vec<Item>,
        p1_yang: u32,
        p1_locked: bool,
        p1_confirmed: bool,
        p2_items: Vec<Item>,
        p2_yang: u32,
        p2_locked: bool,
        p2_confirmed: bool,
    },
    TradeCompleted {
        message: String,
    },
    TradeCancelled,
    // Tiendas Privadas en la Aldea
    PrivateShopsUpdate {
        shops: Vec<WorldPrivateShop>,
    },
    // Recolección y Crafteo / Horno
    GatherResult {
        node_id: String,
        success: bool,
        message: String,
        item: Option<Item>,
        count: u32,
    },
    CraftResult {
        success: bool,
        message: String,
        item: Option<Item>,
    },
    // Almacén / Depósito de Recursos
    StashSync {
        stash: Vec<Option<Item>>,
        stash_yang: u32,
    },
    // Mercado Central / Subastas
    MarketSync {
        listings: Vec<MarketListing>,
    },
    MarketBuyResult {
        success: bool,
        message: String,
    },
}
