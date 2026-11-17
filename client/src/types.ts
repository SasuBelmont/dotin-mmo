export interface Vec2 {
  x: number;
  z: number;
}

export interface Position {
  x: number;
  y: number;
}

export type CharacterClass = 'Warrior' | 'Sura' | 'Ninja' | 'Shaman';

export type TileType = 'Grass' | 'StonePath' | 'MetinStone' | 'Rock' | 'Tree';

export interface MapCell {
  x: number;
  y: number;
  tile_type: TileType;
  is_walkable: boolean;
  blocks_los: boolean;
}

export interface BattleMap {
  width: number;
  height: number;
  cells: MapCell[];
}

export interface Spell {
  id: string;
  name: string;
  description: string;
  ap_cost: number;
  min_range: number;
  max_range: number;
  requires_los: boolean;
  is_linear: boolean;
  base_damage_min: number;
  base_damage_max: number;
  is_heal: boolean;
  is_self_buff: boolean;
  effect_key: string;
}

export interface Player {
  id: string;
  name: string;
  class: CharacterClass;
  pos: Position;
  hp: number;
  max_hp: number;
  ap: number;
  max_ap: number;
  pm: number;
  max_pm: number;
  kingdom: string;
  team: number;
  is_alive: boolean;
  is_bot: boolean;
  spells: Spell[];
  attack_buff_turns: number;
  defense_buff_turns: number;
}

export interface CharacterSummary {
  name: string;
  class: CharacterClass;
  gender: 'male' | 'female';
  outfit: number;
  team: number;
  kingdom: string;
  level: number;
  exp: number;
  yang: number;
  hp: number;
  max_hp: number;
}

export interface WorldPlayer {
  id: string;
  name: string;
  class: CharacterClass;
  kingdom: string;
  team: number;
  pos: Vec2;
  target_pos?: Vec2;
  speed: number;
  level: number;
  exp: number;
  max_exp?: number;
  yang: number;
  hp: number;
  max_hp: number;
  stat_points?: number;
  vit?: number;
  int_stat?: number;
  str_stat?: number;
  dex?: number;
  skill_points?: number;
  subclass?: string;
  party_id?: string;
  in_combat_id?: string;
  account_id?: number;
  gender?: 'male' | 'female';
  outfit?: number;
}

export interface WorldMob {
  id: string;
  name: string;
  mob_type: string;
  pos: Vec2;
  spawn_pos: Vec2;
  level: number;
  hp: number;
  max_hp: number;
  is_alive: boolean;
  in_combat_id?: string;
  respawn_timer?: number;
}

export interface WorldNPC {
  id: string;
  name: string;
  title: string;
  pos: Vec2;
}

export interface ActiveCombatMarker {
  combat_id: string;
  mob_name: string;
  leader_name: string;
  pos: Vec2;
  prep_time_left: number;
  participants_count: number;
  is_preparation: boolean;
}

export type ItemType = 'Weapon' | 'Armor' | 'Consumable' | 'Material' | 'SkillBook';

export type GatherNodeType = 'Mining' | 'Woodcutting' | 'Fishing';

export interface WorldGatherNode {
  id: string;
  name: string;
  node_type: GatherNodeType;
  pos: Vec2;
  resource_name: string;
  is_depleted: boolean;
  respawn_timer: number;
}

export interface MarketListing {
  id: string;
  seller_id: string;
  seller_name: string;
  item: Item;
  price: number;
  created_at: number;
}

export interface CraftingRecipe {
  id: string;
  name: string;
  description: string;
  category: string;
  required_materials: [string, number][];
  required_yang: number;
  result_item: Item;
}

export interface PartyMemberInfo {
  id: string;
  name: string;
  level: number;
  hp: number;
  max_hp: number;
  class: CharacterClass;
}

export interface ShopOffer {
  slot_index: number;
  price: number;
}

export interface ShopItemListing {
  slot_index: number;
  item: Item;
  price: number;
}

export interface WorldPrivateShop {
  seller_id: string;
  seller_name: string;
  title: string;
  pos: Vec2;
  items: ShopItemListing[];
}

export interface Item {
  id: string;
  name: string;
  item_type: ItemType;
  upgrade_level: number;
  attack_bonus: number;
  defense_bonus: number;
  hp_bonus: number;
  buy_price: number;
  icon: string;
  description: string;
  durability?: number;
  max_durability?: number;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  target_mob_type: string;
  target_count: number;
  current_count: number;
  reward_exp: number;
  reward_yang: number;
  reward_item?: Item;
  is_completed: boolean;
  is_turned_in: boolean;
}

export type GameStatus =
  | 'Lobby'
  | 'InBattle'
  | { GameOver: { winner_team: number; winner_kingdom: string } };

export interface CastResult {
  caster_id: string;
  spell: Spell;
  target_pos: Position;
  affected_player_id?: string;
  damage: number;
  heal: number;
  target_new_hp: number;
  is_target_dead: boolean;
  is_game_over: boolean;
}

export interface GameState {
  map: BattleMap;
  players: Player[];
  turn_order: string[];
  current_turn_index: number;
  turn_count: number;
  status: GameStatus;
  combat_logs: string[];
}

export type ClientMessage =
  | { type: 'Login'; payload: { username: string; password: string } }
  | { type: 'Register'; payload: { username: string; password: string } }
  | { type: 'CreateCharacter'; payload: { account_id: number; name: string; class: CharacterClass; gender: 'male' | 'female'; outfit: number; team: number } }
  | { type: 'SelectCharacter'; payload: { account_id: number; name: string } }
  | { type: 'Join'; payload: { name: string; class: CharacterClass; team: number } }
  | { type: 'WorldMove'; payload: { target: Vec2 } }
  | { type: 'WorldSyncPos'; payload: { pos: Vec2; target?: Vec2 } }
  | { type: 'StartMobCombat'; payload: { mob_id: string } }
  | { type: 'JoinCombat'; payload: { combat_id: string } }
  | { type: 'StartCombatNow'; payload: { combat_id: string } }
  | { type: 'CombatMove'; payload: { combat_id: string; target: Position } }
  | { type: 'CombatCastSpell'; payload: { combat_id: string; spell_id: string; target: Position } }
  | { type: 'CombatPassTurn'; payload: { combat_id: string } }
  | { type: 'ChatMessage'; payload: { text: string } }
  | { type: 'InteractNPC'; payload: { npc_id: string } }
  | { type: 'BuyShopItem'; payload: { item_id: string } }
  | { type: 'UpgradeItem'; payload: { slot_index: number } }
  | { type: 'EquipItem'; payload: { slot_index: number } }
  | { type: 'UnequipItem'; payload: { slot_type: 'weapon' | 'armor' } }
  | { type: 'UseItem'; payload: { slot_index: number } }
  | { type: 'AcceptQuest'; payload: { quest_id: string } }
  | { type: 'TurnInQuest'; payload: { quest_id: string } }
  | { type: 'RequestDuel'; payload: { target_player_id: string } }
  | { type: 'RespondDuel'; payload: { challenger_id: string; accept: boolean } }
  | { type: 'AllocateStat'; payload: { stat: string } }
  | { type: 'InviteParty'; payload: { target_player_id: string } }
  | { type: 'RespondParty'; payload: { leader_id: string; accept: boolean } }
  | { type: 'LeaveParty'; payload: {} }
  | { type: 'OpenPrivateShop'; payload: { title: string; items: ShopOffer[] } }
  | { type: 'ClosePrivateShop'; payload: {} }
  | { type: 'BuyPrivateShopItem'; payload: { seller_id: string; shop_slot_index: number } }
  | { type: 'RequestTrade'; payload: { target_player_id: string } }
  | { type: 'RespondTrade'; payload: { challenger_id: string; accept: boolean } }
  | { type: 'GatherResource'; payload: { node_id: string } }
  | { type: 'CraftItem'; payload: { recipe_id: string } }
  | { type: 'OpenStash'; payload?: {} }
  | { type: 'DepositStashItem'; payload: { slot_index: number } }
  | { type: 'WithdrawStashItem'; payload: { stash_slot_index: number } }
  | { type: 'DepositStashYang'; payload: { amount: number } }
  | { type: 'WithdrawStashYang'; payload: { amount: number } }
  | { type: 'RequestMarketListings'; payload?: {} }
  | { type: 'ListMarketItem'; payload: { slot_index: number; price: number } }
  | { type: 'BuyMarketItem'; payload: { listing_id: string } }
  | { type: 'CancelMarketListing'; payload: { listing_id: string } }
  | { type: 'RepairItem'; payload: { slot_index: number; is_equipped: boolean } }
  | { type: 'UpgradeSkillWithPoint'; payload: { skill_id: string } }
  | { type: 'SelectSubclass'; payload: { subclass: string } };

export type ServerMessage =
  | {
      type: 'Welcome';
      payload: {
        your_id: string;
        players: WorldPlayer[];
        mobs: WorldMob[];
        npcs: WorldNPC[];
        markers: ActiveCombatMarker[];
        gather_nodes: WorldGatherNode[];
        market_listings: MarketListing[];
      };
    }
  | {
      type: 'WorldUpdate';
      payload: {
        players: WorldPlayer[];
        mobs: WorldMob[];
        markers: ActiveCombatMarker[];
        gather_nodes: WorldGatherNode[];
      };
    }
  | {
      type: 'EnteredCombat';
      payload: {
        combat_id: string;
        state: GameState;
        is_leader: boolean;
      };
    }
  | {
      type: 'CombatStateUpdate';
      payload: {
        combat_id: string;
        state: GameState;
      };
    }
  | {
      type: 'CombatPlayerMoved';
      payload: {
        combat_id: string;
        player_id: string;
        path: Position[];
        remaining_pm: number;
      };
    }
  | {
      type: 'CombatSpellCast';
      payload: {
        combat_id: string;
        result: CastResult;
        remaining_ap: number;
      };
    }
  | {
      type: 'CombatTurnChanged';
      payload: {
        combat_id: string;
        active_player_id: string;
        turn_count: number;
      };
    }
  | {
      type: 'ExitedCombat';
      payload: {
        is_victory: boolean;
        exp_gained: number;
        yang_gained: number;
        dropped_items: Item[];
      };
    }
  | {
      type: 'ChatBroadcast';
      payload: {
        message: string;
      };
    }
  | {
      type: 'ActionError';
      payload: {
        message: string;
      };
    }
  | {
      type: 'NPCDialog';
      payload: {
        npc_id: string;
        name: string;
        text: string;
        dialog_type: string;
        shop_items: Item[];
        available_quests: Quest[];
      };
    }
  | {
      type: 'UpgradeResult';
      payload: {
        success: boolean;
        message: string;
        item?: Item;
      };
    }
  | {
      type: 'InventorySync';
      payload: {
        inventory: (Item | null)[];
        equipped_weapon?: Item;
        equipped_armor?: Item;
        yang: number;
        quests: Quest[];
      };
    }
  | {
      type: 'DuelRequested';
      payload: {
        challenger_id: string;
        challenger_name: string;
      };
    }
  | {
      type: 'DuelResponse';
      payload: {
        target_id: string;
        target_name: string;
        accepted: boolean;
      };
    }
  | {
      type: 'StatsSync';
      payload: {
        level: number;
        exp: number;
        max_exp: number;
        stat_points: number;
        vit: number;
        int_stat: number;
        str_stat: number;
        dex: number;
        hp: number;
        max_hp: number;
        skill_points?: number;
        subclass?: string | null;
        skill_levels?: Record<string, number>;
      };
    }
  | {
      type: 'RepairResult';
      payload: {
        success: boolean;
        message: string;
        yang: number;
      };
    }
  | {
      type: 'PartyInviteReceived';
      payload: {
        leader_id: string;
        leader_name: string;
      };
    }
  | {
      type: 'PartyUpdate';
      payload: {
        party_id: string;
        leader_id: string;
        members: PartyMemberInfo[];
      };
    }
  | {
      type: 'PartyDisbanded';
      payload?: {};
    }
  | {
      type: 'PrivateShopsUpdate';
      payload: {
        shops: WorldPrivateShop[];
      };
    }
  | {
      type: 'TradeRequested';
      payload: {
        challenger_id: string;
        challenger_name: string;
      };
    }
  | {
      type: 'TradeUpdate';
      payload: {
        trade_id: string;
        p1_id: string;
        p2_id: string;
        p1_name: string;
        p2_name: string;
        p1_items: Item[];
        p1_yang: number;
        p1_locked: boolean;
        p1_confirmed: boolean;
        p2_items: Item[];
        p2_yang: number;
        p2_locked: boolean;
        p2_confirmed: boolean;
      };
    }
  | {
      type: 'TradeCompleted';
      payload: {
        message: string;
      };
    }
  | {
      type: 'TradeCancelled';
      payload?: {};
    }
  | {
      type: 'GatherResult';
      payload: {
        node_id: string;
        success: boolean;
        message: string;
        item?: Item;
        count: number;
      };
    }
  | {
      type: 'CraftResult';
      payload: {
        success: boolean;
        message: string;
        item?: Item;
      };
    }
  | {
      type: 'StashSync';
      payload: {
        stash: (Item | null)[];
        stash_yang: number;
      };
    }
  | {
      type: 'MarketSync';
      payload: {
        listings: MarketListing[];
      };
    }
  | {
      type: 'MarketBuyResult';
      payload: {
        success: boolean;
        message: string;
      };
    }
  | {
      type: 'AuthSuccess';
      payload: {
        client_id: string;
        account_id: number;
        username: string;
        character: CharacterSummary | null;
      };
    }
  | {
      type: 'AuthError';
      payload: {
        client_id: string;
        message: string;
      };
    };
