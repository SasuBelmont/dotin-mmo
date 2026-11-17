import type {
  CharacterClass,
  CharacterSummary,
  GameState,
  Item,
  MarketListing,
  PartyMemberInfo,
  Player,
  Quest,
  ShopOffer,
  Spell,
  WorldPlayer,
  WorldPrivateShop,
} from '../types';
import { SoundManager } from '../audio/SoundManager';
import { CharacterPreview } from '../scene/CharacterPreview';
import { ALL_SKILLS, getSkillsForPlayer, type SkillInfo } from '../data/skills';

/** Renderiza ícono de ítem: si es ruta PNG, usa <img>; si es emoji, muestra texto */
function renderItemIcon(icon: string, size = 24): string {
  if (!icon) return `<span style="font-size:${size}px;">📦</span>`;
  const isPath = icon.startsWith('/') || icon.startsWith('assets/') || icon.startsWith('./') || icon.includes('.png') || icon.includes('.jpg');
  if (isPath) {
    const src = icon.startsWith('/') ? icon : `/${icon}`;
    return `<img src="${src}" style="width:${size}px;height:${size}px;object-fit:contain;image-rendering:pixelated;display:block;margin:auto;" alt="icon" onerror="this.onerror=null;this.replaceWith(document.createTextNode('🗡️'))" />`;
  }
  return `<span style="font-size:${size}px;display:inline-block;line-height:1;">${icon}</span>`;
}

export interface QuickslotContent {
  type: 'skill' | 'item';
  skill?: SkillInfo;
  item?: Item;
  inventoryIndex?: number;
}

export class UIController {
  private root: HTMLElement;
  private myPlayerId: string | null = null;
  private selectedSpell: Spell | null = null;
  private currentMode: 'overworld' | 'combat' = 'overworld';
  private turnSecondsLeft: number = 25;
  private assignedQuickslots: (QuickslotContent | null)[] = Array(14).fill(null);
  private playerLevel: number = 1;
  private turnTimerInterval: any = null;
  private currentTurnPlayerId: string | null = null;
  private latestCombatSpells: Spell[] = []; // Hechizos del jugador local en combate actual

  // Estado de Inventario, Equipo y Misiones
  private currentInventory: (Item | null)[] = [];
  private currentWeapon: Item | null = null;
  private currentArmor: Item | null = null;
  private currentQuests: Quest[] = [];
  private currentYang: number = 250;
  private selectedUpgradeSlot: number | null = null;
  private currentInvFilter: string = 'all';

  // Estado de Almacén y Mercado Central
  private currentStash: (Item | null)[] = [];
  private currentStashYang: number = 0;
  private currentMarketListings: MarketListing[] = [];
  private currentMarketTab: 'browse' | 'sell' | 'my' = 'browse';

  // Autenticación SQLite y Cuentas
  private currentAccountId: number | null = null;
  private currentUsername: string = '';
  private currentAccountCharacter: CharacterSummary | null = null;
  private authMode: 'login' | 'register' = 'login';

  // Creador de personaje y Previews 3D
  private creatorPreview: CharacterPreview | null = null;
  private corePreview: CharacterPreview | null = null;
  private selectedGender: 'male' | 'female' = 'male';
  private selectedOutfit: number = 1;
  private selectedClass: CharacterClass = 'Warrior';
  private selectedKingdomTeam: number = 0;
  private currentSubclass: string | null = null;
  private currentSkillPoints: number = 0;
  private currentSkillLevels: Record<string, number> = {};
  private bsCurrentTab: 'upgrade' | 'repair' = 'upgrade';
  private gatheringInterval: any = null;

  // Callbacks
  public onLoginRequested?: (username: string, password: string) => void;
  public onRegisterRequested?: (username: string, password: string) => void;
  public onCreateCharacterRequested?: (accountId: number, name: string, characterClass: CharacterClass, gender: 'male' | 'female', outfit: number, team: number) => void;
  public onSelectCharacterRequested?: (accountId: number, name: string) => void;
  public onJoinRequested?: (name: string, characterClass: CharacterClass, team: number, outfit?: number, gender?: 'male' | 'female') => void;
  public onSelectSubclassRequested?: (subclass: string) => void;
  public onRepairItemRequested?: (slotIndex: number, isEquipped: boolean) => void;
  public onUpgradeSkillRequested?: (skillId: string) => void;
  public onSpellSelected?: (spell: Spell | null) => void;
  public onPassTurnRequested?: () => void;
  public onStartCombatNowRequested?: () => void;
  public onSendChatRequested?: (text: string) => void;
  public onJoinActiveCombatRequested?: (combatId: string) => void;
  public onBuyShopItemRequested?: (itemId: string) => void;
  public onUpgradeItemRequested?: (slotIndex: number) => void;
  public onEquipItemRequested?: (slotIndex: number) => void;
  public onUnequipItemRequested?: (slotType: 'weapon' | 'armor') => void;
  public onUseItemRequested?: (slotIndex: number) => void;
  public onTurnInQuestRequested?: (questId: string) => void;
  public onRequestDuelRequested?: (targetPlayerId: string) => void;
  public onRespondDuelRequested?: (challengerId: string, accept: boolean) => void;
  public onAllocateStatRequested?: (stat: string) => void;
  public onInvitePartyRequested?: (targetPlayerId: string) => void;
  public onRespondPartyRequested?: (leaderId: string, accept: boolean) => void;
  public onLeavePartyRequested?: () => void;
  public onOpenPrivateShopRequested?: (title: string, items: ShopOffer[]) => void;
  public onClosePrivateShopRequested?: () => void;
  public onBuyPrivateShopItemRequested?: (sellerId: string, shopSlotIndex: number) => void;
  public onRequestTradeRequested?: (targetPlayerId: string) => void;
  public onRespondTradeRequested?: (challengerId: string, accept: boolean) => void;
  public onOfferTradeItemRequested?: (slotIndex: number) => void;
  public onOfferTradeYangRequested?: (yang: number) => void;
  public onConfirmTradeRequested?: () => void;
  public onCancelTradeRequested?: () => void;

  // Callbacks para Almacén, Crafteo y Mercado Central
  public onDepositStashItemRequested?: (slotIndex: number) => void;
  public onWithdrawStashItemRequested?: (stashSlotIndex: number) => void;
  public onDepositStashYangRequested?: (amount: number) => void;
  public onWithdrawStashYangRequested?: (amount: number) => void;
  public onCraftItemRequested?: (recipeId: string) => void;
  public onListMarketItemRequested?: (slotIndex: number, price: number) => void;
  public onBuyMarketItemRequested?: (listingId: string) => void;
  public onCancelMarketListingRequested?: (listingId: string) => void;

  private pendingChallengerId: string | null = null;
  private selectedTargetPlayer: WorldPlayer | null = null;
  private pendingPartyLeaderId: string | null = null;
  private pendingTradeChallengerId: string | null = null;
  private currentNpcDialogType: string | null = null;
  private victoryTimerInterval: number | null = null;
  private onVictoryCloseCallback: (() => void) | null = null;

  constructor(rootId = 'ui-root') {
    let el = document.getElementById(rootId);
    if (!el) {
      el = document.createElement('div');
      el.id = rootId;
      document.body.appendChild(el);
    }
    this.root = el;
    this.renderBaseSkeleton();
    // Asignar Ataque Básico por defecto en Ranura 1
    const basicSkill = ALL_SKILLS.find((s) => s.id === 'ataque_basico');
    this.assignedQuickslots[0] = basicSkill ? { type: 'skill', skill: basicSkill } : null;
    this.renderQuickslots();
    this.setupKeyboardShortcuts();
  }

  public setMyPlayerId(id: string): void {
    this.myPlayerId = id;
  }

  public getSelectedSpell(): Spell | null {
    return this.selectedSpell;
  }

  public clearSelectedSpell(): void {
    this.selectedSpell = null;
    document.querySelectorAll('.spell-slot').forEach((s) => s.classList.remove('selected'));
    document.querySelectorAll('.dofus-slot').forEach((s) => s.classList.remove('selected'));
    if (this.onSpellSelected) {
      this.onSpellSelected(null);
    }
  }

  public setMode(mode: 'overworld' | 'combat'): void {
    this.currentMode = mode;
    const combatHub = document.getElementById('dofus-combat-hub');
    const radialActions = document.getElementById('dofus-radial-actions');
    const topBanner = document.getElementById('top-banner');
    const taskbar = document.getElementById('dofus-taskbar');
    const questTracker = document.getElementById('quest-tracker-hud');

    if (mode === 'overworld') {
      if (taskbar) taskbar.style.display = 'flex';
      if (combatHub) combatHub.style.display = 'none';
      if (radialActions) radialActions.style.display = 'flex';
      if (topBanner) topBanner.style.display = 'none';
      if (questTracker) questTracker.style.display = 'block';
      this.stopTurnTimer();
      this.currentTurnPlayerId = null;
      if (this.victoryTimerInterval) {
        clearInterval(this.victoryTimerInterval);
        this.victoryTimerInterval = null;
      }
      this.onVictoryCloseCallback = null;
      const vic = document.getElementById('victory-modal');
      if (vic) vic.style.display = 'none';
      // Limpiar resaltado de hechizos en quickslots al salir del combate
      document.querySelectorAll('.dofus-slot').forEach((s) => {
        s.classList.remove('combat-available', 'combat-no-ap');
      });
    } else {
      if (taskbar) taskbar.style.display = 'flex';
      if (combatHub) combatHub.style.display = 'flex';
      if (radialActions) radialActions.style.display = 'none';
      if (topBanner) topBanner.style.display = 'block';
      if (questTracker) questTracker.style.display = 'none';
    }
  }

  /**
   * Transición visual de corte de espada al entrar a combate para eliminar sensación de retardo
   */
  public playCombatTransition(onMidpoint?: () => void): void {
    const overlay = document.getElementById('combat-transition-overlay');
    if (!overlay) {
      if (onMidpoint) onMidpoint();
      return;
    }

    if (overlay.classList.contains('combat-transition-active')) {
      if (onMidpoint) onMidpoint();
      return;
    }

    try {
      SoundManager.getInstance().playSlash();
    } catch {
      // Ignorar si el audio no está inicializado
    }

    overlay.classList.remove('combat-transition-hidden');
    overlay.classList.add('combat-transition-active');

    // Al llegar al filo del corte (120ms), cambiar la vista en segundo plano sin tirón
    setTimeout(() => {
      if (onMidpoint) onMidpoint();
    }, 120);

    setTimeout(() => {
      overlay.classList.remove('combat-transition-active');
      overlay.classList.add('combat-transition-hidden');
    }, 380);
  }

  public startTurnTimer(seconds: number = 25, isMyTurn: boolean = false): void {
    if (this.turnTimerInterval) {
      clearInterval(this.turnTimerInterval);
      this.turnTimerInterval = null;
    }
    this.turnSecondsLeft = seconds;

    const timerWrap = document.getElementById('turn-timer-wrap');
    const timerFill = document.getElementById('turn-timer-fill');
    const timerText = document.getElementById('turn-timer-text');

    if (timerWrap) timerWrap.style.display = 'flex';
    if (timerFill) {
      timerFill.style.width = '100%';
      if (isMyTurn) {
        timerFill.classList.remove('enemy-turn');
      } else {
        timerFill.classList.add('enemy-turn');
      }
    }
    if (timerText) timerText.innerText = `⏱️ ${this.turnSecondsLeft}s`;

    this.turnTimerInterval = setInterval(() => {
      this.turnSecondsLeft--;
      if (this.turnSecondsLeft < 0) this.turnSecondsLeft = 0;

      if (timerFill) {
        const pct = Math.max(0, (this.turnSecondsLeft / 25) * 100);
        timerFill.style.width = `${pct}%`;
      }
      if (timerText) {
        timerText.innerText = `⏱️ ${this.turnSecondsLeft}s`;
      }

      if (this.turnSecondsLeft <= 0) {
        if (this.turnTimerInterval) {
          clearInterval(this.turnTimerInterval);
          this.turnTimerInterval = null;
        }
      }
    }, 1000);
  }

  public stopTurnTimer(): void {
    if (this.turnTimerInterval) {
      clearInterval(this.turnTimerInterval);
      this.turnTimerInterval = null;
    }
    const timerWrap = document.getElementById('turn-timer-wrap');
    if (timerWrap) timerWrap.style.display = 'none';
  }

  public onCombatTurnChanged(activePlayerId: string, _turnCount: number): void {
    this.currentTurnPlayerId = activePlayerId;
    const isMyTurn = this.myPlayerId === activePlayerId;
    this.startTurnTimer(25, isMyTurn);
  }

  public showCombatVictory(exp: number, yang: number, droppedItems: Item[] = [], onClose?: () => void): void {
    SoundManager.getInstance().playLevelUp();
    SoundManager.getInstance().playYangCoin();

    if (this.victoryTimerInterval) {
      clearInterval(this.victoryTimerInterval);
      this.victoryTimerInterval = null;
    }
    this.onVictoryCloseCallback = onClose || null;

    const modal = document.getElementById('victory-modal');
    const title = document.getElementById('victory-modal-title');
    const expVal = document.getElementById('victory-exp-val');
    const yangVal = document.getElementById('victory-yang-val');
    const countdownEl = document.getElementById('victory-countdown');
    const dropsCont = document.getElementById('victory-drops-container');
    const dropsList = document.getElementById('victory-drops-list');
    const closeBtn = document.getElementById('btn-close-victory') as HTMLButtonElement;

    if (title) {
      title.innerText = '⚔️ ¡VICTORIA EN COMBATE! ⚔️';
      title.style.color = '#ffd700';
    }
    if (expVal) expVal.innerText = `+${exp} EXP`;
    if (yangVal) yangVal.innerText = `+${yang} Yang`;

    if (dropsCont && dropsList) {
      if (droppedItems && droppedItems.length > 0) {
        dropsCont.style.display = 'block';
        dropsList.innerHTML = droppedItems
          .map(
            (item) => `
          <div style="display: flex; align-items: center; gap: 8px; background: rgba(0,0,0,0.6); border: 1px solid #ffd700; border-radius: 6px; padding: 6px 12px; font-size: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.5);">
            ${renderItemIcon(item.icon, 20)}
            <span style="color: #fff; font-weight: bold;">${item.name}</span>
          </div>
        `
          )
          .join('');
      } else {
        dropsCont.style.display = 'block';
        dropsList.innerHTML = '<span style="color: #9ca3af; font-size: 12px; font-style: italic;">No se obtuvieron objetos adicionales esta vez</span>';
      }
    }

    let remaining = 6;
    if (countdownEl) countdownEl.innerText = `${remaining}`;

    const triggerClose = () => {
      if (this.victoryTimerInterval) {
        clearInterval(this.victoryTimerInterval);
        this.victoryTimerInterval = null;
      }
      if (modal) modal.style.display = 'none';
      if (this.onVictoryCloseCallback) {
        const cb = this.onVictoryCloseCallback;
        this.onVictoryCloseCallback = null;
        cb();
      }
    };

    if (closeBtn) {
      closeBtn.onclick = triggerClose;
    }

    this.victoryTimerInterval = window.setInterval(() => {
      remaining--;
      if (countdownEl) countdownEl.innerText = `${remaining}`;
      if (remaining <= 0) {
        triggerClose();
      }
    }, 1000);

    if (modal) modal.style.display = 'block';
  }

  public showCombatDefeat(onClose?: () => void): void {
    if (this.victoryTimerInterval) {
      clearInterval(this.victoryTimerInterval);
      this.victoryTimerInterval = null;
    }
    this.onVictoryCloseCallback = onClose || null;

    const modal = document.getElementById('victory-modal');
    const title = document.getElementById('victory-modal-title');
    const expVal = document.getElementById('victory-exp-val');
    const yangVal = document.getElementById('victory-yang-val');
    const countdownEl = document.getElementById('victory-countdown');
    const dropsCont = document.getElementById('victory-drops-container');
    const dropsList = document.getElementById('victory-drops-list');
    const closeBtn = document.getElementById('btn-close-victory') as HTMLButtonElement;

    if (title) {
      title.innerText = '💀 ¡DERROTA! 💀';
      title.style.color = '#ef4444';
    }
    if (expVal) expVal.innerText = '+0 EXP';
    if (yangVal) yangVal.innerText = '+0 Yang';

    if (dropsCont && dropsList) {
      dropsCont.style.display = 'block';
      dropsList.innerHTML = '<span style="color: #ef4444; font-size: 12px; font-weight: bold;">Has sido derrotado. Recuperarás salud en la aldea.</span>';
    }

    let remaining = 5;
    if (countdownEl) countdownEl.innerText = `${remaining}`;

    const triggerClose = () => {
      if (this.victoryTimerInterval) {
        clearInterval(this.victoryTimerInterval);
        this.victoryTimerInterval = null;
      }
      if (modal) modal.style.display = 'none';
      if (this.onVictoryCloseCallback) {
        const cb = this.onVictoryCloseCallback;
        this.onVictoryCloseCallback = null;
        cb();
      }
    };

    if (closeBtn) {
      closeBtn.onclick = triggerClose;
    }

    this.victoryTimerInterval = window.setInterval(() => {
      remaining--;
      if (countdownEl) countdownEl.innerText = `${remaining}`;
      if (remaining <= 0) {
        triggerClose();
      }
    }, 1000);

    if (modal) modal.style.display = 'block';
  }

  private renderBaseSkeleton(): void {
    this.root.innerHTML = `
      <!-- Frame Superior Izquierdo: Perfil MMO de Metin2 (Oculto en favor de UI Dofus 1.29) -->
      <div class="mmo-player-card interactive" id="mmo-player-frame" style="display: none;">
        <div class="player-avatar-circle" id="player-avatar">⚔️</div>
        <div class="player-info-column">
          <div class="player-name-row">
            <span class="level-badge" id="mmo-level-badge">Lv. 1</span>
            <span class="mmo-player-name" id="mmo-name-label">Héroe</span>
          </div>
          <div class="mmo-hp-bar-bg">
            <div class="mmo-hp-bar-fill" id="mmo-hp-fill" style="width: 100%;"></div>
            <span class="mmo-bar-text" id="mmo-hp-text">150 / 150 HP</span>
          </div>
          <div class="mmo-exp-bar-bg">
            <div class="mmo-exp-bar-fill" id="mmo-exp-fill" style="width: 0%;"></div>
            <span class="mmo-bar-text" id="mmo-exp-text">EXP: 0 / 300</span>
          </div>
          <div class="mmo-yang-row">
            <span>💰 Yang: </span><span id="mmo-yang-text" style="color: #ffd700; font-weight: 700;">250</span>
          </div>
          <div style="display: flex; gap: 6px; margin-top: 8px;">
            <button id="btn-open-status" class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px;">⚔️ Estado [C]</button>
            <button id="btn-open-inventory" class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px;">🎒 Inventario [I]</button>
            <button id="btn-open-shop-stall" class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px;">🏪 Puesto</button>
            <button id="btn-open-quests" class="btn btn-secondary" style="padding: 3px 8px; font-size: 11px;">📜 Misiones [L]</button>
            <button id="btn-toggle-sound" class="btn btn-secondary" style="padding: 3px 6px; font-size: 11px;" title="Silenciar / Activar Sonido">🔊</button>
            <button id="btn-toggle-bgm" class="btn btn-secondary" style="padding: 3px 6px; font-size: 11px;" title="Música de Aldea">🎵 BGM</button>
          </div>
        </div>
      </div>

      <!-- Panel de Grupo (Party HUD) -->
      <div id="party-hud" class="interactive" style="display: none; position: absolute; top: 125px; left: 16px; width: 230px; background: rgba(15, 20, 30, 0.92); border: 1px solid #38bdf8; border-radius: 8px; padding: 10px; z-index: 55; box-shadow: 0 4px 15px rgba(0,0,0,0.85);">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 4px; margin-bottom: 6px;">
          <span style="font-size: 11px; font-weight: bold; color: #38bdf8; text-transform: uppercase;">🛡️ Mi Grupo</span>
          <button id="btn-leave-party" style="background: transparent; border: none; color: #ef4444; font-size: 11px; cursor: pointer; font-weight: bold;">Salir</button>
        </div>
        <div id="party-members-list" style="display: flex; flex-direction: column; gap: 6px;"></div>
      </div>

      <!-- Tracker de Misiones en Vivo (Superior Derecha - Oculto por defecto, alternable con L o botón de misiones) -->
      <div id="quest-tracker-hud" class="interactive" style="display: none; position: absolute; top: 80px; right: 20px; width: 250px; background: rgba(15, 18, 25, 0.95); border: 1px solid #b8860b; border-radius: 8px; padding: 10px; box-shadow: 0 4px 15px rgba(0,0,0,0.7); z-index: 30;">
        <div style="font-family: 'Cinzel', serif; font-size: 12px; font-weight: 700; color: #ffd700; border-bottom: 1px solid #333; padding-bottom: 4px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span style="display:inline-flex;align-items:center;gap:6px;"><img src="/assets/ui/icons/mt2_btn_quest.png" style="width:16px;height:16px;object-fit:contain;image-rendering:pixelated;" alt="Misiones" /> MISIONES</span>
          <span style="font-size: 10px; color: #aaa;">[L]</span>
        </div>
        <div id="quest-tracker-list" style="display: flex; flex-direction: column; gap: 8px; font-size: 11px;"></div>
      </div>

      <!-- Modal Detalle de Misión (¿Qué debemos hacer?) -->
      <div id="quest-detail-modal" class="interactive" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 440px; max-width: 92vw; background: linear-gradient(180deg, #1c1813 0%, #0f0d0a 100%); border: 2px solid #ffd700; border-radius: 10px; box-shadow: 0 10px 40px rgba(0,0,0,0.95); z-index: 120; padding: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #443322; padding-bottom: 8px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="/assets/ui/icons/mt2_btn_quest.png" style="width:24px;height:24px;object-fit:contain;image-rendering:pixelated;" alt="Misiones" />
            <div>
              <div id="quest-modal-title" style="font-family: 'Cinzel', serif; font-size: 15px; font-weight: 700; color: #ffd700;">Misión</div>
              <div id="quest-modal-status" style="font-size: 10px; color: #4ade80;">En Progreso</div>
            </div>
          </div>
          <button id="btn-close-quest-modal" style="background: transparent; border: none; color: #aaa; font-size: 22px; cursor: pointer; padding: 0 4px;">&times;</button>
        </div>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 11px; font-weight: bold; color: #f59e0b; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">🎯 ¿Qué debemos hacer?</div>
          <div id="quest-modal-desc" style="font-size: 12px; color: #e5e7eb; line-height: 1.5; background: rgba(0,0,0,0.4); padding: 10px; border-radius: 6px; border-left: 3px solid #f59e0b;">
            Descripción de la misión.
          </div>
        </div>

        <div style="margin-bottom: 12px; background: rgba(255,255,255,0.03); padding: 10px; border-radius: 6px; border: 1px solid #33281c;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 6px;">
            <span style="color: #bbb;">Objetivo:</span>
            <span id="quest-modal-progress-text" style="font-weight: bold; color: #ffd700;">0 / 3</span>
          </div>
          <div style="width: 100%; height: 8px; background: #262017; border-radius: 4px; overflow: hidden; border: 1px solid #443522;">
            <div id="quest-modal-progress-bar" style="height: 100%; width: 0%; background: linear-gradient(90deg, #f59e0b, #4ade80); transition: width 0.3s ease;"></div>
          </div>
          <div id="quest-modal-hint" style="margin-top: 6px; font-size: 10px; color: #94a3b8; font-style: italic;">
            📍 Dónde encontrarlo: Alrededores de la Aldea 1.
          </div>
        </div>

        <div style="margin-bottom: 14px;">
          <div style="font-size: 11px; font-weight: bold; color: #4ade80; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">🎁 Recompensas al Entregar:</div>
          <div id="quest-modal-rewards" style="display: flex; gap: 10px; flex-wrap: wrap;"></div>
        </div>

        <div id="quest-modal-turnin-guide" style="font-size: 11px; color: #cbd5e1; background: rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.3); padding: 8px; border-radius: 6px; text-align: center;">
          🏛️ Entrega: Habla con el <b>Guardián de la Aldea</b> en la plaza central.
        </div>
      </div>

      <!-- Ventana de Inventario Auténtica Dofus 1.29 (Imagen 2) -->
      <div id="inventory-modal" class="interactive">
        <!-- Botón de Cierre Superior Derecho -->
        <button id="btn-close-inventory" class="dofus-modal-close-btn" title="Cerrar Inventario [I / Esc]">&times;</button>

        <!-- Columna Izquierda: Vista previa de Core -->
        <div class="dofus-inv-col-left">
          <div class="dofus-core-preview-title">Vista previa de Core</div>
          <div id="dofus-core-preview-wrap"></div>
        </div>

        <!-- Columna Central: Silueta Paperdoll + Yang + Pods + Detalle del Objeto -->
        <div class="dofus-inv-col-center">
          <div class="dofus-paperdoll-wrap">
            <!-- 6 Ranuras de Huevos Dofus -->
            <div class="dofus-eggs-column">
              <div class="dofus-egg-slot" title="Dofus Ocre (PA)">🥚</div>
              <div class="dofus-egg-slot" title="Dofus Carmesí (Fuerza)">🔴</div>
              <div class="dofus-egg-slot" title="Dofus Turquesa (Golpes Críticos)">🔵</div>
              <div class="dofus-egg-slot" title="Dofus Esmeralda (Vitalidad)">🟢</div>
              <div class="dofus-egg-slot" title="Dofus Vulbis (PM)">🟠</div>
              <div class="dofus-egg-slot" title="Dofus Púrpura (Sabiduría)">🟣</div>
            </div>

            <!-- Silueta central de equipamiento -->
            <div class="dofus-doll-silhouette">
              <div class="dofus-equip-slot" id="equip-slot-hat" title="Sombrero">🎩</div>
              <div class="dofus-equip-slot" id="equip-slot-amulet" title="Amuleto">📿</div>
              <div class="dofus-equip-slot" id="equip-slot-ring1" title="Anillo 1">💍</div>

              <div class="dofus-equip-slot" id="equip-slot-weapon" title="Arma Principal">🗡️</div>
              <div class="dofus-equip-slot" id="equip-slot-shield" title="Escudo">🛡️</div>
              <div class="dofus-equip-slot" id="equip-slot-ring2" title="Anillo 2">💍</div>

              <div class="dofus-equip-slot" id="equip-slot-belt" title="Cinturón">🎗️</div>
              <div class="dofus-equip-slot" id="equip-slot-boots" title="Botas">👢</div>
              <div class="dofus-equip-slot" id="equip-slot-cape" title="Capa">🧣</div>
            </div>
          </div>

          <!-- Barra de Yang y Pods -->
          <div class="dofus-kamas-pods-bar">
            <div class="dofus-kamas-val">
              <span>💰 Yang:</span>
              <span id="dofus-inv-yang">250</span>
            </div>
            <div class="dofus-pods-wrap">
              <span>Pods</span>
              <div class="dofus-pods-bar-bg">
                <div class="dofus-pods-bar-fill" id="dofus-pods-fill" style="width: 10%;"></div>
              </div>
              <span id="dofus-pods-text">10 / 1000</span>
            </div>
          </div>

          <!-- Tarjeta de Detalle del Objeto Seleccionado -->
          <div class="dofus-item-detail-card" id="dofus-item-detail">
            <div class="dofus-item-detail-header">
              <span id="dofus-detail-name">Arma</span>
              <span id="dofus-detail-level">-</span>
            </div>
            <div class="dofus-item-detail-body">
              <div class="dofus-item-detail-icon" id="dofus-detail-icon">🗡️</div>
              <div class="dofus-item-detail-stats">
                <div style="font-weight: bold; color: #15803d; margin-bottom: 2px;" id="dofus-detail-bonus">-</div>
                <div style="font-size: 9px; color: #666;" id="dofus-detail-desc">Arma equipada en la mano principal.</div>
                <div style="margin-top: 4px; display: flex; gap: 4px;">
                  <button id="btn-dofus-action" class="btn btn-secondary" style="display: none; padding: 2px 6px; font-size: 9px;">Acción</button>
                  <button id="btn-unequip-weapon" class="btn btn-secondary" style="display: none; padding: 2px 6px; font-size: 9px;">Desequipar</button>
                  <button id="btn-unequip-armor" class="btn btn-secondary" style="display: none; padding: 2px 6px; font-size: 9px;">Desequipar Armadura</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Columna Derecha: Filtros de Categoría y Cuadrícula 8x8 (64 casillas) -->
        <div class="dofus-inv-col-right">
          <div class="dofus-inv-tabs-row">
            <div class="dofus-category-icons">
              <div class="dofus-cat-icon selected" data-cat="all" title="Todo">📦</div>
              <div class="dofus-cat-icon" data-cat="weapon" title="Armas">⚔️</div>
              <div class="dofus-cat-icon" data-cat="armor" title="Equipamiento">🛡️</div>
              <div class="dofus-cat-icon" data-cat="potion" title="Consumibles">🧪</div>
              <div class="dofus-cat-icon" data-cat="resource" title="Recursos">🌾</div>
            </div>
          </div>

          <!-- Cuadrícula 8x8 con scrollbar retro -->
          <div class="dofus-grid-8x8" id="dofus-grid-8x8"></div>
        </div>
      </div>

      <!-- Modal de Diálogo con NPCs (Herrero, Tienda, Guardián, Mercado) -->
      <div id="npc-dialog-modal" class="interactive" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 460px; max-width: 95vw; background: linear-gradient(180deg, #181b26, #0e1017); border: 2px solid #ffd700; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.95); z-index: 130; padding: 20px; box-sizing: border-box;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 8px; margin-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span id="npc-avatar-icon" style="font-size: 24px;">🧔</span>
            <div>
              <div id="npc-dialog-name" style="font-family: 'Cinzel', serif; font-size: 16px; font-weight: 700; color: #ffd700;">NPC</div>
              <div id="npc-dialog-title" style="font-size: 11px; color: #888;">Aldea 1</div>
            </div>
          </div>
          <button id="btn-close-npc-dialog" style="background: transparent; border: none; color: #aaa; font-size: 20px; cursor: pointer;">&times;</button>
        </div>
        <div id="npc-dialog-text" style="font-size: 12px; color: #ddd; line-height: 1.5; margin-bottom: 14px; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 6px; border-left: 3px solid #b8860b;"></div>
        <div id="npc-dialog-content"></div>
      </div>

      <!-- Banner Superior de Combate Táctico con Dashboard Dual de HP -->
      <div class="top-banner interactive" id="top-banner" style="display: none;">
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; gap: 14px;">
          <!-- HP Jugador Local (Aliado) -->
          <div id="combat-hud-player" style="flex: 1; display: flex; flex-direction: column; align-items: flex-start;">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: bold; color: #38bdf8;">
              <span id="cb-player-name">Héroe</span>
              <span id="cb-player-lvl" style="font-size: 10px; background: rgba(56, 189, 248, 0.2); padding: 1px 5px; border-radius: 4px; color: #7dd3fc;">Lv. 1</span>
            </div>
            <div style="width: 100%; height: 16px; background: rgba(0,0,0,0.6); border: 1.5px solid #0284c7; border-radius: 8px; overflow: hidden; position: relative; margin-top: 3px;">
              <div id="cb-player-hp-fill" style="width: 100%; height: 100%; background: linear-gradient(90deg, #10b981, #34d399); transition: width 0.3s ease;"></div>
              <span id="cb-player-hp-text" style="position: absolute; width: 100%; text-align: center; top: 0; left: 0; font-size: 10px; font-weight: 800; color: #fff; text-shadow: 0 1px 3px #000; line-height: 14px;">150 / 150 HP</span>
            </div>
          </div>

          <!-- Centro: Título de Turno & Temporizador -->
          <div style="min-width: 170px; text-align: center;">
            <div class="turn-title" id="banner-turn-title">Arena Táctica</div>
            <div class="turn-subtitle" id="banner-turn-subtitle">Fase de preparación</div>
            <div class="turn-timer-container" id="turn-timer-wrap" style="display: none; margin-top: 2px;">
              <div class="turn-timer-bar">
                <div class="turn-timer-fill" id="turn-timer-fill" style="width: 100%;"></div>
              </div>
              <span class="turn-timer-text" id="turn-timer-text">⏱️ 25s</span>
            </div>
          </div>

          <!-- HP Enemigo / Mob Objetivo -->
          <div id="combat-hud-enemy" style="flex: 1; display: flex; flex-direction: column; align-items: flex-end;">
            <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: bold; color: #f87171;">
              <span id="cb-enemy-lvl" style="font-size: 10px; background: rgba(239, 68, 68, 0.2); padding: 1px 5px; border-radius: 4px; color: #fca5a5;">Lv. 1</span>
              <span id="cb-enemy-name">Perro Salvaje</span>
            </div>
            <div style="width: 100%; height: 16px; background: rgba(0,0,0,0.6); border: 1.5px solid #dc2626; border-radius: 8px; overflow: hidden; position: relative; margin-top: 3px;">
              <div id="cb-enemy-hp-fill" style="width: 100%; height: 100%; background: linear-gradient(90deg, #ef4444, #f87171); transition: width 0.3s ease;"></div>
              <span id="cb-enemy-hp-text" style="position: absolute; width: 100%; text-align: center; top: 0; left: 0; font-size: 10px; font-weight: 800; color: #fff; text-shadow: 0 1px 3px #000; line-height: 14px;">100 / 100 HP</span>
            </div>
          </div>
        </div>
        <button class="btn btn-start" id="btn-force-start" style="display: none; margin: 8px auto 0 auto; font-size: 13px; padding: 6px 14px;">¡INICIAR COMBATE AHORA!</button>
      </div>

      <!-- Banner Flotante de Victoria / Recompensas de Combate -->
      <div id="victory-modal" class="interactive" style="display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 440px; max-width: 92vw; background: linear-gradient(180deg, #181926 0%, #0d0e15 100%); border: 2px solid #ffd700; border-radius: 14px; padding: 24px 28px; box-shadow: 0 12px 50px rgba(0,0,0,0.95), 0 0 35px rgba(255, 215, 0, 0.4); text-align: center; z-index: 300;">
        <div id="victory-modal-title" style="font-family: 'Cinzel', serif; font-size: 26px; font-weight: 900; color: #ffd700; letter-spacing: 1px; text-shadow: 0 0 16px rgba(255, 215, 0, 0.7); margin-bottom: 16px;">⚔️ ¡VICTORIA EN COMBATE! ⚔️</div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
          <div style="background: rgba(34, 197, 94, 0.12); border: 1px solid rgba(74, 222, 128, 0.4); border-radius: 8px; padding: 10px; text-align: center;">
            <div style="font-size: 11px; color: #86efac; text-transform: uppercase; font-weight: bold; margin-bottom: 2px;">Experiencia</div>
            <div id="victory-exp-val" style="font-size: 18px; font-weight: 900; color: #4ade80;">+150 EXP</div>
          </div>
          <div style="background: rgba(234, 179, 8, 0.12); border: 1px solid rgba(253, 224, 71, 0.4); border-radius: 8px; padding: 10px; text-align: center;">
            <div style="font-size: 11px; color: #fde047; text-transform: uppercase; font-weight: bold; margin-bottom: 2px;">Yang Obtenido</div>
            <div id="victory-yang-val" style="font-size: 18px; font-weight: 900; color: #ffd700;">+350 Yang</div>
          </div>
        </div>

        <div id="victory-drops-container" style="background: rgba(0, 0, 0, 0.45); border: 1px solid #33281c; border-radius: 8px; padding: 12px; margin-bottom: 18px;">
          <div style="font-size: 12px; color: #ffd700; font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <span>🎁 Botín Obtenido:</span>
          </div>
          <div id="victory-drops-list" style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;"></div>
        </div>

        <button id="btn-close-victory" class="btn btn-start" style="width: 100%; padding: 10px; font-size: 14px; font-weight: bold; letter-spacing: 0.5px; background: linear-gradient(180deg, #d97706, #b45309); border: 1px solid #f59e0b; border-radius: 8px; color: #fff; cursor: pointer; transition: all 0.2s;">
          Aceptar (<span id="victory-countdown">6</span>s)
        </button>
      </div>

      <!-- Modal de Solicitud de Duelo PvP -->
      <div id="duel-request-modal" class="interactive" style="display: none; position: absolute; top: 32%; left: 50%; transform: translate(-50%, -50%); width: 340px; background: linear-gradient(180deg, #1f142b, #0d0a14); border: 2px solid #ef4444; border-radius: 12px; box-shadow: 0 0 35px rgba(239, 68, 68, 0.7); z-index: 120; padding: 20px; text-align: center;">
        <div style="font-size: 32px; margin-bottom: 6px;">⚔️</div>
        <div style="font-family: 'Cinzel', serif; font-size: 17px; font-weight: bold; color: #ef4444; margin-bottom: 6px;">DESAFÍO DE DUELO</div>
        <div id="duel-challenger-text" style="color: #fff; font-size: 13px; margin-bottom: 16px;">Un guerrero te desafía a un duelo de honor.</div>
        <div style="display: flex; gap: 10px; justify-content: center;">
          <button id="btn-accept-duel" class="btn btn-start" style="padding: 6px 16px; font-size: 12px; background: #ef4444; border-color: #f87171;">⚔️ Aceptar</button>
          <button id="btn-reject-duel" class="btn btn-secondary" style="padding: 6px 16px; font-size: 12px;">❌ Rechazar</button>
        </div>
      </div>

      <!-- Tarjeta de Interacción con Jugador Objetivo -->
      <div id="player-target-modal" class="interactive" style="display: none; position: absolute; top: 120px; left: 50%; transform: translateX(-50%); width: 280px; background: linear-gradient(180deg, #181926, #0e0f17); border: 2px solid #38bdf8; border-radius: 10px; padding: 14px; box-shadow: 0 8px 25px rgba(0,0,0,0.9); z-index: 65; text-align: center;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 6px; margin-bottom: 10px;">
          <div id="target-player-name" style="font-family: 'Cinzel', serif; font-size: 14px; font-weight: bold; color: #38bdf8;">Jugador</div>
          <button id="btn-close-target-modal" style="background: transparent; border: none; color: #888; font-size: 16px; cursor: pointer;">&times;</button>
        </div>
        <div id="target-player-info" style="font-size: 11px; color: #aaa; margin-bottom: 12px;">Guerrero Lv. 1</div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <button id="btn-challenge-duel" class="btn btn-secondary" style="padding: 6px; font-size: 11px;">⚔️ Desafiar a Duelo</button>
          <button id="btn-invite-party" class="btn btn-secondary" style="padding: 6px; font-size: 11px;">🛡️ Invitar al Grupo</button>
          <button id="btn-request-trade" class="btn btn-secondary" style="padding: 6px; font-size: 11px;">🤝 Solicitar Comercio</button>
        </div>
      </div>

      <!-- Ventana de Características y Atributos de Personaje [C] -->
      <div id="character-status-modal" class="interactive" style="display: none; position: absolute; top: 100px; left: 30px; width: 320px; background: linear-gradient(180deg, rgba(22, 24, 34, 0.98), rgba(12, 13, 18, 0.98)); border: 2px solid #ffd700; border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,0.95); z-index: 70; padding: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 6px; margin-bottom: 10px;">
          <div style="font-family: 'Cinzel', serif; font-size: 15px; font-weight: 700; color: #ffd700; display: inline-flex; align-items: center; gap: 6px;"><img src="/assets/ui/icons/mt2_btn_character.png" style="width:20px;height:20px;object-fit:contain;image-rendering:pixelated;" alt="Estado" /> ESTADO DE HÉROE [C]</div>
          <button id="btn-close-status-modal" style="background: transparent; border: none; color: #aaa; font-size: 18px; cursor: pointer;">&times;</button>
        </div>
        <div style="background: rgba(0,0,0,0.4); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; color: #aaa;">Puntos de Estado:</span>
          <span id="stat-points-val" style="color: #ffd700; font-weight: bold; font-size: 14px;">0</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 6px;">
            <div>
              <div style="font-weight: bold; color: #ef4444; font-size: 12px;">VIT (Vitalidad)</div>
              <div style="font-size: 10px; color: #888;">+40 HP máx. y Defensa</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span id="stat-vit-val" style="color: #fff; font-weight: bold;">10</span>
              <button class="btn btn-secondary btn-add-stat" data-stat="vit" style="padding: 2px 8px; font-size: 12px; font-weight: bold;">+</button>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 6px;">
            <div>
              <div style="font-weight: bold; color: #38bdf8; font-size: 12px;">INT (Inteligencia)</div>
              <div style="font-size: 10px; color: #888;">+20 SP y Poder Mágico</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span id="stat-int-val" style="color: #fff; font-weight: bold;">10</span>
              <button class="btn btn-secondary btn-add-stat" data-stat="int" style="padding: 2px 8px; font-size: 12px; font-weight: bold;">+</button>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 6px;">
            <div>
              <div style="font-weight: bold; color: #eab308; font-size: 12px;">STR (Fuerza)</div>
              <div style="font-size: 10px; color: #888;">+3 Ataque Físico</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span id="stat-str-val" style="color: #fff; font-weight: bold;">10</span>
              <button class="btn btn-secondary btn-add-stat" data-stat="str" style="padding: 2px 8px; font-size: 12px; font-weight: bold;">+</button>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.3); padding: 6px 10px; border-radius: 6px;">
            <div>
              <div style="font-weight: bold; color: #a855f7; font-size: 12px;">DEX (Destreza)</div>
              <div style="font-size: 10px; color: #888;">+1% Evasión y Crítico</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span id="stat-dex-val" style="color: #fff; font-weight: bold;">10</span>
              <button class="btn btn-secondary btn-add-stat" data-stat="dex" style="padding: 2px 8px; font-size: 12px; font-weight: bold;">+</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal de Invitación a Grupo -->
      <div id="party-invite-modal" class="interactive" style="display: none; position: absolute; top: 28%; left: 50%; transform: translate(-50%, -50%); width: 330px; background: linear-gradient(180deg, #132238, #0b1420); border: 2px solid #38bdf8; border-radius: 12px; box-shadow: 0 0 35px rgba(56, 189, 248, 0.6); z-index: 120; padding: 18px; text-align: center;">
        <div style="font-size: 28px; margin-bottom: 6px;">🛡️</div>
        <div style="font-family: 'Cinzel', serif; font-size: 16px; font-weight: bold; color: #38bdf8; margin-bottom: 6px;">INVITACIÓN DE GRUPO</div>
        <div id="party-invite-text" style="color: #fff; font-size: 12px; margin-bottom: 14px;">Un héroe te invita a unirte a su grupo.</div>
        <div style="display: flex; gap: 10px; justify-content: center;">
          <button id="btn-accept-party" class="btn btn-start" style="padding: 6px 14px; font-size: 12px;">🛡️ Aceptar</button>
          <button id="btn-reject-party" class="btn btn-secondary" style="padding: 6px 14px; font-size: 12px;">❌ Rechazar</button>
        </div>
      </div>

      <!-- Modal de Invitación a Comercio 1v1 -->
      <div id="trade-invite-modal" class="interactive" style="display: none; position: absolute; top: 28%; left: 50%; transform: translate(-50%, -50%); width: 330px; background: linear-gradient(180deg, #1f2937, #111827); border: 2px solid #10b981; border-radius: 12px; box-shadow: 0 0 35px rgba(16, 185, 129, 0.6); z-index: 120; padding: 18px; text-align: center;">
        <div style="font-size: 28px; margin-bottom: 6px;">🤝</div>
        <div style="font-family: 'Cinzel', serif; font-size: 16px; font-weight: bold; color: #10b981; margin-bottom: 6px;">COMERCIO DIRECTO</div>
        <div id="trade-invite-text" style="color: #fff; font-size: 12px; margin-bottom: 14px;">Un jugador desea comerciar contigo.</div>
        <div style="display: flex; gap: 10px; justify-content: center;">
          <button id="btn-accept-trade" class="btn btn-start" style="padding: 6px 14px; font-size: 12px; background: #059669;">🤝 Aceptar</button>
          <button id="btn-reject-trade" class="btn btn-secondary" style="padding: 6px 14px; font-size: 12px;">❌ Rechazar</button>
        </div>
      </div>

      <!-- Ventana de Intercambio / Comercio Activo -->
      <div id="trade-window-modal" class="interactive" style="display: none; position: absolute; top: 45%; left: 50%; transform: translate(-50%, -50%); width: 560px; background: linear-gradient(180deg, #18181b, #09090b); border: 2px solid #eab308; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.95); z-index: 130; padding: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #3f3f46; padding-bottom: 6px; margin-bottom: 12px;">
          <div style="font-family: 'Cinzel', serif; font-size: 15px; font-weight: bold; color: #fbbf24;">🤝 COMERCIO ENTRE JUGADORES</div>
          <button id="btn-close-trade-window" style="background: transparent; border: none; color: #aaa; font-size: 18px; cursor: pointer;">&times;</button>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
          <!-- Columna Jugador Local -->
          <div style="background: rgba(24, 24, 27, 0.8); border: 1px solid #3f3f46; border-radius: 8px; padding: 10px;">
            <div id="trade-my-header" style="color: #60a5fa; font-weight: bold; font-size: 13px; margin-bottom: 6px; display: flex; justify-content: space-between;">
              <span>Tu Ofrenda</span>
              <span id="trade-my-status" style="font-size: 11px; color: #aaa;">Modificando...</span>
            </div>
            <!-- Lista de items ofrecidos -->
            <div id="trade-my-items" style="min-height: 80px; max-height: 120px; overflow-y: auto; background: #000; border: 1px solid #27272a; border-radius: 6px; padding: 6px; display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;"></div>
            <!-- Yang ofrecido -->
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
              <span style="font-size: 12px; color: #ffd700;">💰 Yang:</span>
              <input type="number" id="trade-my-yang-input" min="0" placeholder="0" style="width: 100px; background: #000; border: 1px solid #555; color: #ffd700; padding: 4px 6px; border-radius: 4px; font-size: 12px;" />
              <button id="btn-trade-offer-yang" class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px;">Ofrecer</button>
            </div>
            <!-- Ofrecer item del inventario -->
            <div style="margin-top: 6px;">
              <label style="font-size: 11px; color: #888;">Ofrecer del Inventario:</label>
              <select id="trade-inventory-select" style="width: 100%; background: #000; border: 1px solid #555; color: #fff; padding: 4px; border-radius: 4px; font-size: 11px; margin-top: 2px;">
                <option value="-1">-- Seleccionar Ítem --</option>
              </select>
            </div>
          </div>

          <!-- Columna Jugador Remoto -->
          <div style="background: rgba(24, 24, 27, 0.8); border: 1px solid #3f3f46; border-radius: 8px; padding: 10px;">
            <div id="trade-other-header" style="color: #f87171; font-weight: bold; font-size: 13px; margin-bottom: 6px; display: flex; justify-content: space-between;">
              <span id="trade-other-name">Compañero</span>
              <span id="trade-other-status" style="font-size: 11px; color: #aaa;">Esperando...</span>
            </div>
            <!-- Lista de items remotos -->
            <div id="trade-other-items" style="min-height: 80px; max-height: 120px; overflow-y: auto; background: #000; border: 1px solid #27272a; border-radius: 6px; padding: 6px; display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px;"></div>
            <!-- Yang remoto -->
            <div style="font-size: 12px; color: #ffd700; padding: 4px 0;">
              💰 Yang Ofrecido: <span id="trade-other-yang" style="font-weight: bold;">0</span>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 10px; justify-content: flex-end;">
          <button id="btn-trade-confirm" class="btn btn-start" style="padding: 8px 16px; font-size: 12px; background: #059669;">✅ Confirmar Intercambio</button>
          <button id="btn-trade-cancel" class="btn btn-secondary" style="padding: 8px 16px; font-size: 12px;">❌ Cancelar</button>
        </div>
      </div>

      <!-- Modal para Abrir Tienda Privada -->
      <div id="open-private-shop-modal" class="interactive" style="display: none; position: absolute; top: 45%; left: 50%; transform: translate(-50%, -50%); width: 360px; background: linear-gradient(180deg, #1c1524, #0f0a14); border: 2px solid #fbbf24; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.95); z-index: 90; padding: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 6px; margin-bottom: 10px;">
          <div style="font-family: 'Cinzel', serif; font-size: 15px; font-weight: bold; color: #fbbf24;">🏪 ABRIR TIENDA PRIVADA</div>
          <button id="btn-close-open-shop" style="background: transparent; border: none; color: #aaa; font-size: 18px; cursor: pointer;">&times;</button>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="font-size: 11px; color: #aaa;">Título de la Tienda:</label>
          <input type="text" id="shop-title-input" placeholder="Ej: Venta de FMS y Materiales" style="width: 100%; box-sizing: border-box; background: #000; border: 1px solid #555; color: #fff; padding: 6px; border-radius: 4px; font-size: 12px; margin-top: 4px;" />
        </div>
        <div style="font-size: 11px; color: #aaa; margin-bottom: 6px;">Selecciona el objeto de tu inventario que venderás:</div>
        <div id="shop-setup-items" style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto; margin-bottom: 12px;"></div>
        <button id="btn-confirm-open-shop" class="btn btn-start" style="width: 100%; padding: 8px; font-size: 13px;">🏪 ¡MONTAR PUESTO DE MERCADO!</button>
      </div>

      <!-- Modal para Comprar en Tienda Privada de Otro Jugador -->
      <div id="view-private-shop-modal" class="interactive" style="display: none; position: absolute; top: 45%; left: 50%; transform: translate(-50%, -50%); width: 380px; background: linear-gradient(180deg, #1c1524, #0f0a14); border: 2px solid #fbbf24; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.95); z-index: 90; padding: 18px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 6px; margin-bottom: 10px;">
          <div>
            <div id="view-shop-title" style="font-family: 'Cinzel', serif; font-size: 15px; font-weight: bold; color: #fbbf24;">Tienda</div>
            <div id="view-shop-seller" style="font-size: 11px; color: #888;">Vendedor: Héroe</div>
          </div>
          <button id="btn-close-view-shop" style="background: transparent; border: none; color: #aaa; font-size: 18px; cursor: pointer;">&times;</button>
        </div>
        <div id="view-shop-items-list" style="display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto; margin-bottom: 12px;"></div>
      </div>

      <!-- Modal de Habilidades / Hechizos Estilo Metin2 / Dofus [S] -->
      <div id="skills-modal" class="interactive" style="display: none; position: absolute; top: 90px; left: 340px; width: 440px; background: linear-gradient(180deg, rgba(22, 24, 34, 0.98), rgba(12, 13, 18, 0.98)); border: 2px solid #ffd700; border-radius: 10px; box-shadow: 0 8px 30px rgba(0,0,0,0.95); z-index: 75; padding: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 6px; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <img src="/assets/ui/icons/mt2_btn_skill.png" style="width:20px;height:20px;object-fit:contain;image-rendering:pixelated;" alt="Habilidades" />
            <div style="font-family: 'Cinzel', serif; font-size: 15px; font-weight: bold; color: #ffd700;">LIBRO DE HABILIDADES [S]</div>
          </div>
          <button id="btn-close-skills-modal" style="background: transparent; border: none; color: #aaa; font-size: 18px; cursor: pointer;">&times;</button>
        </div>

        <!-- Banner de Nivel y Doctrina -->
        <div id="skills-doctrine-banner" style="background: rgba(0,0,0,0.4); border: 1px solid #444; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; font-size: 11px; line-height: 1.4;">
          <div id="skills-doctrine-title" style="color: #ffd700; font-weight: bold; font-size: 12px; margin-bottom: 2px;">Ataque Básico</div>
          <div id="skills-doctrine-sub" style="color: #bbb;">Nivel 1 a 4: Ataque básico con el arma equipada. Al alcanzar nivel 5 visita al Maestro en la Aldea para elegir tu Doctrina.</div>
        </div>

        <div style="font-size: 11px; color: #aaa; margin-bottom: 6px; display: flex; justify-content: space-between;">
          <span>Habilidades Disponibles:</span>
          <span style="color: #60a5fa;">💡 Haz clic o arrastra a la barra rápida</span>
        </div>

        <!-- Contenedor scrollable de habilidades -->
        <div id="skills-list-container" style="display: flex; flex-direction: column; gap: 6px; max-height: 310px; overflow-y: auto; padding-right: 4px;">
          <!-- Se puebla dinámicamente según la clase y doctrina -->
        </div>
      </div>

      <!-- Tooltip Flotante para Hechizos -->
      <div id="spell-tooltip">
        <div class="tooltip-title" id="tt-title"></div>
        <div class="tooltip-meta" id="tt-meta"></div>
        <div class="tooltip-desc" id="tt-desc"></div>
      </div>

      <!-- Auténtica Taskbar Dofus 1.29 (Imagen 2) -->
      <div id="dofus-taskbar" class="interactive">
        <!-- Sección Izquierda: Chat Dofus -->
        <div id="dofus-chat-section">
          <div class="dofus-chat-filters">
            <span style="font-weight: bold; color: #78350f;">Canal:</span>
            <label style="cursor: pointer;"><input type="checkbox" checked /> General</label>
            <label style="cursor: pointer;"><input type="checkbox" checked /> Combate</label>
            <label style="cursor: pointer;"><input type="checkbox" checked /> Grupo</label>
          </div>
          <div class="dofus-chat-messages" id="dofus-chat-messages">
            <div style="color: #92400e; font-style: italic;">¡Bienvenido a Dotin: Tactical MMORPG (Dofus x Metin2)!</div>
          </div>
          <div class="dofus-chat-input-row">
            <input type="text" class="dofus-chat-input" id="chat-input" placeholder="Escribe un mensaje..." />
          </div>
        </div>

        <!-- Sección Central: Minimapa Circular con Corazón HP y Módulo de Combate Dofus -->
        <div id="dofus-center-minimap-wrap">
          <!-- Corazón de HP Dofus 1.29 (2559 / 2559) -->
          <div id="dofus-hp-heart" title="Puntos de Vida (HP)">
            <span class="dofus-heart-text-cur" id="dofus-heart-cur">150</span>
            <span class="dofus-heart-text-max" id="dofus-heart-max">150</span>
          </div>

          <!-- Módulo de Combate Integrado Dofus 1.29 (PA, PM y Pasar Turno) -->
          <div id="dofus-combat-hub" style="display: none;">
            <div class="dofus-combat-orbs">
              <div class="dofus-mini-orb ap" title="Puntos de Acción (PA)">
                <span class="dofus-mini-orb-val" id="ui-ap-val">6</span>
                <span class="dofus-mini-orb-lbl">PA</span>
              </div>
              <div class="dofus-mini-orb pm" title="Puntos de Movimiento (PM)">
                <span class="dofus-mini-orb-val" id="ui-pm-val">3</span>
                <span class="dofus-mini-orb-lbl">PM</span>
              </div>
            </div>
            <button class="dofus-btn-pass-turn" id="btn-pass-turn" title="Terminar tu turno activo [Espacio]">
              <span>FIN DE TURNO</span>
              <small>[Espacio]</small>
            </button>
          </div>

          <!-- Montura circular para Minimap -->
          <div class="dofus-minimap-circle" id="dofus-minimap-mount"></div>

          <!-- Acciones Radiales alrededor del círculo (Overworld) con Iconos Oficiales Metin2 -->
          <div class="dofus-radial-actions" id="dofus-radial-actions">
            <button class="dofus-radial-btn" id="tb-btn-inventory" title="Tu Inventario [I]">
              <img src="/assets/ui/icons/mt2_btn_inventory.png" alt="Inventario" />
            </button>
            <button class="dofus-radial-btn" id="tb-btn-status" title="Características de Héroe [C]">
              <img src="/assets/ui/icons/mt2_btn_character.png" alt="Estado" />
            </button>
            <button class="dofus-radial-btn" id="tb-btn-spells" title="Libro de Hechizos y Habilidades [S]">
              <img src="/assets/ui/icons/mt2_btn_skill.png" alt="Habilidades" />
            </button>
            <button class="dofus-radial-btn" id="tb-btn-quests" title="Misiones [L]">
              <img src="/assets/ui/icons/mt2_btn_quest.png" alt="Misiones" />
            </button>
            <button class="dofus-radial-btn" id="tb-btn-market" title="Mercado Central">
              <img src="/assets/ui/icons/mt2_btn_market.png" alt="Mercado" />
            </button>
            <button class="dofus-radial-btn" id="tb-btn-sound" title="Alternar Sonido">
              <img id="tb-sound-icon" src="/assets/ui/icons/mt2_btn_sound_on.png" alt="Sonido" />
            </button>
          </div>
        </div>

        <!-- Sección Derecha: Quickslots 2x7 (14 ranuras para habilidades y objetos arrastrables) -->
        <div id="dofus-quickslots-section">
          <div class="dofus-quickslot-grid" id="dofus-quickslot-grid">
            ${Array.from({ length: 14 })
              .map(
                (_, idx) => `
              <div class="dofus-slot" data-slot="${idx + 1}" title="Ranura ${idx + 1}">
                <span class="dofus-slot-key">${idx < 7 ? idx + 1 : 'F' + (idx - 6)}</span>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
      </div>

      <!-- Pantalla Inicial y Creador de Personaje Estilo Metin2 / Dofus -->
      <div id="dotin-homescreen" class="interactive">
        <div class="homescreen-logo-wrap">
          <img src="/assets/ui/dotin_logo.png" class="homescreen-logo" alt="DOTIN" />
          <div class="homescreen-subtitle">MMORPG TÁCTICO • EL LEGADO DE LOS REINOS</div>
        </div>

        <!-- 1. Tarjeta de Acceso y Autenticación con SQLite -->
        <div id="homescreen-login-card">
          <div style="display: flex; gap: 8px; margin-bottom: 14px; border-bottom: 1px solid #444; padding-bottom: 8px;">
            <button id="tab-auth-login" class="creator-pill selected" style="flex: 1; text-align: center; justify-content: center; font-size: 13px; font-weight: 700; cursor: pointer;">INICIAR SESIÓN</button>
            <button id="tab-auth-register" class="creator-pill" style="flex: 1; text-align: center; justify-content: center; font-size: 13px; font-weight: 700; cursor: pointer;">CREAR CUENTA</button>
          </div>
          <div id="login-error-msg" style="display: none; background: rgba(220, 38, 38, 0.25); border: 1px solid #ef4444; color: #fca5a5; font-size: 12px; padding: 8px; border-radius: 6px; margin-bottom: 10px; text-align: center;"></div>
          <div class="form-group" style="margin-bottom: 10px;">
            <label class="form-label" id="label-login-user">Nombre de Usuario</label>
            <input type="text" class="input-text" id="login-username" value="Aventurero_1" placeholder="Ej: Aventurero_1" />
          </div>
          <div class="form-group" style="margin-bottom: 10px;">
            <label class="form-label">Contraseña</label>
            <input type="password" class="input-text" id="login-password" value="123456" placeholder="Contraseña de la cuenta" />
          </div>
          <div class="form-group" style="margin-bottom: 16px;">
            <label class="form-label">Servidor del Reino</label>
            <select class="input-text" id="login-server" style="background: #11141f; color: #ffd700;">
              <option value="1">[Servidor 1] Jinno (Península Oriental)</option>
              <option value="2">[Servidor 2] Shinsoo (Desierto Austral)</option>
            </select>
          </div>
          <button class="btn btn-start" id="btn-auth-submit" style="width: 100%; padding: 10px; font-size: 13px;">INICIAR SESIÓN</button>
          <div id="btn-toggle-auth-link" style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 12px; cursor: pointer; text-decoration: underline;">
            ¿No tienes cuenta? Haz clic aquí para registrarte
          </div>
        </div>

        <!-- 1.5 Tarjeta de Selección de Personaje Guardado (1 personaje por cuenta) -->
        <div id="homescreen-character-card" style="display: none; width: 360px; background: rgba(16, 20, 30, 0.96); border: 2px solid #ffd700; border-radius: 12px; padding: 18px; box-shadow: 0 10px 40px rgba(0,0,0,0.9); flex-direction: column;">
          <div style="font-family: 'Cinzel', serif; font-size: 16px; font-weight: 700; color: #ffd700; text-align: center; border-bottom: 1px solid #444; padding-bottom: 6px; margin-bottom: 6px;">
            SELECCIÓN DE PERSONAJE
          </div>
          <div id="char-card-account-label" style="font-size: 11px; color: #94a3b8; text-align: center; margin-bottom: 14px;">
            Cuenta: <span id="char-card-account-name" style="color: #ffd700; font-weight: 600;">Usuario</span>
          </div>

          <div style="background: linear-gradient(135deg, rgba(30, 36, 54, 0.8), rgba(15, 18, 28, 0.8)); border: 1px solid rgba(255, 215, 0, 0.3); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
              <div id="char-card-name" style="font-family: 'Cinzel', serif; font-size: 18px; font-weight: 700; color: #fff;">Héroe</div>
              <div id="char-card-badge" style="background: rgba(255, 215, 0, 0.15); border: 1px solid #ffd700; color: #ffd700; font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 4px;">Lv. 1 Guerrero</div>
            </div>
            <div style="font-size: 12px; color: #cbd5e1; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 10px;">
              <div>Reino: <span id="char-card-kingdom" style="font-weight: 600; color: #60a5fa;">Jinno</span></div>
              <div>Yang: <span id="char-card-yang" style="font-weight: 600; color: #ffd700;">250 🪙</span></div>
              <div>Salud: <span id="char-card-hp" style="font-weight: 600; color: #4ade80;">160 / 160</span></div>
              <div>Género: <span id="char-card-gender" style="font-weight: 600; color: #e2e8f0;">Hombre</span></div>
            </div>
          </div>

          <button class="btn btn-start" id="btn-char-enter" style="width: 100%; padding: 12px; font-size: 14px; margin-bottom: 8px;">ENTRAR AL REINO</button>
          <button class="btn" id="btn-char-new" style="width: 100%; padding: 8px; font-size: 12px; margin-bottom: 8px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; color: #93c5fd; cursor: pointer;">✨ CREAR NUEVO PERSONAJE</button>
          <button class="btn" id="btn-char-logout" style="width: 100%; padding: 8px; font-size: 12px; background: rgba(255,255,255,0.08); color: #cbd5e1; border: 1px solid #555; cursor: pointer;">CAMBIAR DE CUENTA</button>
        </div>

        <!-- 2. Tarjeta del Creador de Personaje (con Preview 3D) -->
        <div id="homescreen-creator-card" style="display: none;">
          <div class="creator-left-col">
            <div style="font-family: 'Cinzel', serif; font-size: 16px; font-weight: 700; color: #ffd700; border-bottom: 1px solid #444; padding-bottom: 4px; margin-bottom: 2px;">
              CREADOR DE PERSONAJE
            </div>
            <div id="creator-account-subtitle" style="font-size: 11px; color: #94a3b8; margin-bottom: 6px;">
              Cuenta: <span id="creator-account-name" style="color: #ffd700; font-weight: 600;">Usuario</span>
            </div>
            <div id="creator-error-msg" style="display: none; background: rgba(220, 38, 38, 0.25); border: 1px solid #ef4444; color: #fca5a5; font-size: 11px; padding: 6px; border-radius: 6px; margin-bottom: 6px; text-align: center;"></div>

            <div class="form-group" style="margin-bottom: 6px;">
              <label class="form-label">Nombre de tu Héroe</label>
              <input type="text" class="input-text" id="input-hero-name" value="Guerrero_1" placeholder="Nombre de tu héroe" />
            </div>

            <div class="form-group" style="margin-bottom: 6px;">
              <label class="form-label">Clase Inicial</label>
              <div class="creator-option-pills" id="creator-class-pills">
                <div class="creator-pill selected" data-class="Warrior">⚔️ Guerrero</div>
                <div class="creator-pill" data-class="Ninja">🗡️ Ninja</div>
                <div class="creator-pill" data-class="Sura">🔥 Sura</div>
                <div class="creator-pill" data-class="Shaman">✨ Chamán</div>
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 6px;">
              <label class="form-label">Género</label>
              <div class="creator-option-pills" id="creator-gender-pills">
                <div class="creator-pill selected" data-gender="male">👨 Hombre</div>
                <div class="creator-pill" data-gender="female">👩 Mujer</div>
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 6px;">
              <label class="form-label">Vestimenta Inicial</label>
              <div class="creator-option-pills" id="creator-outfit-pills">
                <div class="creator-pill selected" data-outfit="1">🥋 Traje Novato 1</div>
                <div class="creator-pill" data-outfit="2">🛡️ Traje Novato 2</div>
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 6px;">
              <label class="form-label">Reino</label>
              <div class="creator-option-pills" id="creator-kingdom-pills">
                <div class="creator-pill selected" data-team="0" style="color: #60a5fa;">🔵 Reino Jinno</div>
                <div class="creator-pill" data-team="1" style="color: #f87171;">🔴 Reino Shinsoo</div>
              </div>
            </div>

            <div id="creator-starter-weapon-hint" style="font-size: 11px; color: #ffd700; margin-top: 4px; background: rgba(0,0,0,0.4); padding: 6px 10px; border-radius: 6px; border-left: 3px solid #ffd700;">
              🗡️ Arma inicial: <strong>Espada +0</strong> equipada en mano
            </div>

            <button class="btn btn-start" id="btn-enter-game" style="margin-top: 8px; padding: 10px; font-size: 13px;">¡COMENZAR AVENTURA!</button>
            <button class="btn" id="btn-creator-back" style="margin-top: 6px; padding: 6px; font-size: 11px; width: 100%; background: transparent; color: #94a3b8; border: 1px solid #444; cursor: pointer;">← Volver al Login</button>
          </div>

          <div class="creator-right-col">
            <div style="font-family: 'Cinzel', serif; font-size: 12px; font-weight: 700; color: #ffd700; margin-bottom: 4px;">VISTA PREVIA 3D</div>
            <div id="char-creator-preview-container"></div>
            <div class="creator-preview-hint">Arrastra para rotar • Modelo Metin2 genuino</div>
          </div>
        </div>
      </div>

      <!-- HUD de Recolección (Minería, Tala, Pesca) -->
      <div id="gathering-hud" class="interactive">
        <div class="gathering-title" id="gathering-title">⛏️ Extrayendo Mena de Cobre...</div>
        <div class="gathering-bar-bg">
          <div class="gathering-bar-fill" id="gathering-fill"></div>
        </div>
        <div class="gathering-hint">Presiona una tecla o muévete para cancelar</div>
      </div>

      <!-- Modal de Selección de Subclase (Nivel 5) -->
      <div id="subclass-modal" class="interactive">
        <div class="subclass-header">
          <div class="subclass-title">¡HAS ALCANZADO EL NIVEL 5!</div>
          <div class="subclass-subtitle">Ha llegado el momento de elegir tu doctrina marcial definitiva.</div>
        </div>
        <div class="subclass-cards-wrap" id="subclass-options-wrap"></div>
      </div>

      <!-- Transición de Combate Estilo Corte de Espada Metin2 -->
      <div id="combat-transition-overlay" class="combat-transition-hidden">
        <div class="combat-flash-flare"></div>
        <div class="combat-slash-line"></div>
        <div class="combat-transition-badge">⚔️ ¡ENTRANDO EN COMBATE! ⚔️</div>
      </div>
    `;

    this.bindEvents();
  }

    private bindEvents(): void {
    // Slots de Metin2 (sonido al hacer clic)
    document.querySelectorAll('.metin2-slot').forEach((slot) => {
      slot.addEventListener('click', () => {
        SoundManager.getInstance().playButtonClick();
      });
    });

    // Abrir / Cerrar Inventario
    document.getElementById('btn-open-inventory')?.addEventListener('click', () => {
      SoundManager.getInstance().playButtonClick();
      this.toggleInventory();
    });
    document.getElementById('btn-close-inventory')?.addEventListener('click', () => {
      SoundManager.getInstance().playButtonClick();
      this.toggleInventory();
    });

    // Pestañas de Filtros de Categoría del Inventario Dofus (Todo, Armas, Equipamiento, Consumibles, Recursos)
    const catIcons = document.querySelectorAll('.dofus-cat-icon');
    catIcons.forEach((icon) => {
      icon.addEventListener('click', (e) => {
        catIcons.forEach((el) => el.classList.remove('selected'));
        const target = e.currentTarget as HTMLElement;
        target.classList.add('selected');
        this.currentInvFilter = target.dataset.cat || 'all';
        SoundManager.getInstance().playButtonClick();
        this.renderInventory();
      });
    });

    // Abrir Misiones / Cerrar NPC
    document.getElementById('btn-open-quests')?.addEventListener('click', () => {
      SoundManager.getInstance().playButtonClick();
      this.toggleQuestsModal();
    });
    document.getElementById('btn-close-npc-dialog')?.addEventListener('click', () => {
      SoundManager.getInstance().playButtonClick();
      this.closeNPCDialog();
    });
    document.getElementById('btn-close-quest-modal')?.addEventListener('click', () => {
      SoundManager.getInstance().playButtonClick();
      const qModal = document.getElementById('quest-detail-modal');
      if (qModal) qModal.style.display = 'none';
    });

    // Control de Audio (SFX y BGM)
    const soundBtn = document.getElementById('btn-toggle-sound');
    soundBtn?.addEventListener('click', () => {
      const isMuted = SoundManager.getInstance().toggleMute();
      if (soundBtn) soundBtn.innerText = isMuted ? '🔇' : '🔊';
    });

    const bgmBtn = document.getElementById('btn-toggle-bgm');
    bgmBtn?.addEventListener('click', () => {
      const isPlaying = SoundManager.getInstance().toggleAmbientBGM();
      if (bgmBtn) bgmBtn.style.color = isPlaying ? '#4ade80' : '#888';
    });

    // Interacción de Duelos PvP
    document.getElementById('btn-accept-duel')?.addEventListener('click', () => {
      if (this.pendingChallengerId) {
        this.onRespondDuelRequested?.(this.pendingChallengerId, true);
        this.pendingChallengerId = null;
      }
      const m = document.getElementById('duel-request-modal');
      if (m) m.style.display = 'none';
      SoundManager.getInstance().playSlash();
    });

    document.getElementById('btn-reject-duel')?.addEventListener('click', () => {
      if (this.pendingChallengerId) {
        this.onRespondDuelRequested?.(this.pendingChallengerId, false);
        this.pendingChallengerId = null;
      }
      const m = document.getElementById('duel-request-modal');
      if (m) m.style.display = 'none';
    });

    document.getElementById('btn-close-target-modal')?.addEventListener('click', () => {
      this.closePlayerTargetCard();
    });

    document.getElementById('btn-challenge-duel')?.addEventListener('click', () => {
      if (this.selectedTargetPlayer) {
        this.onRequestDuelRequested?.(this.selectedTargetPlayer.id);
        this.closePlayerTargetCard();
        SoundManager.getInstance().playButtonClick();
      }
    });

    document.getElementById('btn-invite-party')?.addEventListener('click', () => {
      if (this.selectedTargetPlayer) {
        this.onInvitePartyRequested?.(this.selectedTargetPlayer.id);
        this.closePlayerTargetCard();
        SoundManager.getInstance().playButtonClick();
      }
    });

    document.getElementById('btn-request-trade')?.addEventListener('click', () => {
      if (this.selectedTargetPlayer) {
        this.onRequestTradeRequested?.(this.selectedTargetPlayer.id);
        this.closePlayerTargetCard();
        SoundManager.getInstance().playButtonClick();
      }
    });

    // Ventana de Estado (C) y Asignación de Puntos
    document.getElementById('btn-open-status')?.addEventListener('click', () => {
      SoundManager.getInstance().playButtonClick();
      this.toggleStatusModal();
    });
    document.getElementById('btn-close-status-modal')?.addEventListener('click', () => {
      SoundManager.getInstance().playButtonClick();
      this.toggleStatusModal();
    });
    document.querySelectorAll('.btn-add-stat').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const stat = (e.currentTarget as HTMLElement).dataset.stat;
        if (stat) {
          SoundManager.getInstance().playLevelUp();
          this.onAllocateStatRequested?.(stat);
        }
      });
    });

    // Grupo (Party)
    document.getElementById('btn-accept-party')?.addEventListener('click', () => {
      if (this.pendingPartyLeaderId) {
        this.onRespondPartyRequested?.(this.pendingPartyLeaderId, true);
        this.pendingPartyLeaderId = null;
      }
      const m = document.getElementById('party-invite-modal');
      if (m) m.style.display = 'none';
      SoundManager.getInstance().playButtonClick();
    });
    document.getElementById('btn-reject-party')?.addEventListener('click', () => {
      if (this.pendingPartyLeaderId) {
        this.onRespondPartyRequested?.(this.pendingPartyLeaderId, false);
        this.pendingPartyLeaderId = null;
      }
      const m = document.getElementById('party-invite-modal');
      if (m) m.style.display = 'none';
    });

    // Comercio 1v1
    document.getElementById('btn-accept-trade')?.addEventListener('click', () => {
      if (this.pendingTradeChallengerId) {
        this.onRespondTradeRequested?.(this.pendingTradeChallengerId, true);
        this.pendingTradeChallengerId = null;
      }
      const m = document.getElementById('trade-invite-modal');
      if (m) m.style.display = 'none';
      SoundManager.getInstance().playButtonClick();
    });
    document.getElementById('btn-reject-trade')?.addEventListener('click', () => {
      if (this.pendingTradeChallengerId) {
        this.onRespondTradeRequested?.(this.pendingTradeChallengerId, false);
        this.pendingTradeChallengerId = null;
      }
      const m = document.getElementById('trade-invite-modal');
      if (m) m.style.display = 'none';
    });
    document.getElementById('btn-close-trade-window')?.addEventListener('click', () => {
      this.onCancelTradeRequested?.();
      this.closeTradeModal();
    });
    document.getElementById('btn-trade-cancel')?.addEventListener('click', () => {
      this.onCancelTradeRequested?.();
      this.closeTradeModal();
    });
    document.getElementById('btn-trade-offer-yang')?.addEventListener('click', () => {
      const inp = document.getElementById('trade-my-yang-input') as HTMLInputElement;
      const yang = parseInt(inp?.value || '0', 10);
      if (!isNaN(yang) && yang >= 0) {
        this.onOfferTradeYangRequested?.(yang);
        SoundManager.getInstance().playButtonClick();
      }
    });
    document.getElementById('trade-inventory-select')?.addEventListener('change', (e) => {
      const sel = e.currentTarget as HTMLSelectElement;
      const slot = parseInt(sel?.value || '-1', 10);
      if (!isNaN(slot) && slot >= 0) {
        this.onOfferTradeItemRequested?.(slot);
        SoundManager.getInstance().playButtonClick();
        sel.value = '-1';
      }
    });
    document.getElementById('btn-trade-confirm')?.addEventListener('click', () => {
      SoundManager.getInstance().playButtonClick();
      this.onConfirmTradeRequested?.();
    });

    document.getElementById('btn-leave-party')?.addEventListener('click', () => {
      SoundManager.getInstance().playButtonClick();
      this.onLeavePartyRequested?.();
    });

    // Tiendas Privadas
    document.getElementById('btn-open-shop-stall')?.addEventListener('click', () => {
      SoundManager.getInstance().playButtonClick();
      this.showOpenPrivateShopModal();
    });
    document.getElementById('btn-close-open-shop')?.addEventListener('click', () => {
      const m = document.getElementById('open-private-shop-modal');
      if (m) m.style.display = 'none';
    });
    document.getElementById('btn-close-view-shop')?.addEventListener('click', () => {
      const m = document.getElementById('view-private-shop-modal');
      if (m) m.style.display = 'none';
    });
    document.getElementById('btn-confirm-open-shop')?.addEventListener('click', () => {
      const titleInput = document.getElementById('shop-title-input') as HTMLInputElement;
      const title = titleInput?.value.trim() || 'Tienda de Héroe';

      const offers: ShopOffer[] = [];
      document.querySelectorAll('.shop-item-check:checked').forEach((ch) => {
        const slot = parseInt((ch as HTMLElement).dataset.slot || '0', 10);
        const priceInput = document.querySelector(`.shop-item-price[data-slot="${slot}"]`) as HTMLInputElement;
        const price = Math.max(1, parseInt(priceInput?.value || '100', 10));
        offers.push({ slot_index: slot, price });
      });

      if (offers.length === 0) {
        alert('Debes marcar al menos un objeto de tu inventario.');
        return;
      }

      SoundManager.getInstance().playYangCoin();
      this.onOpenPrivateShopRequested?.(title, offers);
      const m = document.getElementById('open-private-shop-modal');
      if (m) m.style.display = 'none';
    });

    // Desequipar
    document.getElementById('btn-unequip-weapon')?.addEventListener('click', () => {
      this.onUnequipItemRequested?.('weapon');
    });
    document.getElementById('btn-unequip-armor')?.addEventListener('click', () => {
      this.onUnequipItemRequested?.('armor');
    });

    // Pasar turno
    document.getElementById('btn-pass-turn')?.addEventListener('click', () => {
      if (this.onPassTurnRequested) this.onPassTurnRequested();
    });

    // Iniciar combate ahora (Líder)
    document.getElementById('btn-force-start')?.addEventListener('click', () => {
      if (this.onStartCombatNowRequested) this.onStartCombatNowRequested();
    });

    // Chat input Enter
    const chatInput = document.getElementById('chat-input') as HTMLInputElement;
    chatInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (chatInput.value.trim().length > 0) {
          if (this.onSendChatRequested) {
            this.onSendChatRequested(chatInput.value.trim());
          }
          chatInput.value = '';
        }
        chatInput.blur();
      } else if (e.key === 'Escape') {
        chatInput.blur();
      }
    });

    // Dofus Taskbar botones radiales
    document.getElementById('tb-btn-status')?.addEventListener('click', () => {
      SoundManager.getInstance().playButtonClick();
      this.toggleStatusModal();
    });
    document.getElementById('tb-btn-spells')?.addEventListener('click', () => {
      SoundManager.getInstance().playButtonClick();
      this.toggleSkillsModal();
    });
    document.getElementById('btn-close-skills-modal')?.addEventListener('click', () => {
      SoundManager.getInstance().playButtonClick();
      this.toggleSkillsModal();
    });
    document.getElementById('tb-btn-inventory')?.addEventListener('click', () => {
      SoundManager.getInstance().playButtonClick();
      this.toggleInventory();
    });
    document.getElementById('tb-btn-quests')?.addEventListener('click', () => {
      SoundManager.getInstance().playButtonClick();
      this.toggleQuestsModal();
    });
    document.getElementById('tb-btn-market')?.addEventListener('click', () => {
      SoundManager.getInstance().playButtonClick();
      const modal = document.getElementById('npc-dialog-modal');
      if (modal && modal.style.display !== 'none' && this.currentNpcDialogType === 'market_board') {
        this.closeNPCDialog();
        return;
      }
      this.showNPCDialog({
        npc_id: 'npc_market_board',
        name: 'Tablón de Mercado',
        text: 'Bienvenido a la Casa de Subastas Central del Reino. Compra y vende equipamiento.',
        dialog_type: 'market_board',
        shop_items: [],
        available_quests: [],
      });
    });
    document.getElementById('tb-btn-sound')?.addEventListener('click', () => {
      const isMuted = SoundManager.getInstance().toggleMute();
      const soundIcon = document.getElementById('tb-sound-icon') as HTMLImageElement;
      if (soundIcon) {
        soundIcon.src = isMuted ? '/assets/ui/icons/mt2_btn_sound_off.png' : '/assets/ui/icons/mt2_btn_sound_on.png';
      }
      const btn = document.getElementById('tb-btn-sound');
      if (btn) btn.title = isMuted ? 'Sonido Silenciado (Clic para activar)' : 'Sonido Activado (Clic para silenciar)';
    });

    // Quickslots Dofus 1.29: Clic y Drag & Drop
    document.querySelectorAll('.dofus-slot').forEach((slot) => {
      slot.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      slot.addEventListener('drop', (e) => {
        e.preventDefault();
        const slotIdx = parseInt((slot as HTMLElement).dataset.slot || '1', 10) - 1;
        if (slotIdx < 0 || slotIdx >= 14) return;

        const itemJson = (e as DragEvent).dataTransfer?.getData('application/dotin-item');
        if (itemJson) {
          try {
            const data = JSON.parse(itemJson);
            this.assignedQuickslots[slotIdx] = {
              type: 'item',
              item: data.item,
              inventoryIndex: data.index,
            };
            this.renderQuickslots();
            SoundManager.getInstance().playButtonClick();
            this.addChatMessage(`📦 Objeto [${data.item.name}] asignado a la Ranura ${slotIdx + 1} [${slotIdx < 7 ? slotIdx + 1 : 'F' + (slotIdx - 6)}].`);
            return;
          } catch (err) {
            console.warn('Error al deserializar item para quickslot:', err);
          }
        }

        const skillId = (e as DragEvent).dataTransfer?.getData('text/plain');
        const skill = ALL_SKILLS.find((s) => s.id === skillId);
        if (skill) {
          this.assignedQuickslots[slotIdx] = {
            type: 'skill',
            skill,
          };
          this.renderQuickslots();
          SoundManager.getInstance().playButtonClick();
          this.addChatMessage(`✨ Habilidad [${skill.name}] asignada a la Ranura ${slotIdx + 1} [${slotIdx < 7 ? slotIdx + 1 : 'F' + (slotIdx - 6)}].`);
        }
      });
      slot.addEventListener('click', () => {
        const slotIdx = parseInt((slot as HTMLElement).dataset.slot || '1', 10) - 1;
        this.triggerQuickslot(slotIdx);
      });
    });

    // Homescreen: Autenticación y Cuentas SQLite
    const setAuthMode = (mode: 'login' | 'register') => {
      this.authMode = mode;
      const tabLogin = document.getElementById('tab-auth-login');
      const tabRegister = document.getElementById('tab-auth-register');
      const submitBtn = document.getElementById('btn-auth-submit');
      const toggleLink = document.getElementById('btn-toggle-auth-link');
      const errBox = document.getElementById('login-error-msg');
      if (errBox) errBox.style.display = 'none';

      if (mode === 'login') {
        tabLogin?.classList.add('selected');
        tabRegister?.classList.remove('selected');
        if (submitBtn) submitBtn.textContent = 'INICIAR SESIÓN';
        if (toggleLink) toggleLink.textContent = '¿No tienes cuenta? Haz clic aquí para registrarte';
      } else {
        tabRegister?.classList.add('selected');
        tabLogin?.classList.remove('selected');
        if (submitBtn) submitBtn.textContent = 'REGISTRARSE Y CONTINUAR';
        if (toggleLink) toggleLink.textContent = '¿Ya tienes cuenta? Haz clic aquí para iniciar sesión';
      }
      SoundManager.getInstance().playButtonClick();
    };

    document.getElementById('tab-auth-login')?.addEventListener('click', () => setAuthMode('login'));
    document.getElementById('tab-auth-register')?.addEventListener('click', () => setAuthMode('register'));
    document.getElementById('btn-toggle-auth-link')?.addEventListener('click', () => {
      setAuthMode(this.authMode === 'login' ? 'register' : 'login');
    });

    // Envío del Formulario de Autenticación
    document.getElementById('btn-auth-submit')?.addEventListener('click', () => {
      const userEl = document.getElementById('login-username') as HTMLInputElement | null;
      const passEl = document.getElementById('login-password') as HTMLInputElement | null;
      const username = userEl?.value.trim() || '';
      const password = passEl?.value.trim() || '';
      const errBox = document.getElementById('login-error-msg');

      if (username.length < 3) {
        if (errBox) {
          errBox.textContent = 'El usuario debe tener al menos 3 caracteres.';
          errBox.style.display = 'block';
        }
        return;
      }
      if (password.length < 4) {
        if (errBox) {
          errBox.textContent = 'La contraseña debe tener al menos 4 caracteres.';
          errBox.style.display = 'block';
        }
        return;
      }

      if (errBox) errBox.style.display = 'none';
      SoundManager.getInstance().playButtonClick();

      if (this.authMode === 'login') {
        if (this.onLoginRequested) {
          this.onLoginRequested(username, password);
        }
      } else {
        if (this.onRegisterRequested) {
          this.onRegisterRequested(username, password);
        }
      }
    });

    // Selección de Personaje Guardado: Entrar al Reino
    document.getElementById('btn-char-enter')?.addEventListener('click', () => {
      if (this.currentAccountCharacter && this.currentAccountId !== null) {
        const homescreen = document.getElementById('dotin-homescreen');
        if (homescreen) homescreen.style.display = 'none';

        SoundManager.getInstance().playLevelUp();
        if (this.onSelectCharacterRequested) {
          this.onSelectCharacterRequested(this.currentAccountId, this.currentAccountCharacter.name);
        }
      }
    });

    // Selección de Personaje Guardado: Crear Nuevo Personaje (cambiar de héroe / clase)
    document.getElementById('btn-char-new')?.addEventListener('click', () => {
      if (this.currentAccountId !== null) {
        this.showCharacterCreator(this.currentAccountId, this.currentUsername);
        SoundManager.getInstance().playButtonClick();
      }
    });

    // Selección de Personaje Guardado: Cambiar de Cuenta
    document.getElementById('btn-char-logout')?.addEventListener('click', () => {
      const loginCard = document.getElementById('homescreen-login-card');
      const charCard = document.getElementById('homescreen-character-card');
      if (charCard) charCard.style.display = 'none';
      if (loginCard) loginCard.style.display = 'flex';
      SoundManager.getInstance().playButtonClick();
    });

    // Creador: Botón Volver al Login
    document.getElementById('btn-creator-back')?.addEventListener('click', () => {
      if (this.creatorPreview) {
        this.creatorPreview.destroy();
        this.creatorPreview = null;
      }
      const loginCard = document.getElementById('homescreen-login-card');
      const creatorCard = document.getElementById('homescreen-creator-card');
      if (creatorCard) creatorCard.style.display = 'none';
      if (loginCard) loginCard.style.display = 'flex';
      SoundManager.getInstance().playButtonClick();
    });

    const updateStarterWeaponHint = (cls: CharacterClass) => {
      const hint = document.getElementById('creator-starter-weapon-hint');
      if (!hint) return;
      if (cls === 'Shaman') {
        hint.innerHTML = '🪭 Arma inicial: <strong>Abanico +0</strong> equipado en mano';
      } else if (cls === 'Ninja') {
        hint.innerHTML = '🗡️ Arma inicial: <strong>Dagas +0</strong> equipadas en mano';
      } else if (cls === 'Sura') {
        hint.innerHTML = '🗡️ Arma inicial: <strong>Espada +0 (Sura)</strong> equipada en mano';
      } else {
        hint.innerHTML = '🗡️ Arma inicial: <strong>Espada +0 (Guerrero)</strong> equipada en mano';
      }
    };

    // Creador: Selección de Clase
    document.querySelectorAll('#creator-class-pills .creator-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#creator-class-pills .creator-pill').forEach((p) => p.classList.remove('selected'));
        pill.classList.add('selected');
        this.selectedClass = (pill.getAttribute('data-class') || 'Warrior') as CharacterClass;
        this.creatorPreview?.setCharacter(this.selectedClass, this.selectedOutfit, this.selectedGender);
        updateStarterWeaponHint(this.selectedClass);

        const nameInput = document.getElementById('input-hero-name') as HTMLInputElement;
        if (nameInput) {
          const randSuffix = Math.floor(100 + Math.random() * 900);
          if (this.selectedClass === 'Shaman') nameInput.value = `Chaman_${randSuffix}`;
          else if (this.selectedClass === 'Ninja') nameInput.value = `Ninja_${randSuffix}`;
          else if (this.selectedClass === 'Sura') nameInput.value = `Sura_${randSuffix}`;
          else nameInput.value = `Guerrero_${randSuffix}`;
        }
        SoundManager.getInstance().playButtonClick();
      });
    });

    // Creador: Selección de Género
    document.querySelectorAll('#creator-gender-pills .creator-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#creator-gender-pills .creator-pill').forEach((p) => p.classList.remove('selected'));
        pill.classList.add('selected');
        this.selectedGender = (pill.getAttribute('data-gender') || 'male') as 'male' | 'female';
        this.creatorPreview?.setCharacter(this.selectedClass, this.selectedOutfit, this.selectedGender);
        SoundManager.getInstance().playButtonClick();
      });
    });

    // Creador: Selección de Vestimenta Inicial (Traje 1 / Traje 2)
    document.querySelectorAll('#creator-outfit-pills .creator-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#creator-outfit-pills .creator-pill').forEach((p) => p.classList.remove('selected'));
        pill.classList.add('selected');
        this.selectedOutfit = parseInt(pill.getAttribute('data-outfit') || '1', 10);
        this.creatorPreview?.setCharacter(this.selectedClass, this.selectedOutfit, this.selectedGender);
        SoundManager.getInstance().playButtonClick();
      });
    });

    // Creador: Selección de Reino
    document.querySelectorAll('#creator-kingdom-pills .creator-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#creator-kingdom-pills .creator-pill').forEach((p) => p.classList.remove('selected'));
        pill.classList.add('selected');
        this.selectedKingdomTeam = parseInt(pill.getAttribute('data-team') || '0', 10);
        SoundManager.getInstance().playButtonClick();
      });
    });

    // Botón Entrar al Juego / Crear Personaje
    document.getElementById('btn-enter-game')?.addEventListener('click', () => {
      const nameInput = document.getElementById('input-hero-name') as HTMLInputElement;
      const randSuffix = Math.floor(100 + Math.random() * 900);
      const name = nameInput.value.trim() || `Heroe_${randSuffix}`;
      const creatorErrBox = document.getElementById('creator-error-msg');

      if (name.length < 3) {
        if (creatorErrBox) {
          creatorErrBox.textContent = 'El nombre de tu héroe debe tener al menos 3 caracteres.';
          creatorErrBox.style.display = 'block';
        }
        return;
      }

      const enterBtn = document.getElementById('btn-enter-game') as HTMLButtonElement | null;
      if (enterBtn) {
        enterBtn.disabled = true;
        enterBtn.innerText = 'CONECTANDO AL REINO...';
      }
      if (creatorErrBox) creatorErrBox.style.display = 'none';

      nameInput.blur();
      (document.activeElement as HTMLElement)?.blur();
      SoundManager.getInstance().playLevelUp();

      if (this.currentAccountId !== null && this.onCreateCharacterRequested) {
        this.onCreateCharacterRequested(
          this.currentAccountId,
          name,
          this.selectedClass,
          this.selectedGender,
          this.selectedOutfit,
          this.selectedKingdomTeam
        );
      } else if (this.onJoinRequested) {
        this.onJoinRequested(name, this.selectedClass, this.selectedKingdomTeam, this.selectedOutfit, this.selectedGender);
      }
    });
  }

  private setupKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const target = e.target as HTMLElement | null;
      const isInput =
        (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) ||
        (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA'));

      if (isInput) {
        const inputElem = (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') ? target : activeEl;
        // Solo bloquear si el input está visible
        if (inputElem && inputElem.offsetParent !== null) {
          if (e.key === 'Escape') {
            inputElem.blur();
          }
          return;
        } else if (inputElem) {
          inputElem.blur();
        }
      }

      const code = e.code;
      const keyLower = e.key.toLowerCase();

      // [C] Ventana de Estado / Atributos de Personaje (VIT, INT, STR, DEX)
      if (code === 'KeyC' || keyLower === 'c') {
        this.toggleStatusModal();
      }
      // [V] o [K] Ventana de Hechizos y Habilidades (Metin2 standard V / RPG standard K; S es para caminar hacia atrás en WASD)
      else if (code === 'KeyV' || keyLower === 'v' || code === 'KeyK' || keyLower === 'k') {
        this.toggleSkillsModal();
      }
      // [I] Inventario
      else if (code === 'KeyI' || keyLower === 'i') {
        this.toggleInventory();
      }
      // [L] Registro de Misiones
      else if (code === 'KeyL' || keyLower === 'l') {
        this.toggleQuestsModal();
      }
      // [1..7] Acceso Rápido a Ranuras 1 a 7
      else if (code.startsWith('Digit') && parseInt(code.replace('Digit', ''), 10) >= 1 && parseInt(code.replace('Digit', ''), 10) <= 7) {
        const num = parseInt(code.replace('Digit', ''), 10);
        this.triggerQuickslot(num - 1);
      }
      // [F1..F7] Acceso Rápido a Ranuras 8 a 14
      else if (/^F[1-7]$/.test(code)) {
        e.preventDefault();
        const fNum = parseInt(code.replace('F', ''), 10);
        this.triggerQuickslot(6 + fNum);
      }
      // Espacio: Pasar turno en combate
      else if (code === 'Space' && this.currentMode === 'combat') {
        const modal = document.getElementById('dotin-homescreen');
        if (!modal || modal.style.display === 'none') {
          e.preventDefault();
          if (this.onPassTurnRequested) this.onPassTurnRequested();
        }
      }
      // Escape: Cerrar todas las ventanas abiertas y deseleccionar hechizo
      else if (e.key === 'Escape') {
        (document.activeElement as HTMLElement)?.blur();
        this.clearSelectedSpell();
        this.closeNPCDialog();
        this.closePlayerTargetCard();
        const inv = document.getElementById('inventory-modal');
        if (inv) inv.style.display = 'none';
        const st = document.getElementById('character-status-modal');
        if (st) st.style.display = 'none';
        const sk = document.getElementById('skills-modal');
        if (sk) sk.style.display = 'none';
        const pShop = document.getElementById('open-private-shop-modal');
        if (pShop) pShop.style.display = 'none';
        const vShop = document.getElementById('view-private-shop-modal');
        if (vShop) vShop.style.display = 'none';
      }
    });
  }

  public showAuthError(message: string): void {
    const errorEl = document.getElementById('login-error-msg');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
    }
    const creatorErrorEl = document.getElementById('creator-error-msg');
    if (creatorErrorEl) {
      creatorErrorEl.textContent = message;
      creatorErrorEl.style.display = 'block';
    }
  }

  public showCharacterSelection(accountId: number, username: string, character: CharacterSummary): void {
    this.currentAccountId = accountId;
    this.currentUsername = username;
    this.currentAccountCharacter = character;

    const loginCard = document.getElementById('homescreen-login-card');
    const creatorCard = document.getElementById('homescreen-creator-card');
    const charCard = document.getElementById('homescreen-character-card');

    if (loginCard) loginCard.style.display = 'none';
    if (creatorCard) creatorCard.style.display = 'none';
    if (charCard) {
      charCard.style.display = 'flex';

      const accountLabel = document.getElementById('char-card-account-name');
      if (accountLabel) accountLabel.textContent = this.currentUsername;

      const nameEl = document.getElementById('char-card-name');
      if (nameEl) nameEl.textContent = character.name;

      const badgeEl = document.getElementById('char-card-badge');
      if (badgeEl) badgeEl.textContent = `Lv. ${character.level} ${character.class}`;

      const kingdomEl = document.getElementById('char-card-kingdom');
      if (kingdomEl) {
        kingdomEl.textContent = character.kingdom;
        kingdomEl.style.color = character.team === 0 ? '#60a5fa' : '#f87171';
      }

      const yangEl = document.getElementById('char-card-yang');
      if (yangEl) yangEl.textContent = `${character.yang.toLocaleString()} 🪙`;

      const hpEl = document.getElementById('char-card-hp');
      if (hpEl) hpEl.textContent = `${character.hp} / ${character.max_hp}`;

      const genderEl = document.getElementById('char-card-gender');
      if (genderEl) genderEl.textContent = character.gender === 'female' ? 'Mujer' : 'Hombre';
    }
  }

  public showCharacterCreator(accountId: number, username: string): void {
    this.currentAccountId = accountId;
    this.currentUsername = username;
    this.currentAccountCharacter = null;

    const loginCard = document.getElementById('homescreen-login-card');
    const creatorCard = document.getElementById('homescreen-creator-card');
    const charCard = document.getElementById('homescreen-character-card');

    if (loginCard) loginCard.style.display = 'none';
    if (charCard) charCard.style.display = 'none';
    if (creatorCard) {
      creatorCard.style.display = 'flex';
      const userSub = document.getElementById('creator-account-name');
      if (userSub) userSub.textContent = username;

      const previewContainer = document.getElementById('char-creator-preview-container');
      if (previewContainer && !this.creatorPreview) {
        this.creatorPreview = new CharacterPreview(previewContainer);
        this.creatorPreview.setCharacter(this.selectedClass, this.selectedOutfit, this.selectedGender);
      }
    }
  }

  public dismissHomescreen(): void {
    const homescreen = document.getElementById('dotin-homescreen');
    if (homescreen) homescreen.style.display = 'none';
    if (this.creatorPreview) {
      this.creatorPreview.destroy();
      this.creatorPreview = null;
    }
    const enterBtn = document.getElementById('btn-enter-game') as HTMLButtonElement | null;
    if (enterBtn) {
      enterBtn.disabled = false;
      enterBtn.innerText = '¡COMENZAR AVENTURA!';
    }
  }

  public showCreatorError(msg: string): void {
    const creatorErrBox = document.getElementById('creator-error-msg');
    if (creatorErrBox) {
      creatorErrBox.textContent = msg;
      creatorErrBox.style.display = 'block';
    }
    const homescreen = document.getElementById('dotin-homescreen');
    if (homescreen) homescreen.style.display = 'flex';
    const enterBtn = document.getElementById('btn-enter-game') as HTMLButtonElement | null;
    if (enterBtn) {
      enterBtn.disabled = false;
      enterBtn.innerText = '¡COMENZAR AVENTURA!';
    }
  }

  public updateWorldPlayerStats(player: WorldPlayer): void {
    const badge = document.getElementById('mmo-level-badge');
    if (badge) badge.innerText = `Lv. ${player.level}`;
    const nameLabel = document.getElementById('mmo-name-label');
    if (nameLabel) nameLabel.innerText = player.name;
    const hpText = document.getElementById('mmo-hp-text');
    if (hpText) hpText.innerText = `${player.hp} / ${player.max_hp} HP`;
    const hpPct = Math.max(0, Math.min(100, (player.hp / player.max_hp) * 100));
    const hpFill = document.getElementById('mmo-hp-fill');
    if (hpFill) hpFill.style.width = `${hpPct}%`;

    const maxExp = player.level * 300;
    const expPct = Math.max(0, Math.min(100, (player.exp / maxExp) * 100));
    const expFill = document.getElementById('mmo-exp-fill');
    if (expFill) expFill.style.width = `${expPct}%`;
    const expText = document.getElementById('mmo-exp-text');
    if (expText) expText.innerText = `EXP: ${player.exp} / ${maxExp}`;
    const yangText = document.getElementById('mmo-yang-text');
    if (yangText) yangText.innerText = `${player.yang.toLocaleString()}`;

    // Actualización de la Taskbar Dofus 1.29 (Corazón HP y Yang)
    const curHeart = document.getElementById('dofus-heart-cur');
    const maxHeart = document.getElementById('dofus-heart-max');
    if (curHeart) curHeart.innerText = `${player.hp}`;
    if (maxHeart) maxHeart.innerText = `${player.max_hp}`;

    const dofusYang = document.getElementById('dofus-inv-yang');
    if (dofusYang) dofusYang.innerText = `${player.yang.toLocaleString()}`;

    this.playerLevel = player.level;
    this.selectedClass = player.class;
    this.renderSkillsModal();

    // Desbloqueo de Doctrina Marcial / Subclase al Nivel 5
    if (player.level >= 5 && !this.currentSubclass) {
      this.showSubclassSelectionModal(player.class, (subclassId) => {
        this.currentSubclass = subclassId;
        this.addChatMessage(`✨ ¡Has elegido la ${subclassId}! Tus habilidades marciales se han despertado.`);
        SoundManager.getInstance().playLevelUp();
        if (this.onSelectSubclassRequested) {
          this.onSelectSubclassRequested(subclassId);
        }
      });
    }
  }

  public showGatheringProgress(title: string, durationSeconds: number): void {
    const hud = document.getElementById('gathering-hud');
    const titleEl = document.getElementById('gathering-title');
    const fillEl = document.getElementById('gathering-fill');
    if (!hud || !titleEl || !fillEl) return;

    titleEl.innerText = title;
    fillEl.style.width = '0%';
    hud.style.display = 'flex';

    const start = performance.now();
    const durationMs = durationSeconds * 1000;

    if (this.gatheringInterval) {
      clearInterval(this.gatheringInterval);
    }

    this.gatheringInterval = setInterval(() => {
      const elapsed = performance.now() - start;
      const pct = Math.min(100, (elapsed / durationMs) * 100);
      fillEl.style.width = `${pct}%`;
      if (pct >= 100) {
        clearInterval(this.gatheringInterval);
        this.gatheringInterval = null;
      }
    }, 40);
  }

  public hideGatheringProgress(): void {
    const hud = document.getElementById('gathering-hud');
    if (hud) hud.style.display = 'none';
    if (this.gatheringInterval) {
      clearInterval(this.gatheringInterval);
      this.gatheringInterval = null;
    }
  }

  public showSubclassSelectionModal(characterClass: CharacterClass, onChoose: (subclass: string) => void): void {
    const modal = document.getElementById('subclass-modal');
    const content = document.getElementById('subclass-options-wrap');
    if (!modal || !content) return;

    let doctrines = [
      {
        id: 'Guerrero Corporal',
        name: 'Doctrina Corporal',
        icon: '⚔️',
        desc: 'Fuerza devastadora y velocidad de ataque implacable.',
        skills: ['Aura de Espada', 'Giro de Espada', 'Berserk', 'Corte Tres Vías'],
      },
      {
        id: 'Guerrero Mental',
        name: 'Doctrina Mental',
        icon: '🛡️',
        desc: 'Defensa inquebrantable capaz de resistir cualquier impacto.',
        skills: ['Cuerpo Fuerte', 'Ráfaga de Espada', 'Golpe de Espada', 'Pulso Espiritual'],
      },
    ];

    if (characterClass === 'Ninja') {
      doctrines = [
        {
          id: 'Ninja Asesino',
          name: 'Doctrina Asesino',
          icon: '🗡️',
          desc: 'Ataques letales a corta distancia con dagas envenenadas.',
          skills: ['Emboscada', 'Daga Rodante', 'Ataque Rápido', 'Veneno Oculto'],
        },
        {
          id: 'Ninja Arquero',
          name: 'Doctrina Arquero',
          icon: '🏹',
          desc: 'Precisión a larga distancia con flechas perforantes.',
          skills: ['Tiro Preciso', 'Disparo Repetitivo', 'Lluvia de Flechas', 'Disparo Tóxico'],
        },
      ];
    } else if (characterClass === 'Sura') {
      doctrines = [
        {
          id: 'Sura Armas Mágicas',
          name: 'Armas Mágicas',
          icon: '🔮',
          desc: 'Espadas imbuidas con fuego y absorción de vida.',
          skills: ['Hoja Encantada', 'Armadura Encantada', 'Remolino Dragón', 'Miedo'],
        },
        {
          id: 'Sura Magia Negra',
          name: 'Magia Negra',
          icon: '🔥',
          desc: 'Conjuros destructivos de llamas oscuras y espíritus.',
          skills: ['Golpe de Llama', 'Orbe Oscuro', 'Protección Oscura', 'Disparo Oscuro'],
        },
      ];
    } else if (characterClass === 'Shaman') {
      doctrines = [
        {
          id: 'Chamán Dragón',
          name: 'Fuerza Dragón',
          icon: '✨',
          desc: 'Bendiciones de los dragones, críticos y fuego celestial.',
          skills: ['Ayuda del Dragón', 'Bendición', 'Rugido Dragón', 'Disparo Dragón'],
        },
        {
          id: 'Chamán Curación',
          name: 'Curación Ancestral',
          icon: '⚡',
          desc: 'Relámpagos y restauración milagrosa de vida.',
          skills: ['Curación', 'Tiro Relámpago', 'Ataque Rápido', 'Garra Relámpago'],
        },
      ];
    }

    content.innerHTML = doctrines
      .map(
        (doc) => `
      <div class="subclass-card" data-subclass="${doc.id}">
        <div class="subclass-card-icon">${doc.icon}</div>
        <div class="subclass-card-name">${doc.name}</div>
        <div class="subclass-card-desc">${doc.desc}</div>
        <div class="subclass-skills-list">
          ${doc.skills.map((s) => `<span class="subclass-skill-badge">${s}</span>`).join('')}
        </div>
      </div>
    `
      )
      .join('');

    content.querySelectorAll('.subclass-card').forEach((card) => {
      card.addEventListener('click', () => {
        const subId = (card as HTMLElement).dataset.subclass;
        if (subId) {
          modal.style.display = 'none';
          onChoose(subId);
        }
      });
    });

    modal.style.display = 'flex';
  }

  public updateCombatState(state: GameState, isLeader: boolean): void {
    const activePlayer = state.players.find((p) => {
      const activeId = state.turn_order[state.current_turn_index];
      return p.id === activeId;
    });

    const myPlayer = state.players.find((p) => p.id === this.myPlayerId);
    const isMyTurn = myPlayer && activePlayer && myPlayer.id === activePlayer.id;

    const bannerTitle = document.getElementById('banner-turn-title')!;
    const bannerSubtitle = document.getElementById('banner-turn-subtitle')!;
    const passBtn = document.getElementById('btn-pass-turn') as HTMLButtonElement;
    const forceStartBtn = document.getElementById('btn-force-start') as HTMLButtonElement;

    if (state.status === 'InBattle') {
      forceStartBtn.style.display = 'none';
      if (activePlayer) {
        bannerTitle.innerText = `Turno ${state.turn_count} • ${activePlayer.name}`;
        bannerTitle.style.color = activePlayer.team === 0 ? '#64b5f6' : '#e57373';
        bannerSubtitle.innerText = isMyTurn
          ? '¡Es tu turno! Mueve con PM o ataca con PA.'
          : `Turno de ${activePlayer.name}...`;

        if (this.currentTurnPlayerId !== activePlayer.id) {
          this.currentTurnPlayerId = activePlayer.id;
          this.startTurnTimer(25, isMyTurn);
          if (isMyTurn) {
            SoundManager.getInstance().playButtonClick();
          }
        }
      }
      if (passBtn) {
        passBtn.disabled = !isMyTurn;
        passBtn.classList.toggle('active-turn', !!isMyTurn);
      }
    } else {
      bannerTitle.innerText = 'Fase de Preparación de Grupo';
      bannerSubtitle.innerText = 'Esperando a que tus aliados se unan...';
      forceStartBtn.style.display = isLeader ? 'block' : 'none';
      if (passBtn) {
        passBtn.disabled = true;
        passBtn.classList.remove('active-turn');
      }
      this.stopTurnTimer();
    }

    // Actualizar Dashboard Dual de HP en el top-banner
    const playerEl = document.getElementById('cb-player-name');
    const playerHpFill = document.getElementById('cb-player-hp-fill');
    const playerHpText = document.getElementById('cb-player-hp-text');
    const playerLvl = document.getElementById('cb-player-lvl');
    if (myPlayer && playerEl && playerHpFill && playerHpText) {
      playerEl.innerText = myPlayer.name;
      if (playerLvl) playerLvl.innerText = `Lv. ${this.playerLevel || 1}`;
      const pct = Math.max(0, Math.min(100, Math.round((myPlayer.hp / Math.max(1, myPlayer.max_hp)) * 100)));
      playerHpFill.style.width = `${pct}%`;
      playerHpText.innerText = `${myPlayer.hp} / ${myPlayer.max_hp} HP (${pct}%)`;
    }

    const enemy = state.players.find((p) => p.team !== myPlayer?.team) || state.players.find((p) => p.id !== this.myPlayerId);
    const enemyEl = document.getElementById('cb-enemy-name');
    const enemyHpFill = document.getElementById('cb-enemy-hp-fill');
    const enemyHpText = document.getElementById('cb-enemy-hp-text');
    const enemyLvl = document.getElementById('cb-enemy-lvl');
    if (enemy && enemyEl && enemyHpFill && enemyHpText) {
      enemyEl.innerText = enemy.name;
      if (enemyLvl) enemyLvl.innerText = `Lv. 1`;
      const ePct = Math.max(0, Math.min(100, Math.round((enemy.hp / Math.max(1, enemy.max_hp)) * 100)));
      enemyHpFill.style.width = `${ePct}%`;
      enemyHpText.innerText = `${enemy.hp} / ${enemy.max_hp} HP (${ePct}%)`;
    }

    if (myPlayer) {
      document.getElementById('ui-ap-val')!.innerText = `${myPlayer.ap}`;
      document.getElementById('ui-pm-val')!.innerText = `${myPlayer.pm}`;

      // Actualizar HP en el corazón Dofus de la taskbar (fuente principal de HP)
      const heartCur = document.getElementById('dofus-heart-cur');
      const heartMax = document.getElementById('dofus-heart-max');
      if (heartCur) heartCur.innerText = `${myPlayer.hp}`;
      if (heartMax) heartMax.innerText = `${myPlayer.max_hp}`;

      this.latestCombatSpells = myPlayer.spells || [];
      this.renderSpells(myPlayer, isMyTurn ?? false);
    }
  }

  private renderSpells(player: Player, isMyTurn: boolean): void {
    // Los hechizos de combate se muestran en los quickslots Dofus (derecha de la taskbar)
    // El contenedor ui-spells-container ya no existe; usamos los dofus-slots directamente.
    // Si existiera un contenedor legacy, limpiarlo sin crashear:
    const container = document.getElementById('ui-spells-container');
    if (!container) {
      // Marcar hechizos disponibles en los quickslots Dofus existentes
      this.latestCombatSpells = player.spells || [];
      this.highlightCombatSpellsInQuickslots(player, isMyTurn);
      return;
    }
    container.innerHTML = '';

    const spellIcons: Record<string, string> = {
      corte_tres_maneras: '⚔️',
      golpe_espada: '💥',
      aura_espada: '🔥',
      golpe_llama: '🌋',
      espiritu_llama: '☄️',
      proteccion_oscura: '🛡️',
      ataque_rapido: '🗡️',
      disparo_flecha: '🏹',
      nube_venenosa: '☣️',
      disparo_dragon: '🐲',
      curacion: '💚',
      bendicion: '✨',
    };

    player.spells.forEach((spell, idx) => {
      const slot = document.createElement('div');
      const canCast = isMyTurn && player.ap >= spell.ap_cost;
      const isSelected = this.selectedSpell?.id === spell.id;

      slot.className = `spell-slot ${isSelected ? 'selected' : ''} ${!canCast ? 'disabled' : ''}`;
      slot.innerHTML = `
        <span class="spell-hotkey">[${idx + 1}]</span>
        <span class="spell-icon">${spellIcons[spell.id] || '⚡'}</span>
        <span class="spell-cost">${spell.ap_cost} PA</span>
      `;

      slot.addEventListener('click', () => {
        if (!canCast) return;
        if (this.selectedSpell?.id === spell.id) {
          this.clearSelectedSpell();
        } else {
          this.selectedSpell = spell;
          document.querySelectorAll('.spell-slot').forEach((s) => s.classList.remove('selected'));
          slot.classList.add('selected');
          if (this.onSpellSelected) this.onSpellSelected(spell);
        }
      });

      slot.addEventListener('mouseenter', (e) => {
        this.showTooltip(spell, e);
      });
      slot.addEventListener('mouseleave', () => {
        this.hideTooltip();
      });

      container.appendChild(slot);
    });
  }

  /** Resalta en los quickslots Dofus qué habilidades están disponibles (tenemos PA) durante combate */
  private highlightCombatSpellsInQuickslots(player: Player, isMyTurn: boolean): void {
    document.querySelectorAll('.dofus-slot').forEach((slotEl) => {
      const idx = parseInt((slotEl as HTMLElement).dataset.slot || '1', 10) - 1;
      const entry = this.assignedQuickslots[idx];
      if (!entry || entry.type !== 'skill' || !entry.skill) {
        slotEl.classList.remove('combat-available', 'combat-no-ap');
        return;
      }
      const skill = entry.skill;
      // Buscar si este skill es un hechizo del combate actual
      const combatSpell = player.spells.find((s) => s.id === skill.id);
      if (combatSpell) {
        const canCast = isMyTurn && player.ap >= combatSpell.ap_cost;
        slotEl.classList.toggle('combat-available', canCast);
        slotEl.classList.toggle('combat-no-ap', !canCast && isMyTurn);
      } else {
        slotEl.classList.remove('combat-available', 'combat-no-ap');
      }
    });
  }

  private showTooltip(spell: Spell, e: MouseEvent): void {
    const tt = document.getElementById('spell-tooltip')!;
    document.getElementById('tt-title')!.innerText = spell.name;
    document.getElementById('tt-meta')!.innerText = `Costo: ${spell.ap_cost} PA • Rango: ${spell.min_range}-${spell.max_range} ${spell.is_linear ? '(Lineal)' : ''}`;
    document.getElementById('tt-desc')!.innerText = spell.description;

    tt.style.display = 'block';
    tt.style.left = `${e.clientX + 10}px`;
    tt.style.top = `${e.clientY - 120}px`;
  }

  private hideTooltip(): void {
    const tt = document.getElementById('spell-tooltip')!;
    tt.style.display = 'none';
  }

  public addChatMessage(message: string): void {
    const logList = document.getElementById('combat-log-list');
    if (logList) {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      if (message.includes('🏆') || message.includes('🌟')) {
        entry.style.color = '#ffd700';
        entry.style.fontWeight = 'bold';
      } else if (message.includes('⚔️') || message.includes('☄️')) {
        entry.style.color = '#f87171';
        entry.style.fontWeight = 'bold';
      } else if (message.includes('🛡️')) {
        entry.style.color = '#60a5fa';
      } else if (message.includes('🔨') || message.includes('✨')) {
        entry.style.color = '#facc15';
        entry.style.fontWeight = 'bold';
      } else if (message.includes('📜')) {
        entry.style.color = '#a78bfa';
        entry.style.fontWeight = 'bold';
      }
      entry.innerText = message;
      logList.appendChild(entry);
      logList.scrollTop = logList.scrollHeight;
    }

    const dofusChat = document.getElementById('dofus-chat-messages');
    if (dofusChat) {
      const dEntry = document.createElement('div');
      dEntry.innerText = message;
      dofusChat.appendChild(dEntry);
      dofusChat.scrollTop = dofusChat.scrollHeight;
    }
  }

  public toggleInventory(): void {
    const inv = document.getElementById('inventory-modal');
    if (inv) {
      const isVisible = inv.style.display === 'flex';
      if (isVisible) {
        inv.style.display = 'none';
        this.corePreview?.pause();
      } else {
        inv.style.display = 'flex';
        SoundManager.getInstance().playButtonClick();
        this.renderInventory();

        const previewWrap = document.getElementById('dofus-core-preview-wrap');
        if (previewWrap) {
          if (!this.corePreview) {
            this.corePreview = new CharacterPreview(previewWrap);
            this.corePreview.setCharacter(this.selectedClass, this.selectedOutfit, this.selectedGender);
          } else {
            this.corePreview.resume();
          }
          requestAnimationFrame(() => {
            this.corePreview?.resize();
          });
        }
      }
    }
  }

  public toggleQuestsModal(): void {
    const modal = document.getElementById('quest-detail-modal');
    if (modal && modal.style.display === 'block') {
      modal.style.display = 'none';
      return;
    }

    const activeQuest = this.currentQuests.find((q) => !q.is_turned_in) || this.currentQuests[0];
    if (activeQuest) {
      this.showQuestDetailsModal(activeQuest);
    } else {
      this.showQuestDetailsModal({
        id: 'no_quest',
        title: 'Guía de Misiones de la Aldea 1',
        description: 'Actualmente no tienes misiones activas en tu diario. Para comenzar tus encargos, recibir Yang, armas y experiencia, dirígete a la plaza central de la Aldea 1 y habla con el Guardián de la Aldea frente a la fuente.',
        target_mob_type: '',
        target_count: 1,
        current_count: 0,
        reward_exp: 250,
        reward_yang: 500,
        is_completed: false,
        is_turned_in: false,
      });
    }
  }

  public syncInventory(data: {
    inventory: (Item | null)[];
    equipped_weapon?: Item;
    equipped_armor?: Item;
    yang: number;
    quests: Quest[];
  }): void {
    this.currentInventory = data.inventory;
    this.currentWeapon = data.equipped_weapon || null;
    this.currentArmor = data.equipped_armor || null;
    this.currentYang = data.yang;
    this.currentQuests = data.quests || [];

    const yangEl = document.getElementById('dofus-inv-yang');
    if (yangEl) yangEl.innerText = `${this.currentYang.toLocaleString()}`;

    // Actualizar ranura de arma Dofus (Espada +0)
    const wepSlot = document.getElementById('equip-slot-weapon');
    if (wepSlot) {
      if (this.currentWeapon) {
        wepSlot.innerHTML = renderItemIcon(this.currentWeapon.icon || '🗡️', 26);
        wepSlot.title = `${this.currentWeapon.name} (+${this.currentWeapon.attack_bonus} Daño)`;
      } else {
        wepSlot.innerHTML = '🗡️';
        wepSlot.title = 'Arma Vacía';
      }
    }

    // Actualizar ranura de armadura / capa Dofus
    const capeSlot = document.getElementById('equip-slot-cape');
    if (capeSlot) {
      if (this.currentArmor) {
        capeSlot.innerHTML = renderItemIcon(this.currentArmor.icon || '🛡️', 26);
        capeSlot.title = `${this.currentArmor.name} (+${this.currentArmor.defense_bonus} Def)`;
      } else {
        capeSlot.innerHTML = '🧣';
        capeSlot.title = 'Armadura / Capa Vacía';
      }
    }

    // Actualizar medidor de Pods / Carga de inventario
    const filledCount = this.currentInventory.filter(Boolean).length;
    const podsFill = document.getElementById('dofus-pods-fill');
    const podsText = document.getElementById('dofus-pods-text');
    if (podsFill && podsText) {
      const podsUsed = filledCount * 15;
      const maxPods = 1000;
      const pct = Math.min(100, Math.round((podsUsed / maxPods) * 100));
      podsFill.style.width = `${pct}%`;
      podsText.innerText = `${podsUsed} / ${maxPods}`;
    }

    this.renderInventory();
    this.updateQuestTracker();
  }

  private renderInventory(): void {
    const grid = document.getElementById('dofus-grid-8x8');
    if (!grid) return;
    grid.innerHTML = '';

    // Mapeo de ranuras según el filtro activo (all, weapon, armor, potion, resource)
    interface SlotData {
      item: Item | null;
      originalIndex: number;
    }

    const slotsToRender: SlotData[] = [];

    if (this.currentInvFilter === 'all') {
      for (let i = 0; i < 64; i++) {
        slotsToRender.push({
          item: this.currentInventory[i] || null,
          originalIndex: i,
        });
      }
    } else {
      const filtered: SlotData[] = [];
      for (let i = 0; i < this.currentInventory.length; i++) {
        const item = this.currentInventory[i];
        if (!item) continue;
        let matches = false;
        if (this.currentInvFilter === 'weapon' && item.item_type === 'Weapon') matches = true;
        if (this.currentInvFilter === 'armor' && item.item_type === 'Armor') matches = true;
        if (this.currentInvFilter === 'potion' && item.item_type === 'Consumable') matches = true;
        if (this.currentInvFilter === 'resource' && (item.item_type === 'Material' || item.item_type === 'SkillBook')) matches = true;

        if (matches) {
          filtered.push({ item, originalIndex: i });
        }
      }

      for (let i = 0; i < 64; i++) {
        if (i < filtered.length) {
          slotsToRender.push(filtered[i]);
        } else {
          slotsToRender.push({ item: null, originalIndex: -1 });
        }
      }
    }

    // Cuadrícula 8x8 (64 ranuras) estilo Dofus 1.29
    for (let slotIdx = 0; slotIdx < 64; slotIdx++) {
      const { item, originalIndex } = slotsToRender[slotIdx];
      const slot = document.createElement('div');
      slot.className = 'dofus-grid-slot';

      if (item && originalIndex >= 0) {
        slot.draggable = true;
        slot.style.cursor = 'grab';
        slot.addEventListener('dragstart', (e) => {
          (e as DragEvent).dataTransfer?.setData('application/dotin-item', JSON.stringify({ index: originalIndex, item }));
          (e as DragEvent).dataTransfer?.setData('text/plain', `item:${item.id}`);
        });

        const plusBadge = item.upgrade_level > 0 ? `<span style="position: absolute; top: 1px; right: 2px; font-size: 8px; font-weight: bold; color: #b45309;">+${item.upgrade_level}</span>` : '';
        slot.innerHTML = `
          ${plusBadge}
          ${renderItemIcon(item.icon)}
        `;
        slot.title = `${item.name}\n${item.description}\nPrecio: ${item.buy_price} Yang (Arrastrable a la barra rápida)`;

        slot.addEventListener('click', () => {
          document.querySelectorAll('.dofus-grid-slot').forEach((s) => s.classList.remove('selected'));
          slot.classList.add('selected');
          this.displayItemDetail(item, originalIndex);
        });
      } else {
        slot.style.opacity = '0.35';
      }

      grid.appendChild(slot);
    }

    // Por defecto mostrar el arma equipada en el detalle si ninguna casilla está seleccionada
    if (this.currentWeapon) {
      this.displayItemDetail(this.currentWeapon, -1);
    }
  }

  private displayItemDetail(item: Item, slotIndex: number): void {
    const nameEl = document.getElementById('dofus-detail-name');
    const lvlEl = document.getElementById('dofus-detail-level');
    const iconEl = document.getElementById('dofus-detail-icon');
    const bonusEl = document.getElementById('dofus-detail-bonus');
    const descEl = document.getElementById('dofus-detail-desc');
    const btnAct = document.getElementById('btn-dofus-action');

    if (nameEl) nameEl.innerText = item.name;
    if (lvlEl) lvlEl.innerText = item.upgrade_level > 0 ? `+${item.upgrade_level}` : (item.item_type === 'Material' ? 'Material' : 'Niv. 1');
    if (iconEl) iconEl.innerHTML = renderItemIcon(item.icon, 36);

    let statBonus = '';
    if (item.attack_bonus) statBonus += `+${item.attack_bonus} Ataque Físico `;
    if (item.defense_bonus) statBonus += `+${item.defense_bonus} Defensa `;
    if (item.hp_bonus) statBonus += `+${item.hp_bonus} HP `;
    if (bonusEl) bonusEl.innerText = statBonus || (item.item_type === 'Material' ? 'Material para Forja y Alquimia' : 'Sin efectos mágicos');

    const durVal = item.durability ?? 100;
    const maxDur = item.max_durability ?? 100;
    const durPct = Math.round((durVal / maxDur) * 100);
    const durInfo = (item.item_type === 'Weapon' || item.item_type === 'Armor')
      ? `\n🔧 Durabilidad: ${durVal}/${maxDur} (${durPct}%)`
      : '';

    if (descEl) descEl.innerText = `${item.description}${durInfo}`;

    if (btnAct) {
      if (slotIndex >= 0) {
        if (item.item_type === 'Consumable') {
          btnAct.style.display = 'block';
          btnAct.innerText = 'Usar Poción';
          btnAct.onclick = () => this.handleInventorySlotClick(slotIndex, item);
        } else if (item.item_type === 'SkillBook') {
          btnAct.style.display = 'block';
          btnAct.innerText = 'Leer Libro';
          btnAct.onclick = () => this.handleInventorySlotClick(slotIndex, item);
        } else if (item.item_type === 'Weapon' || item.item_type === 'Armor') {
          btnAct.style.display = 'block';
          btnAct.innerText = 'Equipar';
          btnAct.onclick = () => this.handleInventorySlotClick(slotIndex, item);
        } else {
          btnAct.style.display = 'none';
        }
      } else {
        btnAct.style.display = 'none';
      }
    }
  }

  private handleInventorySlotClick(slotIndex: number, item: Item): void {
    if (item.item_type === 'Consumable') {
      if (confirm(`¿Quieres usar [${item.name}] para recuperar ${item.hp_bonus} HP?`)) {
        this.onUseItemRequested?.(slotIndex);
      }
    } else if (item.item_type === 'SkillBook') {
      if (confirm(`¿Quieres intentar leer [${item.name}] para mejorar tu técnica marcial?`)) {
        this.onUseItemRequested?.(slotIndex);
      }
    } else if (item.item_type === 'Weapon' || item.item_type === 'Armor') {
      const choice = confirm(`[${item.name}]\n${item.description}\n\nPresiona ACEPTAR para EQUIPAR este objeto, o CANCELAR para volver.`);
      if (choice) {
        this.onEquipItemRequested?.(slotIndex);
      }
    }
  }

  public showNPCDialog(dialog: {
    npc_id: string;
    name: string;
    text: string;
    dialog_type: string;
    shop_items: Item[];
    available_quests: Quest[];
  }): void {
    const modal = document.getElementById('npc-dialog-modal');
    const nameEl = document.getElementById('npc-dialog-name');
    const textEl = document.getElementById('npc-dialog-text');
    const iconEl = document.getElementById('npc-avatar-icon');
    const contentEl = document.getElementById('npc-dialog-content');

    if (!modal || !nameEl || !textEl || !contentEl) return;

    this.currentNpcDialogType = dialog.dialog_type;
    nameEl.innerText = dialog.name;
    textEl.innerText = dialog.text;
    modal.style.width = dialog.dialog_type === 'market_board' ? '660px' : '460px';
    modal.style.display = 'block';

    if (dialog.dialog_type === 'blacksmith') {
      if (iconEl) iconEl.innerText = '🔨';
      this.renderBlacksmithUI(contentEl);
    } else if (dialog.dialog_type === 'merchant') {
      if (iconEl) iconEl.innerText = '🧪';
      this.renderMerchantUI(contentEl, dialog.shop_items);
    } else if (dialog.dialog_type === 'guardian') {
      if (iconEl) iconEl.innerText = '🛡️';
      this.renderGuardianUI(contentEl, dialog.available_quests);
    } else if (dialog.dialog_type === 'storekeeper') {
      if (iconEl) iconEl.innerText = '📦';
      this.renderStorekeeperUI(contentEl);
    } else if (dialog.dialog_type === 'market_board') {
      if (iconEl) iconEl.innerText = '⚖️';
      this.renderMarketBoardUI(contentEl);
    } else if (dialog.dialog_type === 'furnace') {
      if (iconEl) iconEl.innerText = '🔥';
      this.renderFurnaceUI(contentEl);
    }
  }

  public closeNPCDialog(): void {
    const modal = document.getElementById('npc-dialog-modal');
    if (modal) modal.style.display = 'none';
    this.currentNpcDialogType = null;
  }

  private renderBlacksmithUI(container: HTMLElement): void {
    const isUpgrade = this.bsCurrentTab === 'upgrade';

    container.innerHTML = `
      <div style="background: rgba(0,0,0,0.5); padding: 12px; border-radius: 8px; border: 1px solid #555;">
        <!-- Pestañas del Herrero -->
        <div style="display: flex; gap: 8px; margin-bottom: 12px; border-bottom: 1px solid #444; padding-bottom: 8px;">
          <button id="btn-bs-tab-upgrade" class="btn ${isUpgrade ? 'btn-start' : 'btn-secondary'}" style="flex: 1; padding: 6px; font-size: 11px;">
            🔨 Mejora (+0 a +9)
          </button>
          <button id="btn-bs-tab-repair" class="btn ${!isUpgrade ? 'btn-start' : 'btn-secondary'}" style="flex: 1; padding: 6px; font-size: 11px;">
            🔧 Reparar Durabilidad
          </button>
        </div>

        <div id="bs-tab-content">
          ${isUpgrade ? this.getBlacksmithUpgradeHTML() : this.getBlacksmithRepairHTML()}
        </div>

        <div id="bs-result-alert" style="display: none; padding: 8px; border-radius: 6px; font-size: 12px; font-weight: bold; text-align: center; margin-top: 10px;"></div>
      </div>
    `;

    document.getElementById('btn-bs-tab-upgrade')?.addEventListener('click', () => {
      this.bsCurrentTab = 'upgrade';
      this.renderBlacksmithUI(container);
    });
    document.getElementById('btn-bs-tab-repair')?.addEventListener('click', () => {
      this.bsCurrentTab = 'repair';
      this.renderBlacksmithUI(container);
    });

    if (isUpgrade) {
      this.bindBlacksmithUpgradeEvents();
    } else {
      this.bindBlacksmithRepairEvents();
    }
  }

  private getBlacksmithUpgradeHTML(): string {
    return `
      <div style="font-size: 11px; color: #aaa; margin-bottom: 8px;">Selecciona un arma o armadura de tu inventario:</div>
      <select id="bs-item-select" style="width: 100%; background: #222; color: #fff; border: 1px solid #b8860b; border-radius: 4px; padding: 6px; font-size: 12px; margin-bottom: 12px;">
        <option value="-1">-- Selecciona un objeto --</option>
      </select>
      <div id="bs-upgrade-info" style="display: none; background: rgba(20,20,30,0.85); padding: 10px; border-radius: 6px; margin-bottom: 12px; border: 1px solid #444;">
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
          <span>Coste en Yang:</span>
          <span id="bs-yang-cost" style="color: #ffd700; font-weight: bold;">0 Yang</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
          <span>Material Requerido:</span>
          <span id="bs-material-req" style="color: #93c5fd; font-weight: bold;">Ninguno</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 6px;">
          <span>Probabilidad de Éxito:</span>
          <span id="bs-success-chance" style="color: #4ade80; font-weight: bold;">100%</span>
        </div>
        <div id="bs-danger-warning" style="font-size: 10px; color: #fbbf24; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3); padding: 6px; border-radius: 4px; text-align: center;"></div>
      </div>
      <button id="btn-do-upgrade" class="btn btn-start" style="width: 100%; padding: 8px; font-size: 13px;" disabled>¡INTENTAR MEJORA!</button>
    `;
  }

  private bindBlacksmithUpgradeEvents(): void {
    const select = document.getElementById('bs-item-select') as HTMLSelectElement;
    const infoBox = document.getElementById('bs-upgrade-info');
    const costText = document.getElementById('bs-yang-cost');
    const matText = document.getElementById('bs-material-req');
    const chanceText = document.getElementById('bs-success-chance');
    const dangerBox = document.getElementById('bs-danger-warning');
    const upgradeBtn = document.getElementById('btn-do-upgrade') as HTMLButtonElement;

    if (!select) return;

    this.currentInventory.forEach((item, idx) => {
      if (item && (item.item_type === 'Weapon' || item.item_type === 'Armor') && item.upgrade_level < 9) {
        const opt = document.createElement('option');
        opt.value = `${idx}`;
        opt.innerText = `${item.name} (+${item.upgrade_level})`;
        select.appendChild(opt);
      }
    });

    select.addEventListener('change', () => {
      const idx = parseInt(select.value, 10);
      if (idx >= 0 && this.currentInventory[idx]) {
        const it = this.currentInventory[idx]!;
        this.selectedUpgradeSlot = idx;
        const lvl = it.upgrade_level;
        const isWep = it.item_type === 'Weapon';

        const costs = [200, 400, 800, 1500, 2500, 4000, 7000, 12000, 20000];
        const cost = costs[lvl] || 25000;

        const reqMats = [
          null,
          null,
          null,
          'Piel de Animal',
          isWep ? 'Diente de Perro' : 'Piel de Animal',
          'Lingote de Cobre',
          'Piel de Lobo',
          'Garra de Lobo',
          'Lingote de Hierro',
        ];
        const reqMat = reqMats[lvl];

        const chances = ['100%', '100%', '100%', '75%', '65%', '55%', '45%', '35%', '25%'];
        const chance = chances[lvl] || '20%';

        if (costText) costText.innerText = `${cost.toLocaleString()} Yang`;

        // Check if player has the required material
        let hasMat = true;
        if (reqMat) {
          const count = this.currentInventory.filter((x) => x && x.name === reqMat).length;
          hasMat = count > 0;
          if (matText) {
            matText.innerHTML = hasMat
              ? `<span style="color: #4ade80;">1x ${reqMat} (Tienes ${count})</span>`
              : `<span style="color: #ef4444;">1x ${reqMat} (No tienes)</span>`;
          }
        } else {
          if (matText) matText.innerText = 'Solo Yang (Sin materiales)';
        }

        if (chanceText) {
          chanceText.innerText = chance;
          chanceText.style.color = lvl < 3 ? '#4ade80' : lvl < 6 ? '#facc15' : '#ef4444';
        }

        if (dangerBox) {
          if (lvl < 3) {
            dangerBox.style.color = '#4ade80';
            dangerBox.style.borderColor = 'rgba(74, 222, 128, 0.3)';
            dangerBox.innerText = '🛡️ Mejora segura: 100% de éxito garantizado.';
          } else if (lvl < 6) {
            dangerBox.style.color = '#fbbf24';
            dangerBox.style.borderColor = 'rgba(251, 191, 36, 0.3)';
            dangerBox.innerText = '⚠️ Cuidado: Si falla, el objeto puede bajar de nivel o destruirse.';
          } else {
            dangerBox.style.color = '#ef4444';
            dangerBox.style.borderColor = 'rgba(239, 68, 68, 0.4)';
            dangerBox.innerText = '🔥 ¡ALTO RIESGO! Si el Herrero falla, ¡el objeto se romperá y desaparecerá!';
          }
        }

        if (infoBox) infoBox.style.display = 'block';
        if (upgradeBtn) upgradeBtn.disabled = this.currentYang < cost || !hasMat;
      } else {
        this.selectedUpgradeSlot = null;
        if (infoBox) infoBox.style.display = 'none';
        if (upgradeBtn) upgradeBtn.disabled = true;
      }
    });

    upgradeBtn.addEventListener('click', () => {
      if (this.selectedUpgradeSlot !== null) {
        this.onUpgradeItemRequested?.(this.selectedUpgradeSlot);
      }
    });
  }

  private getBlacksmithRepairHTML(): string {
    const repairItems: { label: string; item: Item; isEquipped: boolean; slotIdx: number }[] = [];

    if (this.currentWeapon && (this.currentWeapon.durability ?? 100) < (this.currentWeapon.max_durability ?? 100)) {
      repairItems.push({ label: 'Arma Equipada', item: this.currentWeapon, isEquipped: true, slotIdx: 0 });
    }
    if (this.currentArmor && (this.currentArmor.durability ?? 100) < (this.currentArmor.max_durability ?? 100)) {
      repairItems.push({ label: 'Armadura Equipada', item: this.currentArmor, isEquipped: true, slotIdx: 1 });
    }

    this.currentInventory.forEach((it, idx) => {
      if (it && (it.item_type === 'Weapon' || it.item_type === 'Armor')) {
        const dur = it.durability ?? 100;
        const max = it.max_durability ?? 100;
        if (dur < max) {
          repairItems.push({ label: `Inventario #${idx + 1}`, item: it, isEquipped: false, slotIdx: idx });
        }
      }
    });

    if (repairItems.length === 0) {
      return `
        <div style="text-align: center; padding: 20px; color: #4ade80;">
          <div style="font-size: 24px; margin-bottom: 6px;">✨</div>
          <div style="font-weight: bold; font-size: 13px;">¡Todo tu equipamiento está al 100% de durabilidad!</div>
          <div style="font-size: 11px; color: #aaa; margin-top: 4px;">Las armas y armaduras pierden durabilidad gradualmente en combate.</div>
        </div>
      `;
    }

    return `
      <div style="font-size: 11px; color: #aaa; margin-bottom: 8px;">Objetos desgastados que requieren restauración:</div>
      <div style="display: flex; flex-direction: column; gap: 8px; max-height: 220px; overflow-y: auto;">
        ${repairItems.map((r) => {
          const dur = r.item.durability ?? 100;
          const max = r.item.max_durability ?? 100;
          const cost = (max - dur) * 2;
          const canAfford = this.currentYang >= cost;
          return `
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.4); border: 1px solid #444; border-radius: 6px; padding: 8px 10px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                ${renderItemIcon(r.item.icon, 24)}
                <div>
                  <div style="font-size: 12px; font-weight: bold; color: #ffd700;">${r.item.name} <span style="font-size: 10px; color: #aaa;">(${r.label})</span></div>
                  <div style="font-size: 10px; color: #bbb;">Durabilidad: <b style="color: ${dur < 25 ? '#ef4444' : '#fbbf24'};">${dur}/${max}</b></div>
                </div>
              </div>
              <button class="btn btn-start btn-repair-action" data-slot="${r.slotIdx}" data-equipped="${r.isEquipped}" ${canAfford ? '' : 'disabled'} style="padding: 4px 10px; font-size: 11px; white-space: nowrap;">
                🔧 Reparar (${cost} Yang)
              </button>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  private bindBlacksmithRepairEvents(): void {
    document.querySelectorAll('.btn-repair-action').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const target = e.currentTarget as HTMLElement;
        const slotIdx = parseInt(target.dataset.slot || '0', 10);
        const isEquipped = target.dataset.equipped === 'true';
        this.onRepairItemRequested?.(slotIdx, isEquipped);
      });
    });
  }

  public showRepairResult(res: { success: boolean; message: string; yang: number }): void {
    const alertBox = document.getElementById('bs-result-alert');
    if (!alertBox) return;

    alertBox.style.display = 'block';
    if (res.success) {
      SoundManager.getInstance().playBlacksmithSuccess();
      alertBox.style.background = 'rgba(74, 222, 128, 0.2)';
      alertBox.style.border = '1px solid #4ade80';
      alertBox.style.color = '#4ade80';
      alertBox.innerText = res.message;
    } else {
      SoundManager.getInstance().playBlacksmithFail();
      alertBox.style.background = 'rgba(239, 68, 68, 0.2)';
      alertBox.style.border = '1px solid #ef4444';
      alertBox.style.color = '#ef4444';
      alertBox.innerText = res.message;
    }

    const content = document.getElementById('npc-dialog-content');
    if (content) {
      setTimeout(() => {
        this.renderBlacksmithUI(content);
      }, 1500);
    }
  }

  public showUpgradeResult(res: { success: boolean; message: string; item?: Item }): void {
    const alertBox = document.getElementById('bs-result-alert');
    if (!alertBox) return;

    alertBox.style.display = 'block';
    if (res.success) {
      SoundManager.getInstance().playBlacksmithSuccess();
      alertBox.style.background = 'rgba(74, 222, 128, 0.2)';
      alertBox.style.border = '1px solid #4ade80';
      alertBox.style.color = '#4ade80';
      alertBox.innerText = `✨ ${res.message}`;
    } else {
      SoundManager.getInstance().playBlacksmithFail();
      alertBox.style.background = 'rgba(239, 68, 68, 0.2)';
      alertBox.style.border = '1px solid #ef4444';
      alertBox.style.color = '#ef4444';
      alertBox.innerText = `💥 ${res.message}`;
    }

    const content = document.getElementById('npc-dialog-content');
    if (content) {
      setTimeout(() => {
        this.renderBlacksmithUI(content);
      }, 1800);
    }
  }

  private renderMerchantUI(container: HTMLElement, shopItems: Item[]): void {
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto;">
        ${shopItems
          .map(
            (item) => `
          <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.4); padding: 8px 12px; border-radius: 6px; border: 1px solid #444;">
            <div style="display: flex; align-items: center; gap: 10px;">
              ${renderItemIcon(item.icon, 24)}
              <div>
                <div style="font-size: 12px; font-weight: bold; color: #ffd700;">${item.name}</div>
                <div style="font-size: 10px; color: #aaa;">${item.description}</div>
              </div>
            </div>
            <button class="btn btn-start btn-buy-item" data-id="${item.id}" style="padding: 4px 10px; font-size: 11px;">
              💰 ${item.buy_price} Yang
            </button>
          </div>
        `
          )
          .join('')}
      </div>
    `;

    container.querySelectorAll('.btn-buy-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const itemId = btn.getAttribute('data-id');
        if (itemId) {
          this.onBuyShopItemRequested?.(itemId);
        }
      });
    });
  }

  private renderGuardianUI(container: HTMLElement, quests: Quest[]): void {
    if (!quests || quests.length === 0) {
      container.innerHTML = `<div style="font-size: 12px; color: #888; text-align: center; padding: 10px;">No tienes misiones activas por ahora.</div>`;
      return;
    }

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${quests
          .map((q) => {
            const isDone = q.is_completed;
            const isTurned = q.is_turned_in;
            const progress = `${q.current_count} / ${q.target_count}`;
            const pct = Math.min(100, (q.current_count / q.target_count) * 100);

            return `
            <div class="guardian-quest-card" data-qid="${q.id}" style="background: rgba(0,0,0,0.5); padding: 10px; border-radius: 8px; border: 1px solid ${isDone ? '#4ade80' : '#b8860b'}; cursor: pointer;" title="Haz clic para ver qué debemos hacer">
              <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; color: #ffd700; margin-bottom: 4px;">
                <span>${q.title}</span>
                <span style="color: ${isDone ? '#4ade80' : '#38bdf8'}; font-size: 11px;">${isTurned ? 'Completada' : progress}</span>
              </div>
              <div style="font-size: 11px; color: #ccc; margin-bottom: 6px;">🎯 ${q.description}</div>
              <div style="font-size: 10px; color: #4ade80; margin-bottom: 8px;">Recompensa: +${q.reward_exp} EXP • +${q.reward_yang} Yang ${q.reward_item ? `• [${q.reward_item.name}]` : ''}</div>
              ${
                isTurned
                  ? `<div style="font-size: 11px; color: #888; font-style: italic;">¡Recompensa ya entregada!</div>`
                  : isDone
                  ? `<button class="btn btn-start btn-claim-quest" data-qid="${q.id}" style="width: 100%; padding: 6px; font-size: 12px; background: linear-gradient(180deg, #16a34a, #15803d); border-color: #4ade80;">🎁 RECLAMAR RECOMPENSA</button>`
                  : `<div style="width: 100%; height: 6px; background: #222; border-radius: 3px; overflow: hidden; margin-bottom: 4px;"><div style="width: ${pct}%; height: 100%; background: #38bdf8;"></div></div><div style="font-size: 9px; color: #38bdf8; text-align: right;">ℹ️ Clic para ver qué debemos hacer</div>`
              }
            </div>
          `;
          })
          .join('')}
      </div>
    `;

    container.querySelectorAll('.guardian-quest-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).classList.contains('btn-claim-quest')) return;
        const qid = card.getAttribute('data-qid');
        const q = quests.find((item) => item.id === qid);
        if (q) {
          SoundManager.getInstance().playButtonClick();
          this.showQuestDetailsModal(q);
        }
      });
    });

    container.querySelectorAll('.btn-claim-quest').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const qid = btn.getAttribute('data-qid');
        if (qid) {
          this.onTurnInQuestRequested?.(qid);
        }
      });
    });
  }

  public updateQuestTracker(): void {
    const trackerList = document.getElementById('quest-tracker-list');
    if (!trackerList) return;

    if (this.currentQuests.length === 0) {
      trackerList.innerHTML = `
        <div style="background: rgba(0,0,0,0.45); padding: 8px; border-radius: 6px; border-left: 3px solid #38bdf8; cursor: pointer; transition: transform 0.15s ease;" title="Haz clic para ver qué debemos hacer">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: bold; color: #38bdf8; font-size: 11px;">📜 ¿Qué debemos hacer?</div>
            <span style="font-size: 9px; color: #facc15;">Ver ➔</span>
          </div>
          <div style="font-size: 10px; color: #cbd5e1; margin-top: 3px; line-height: 1.3;">
            Habla con el <b>Guardián de la Aldea</b> en la plaza central para recibir tu primera misión.
          </div>
        </div>
      `;
      trackerList.firstElementChild?.addEventListener('click', () => {
        SoundManager.getInstance().playButtonClick();
        this.toggleQuestsModal();
      });
      return;
    }

    trackerList.innerHTML = '';
    for (const q of this.currentQuests) {
      if (q.is_turned_in) continue;
      const isDone = q.is_completed;
      const card = document.createElement('div');
      card.style.cssText = `
        background: rgba(0,0,0,0.35);
        padding: 8px;
        border-radius: 5px;
        border-left: 3px solid ${isDone ? '#4ade80' : '#ffd700'};
        cursor: pointer;
        transition: all 0.2s ease;
        position: relative;
      `;
      card.title = 'Haz clic para ver qué debemos hacer';

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-weight: bold; color: #ffd700; font-size: 11px;">${q.title}</div>
          <span style="font-size: 9px; color: #38bdf8; font-weight: bold;">[Ver qué hacer]</span>
        </div>
        <div style="color: #fde047; font-size: 10px; margin-top: 2px; font-weight: 600;">
          🎯 ${q.description || 'Derrota monstruos en el exterior'}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <span style="color: ${isDone ? '#4ade80' : '#38bdf8'}; font-size: 10px; font-weight: bold;">
            ${isDone ? '✅ ¡Listo para entregar!' : `Progreso: <b>${q.current_count} / ${q.target_count}</b>`}
          </span>
          <span style="font-size: 9px; color: #94a3b8;">📍 Clic para guía</span>
        </div>
      `;

      card.addEventListener('mouseenter', () => {
        card.style.background = 'rgba(255, 215, 0, 0.12)';
        card.style.transform = 'translateX(2px)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.background = 'rgba(0,0,0,0.35)';
        card.style.transform = 'none';
      });
      card.addEventListener('click', () => {
        SoundManager.getInstance().playButtonClick();
        this.showQuestDetailsModal(q);
      });

      trackerList.appendChild(card);
    }
  }

  public showQuestDetailsModal(quest: Quest): void {
    const modal = document.getElementById('quest-detail-modal');
    if (!modal) return;

    const titleEl = document.getElementById('quest-modal-title');
    const statusEl = document.getElementById('quest-modal-status');
    const descEl = document.getElementById('quest-modal-desc');
    const progTextEl = document.getElementById('quest-modal-progress-text');
    const progBarEl = document.getElementById('quest-modal-progress-bar');
    const hintEl = document.getElementById('quest-modal-hint');
    const rewardsEl = document.getElementById('quest-modal-rewards');
    const turnInGuideEl = document.getElementById('quest-modal-turnin-guide');

    if (titleEl) titleEl.innerText = quest.title;

    if (statusEl) {
      if (quest.is_turned_in) {
        statusEl.innerText = 'Entregada y Cobrada';
        statusEl.style.color = '#94a3b8';
      } else if (quest.is_completed) {
        statusEl.innerText = '✅ ¡Objetivo Completado! Listo para entregar';
        statusEl.style.color = '#4ade80';
      } else {
        statusEl.innerText = 'En Curso';
        statusEl.style.color = '#f59e0b';
      }
    }

    if (descEl) {
      const mobName = quest.target_mob_type || 'monstruos salvajes';
      const countNeeded = Math.max(0, quest.target_count - quest.current_count);
      let guidance = `🎯 OBJETIVO: ${quest.description || 'Proteger la Aldea 1.'}\n\n`;
      if (quest.is_completed) {
        guidance += `✅ ¡HAS COMPLETADO EL OBJETIVO!\nDirígete de regreso a la plaza central de la Aldea 1 y habla con el Guardián de la Aldea para reclamar tus recompensas.`;
      } else {
        guidance += `🧭 ¿QUÉ DEBEMOS HACER AHORA?\n`;
        guidance += `1. Sal de la aldea cruzando la muralla o puerta sur hacia las praderas exteriores.\n`;
        guidance += `2. Busca y haz clic sobre [${mobName}] para iniciar el combate táctico.\n`;
        guidance += `3. Derrota a ${countNeeded} objetivo(s) más para completar la misión.\n`;
        guidance += `4. Al terminar, regresa con el Guardián de la Aldea para cobrar.`;
      }
      descEl.innerText = guidance;
    }

    const pct = Math.min(100, Math.round((quest.current_count / Math.max(1, quest.target_count)) * 100));
    if (progTextEl) {
      progTextEl.innerText = `${quest.current_count} / ${quest.target_count} (${pct}%)`;
    }
    if (progBarEl) {
      progBarEl.style.width = `${pct}%`;
    }

    if (hintEl) {
      if (quest.target_mob_type.toLowerCase().includes('dog')) {
        hintEl.innerText = '📍 Dónde encontrarlo: Praderas exteriores al sur y caminos de la Aldea 1.';
      } else if (quest.target_mob_type.toLowerCase().includes('metin')) {
        hintEl.innerText = '📍 Dónde encontrarlo: Caídas de meteorito en los claros abiertos del mapa exterior.';
      } else if (quest.target_mob_type.toLowerCase().includes('wolf')) {
        hintEl.innerText = '📍 Dónde encontrarlo: Bosques y colinas al este y oeste de la Aldea 1.';
      } else {
        hintEl.innerText = '📍 Dónde encontrarlo: Alrededores del mapa exterior.';
      }
    }

    if (rewardsEl) {
      let rHtml = `
        <span style="background: rgba(234, 179, 8, 0.15); border: 1px solid #eab308; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #ffd700; font-weight: bold;">
          💰 +${quest.reward_yang.toLocaleString()} Yang
        </span>
        <span style="background: rgba(59, 130, 246, 0.15); border: 1px solid #3b82f6; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #60a5fa; font-weight: bold;">
          ⭐ +${quest.reward_exp.toLocaleString()} EXP
        </span>
      `;
      if (quest.reward_item) {
        rHtml += `
          <div style="background: rgba(168, 85, 247, 0.15); border: 1px solid #a855f7; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #e9d5ff; display: flex; align-items: center; gap: 6px;">
            ${renderItemIcon(quest.reward_item.icon, 20)}
            <span><b>${quest.reward_item.name}</b> (+${quest.reward_item.attack_bonus || quest.reward_item.defense_bonus} Stat)</span>
          </div>
        `;
      }
      rewardsEl.innerHTML = rHtml;
    }

    if (turnInGuideEl) {
      if (quest.is_completed) {
        turnInGuideEl.innerHTML = `🎉 <b>¡Misión lista para entregar!</b> Ve a la plaza central de la Aldea 1 y habla con el <b>Guardián de la Aldea</b> para reclamar tu recompensa.`;
        turnInGuideEl.style.background = 'rgba(74, 222, 128, 0.18)';
        turnInGuideEl.style.borderColor = '#4ade80';
      } else {
        turnInGuideEl.innerHTML = `🏛️ <b>Cómo completar:</b> Derrota a los objetivos restantes en combate táctico. Al terminar, vuelve con el <b>Guardián de la Aldea</b> en la plaza central.`;
        turnInGuideEl.style.background = 'rgba(255, 255, 255, 0.04)';
        turnInGuideEl.style.borderColor = '#443522';
      }
    }

    modal.style.display = 'block';
  }

  public showDuelPrompt(challengerId: string, challengerName: string): void {
    this.pendingChallengerId = challengerId;
    const modal = document.getElementById('duel-request-modal');
    const textEl = document.getElementById('duel-challenger-text');
    if (textEl) textEl.innerText = `¡${challengerName} te reta a un Duelo de Honor! ¿Aceptas?`;
    if (modal) modal.style.display = 'block';
    SoundManager.getInstance().playImpact();
  }

  public showPlayerTargetCard(player: WorldPlayer): void {
    this.selectedTargetPlayer = player;
    const modal = document.getElementById('player-target-modal');
    const nameEl = document.getElementById('target-player-name');
    const infoEl = document.getElementById('target-player-info');
    if (nameEl) nameEl.innerText = player.name;
    if (infoEl) infoEl.innerText = `Lv. ${player.level} • Reino ${player.kingdom}`;
    if (modal) modal.style.display = 'block';
  }

  public closePlayerTargetCard(): void {
    this.selectedTargetPlayer = null;
    const modal = document.getElementById('player-target-modal');
    if (modal) modal.style.display = 'none';
  }

  public toggleStatusModal(): void {
    const modal = document.getElementById('character-status-modal');
    if (modal) {
      modal.style.display = modal.style.display === 'none' ? 'block' : 'none';
    }
  }

  public updateStats(data: {
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
  }): void {
    if (data.skill_points !== undefined) this.currentSkillPoints = data.skill_points;
    if (data.subclass !== undefined) this.currentSubclass = data.subclass;
    if (data.skill_levels) this.currentSkillLevels = data.skill_levels;
    if (document.getElementById('skills-modal')?.style.display === 'block') {
      this.renderSkillsModal();
    }
    const ptsEl = document.getElementById('stat-points-val');
    if (ptsEl) ptsEl.innerText = data.stat_points.toString();

    const vitEl = document.getElementById('stat-vit-val');
    if (vitEl) vitEl.innerText = data.vit.toString();
    const intEl = document.getElementById('stat-int-val');
    if (intEl) intEl.innerText = data.int_stat.toString();
    const strEl = document.getElementById('stat-str-val');
    if (strEl) strEl.innerText = data.str_stat.toString();
    const dexEl = document.getElementById('stat-dex-val');
    if (dexEl) dexEl.innerText = data.dex.toString();

    // Actualizar barra de EXP y Nivel del HUD principal
    const lvlEl = document.getElementById('mmo-level-badge');
    if (lvlEl) lvlEl.innerText = `Lv. ${data.level}`;
    const expText = document.getElementById('mmo-exp-text');
    if (expText) expText.innerText = `EXP: ${data.exp} / ${data.max_exp}`;
    const expFill = document.getElementById('mmo-exp-fill');
    if (expFill) {
      const pct = Math.min(100, (data.exp / (data.max_exp || 1)) * 100);
      expFill.style.width = `${pct}%`;
    }

    const hpText = document.getElementById('mmo-hp-text');
    if (hpText) hpText.innerText = `${data.hp} / ${data.max_hp} HP`;
    const hpFill = document.getElementById('mmo-hp-fill');
    if (hpFill) {
      const pct = Math.min(100, (data.hp / (data.max_hp || 1)) * 100);
      hpFill.style.width = `${pct}%`;
    }
  }

  public showPartyInvite(leaderId: string, leaderName: string): void {
    this.pendingPartyLeaderId = leaderId;
    const modal = document.getElementById('party-invite-modal');
    const textEl = document.getElementById('party-invite-text');
    if (textEl) textEl.innerText = `${leaderName} te invita a unirte a su grupo de batalla.`;
    if (modal) modal.style.display = 'block';
    SoundManager.getInstance().playButtonClick();
  }

  public showTradePrompt(challengerId: string, challengerName: string): void {
    this.pendingTradeChallengerId = challengerId;
    const modal = document.getElementById('trade-invite-modal');
    const textEl = document.getElementById('trade-invite-text');
    if (textEl) textEl.innerText = `${challengerName} desea comerciar contigo.`;
    if (modal) modal.style.display = 'block';
    SoundManager.getInstance().playButtonClick();
  }

  public showTradeModal(tradeData: any, myPlayerId: string): void {
    const invModal = document.getElementById('trade-invite-modal');
    if (invModal) invModal.style.display = 'none';

    const winModal = document.getElementById('trade-window-modal');
    if (!winModal) return;
    winModal.style.display = 'block';

    const isP1 = tradeData.p1_id === myPlayerId;
    const myItems = isP1 ? tradeData.p1_items : tradeData.p2_items;
    const myYang = isP1 ? tradeData.p1_yang : tradeData.p2_yang;
    const myConfirmed = isP1 ? tradeData.p1_confirmed : tradeData.p2_confirmed;

    const otherName = isP1 ? tradeData.p2_name : tradeData.p1_name;
    const otherItems = isP1 ? tradeData.p2_items : tradeData.p1_items;
    const otherYang = isP1 ? tradeData.p2_yang : tradeData.p1_yang;
    const otherConfirmed = isP1 ? tradeData.p2_confirmed : tradeData.p1_confirmed;

    const otherNameEl = document.getElementById('trade-other-name');
    if (otherNameEl) otherNameEl.innerText = `Ofrenda de ${otherName}`;

    const myStatusEl = document.getElementById('trade-my-status');
    if (myStatusEl) {
      myStatusEl.innerText = myConfirmed ? '✅ Listo' : '⏳ Modificando';
      myStatusEl.style.color = myConfirmed ? '#4ade80' : '#aaa';
    }

    const otherStatusEl = document.getElementById('trade-other-status');
    if (otherStatusEl) {
      otherStatusEl.innerText = otherConfirmed ? '✅ Listo' : '⏳ Modificando';
      otherStatusEl.style.color = otherConfirmed ? '#4ade80' : '#aaa';
    }

    const myYangInput = document.getElementById('trade-my-yang-input') as HTMLInputElement;
    if (myYangInput && document.activeElement !== myYangInput) {
      myYangInput.value = (myYang || 0).toString();
    }

    const myItemsEl = document.getElementById('trade-my-items');
    if (myItemsEl) {
      if (!myItems || myItems.length === 0) {
        myItemsEl.innerHTML = '<span style="color:#666;font-size:11px;">Sin objetos ofrecidos</span>';
      } else {
        myItemsEl.innerHTML = myItems.map((item: any) => `
          <div style="display:flex;align-items:center;gap:6px;background:#18181b;padding:4px;border-radius:4px;border:1px solid #333;">
            <span style="font-size:14px;">${item.icon || '📦'}</span>
            <span style="font-size:11px;color:#ffd700;">${item.name} ${item.upgrade_level > 0 ? '+' + item.upgrade_level : ''}</span>
          </div>
        `).join('');
      }
    }

    const otherYangEl = document.getElementById('trade-other-yang');
    if (otherYangEl) otherYangEl.innerText = `${(otherYang || 0).toLocaleString()} Yang`;

    const otherItemsEl = document.getElementById('trade-other-items');
    if (otherItemsEl) {
      if (!otherItems || otherItems.length === 0) {
        otherItemsEl.innerHTML = '<span style="color:#666;font-size:11px;">Sin objetos ofrecidos</span>';
      } else {
        otherItemsEl.innerHTML = otherItems.map((item: any) => `
          <div style="display:flex;align-items:center;gap:6px;background:#18181b;padding:4px;border-radius:4px;border:1px solid #333;">
            <span style="font-size:14px;">${item.icon || '📦'}</span>
            <span style="font-size:11px;color:#ffd700;">${item.name} ${item.upgrade_level > 0 ? '+' + item.upgrade_level : ''}</span>
          </div>
        `).join('');
      }
    }

    const sel = document.getElementById('trade-inventory-select') as HTMLSelectElement;
    if (sel && this.currentInventory) {
      sel.innerHTML = '<option value="-1">-- Seleccionar Ítem del Inventario --</option>' +
        this.currentInventory.map((item, idx) => {
          if (!item) return '';
          return `<option value="${idx}">${item.name} ${item.upgrade_level > 0 ? '+' + item.upgrade_level : ''}</option>`;
        }).join('');
    }

    const btnConfirm = document.getElementById('btn-trade-confirm') as HTMLButtonElement;
    if (btnConfirm) {
      btnConfirm.innerText = myConfirmed ? '⏳ Esperando confirmación mutua...' : '✅ Confirmar Intercambio';
      btnConfirm.style.background = myConfirmed ? '#2563eb' : '#059669';
    }
  }

  public closeTradeModal(): void {
    const invModal = document.getElementById('trade-invite-modal');
    if (invModal) invModal.style.display = 'none';
    const winModal = document.getElementById('trade-window-modal');
    if (winModal) winModal.style.display = 'none';
    this.pendingTradeChallengerId = null;
  }

  public updateParty(_partyId: string, leaderId: string, members: PartyMemberInfo[]): void {
    const hud = document.getElementById('party-hud');
    const list = document.getElementById('party-members-list');
    if (!hud || !list) return;

    if (members.length <= 1) {
      hud.style.display = 'none';
      return;
    }

    hud.style.display = 'block';
    list.innerHTML = members
      .map((m) => {
        const isLeader = m.id === leaderId;
        const hpPct = Math.min(100, Math.max(0, (m.hp / (m.max_hp || 1)) * 100));
        return `
        <div style="background: rgba(0,0,0,0.5); padding: 4px 6px; border-radius: 4px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
            <span style="font-weight: bold; color: ${isLeader ? '#ffd700' : '#fff'};">
              ${isLeader ? '👑 ' : ''}[Lv.${m.level}] ${m.name}
            </span>
            <span style="font-size: 9px; color: #888;">${m.class}</span>
          </div>
          <div style="height: 4px; background: #333; border-radius: 2px; overflow: hidden;">
            <div style="height: 100%; width: ${hpPct}%; background: #22c55e;"></div>
          </div>
        </div>
      `;
      })
      .join('');
  }

  public disbandParty(): void {
    const hud = document.getElementById('party-hud');
    if (hud) hud.style.display = 'none';
  }

  public showOpenPrivateShopModal(): void {
    const modal = document.getElementById('open-private-shop-modal');
    const itemsList = document.getElementById('shop-setup-items');
    if (!modal || !itemsList) return;

    const availableItems = this.currentInventory
      .map((item, idx) => ({ item, idx }))
      .filter((entry): entry is { item: Item; idx: number } => entry.item !== null);

    if (availableItems.length === 0) {
      alert('No tienes objetos en tu inventario para poner a la venta.');
      return;
    }

    itemsList.innerHTML = availableItems
      .map(
        ({ item, idx }) => `
      <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.4); padding: 4px 8px; border-radius: 4px;">
        <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: #fff; cursor: pointer;">
          <input type="checkbox" class="shop-item-check" data-slot="${idx}" />
          ${renderItemIcon(item.icon)}
          <span>${item.name}</span>
        </label>
        <div style="display: flex; align-items: center; gap: 4px;">
          <input type="number" class="shop-item-price" data-slot="${idx}" value="${item.buy_price || 100}" style="width: 70px; background: #000; border: 1px solid #444; color: #ffd700; font-size: 11px; padding: 2px 4px; border-radius: 3px;" />
          <span style="font-size: 10px; color: #ffd700;">Yang</span>
        </div>
      </div>
    `
      )
      .join('');

    modal.style.display = 'block';
  }


  public showViewPrivateShopModal(shop: WorldPrivateShop): void {
    const modal = document.getElementById('view-private-shop-modal');
    const titleEl = document.getElementById('view-shop-title');
    const sellerEl = document.getElementById('view-shop-seller');
    const listEl = document.getElementById('view-shop-items-list');
    if (!modal || !titleEl || !sellerEl || !listEl) return;

    titleEl.innerText = `🏪 ${shop.title}`;
    sellerEl.innerText = `Vendedor: ${shop.seller_name}`;

    if (shop.items.length === 0) {
      listEl.innerHTML = '<div style="color: #888; font-size: 12px; text-align: center;">Todos los objetos han sido vendidos.</div>';
    } else {
      listEl.innerHTML = shop.items
        .map(
          (listing) => `
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.5); border: 1px solid #ffd700; border-radius: 6px; padding: 6px 10px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            ${renderItemIcon(listing.item.icon, 20)}
            <div>
              <div style="color: #ffd700; font-weight: bold; font-size: 12px;">${listing.item.name}</div>
              <div style="color: #888; font-size: 10px;">${listing.item.description || ''}</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: #ffd700; font-weight: bold; font-size: 12px;">${listing.price.toLocaleString()} Yang</span>
            <button class="btn btn-start btn-buy-shop-item" data-seller="${shop.seller_id}" data-slot="${listing.slot_index}" style="padding: 4px 10px; font-size: 11px;">Comprar</button>
          </div>
        </div>
      `
        )
        .join('');

      listEl.querySelectorAll('.btn-buy-shop-item').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const seller = (e.currentTarget as HTMLElement).dataset.seller;
          const slot = parseInt((e.currentTarget as HTMLElement).dataset.slot || '0', 10);
          if (seller) {
            SoundManager.getInstance().playYangCoin();
            this.onBuyPrivateShopItemRequested?.(seller, slot);
            modal.style.display = 'none';
          }
        });
      });
    }

    modal.style.display = 'block';
  }


  public syncStash(stash: (Item | null)[], stashYang: number): void {
    this.currentStash = stash;
    this.currentStashYang = stashYang;

    const contentEl = document.getElementById('npc-dialog-content');
    const modal = document.getElementById('npc-dialog-modal');
    if (modal && modal.style.display !== 'none' && contentEl && contentEl.querySelector('#storekeeper-ui-root')) {
      this.renderStorekeeperUI(contentEl);
    }
  }

  public syncMarket(listings: MarketListing[]): void {
    this.currentMarketListings = listings;

    const contentEl = document.getElementById('npc-dialog-content');
    const modal = document.getElementById('npc-dialog-modal');
    if (modal && modal.style.display !== 'none' && contentEl && contentEl.querySelector('#market-board-ui-root')) {
      this.renderMarketBoardUI(contentEl);
    }
  }

  private renderStorekeeperUI(container: HTMLElement): void {
    const stashSlots = this.currentStash.length > 0 ? this.currentStash : new Array(24).fill(null);

    container.innerHTML = `
      <div id="storekeeper-ui-root" style="background: rgba(10,12,18,0.7); padding: 12px; border-radius: 8px; border: 1px solid #b8860b; max-height: 480px; overflow-y: auto;">
        <!-- Cabecera de Yang en Almacén -->
        <div style="background: rgba(0,0,0,0.6); padding: 8px 12px; border-radius: 6px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; border: 1px solid #444;">
          <div>
            <div style="font-size: 11px; color: #aaa;">Yang Seguro en Almacén:</div>
            <div style="font-size: 14px; font-weight: bold; color: #ffd700;">🪙 ${this.currentStashYang.toLocaleString()} Yang</div>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <input id="stash-yang-input" type="number" min="1" max="${this.currentYang}" placeholder="Cantidad" style="width: 80px; background: #222; color: #fff; border: 1px solid #666; border-radius: 4px; padding: 4px; font-size: 11px;">
            <button id="btn-stash-deposit-yang" class="btn btn-secondary" style="padding: 4px 8px; font-size: 10px;">Depositar</button>
            <button id="btn-stash-withdraw-yang" class="btn btn-start" style="padding: 4px 8px; font-size: 10px;">Retirar</button>
          </div>
        </div>

        <!-- Casillero de Almacén (24 slots) -->
        <div style="font-family: 'Cinzel', serif; font-size: 12px; font-weight: bold; color: #ffd700; margin-bottom: 6px;">
          📦 COFRE DE ALMACÉN (Haz clic para retirar al inventario)
        </div>
        <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 16px; background: rgba(0,0,0,0.5); padding: 8px; border-radius: 6px;">
          ${stashSlots
            .map((item, idx) => {
              if (item) {
                return `
                  <div class="stash-slot-item" data-slot="${idx}" title="${item.name} (${item.description})" style="aspect-ratio: 1; background: #1e1b2e; border: 1px solid #a855f7; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.1s; user-select: none;">
                    ${renderItemIcon(item.icon, 18)}
                    <span style="font-size: 8px; color: #e9d5ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90%;">${item.upgrade_level > 0 ? `+${item.upgrade_level}` : item.name.slice(0, 5)}</span>
                  </div>
                `;
              }
              return `
                <div style="aspect-ratio: 1; background: rgba(255,255,255,0.03); border: 1px dashed #444; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                  <span style="color: #444; font-size: 10px;">${idx + 1}</span>
                </div>
              `;
            })
            .join('')}
        </div>

        <!-- Tu Inventario (Haz clic para Depositar) -->
        <div style="font-family: 'Cinzel', serif; font-size: 12px; font-weight: bold; color: #38bdf8; margin-bottom: 6px;">
          🎒 TU INVENTARIO (Haz clic para depositar en Almacén)
        </div>
        <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; background: rgba(0,0,0,0.5); padding: 8px; border-radius: 6px;">
          ${this.currentInventory
            .map((item, idx) => {
              if (item) {
                return `
                  <div class="inv-slot-deposit" data-slot="${idx}" title="${item.name} (${item.description})" style="aspect-ratio: 1; background: #182234; border: 1px solid #38bdf8; border-radius: 4px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.1s; user-select: none;">
                    ${renderItemIcon(item.icon, 18)}
                    <span style="font-size: 8px; color: #bae6fd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 90%;">${item.upgrade_level > 0 ? `+${item.upgrade_level}` : item.name.slice(0, 5)}</span>
                  </div>
                `;
              }
              return `
                <div style="aspect-ratio: 1; background: rgba(255,255,255,0.02); border: 1px dashed #333; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                  <span style="color: #333; font-size: 10px;">${idx + 1}</span>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;

    // Eventos de botones
    container.querySelectorAll('.stash-slot-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        const slot = parseInt((e.currentTarget as HTMLElement).dataset.slot || '0', 10);
        SoundManager.getInstance().playButtonClick();
        this.onWithdrawStashItemRequested?.(slot);
      });
    });

    container.querySelectorAll('.inv-slot-deposit').forEach((el) => {
      el.addEventListener('click', (e) => {
        const slot = parseInt((e.currentTarget as HTMLElement).dataset.slot || '0', 10);
        SoundManager.getInstance().playButtonClick();
        this.onDepositStashItemRequested?.(slot);
      });
    });

    const yangInput = container.querySelector('#stash-yang-input') as HTMLInputElement;
    container.querySelector('#btn-stash-deposit-yang')?.addEventListener('click', () => {
      const amount = parseInt(yangInput.value || '0', 10);
      if (amount > 0) {
        SoundManager.getInstance().playYangCoin();
        this.onDepositStashYangRequested?.(amount);
        yangInput.value = '';
      }
    });

    container.querySelector('#btn-stash-withdraw-yang')?.addEventListener('click', () => {
      const amount = parseInt(yangInput.value || '0', 10);
      if (amount > 0) {
        SoundManager.getInstance().playYangCoin();
        this.onWithdrawStashYangRequested?.(amount);
        yangInput.value = '';
      }
    });
  }

  private renderFurnaceUI(container: HTMLElement): void {
    const recipes = [
      { id: 'refine_iron', name: 'Fundir Lingote de Hierro', icon: '⛓️', costYang: 200, mats: [{ name: 'Mena de Hierro', count: 4 }], resultDesc: 'Lingote de Hierro Refinado para armas y equipo.' },
      { id: 'refine_copper', name: 'Fundir Lingote de Cobre', icon: '🟧', costYang: 150, mats: [{ name: 'Mena de Cobre', count: 4 }], resultDesc: 'Lingote de Cobre Maleable para armaduras ligeras.' },
      { id: 'refine_ebony', name: 'Fundir Lingote de Ébano', icon: '⬛', costYang: 400, mats: [{ name: 'Mena de Ébano', count: 3 }], resultDesc: 'Metal de élite militar para forja avanzada.' },
      { id: 'craft_plank', name: 'Cepillar Tablón de Sauce', icon: '🪵', costYang: 100, mats: [{ name: 'Madera de Sauce', count: 3 }], resultDesc: 'Tablón pulido para arcos y empuñaduras.' },
      { id: 'craft_elixir', name: 'Cocinar Carpa Asada', icon: '🐟', costYang: 150, mats: [{ name: 'Carpa Dorada', count: 2 }], resultDesc: 'Elixir nutritivo (+300 HP al instante).' },
      { id: 'craft_fms', name: 'Forjar Espada de Luna Llena', icon: '🌙', costYang: 2500, mats: [{ name: 'Lingote de Hierro', count: 2 }, { name: 'Lingote de Ébano', count: 1 }, { name: 'Tablón de Sauce Pulido', count: 1 }], resultDesc: 'Legendaria arma de filo lunar (+24 Daño).' },
      { id: 'craft_dragon_armor', name: 'Forjar Armadura Placas Dragón', icon: '🐉', costYang: 3000, mats: [{ name: 'Lingote de Ébano', count: 2 }, { name: 'Lingote de Cobre', count: 2 }], resultDesc: 'Coraza carmesí con hombreras doradas (+18 Def, +100 HP).' },
    ];

    container.innerHTML = `
      <div style="background: rgba(10,12,18,0.7); padding: 12px; border-radius: 8px; border: 1px solid #ea580c; max-height: 480px; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <div style="font-family: 'Cinzel', serif; font-size: 13px; font-weight: bold; color: #fb923c;">
            🔥 HORNO DE FUNDICIÓN & TALLER DE CRAFTEO
          </div>
          <div style="font-size: 12px; font-weight: bold; color: #ffd700;">🪙 ${this.currentYang.toLocaleString()} Yang</div>
        </div>
        <div style="font-size: 11px; color: #9ca3af; margin-bottom: 12px;">
          Funde las materias primas extraídas en el valle para forjar lingotes, elixires y legendario equipo de combate:
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${recipes
            .map((rec) => {
              const hasYang = this.currentYang >= rec.costYang;
              let hasAllMats = hasYang;
              const matsHtml = rec.mats
                .map((m) => {
                  const currentCount = this.currentInventory.filter((it) => it && it.name === m.name).length;
                  const ok = currentCount >= m.count;
                  if (!ok) hasAllMats = false;
                  return `<span style="color: ${ok ? '#4ade80' : '#f87171'}; font-size: 10px; margin-right: 6px;">${m.name}: ${currentCount}/${m.count}</span>`;
                })
                .join('');

              return `
                <div style="background: rgba(0,0,0,0.5); border: 1px solid ${hasAllMats ? '#f97316' : '#444'}; border-radius: 6px; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 24px;">${rec.icon}</span>
                    <div>
                      <div style="font-size: 12px; font-weight: bold; color: ${hasAllMats ? '#fed7aa' : '#e5e7eb'};">${rec.name}</div>
                      <div style="font-size: 10px; color: #9ca3af; margin-bottom: 3px;">${rec.resultDesc}</div>
                      <div style="display: flex; align-items: center; flex-wrap: wrap;">
                        ${matsHtml}
                        <span style="color: ${hasYang ? '#ffd700' : '#ef4444'}; font-size: 10px; font-weight: bold;">🪙 ${rec.costYang} Yang</span>
                      </div>
                    </div>
                  </div>
                  <button class="btn btn-craft-recipe ${hasAllMats ? 'btn-start' : 'btn-secondary'}" data-recipe="${rec.id}" style="padding: 6px 12px; font-size: 11px;" ${!hasAllMats ? 'disabled' : ''}>
                    ${hasAllMats ? '¡Forjar!' : 'Faltan Mats'}
                  </button>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;

    container.querySelectorAll('.btn-craft-recipe').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const recipeId = (e.currentTarget as HTMLElement).dataset.recipe;
        if (recipeId) {
          SoundManager.getInstance().playBlacksmithSuccess();
          this.onCraftItemRequested?.(recipeId);
        }
      });
    });
  }

  private renderMarketBoardUI(container: HTMLElement): void {
    container.innerHTML = `
      <div id="market-board-ui-root" style="background: rgba(10,12,18,0.7); padding: 12px; border-radius: 8px; border: 1px solid #eab308; max-height: 480px; overflow-y: auto;">
        <!-- Pestañas del Mercado -->
        <div style="display: flex; gap: 6px; margin-bottom: 12px; border-bottom: 1px solid #444; padding-bottom: 8px;">
          <button id="btn-mkt-tab-browse" class="btn ${this.currentMarketTab === 'browse' ? 'btn-start' : 'btn-secondary'}" style="padding: 4px 10px; font-size: 11px;">🔍 Explorar Ofertas</button>
          <button id="btn-mkt-tab-sell" class="btn ${this.currentMarketTab === 'sell' ? 'btn-start' : 'btn-secondary'}" style="padding: 4px 10px; font-size: 11px;">🏷️ Publicar Objeto</button>
          <button id="btn-mkt-tab-my" class="btn ${this.currentMarketTab === 'my' ? 'btn-start' : 'btn-secondary'}" style="padding: 4px 10px; font-size: 11px;">📋 Mis Publicaciones</button>
        </div>

        <div id="market-tab-content"></div>
      </div>
    `;

    const tabContainer = container.querySelector('#market-tab-content') as HTMLElement;

    container.querySelector('#btn-mkt-tab-browse')?.addEventListener('click', () => {
      this.currentMarketTab = 'browse';
      this.renderMarketBoardUI(container);
    });
    container.querySelector('#btn-mkt-tab-sell')?.addEventListener('click', () => {
      this.currentMarketTab = 'sell';
      this.renderMarketBoardUI(container);
    });
    container.querySelector('#btn-mkt-tab-my')?.addEventListener('click', () => {
      this.currentMarketTab = 'my';
      this.renderMarketBoardUI(container);
    });

    if (this.currentMarketTab === 'browse') {
      if (this.currentMarketListings.length === 0) {
        tabContainer.innerHTML = `
          <div style="text-align: center; color: #888; padding: 24px 0; font-size: 12px;">
            Actualmente no hay ofertas en el Mercado Central. ¡Sé el primero en publicar una!
          </div>
        `;
      } else {
        tabContainer.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 11px; color: #aaa;">
            <span>${this.currentMarketListings.length} ofertas disponibles</span>
            <span style="color: #fbbf24;">(Tasa del 8% deducida al vendedor para control de inflación)</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${this.currentMarketListings
              .map((l) => `
                <div style="background: rgba(0,0,0,0.5); border: 1px solid #ffd700; border-radius: 6px; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    ${renderItemIcon(l.item.icon, 22)}
                    <div>
                      <div style="font-size: 12px; font-weight: bold; color: #ffd700;">
                        ${l.item.upgrade_level > 0 ? `+${l.item.upgrade_level} ` : ''}${l.item.name}
                      </div>
                      <div style="font-size: 10px; color: #aaa;">Vendedor: <span style="color: #60a5fa;">${l.seller_name}</span> | ${l.item.description || ''}</div>
                    </div>
                  </div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 12px; font-weight: bold; color: #ffd700;">🪙 ${l.price.toLocaleString()} Yang</span>
                    <button class="btn btn-start btn-buy-market" data-id="${l.id}" style="padding: 4px 10px; font-size: 11px;">Comprar</button>
                  </div>
                </div>
              `)
              .join('')}
          </div>
        `;

        tabContainer.querySelectorAll('.btn-buy-market').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const id = (e.currentTarget as HTMLElement).dataset.id;
            if (id) {
              SoundManager.getInstance().playYangCoin();
              this.onBuyMarketItemRequested?.(id);
            }
          });
        });
      }
    } else if (this.currentMarketTab === 'sell') {
      const itemsWithSlot = this.currentInventory
        .map((item, idx) => ({ item, slot: idx }))
        .filter((entry) => entry.item !== null);

      tabContainer.innerHTML = `
        <div style="background: rgba(0,0,0,0.5); padding: 10px; border-radius: 6px;">
          <div style="font-size: 12px; font-weight: bold; color: #ffd700; margin-bottom: 8px;">Publicar Objeto en Subasta Pública</div>
          <div style="font-size: 11px; color: #aaa; margin-bottom: 8px;">Selecciona el objeto que deseas vender:</div>
          <select id="mkt-sell-select" style="width: 100%; background: #222; color: #fff; border: 1px solid #b8860b; border-radius: 4px; padding: 6px; font-size: 11px; margin-bottom: 10px;">
            <option value="-1">-- Selecciona un objeto de tu inventario --</option>
            ${itemsWithSlot.map((e) => `<option value="${e.slot}">${e.item!.name} ${e.item!.upgrade_level > 0 ? `+${e.item!.upgrade_level}` : ''}</option>`).join('')}
          </select>

          <div style="font-size: 11px; color: #aaa; margin-bottom: 4px;">Precio de venta (en Yang):</div>
          <input id="mkt-sell-price" type="number" min="10" placeholder="Ej. 1000" style="width: 100%; background: #222; color: #ffd700; border: 1px solid #b8860b; border-radius: 4px; padding: 6px; font-size: 12px; font-weight: bold; margin-bottom: 12px;">

          <div style="background: rgba(20,20,30,0.7); padding: 8px; border-radius: 4px; font-size: 11px; color: #bbb; margin-bottom: 12px;">
            <div>• Tasa de depósito de subasta: <span style="color: #ffd700;">50 Yang</span> (no reembolsable)</div>
            <div>• Impuesto de mercado al vender: <span style="color: #ef4444;">8%</span> (quemado para estabilidad económica)</div>
          </div>

          <button id="btn-mkt-confirm-list" class="btn btn-start" style="width: 100%; padding: 8px; font-size: 12px;">¡PUBLICAR EN EL MERCADO!</button>
        </div>
      `;

      tabContainer.querySelector('#btn-mkt-confirm-list')?.addEventListener('click', () => {
        const sel = tabContainer.querySelector('#mkt-sell-select') as HTMLSelectElement;
        const pr = tabContainer.querySelector('#mkt-sell-price') as HTMLInputElement;
        const slot = parseInt(sel.value, 10);
        const price = parseInt(pr.value || '0', 10);

        if (slot >= 0 && price > 0) {
          SoundManager.getInstance().playYangCoin();
          this.onListMarketItemRequested?.(slot, price);
          this.currentMarketTab = 'browse';
          this.renderMarketBoardUI(container);
        } else {
          alert('Por favor selecciona un objeto y un precio válido superior a 0.');
        }
      });
    } else {
      // Mis Publicaciones
      const myListings = this.currentMarketListings.filter((l) => l.seller_id === this.myPlayerId);
      if (myListings.length === 0) {
        tabContainer.innerHTML = `
          <div style="text-align: center; color: #888; padding: 24px 0; font-size: 12px;">
            No tienes ninguna oferta activa publicada en el Mercado Central.
          </div>
        `;
      } else {
        tabContainer.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${myListings
              .map((l) => `
                <div style="background: rgba(0,0,0,0.5); border: 1px solid #38bdf8; border-radius: 6px; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    ${renderItemIcon(l.item.icon, 22)}
                    <div>
                      <div style="font-size: 12px; font-weight: bold; color: #38bdf8;">${l.item.name}</div>
                      <div style="font-size: 10px; color: #aaa;">Precio fijado: <span style="color: #ffd700;">${l.price.toLocaleString()} Yang</span></div>
                    </div>
                  </div>
                  <button class="btn btn-secondary btn-cancel-mkt" data-id="${l.id}" style="padding: 4px 8px; font-size: 10px;">Cancelar y Recuperar</button>
                </div>
              `)
              .join('')}
          </div>
        `;

        tabContainer.querySelectorAll('.btn-cancel-mkt').forEach((btn) => {
          btn.addEventListener('click', (e) => {
            const id = (e.currentTarget as HTMLElement).dataset.id;
            if (id) {
              SoundManager.getInstance().playButtonClick();
              this.onCancelMarketListingRequested?.(id);
            }
          });
        });
      }
    }
  }

  public toggleSkillsModal(): void {
    const modal = document.getElementById('skills-modal');
    if (!modal) return;
    const isClosed = modal.style.display === 'none' || !modal.style.display;
    modal.style.display = isClosed ? 'block' : 'none';
    if (isClosed) {
      this.renderSkillsModal();
    }
  }

  public renderSkillsModal(): void {
    const bannerTitle = document.getElementById('skills-doctrine-title');
    const bannerSub = document.getElementById('skills-doctrine-sub');
    const listContainer = document.getElementById('skills-list-container');
    if (!listContainer) return;

    if (this.playerLevel < 5) {
      if (bannerTitle) bannerTitle.innerText = `⚔️ Aprendiz Marcial (Nivel ${this.playerLevel})`;
      if (bannerSub) bannerSub.innerHTML = `Nivel actual: <b>Lv. ${this.playerLevel}</b>. Solo cuentas con Ataque Básico. Al alcanzar <b>Nivel 5</b> desbloquearás la selección de Doctrina y ganarás +1 Punto de Habilidad por nivel.`;
    } else if (!this.currentSubclass) {
      if (bannerTitle) bannerTitle.innerText = `✨ ¡Elige tu Doctrina Marcial! (Lv. ${this.playerLevel})`;
      if (bannerSub) bannerSub.innerHTML = `Has alcanzado el nivel 5. Tienes <b>${this.currentSkillPoints} Puntos de Habilidad</b> disponibles para repartir. Selecciona tu camino:`;
    } else {
      if (bannerTitle) bannerTitle.innerText = `⚔️ Doctrina: ${this.currentSubclass.toUpperCase()} • Puntos: ${this.currentSkillPoints}`;
      if (bannerSub) bannerSub.innerHTML = `Puntos disponibles: <b style="color: #4ade80;">${this.currentSkillPoints}</b>. Las habilidades suben con puntos hasta el nivel 20 (M1). A partir de M1 se requiere leer <b>Libros de Habilidad</b>.`;
    }

    // Si tiene nivel >= 5 y no tiene doctrina, mostrar selector de doctrina
    if (this.playerLevel >= 5 && !this.currentSubclass) {
      const doctrines: Record<string, { id: string; name: string; icon: string; desc: string }[]> = {
        Warrior: [
          { id: 'warrior_body', name: 'Guerrero Corporal', icon: '⚔️', desc: 'Aura de Espada y velocidad de ataque devastadora.' },
          { id: 'warrior_mental', name: 'Guerrero Mental', icon: '🛡️', desc: 'Cuerpo Fuerte y defensa inquebrantable que resiste cualquier golpe.' },
        ],
        Sura: [
          { id: 'sura_black', name: 'Sura Magia Negra', icon: '🔮', desc: 'Ataques a distancia oscuros y Protección Oscura protectora.' },
          { id: 'sura_weapon', name: 'Sura Armas Mágicas', icon: '🗡️', desc: 'Hoja Encantada que drena vida en combate cuerpo a cuerpo.' },
        ],
        Ninja: [
          { id: 'ninja_assassin', name: 'Ninja Asesino', icon: '🗡️', desc: 'Golpes críticos fulminantes desde las sombras con dagas.' },
          { id: 'ninja_archer', name: 'Ninja Arquero', icon: '🏹', desc: 'Disparos venenosos de largo alcance y flechas de fuego.' },
        ],
        Shaman: [
          { id: 'shaman_dragon', name: 'Chamán Dragón', icon: '🐉', desc: 'Fuego destructor, Bendición protectora y Fuerza de Dragón.' },
          { id: 'shaman_lightning', name: 'Chamán Relámpago', icon: '⚡', desc: 'Velocidad del viento, relámpagos aturdidores y Curación mágica.' },
        ],
      };

      const myDocs = doctrines[this.selectedClass] || doctrines['Warrior'];
      listContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${myDocs.map((doc) => `
            <div style="background: rgba(0,0,0,0.5); border: 1.5px solid #ffd700; border-radius: 8px; padding: 10px; display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 26px;">${doc.icon}</span>
                <div>
                  <div style="font-family: 'Cinzel', serif; font-size: 13px; font-weight: bold; color: #ffd700;">${doc.name}</div>
                  <div style="font-size: 11px; color: #bbb;">${doc.desc}</div>
                </div>
              </div>
              <button class="btn btn-start btn-choose-subclass" data-subclass="${doc.id}" style="padding: 6px 12px; font-size: 11px; white-space: nowrap;">
                Elegir Camino ➔
              </button>
            </div>
          `).join('')}
        </div>
      `;

      listContainer.querySelectorAll('.btn-choose-subclass').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const subId = (e.currentTarget as HTMLElement).dataset.subclass;
          if (subId) {
            this.onSelectSubclassRequested?.(subId);
          }
        });
      });
      return;
    }

    const skills = getSkillsForPlayer(this.selectedClass, this.playerLevel, this.currentSubclass);

    listContainer.innerHTML = skills
      .map(
        (s) => {
          const currentLvl = this.currentSkillLevels[s.id] || 0;
          let levelBadge = '';
          if (currentLvl >= 30) {
            levelBadge = `<span style="background: linear-gradient(90deg, #dc2626, #b91c1c); color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 10px; border: 1px solid #f87171;">🔥 G1 GRAN MÁSTER</span>`;
          } else if (currentLvl >= 20) {
            const mRank = currentLvl - 19;
            levelBadge = `<span style="background: linear-gradient(90deg, #d97706, #b45309); color: #fff; font-weight: bold; padding: 2px 6px; border-radius: 4px; font-size: 10px; border: 1px solid #fde047;">⭐ M${mRank} MÁSTER</span>`;
          } else {
            levelBadge = `<span style="background: rgba(255,255,255,0.1); color: #cbd5e1; padding: 2px 6px; border-radius: 4px; font-size: 10px;">Nv. ${currentLvl}/20</span>`;
          }

          const canLevelUp = this.currentSkillPoints > 0 && currentLvl < 20;
          const isMaster = currentLvl >= 20;

          return `
      <div class="skill-item-card" data-skill-id="${s.id}" draggable="true" style="display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.45); border: 1px solid ${isMaster ? '#ffd700' : '#4a3b2c'}; border-radius: 6px; padding: 8px 10px; cursor: grab; transition: border-color 0.2s;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 38px; height: 38px; border: 1.5px solid ${isMaster ? '#ffd700' : '#888'}; border-radius: 4px; overflow: hidden; background: #000; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <img src="${s.icon}" style="width: 32px; height: 32px; object-fit: contain; pointer-events: none;" alt="${s.name}" />
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-family: 'Cinzel', serif; font-size: 13px; font-weight: bold; color: #ffd700;">${s.name}</span>
              ${levelBadge}
            </div>
            <div style="display: flex; gap: 6px; font-size: 10px; margin-top: 2px;">
              <span style="background: rgba(37,99,235,0.4); color: #93c5fd; padding: 1px 4px; border-radius: 3px;">${s.apCost} PA</span>
              <span style="background: rgba(16,185,129,0.3); color: #6ee7b7; padding: 1px 4px; border-radius: 3px;">${s.range}</span>
              <span style="background: rgba(239,68,68,0.3); color: #fca5a5; padding: 1px 4px; border-radius: 3px;">${s.damage}</span>
            </div>
            <div style="font-size: 10px; color: ${isMaster ? '#fbbf24' : '#aaa'}; font-style: italic; margin-top: 2px;">
              ${isMaster ? '📖 Requiere Libro de Habilidad para subir a M2..G1' : s.desc}
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 6px; align-items: center;">
          ${canLevelUp ? `
            <button class="btn btn-start btn-upgrade-skill" data-skill-id="${s.id}" title="Gastar 1 punto de habilidad" style="padding: 4px 8px; font-size: 11px; font-weight: bold;">
              ➕ Subir
            </button>
          ` : ''}
          <button class="btn btn-secondary btn-equip-skill" data-skill-id="${s.id}" style="padding: 4px 10px; font-size: 11px; white-space: nowrap;">Equipar ➔</button>
        </div>
      </div>
    `;
        }
      )
      .join('');

    listContainer.querySelectorAll('.btn-upgrade-skill').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const skillId = (e.currentTarget as HTMLElement).dataset.skillId;
        if (skillId) {
          this.onUpgradeSkillRequested?.(skillId);
        }
      });
    });

    // Eventos de drag y clic en botones de equipar
    listContainer.querySelectorAll('.btn-equip-skill').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const skillId = (e.currentTarget as HTMLElement).dataset.skillId;
        const skill = ALL_SKILLS.find((sk) => sk.id === skillId);
        if (!skill) return;

        // Buscar primera ranura vacía o sobreescribir la ranura 0
        let slotIdx = this.assignedQuickslots.findIndex((s) => s === null);
        if (slotIdx === -1) slotIdx = 0;

        this.assignedQuickslots[slotIdx] = { type: 'skill', skill };
        this.renderQuickslots();
        SoundManager.getInstance().playButtonClick();
        this.addChatMessage(`✨ Habilidad [${skill.name}] asignada a la Ranura ${slotIdx + 1} [${slotIdx < 7 ? slotIdx + 1 : 'F' + (slotIdx - 6)}].`);
      });
    });

    listContainer.querySelectorAll('.skill-item-card').forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        const sId = (card as HTMLElement).dataset.skillId;
        if (sId && (e as DragEvent).dataTransfer) {
          (e as DragEvent).dataTransfer!.setData('text/plain', sId);
        }
      });
    });
  }

  public renderQuickslots(): void {
    const slots = document.querySelectorAll('.dofus-slot');
    slots.forEach((slot) => {
      const idx = parseInt((slot as HTMLElement).dataset.slot || '1', 10) - 1;
      const keyLabel = idx < 7 ? `${idx + 1}` : `F${idx - 6}`;
      const entry = this.assignedQuickslots[idx];

      if (entry) {
        if (entry.type === 'skill' && entry.skill) {
          slot.innerHTML = `
            <img src="${entry.skill.icon}" style="width: 26px; height: 26px; object-fit: contain; pointer-events: none;" alt="${entry.skill.name}" />
            <span class="dofus-slot-key">${keyLabel}</span>
          `;
          (slot as HTMLElement).title = `${entry.skill.name} (${entry.skill.damage}) [${keyLabel}]`;
        } else if (entry.type === 'item' && entry.item) {
          slot.innerHTML = `
            <div style="pointer-events: none; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
              ${renderItemIcon(entry.item.icon, 24)}
            </div>
            <span class="dofus-slot-key">${keyLabel}</span>
          `;
          (slot as HTMLElement).title = `${entry.item.name} (${entry.item.item_type}) [${keyLabel}]`;
        }
      } else {
        slot.innerHTML = `<span class="dofus-slot-key">${keyLabel}</span>`;
        (slot as HTMLElement).title = `Ranura ${idx + 1} [${keyLabel}]`;
      }
    });
  }

  public triggerQuickslot(index: number): void {
    if (index < 0 || index >= 14) return;
    const entry = this.assignedQuickslots[index];
    if (!entry) return;

    SoundManager.getInstance().playButtonClick();

    // Feedback visual en la ranura
    const slotEl = document.querySelector(`.dofus-slot[data-slot="${index + 1}"]`);
    if (slotEl) {
      slotEl.classList.add('selected');
      setTimeout(() => slotEl.classList.remove('selected'), 300);
    }

    if (entry.type === 'skill' && entry.skill) {
      const skill = entry.skill;
      if (this.currentMode === 'combat') {
        // Buscar el hechizo del servidor que coincida con esta habilidad (por id o nombre)
        const combatSpell = this.latestCombatSpells.find(
          (s) => s.id === skill.id || s.name.toLowerCase() === skill.name.toLowerCase()
        );
        if (combatSpell) {
          // Seleccionar / deseleccionar
          if (this.selectedSpell?.id === combatSpell.id) {
            this.clearSelectedSpell();
          } else {
            this.selectedSpell = combatSpell;
            if (this.onSpellSelected) this.onSpellSelected(combatSpell);
            // Resaltar slot
            document.querySelectorAll('.dofus-slot').forEach((s) => s.classList.remove('selected'));
            if (slotEl) slotEl.classList.add('selected');
          }
        }
      } else {
        this.addChatMessage(`⚔️ Habilidad [${skill.name}] seleccionada (${skill.damage}, Costo: ${skill.apCost} PA).`);
      }
    } else if (entry.type === 'item' && entry.item) {
      // Buscar el objeto en el inventario actual
      const invIdx = this.currentInventory.findIndex((it) => it && (it.id === entry.item?.id || it.name === entry.item?.name));
      if (invIdx !== -1) {
        const item = this.currentInventory[invIdx]!;
        if (item.item_type === 'Consumable') {
          this.onUseItemRequested?.(invIdx);
          this.addChatMessage(`🧪 Usaste [${item.name}] desde la barra rápida.`);
        } else if (item.item_type === 'Weapon' || item.item_type === 'Armor') {
          this.onEquipItemRequested?.(invIdx);
          this.addChatMessage(`🛡️ Equipaste [${item.name}] desde la barra rápida.`);
        }
      } else {
        this.addChatMessage(`⚠️ Ya no tienes [${entry.item.name}] en tu inventario.`);
      }
    }
  }
}
