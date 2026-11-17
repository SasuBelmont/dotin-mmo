import * as THREE from 'three';
import type {
  ActiveCombatMarker,
  GameState,
  Position,
  Spell,
  WorldGatherNode,
  WorldMob,
  WorldNPC,
  WorldPlayer,
  WorldPrivateShop,
} from './types';
import { NetworkManager } from './network';
import { WorldView } from './scene/WorldView';
import { BoardView } from './scene/BoardView';
import { CharacterManager } from './scene/CharacterView';
import { UIController } from './ui/UIController';
import { CombatVFX } from './scene/CombatVFX';
import { Minimap } from './ui/Minimap';
import { SoundManager } from './audio/SoundManager';
import './style.css';

class GameApp {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private worldView: WorldView;
  private boardView: BoardView;
  private characters: CharacterManager;
  private ui: UIController;
  private network: NetworkManager;
  private combatVFX: CombatVFX;
  private minimap: Minimap;

  private mode: 'overworld' | 'combat' = 'overworld';
  private currentCombatId: string | null = null;
  private latestCombatState: GameState | null = null;
  private isCombatFinished = false;
  private myPlayerId: string | null = null;
  private myWorldPlayer: WorldPlayer | null = null;
  private isInGame: boolean = false; // true sólo después de confirmar el personaje en la Homescreen
  private hasSyncedInitialPosition: boolean = false;

  private latestOtherPlayers: WorldPlayer[] = [];
  private latestMobs: WorldMob[] = [];
  private latestNPCs: WorldNPC[] = [];
  private latestGatherNodes: WorldGatherNode[] = [];
  private latestMarkers: ActiveCombatMarker[] = [];
  private latestShops: WorldPrivateShop[] = [];

  // Variables de control de movimiento fluido (WASD + Click-and-Move)
  private keysPressed: Set<string> = new Set();
  private clickTarget: THREE.Vector3 | null = null;
  private isCurrentlyMoving = false;
  private lastSyncTime = 0;
  private lastPortalWarningTime = 0;
  private lastMinimapRenderTime = 0;
  private renderLoopBound: (time: number) => void;

  // Sistema de Recolección con Barra de Espera y Animación
  private isGathering = false;
  private gatheringTimer: any = null;
  private pendingGatherNodeId: string | null = null;

  // Controles de cámara táctica de combate (Arrastrar/Pan y Zoom)
  private combatCameraBasePos = new THREE.Vector3(16, 21.5, 18.5);
  private combatCameraBaseLookAt = new THREE.Vector3(0, 0.4, 2.5);
  private combatPanOffset = new THREE.Vector3(0, 0, 0);
  private isDraggingCombatCamera = false;
  private dragStartMouse = { x: 0, y: 0 };
  private didDragCombatCamera = false;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private hoveredCombatCell: Position | null = null;

  private lastTime = performance.now();
  // Contador FPS
  private fpsFrameCount = 0;
  private fpsAccTime = 0;
  private fpsDisplayEl: HTMLElement | null = null;

  constructor() {
    const container = document.createElement('div');
    container.id = 'canvas-container';
    document.body.prepend(container);

    // Desactivar antialias nativo si DPR > 1 (supersampling ya actúa como AA) — mejora rendimiento
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    this.renderer = new THREE.WebGLRenderer({
      antialias: dpr <= 1.0,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // Limitar pixel ratio a 1.25 para evitar fillrate 4K en pantallas escaladas (ahorra hasta 60% de GPU)
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // Mucho más rápido y suave que PCFSoftShadowMap
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(this.renderer.domElement);

    // Diagnósticos accesibles
    (window as any).__THREE_GAME_DIAGNOSTICS__ = {
      renderer: this.renderer.info,
      toggleShadows: (enable?: boolean) => {
        this.renderer.shadowMap.enabled = enable !== undefined ? enable : !this.renderer.shadowMap.enabled;
        console.log('Shadows enabled:', this.renderer.shadowMap.enabled);
      },
      setDpr: (dpr: number) => {
        this.renderer.setPixelRatio(dpr);
        console.log('DPR set to:', dpr);
      },
    };

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.005);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 220);
    this.camera.position.set(0, 22, 24);
    this.camera.lookAt(0, 0, 0);

    // Iluminación natural
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 2.0);
    dirLight.position.set(25, 45, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 80;
    // Frustum ajustado a zona visible del jugador (~28x28 unidades)
    dirLight.shadow.camera.left = -28;
    dirLight.shadow.camera.right = 28;
    dirLight.shadow.camera.top = 28;
    dirLight.shadow.camera.bottom = -28;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x3b5323, 0.6);
    this.scene.add(hemiLight);

    // Contador de FPS en pantalla (Badge ligero, fondo semitransparente)
    const fpsEl = document.createElement('div');
    fpsEl.id = 'fps-counter';
    fpsEl.style.cssText = [
      'position:fixed', 'top:6px', 'right:8px', 'z-index:9999',
      'background:rgba(0,0,0,0.55)', 'color:#4ade80',
      'font:bold 12px/1 monospace', 'padding:3px 7px',
      'border-radius:4px', 'pointer-events:none',
      'border:1px solid rgba(74,222,128,0.35)',
    ].join(';');
    fpsEl.textContent = '-- fps';
    document.body.appendChild(fpsEl);
    this.fpsDisplayEl = fpsEl;

    // Submódulos
    this.worldView = new WorldView(this.scene);
    this.boardView = new BoardView(this.scene);
    this.boardView.setVisible(false);

    this.characters = new CharacterManager(this.scene, this.boardView);
    this.characters.setVisible(false);

    this.combatVFX = new CombatVFX();
    this.scene.add(this.combatVFX.group);

    this.ui = new UIController();
    this.ui.setMode('overworld');

    this.minimap = new Minimap();

    // Inicializar personaje local en la plaza central de inmediato
    const initialPlayer: WorldPlayer = {
      id: 'me',
      name: 'Guerrero_1',
      class: 'Warrior',
      kingdom: 'Jinno',
      team: 0,
      pos: { x: 0, z: 0 },
      speed: 8.5,
      level: 1,
      exp: 0,
      yang: 250,
      hp: 150,
      max_hp: 150,
    };
    this.myWorldPlayer = initialPlayer;
    this.worldView.syncPlayers([initialPlayer], 'me');
    this.ui.updateWorldPlayerStats(initialPlayer);

    this.network = new NetworkManager();

    this.setupListeners();
    this.network.connect();

    this.renderLoopBound = this.renderLoop.bind(this);
    requestAnimationFrame(this.renderLoopBound);
  }

  private setupListeners(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Des-enfocar campos de texto al hacer clic en el mundo 3D
    window.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('input') && !target.closest('textarea')) {
        const active = document.activeElement as HTMLElement | null;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          active.blur();
        }
      }
    });

    // Controles WASD y Flechas de Teclado
    window.addEventListener('keydown', (e) => {
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active.offsetParent !== null) {
        return;
      }
      if (!this.isInGame) return; // Bloquear controles durante Homescreen/Creador
      this.keysPressed.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active.offsetParent !== null) {
        return;
      }
      this.keysPressed.delete(e.code);
    });

    window.addEventListener('mousedown', (e) => {
      if (this.mode === 'combat') {
        const target = e.target as HTMLElement;
        if (target.closest('.interactive') || target.closest('.modal-card') || target.closest('#bottom-bar') || target.closest('#top-banner')) {
          return;
        }
        // Arrastre con clic derecho (2), clic central (1) o Shift + clic izquierdo (0)
        if (e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey)) {
          this.isDraggingCombatCamera = true;
          this.dragStartMouse = { x: e.clientX, y: e.clientY };
          this.didDragCombatCamera = false;
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      if (this.mode === 'combat') {
        if (this.isDraggingCombatCamera) {
          const dx = e.clientX - this.dragStartMouse.x;
          const dy = e.clientY - this.dragStartMouse.y;
          if (Math.hypot(dx, dy) > 4) {
            this.didDragCombatCamera = true;
          }
          this.dragStartMouse = { x: e.clientX, y: e.clientY };

          // Paneo isométrico a 45°:
          // Permite desplazar la cuadrícula libremente para ver el sur o el norte sin que lo tape el HUD
          const panSpeed = 0.024 * (this.camera.fov / 38);
          const rightX = -0.7071;
          const rightZ = 0.7071;
          const fwdX = -0.7071;
          const fwdZ = -0.7071;

          this.combatPanOffset.x -= (rightX * dx + fwdX * dy) * panSpeed;
          this.combatPanOffset.z -= (rightZ * dx + fwdZ * dy) * panSpeed;

          // Limitar desplazamiento dentro del rango del tablero táctico (-18..18)
          this.combatPanOffset.x = THREE.MathUtils.clamp(this.combatPanOffset.x, -18, 18);
          this.combatPanOffset.z = THREE.MathUtils.clamp(this.combatPanOffset.z, -18, 18);
        } else {
          this.updateCombatHover();
        }
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDraggingCombatCamera = false;
    });

    // Zoom con rueda del ratón en combate (FOV 24 a 48)
    window.addEventListener('wheel', (e) => {
      if (this.mode === 'combat') {
        const target = e.target as HTMLElement;
        if (target.closest('.modal-card') || target.closest('.dofus-chat-box') || target.closest('#market-inventory-grid')) {
          return;
        }
        e.preventDefault();
        this.camera.fov = THREE.MathUtils.clamp(this.camera.fov + Math.sign(e.deltaY) * 2.5, 24, 48);
        this.camera.updateProjectionMatrix();
      }
    }, { passive: false });

    window.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.interactive') || target.closest('.modal-card')) {
        return;
      }
      if (!this.isInGame) return; // Bloquear clicks en mundo 3D durante homescreen/creator
      if (this.mode === 'combat' && this.didDragCombatCamera) {
        this.didDragCombatCamera = false;
        return; // Evitar disparar movimiento si se estaba arrastrando la pantalla
      }
      this.handleClick();
    });

    // Clic derecho en combate: cancelar selección de hechizo (estilo Dofus)
    window.addEventListener('contextmenu', (e) => {
      if (this.mode === 'combat') {
        e.preventDefault();
        if (!this.didDragCombatCamera) {
          if (this.ui.getSelectedSpell()) {
            this.ui.clearSelectedSpell();
            this.refreshCombatHighlights(null);
            SoundManager.getInstance().playButtonClick();
          }
        }
        this.didDragCombatCamera = false;
      }
    });

    // UI -> Red: Autenticación y Cuentas SQLite
    this.ui.onLoginRequested = (username, password) => {
      this.network.send({
        type: 'Login',
        payload: { username, password },
      });
    };

    this.ui.onRegisterRequested = (username, password) => {
      this.network.send({
        type: 'Register',
        payload: { username, password },
      });
    };

    this.ui.onSelectCharacterRequested = (accountId, name) => {
      this.isInGame = true;
      SoundManager.getInstance().playOverworldBGM();
      this.keysPressed.clear();
      this.network.send({
        type: 'SelectCharacter',
        payload: { account_id: accountId, name },
      });
    };

    this.ui.onCreateCharacterRequested = (accountId, name, characterClass, gender, outfit, team) => {
      this.isInGame = true;
      SoundManager.getInstance().playOverworldBGM();
      this.keysPressed.clear();
      if (this.myWorldPlayer) {
        this.myWorldPlayer.name = name;
        this.myWorldPlayer.class = characterClass;
        this.myWorldPlayer.team = team;
        this.myWorldPlayer.kingdom = team === 0 ? 'Jinno' : 'Shinsoo';
        (this.myWorldPlayer as any).outfit = outfit;
        (this.myWorldPlayer as any).gender = gender;
        this.worldView.removePlayerMesh(this.myWorldPlayer.id);
        this.worldView.removePlayerMesh('me');
        if (this.myPlayerId) {
          this.worldView.removePlayerMesh(this.myPlayerId);
        }
        this.worldView.syncPlayers([this.myWorldPlayer], this.myPlayerId || 'me');
        this.ui.updateWorldPlayerStats(this.myWorldPlayer);
      }

      this.network.send({
        type: 'CreateCharacter',
        payload: {
          account_id: accountId,
          name,
          class: characterClass,
          gender,
          outfit,
          team,
        },
      });
    };

    // UI -> Red (Legacy / Fallback)
    this.ui.onJoinRequested = (name, characterClass, team, outfit = 1, gender = 'male') => {
      this.isInGame = true; // Habilitar controles de juego al confirmar personaje
      SoundManager.getInstance().playOverworldBGM();
      this.keysPressed.clear();
      if (this.myWorldPlayer) {
        this.myWorldPlayer.name = name;
        this.myWorldPlayer.class = characterClass;
        this.myWorldPlayer.team = team;
        this.myWorldPlayer.kingdom = team === 0 ? 'Jinno' : 'Shinsoo';
        (this.myWorldPlayer as any).outfit = outfit;
        (this.myWorldPlayer as any).gender = gender;
        // Forzar eliminación de la malla previa para asegurar reconstrucción con el modelo de la nueva raza
        this.worldView.removePlayerMesh(this.myWorldPlayer.id);
        this.worldView.removePlayerMesh('me');
        if (this.myPlayerId) {
          this.worldView.removePlayerMesh(this.myPlayerId);
        }
        this.worldView.syncPlayers([this.myWorldPlayer], this.myPlayerId || 'me');
        this.ui.updateWorldPlayerStats(this.myWorldPlayer);
      }

      this.network.send({
        type: 'Join',
        payload: { name, class: characterClass, team },
      });
    };

    this.ui.onSendChatRequested = (text) => {
      this.network.send({
        type: 'ChatMessage',
        payload: { text },
      });
    };

    this.ui.onPassTurnRequested = () => {
      if (this.currentCombatId) {
        this.network.send({
          type: 'CombatPassTurn',
          payload: { combat_id: this.currentCombatId },
        });
      }
    };

    this.ui.onStartCombatNowRequested = () => {
      if (this.currentCombatId) {
        this.network.send({
          type: 'StartCombatNow',
          payload: { combat_id: this.currentCombatId },
        });
      }
    };

    this.ui.onSpellSelected = (spell) => {
      this.refreshCombatHighlights(spell);
    };

    // Callbacks de NPCs, Tienda, Herrero y Misiones
    this.ui.onBuyShopItemRequested = (itemId) => {
      this.network.send({
        type: 'BuyShopItem',
        payload: { item_id: itemId },
      });
    };

    this.ui.onUpgradeItemRequested = (slotIndex) => {
      this.network.send({
        type: 'UpgradeItem',
        payload: { slot_index: slotIndex },
      });
    };

    this.ui.onRepairItemRequested = (slotIndex, isEquipped) => {
      this.network.send({
        type: 'RepairItem',
        payload: { slot_index: slotIndex, is_equipped: isEquipped },
      });
    };

    this.ui.onUpgradeSkillRequested = (skillId) => {
      this.network.send({
        type: 'UpgradeSkillWithPoint',
        payload: { skill_id: skillId },
      });
    };

    this.ui.onEquipItemRequested = (slotIndex) => {
      this.network.send({
        type: 'EquipItem',
        payload: { slot_index: slotIndex },
      });
    };

    this.ui.onUnequipItemRequested = (slotType) => {
      this.network.send({
        type: 'UnequipItem',
        payload: { slot_type: slotType },
      });
    };

    this.ui.onUseItemRequested = (slotIndex) => {
      this.network.send({
        type: 'UseItem',
        payload: { slot_index: slotIndex },
      });
    };

    this.ui.onTurnInQuestRequested = (questId) => {
      this.network.send({
        type: 'TurnInQuest',
        payload: { quest_id: questId },
      });
    };

    this.ui.onRequestDuelRequested = (targetId) => {
      this.network.send({
        type: 'RequestDuel',
        payload: { target_player_id: targetId },
      });
    };

    this.ui.onRespondDuelRequested = (challengerId, accept) => {
      this.network.send({
        type: 'RespondDuel',
        payload: { challenger_id: challengerId, accept },
      });
    };

    this.ui.onAllocateStatRequested = (stat) => {
      this.network.send({
        type: 'AllocateStat',
        payload: { stat },
      });
    };

    this.ui.onInvitePartyRequested = (targetId) => {
      this.network.send({
        type: 'InviteParty',
        payload: { target_player_id: targetId },
      });
    };

    this.ui.onRespondPartyRequested = (leaderId, accept) => {
      this.network.send({
        type: 'RespondParty',
        payload: { leader_id: leaderId, accept },
      });
    };

    this.ui.onLeavePartyRequested = () => {
      this.network.send({
        type: 'LeaveParty',
        payload: {},
      });
    };

    this.ui.onOpenPrivateShopRequested = (title, items) => {
      this.network.send({
        type: 'OpenPrivateShop',
        payload: { title, items },
      });
    };

    this.ui.onClosePrivateShopRequested = () => {
      this.network.send({
        type: 'ClosePrivateShop',
        payload: {},
      });
    };

    this.ui.onBuyPrivateShopItemRequested = (sellerId, shopSlotIndex) => {
      this.network.send({
        type: 'BuyPrivateShopItem',
        payload: { seller_id: sellerId, shop_slot_index: shopSlotIndex },
      });
    };

    this.ui.onRequestTradeRequested = (targetId) => {
      this.network.send({
        type: 'RequestTrade',
        payload: { target_player_id: targetId },
      });
    };

    this.ui.onRespondTradeRequested = (challengerId, accept) => {
      this.network.send({
        type: 'RespondTrade',
        payload: { challenger_id: challengerId, accept },
      });
    };

    this.ui.onDepositStashItemRequested = (slotIndex) => {
      this.network.send({
        type: 'DepositStashItem',
        payload: { slot_index: slotIndex },
      });
    };

    this.ui.onWithdrawStashItemRequested = (stashSlotIndex) => {
      this.network.send({
        type: 'WithdrawStashItem',
        payload: { stash_slot_index: stashSlotIndex },
      });
    };

    this.ui.onDepositStashYangRequested = (amount) => {
      this.network.send({
        type: 'DepositStashYang',
        payload: { amount },
      });
    };

    this.ui.onWithdrawStashYangRequested = (amount) => {
      this.network.send({
        type: 'WithdrawStashYang',
        payload: { amount },
      });
    };

    this.ui.onCraftItemRequested = (recipeId) => {
      this.network.send({
        type: 'CraftItem',
        payload: { recipe_id: recipeId },
      });
    };

    this.ui.onListMarketItemRequested = (slotIndex, price) => {
      this.network.send({
        type: 'ListMarketItem',
        payload: { slot_index: slotIndex, price },
      });
    };

    this.ui.onBuyMarketItemRequested = (listingId) => {
      this.network.send({
        type: 'BuyMarketItem',
        payload: { listing_id: listingId },
      });
    };

    this.ui.onCancelMarketListingRequested = (listingId) => {
      this.network.send({
        type: 'CancelMarketListing',
        payload: { listing_id: listingId },
      });
    };

    // Red -> Estado
    this.network.onMessage((msg) => {
      switch (msg.type) {
        case 'AuthSuccess': {
          if (msg.payload.client_id !== this.myPlayerId) break;
          if (msg.payload.character) {
            this.ui.showCharacterSelection(msg.payload.account_id, msg.payload.username, msg.payload.character);
          } else {
            this.ui.showCharacterCreator(msg.payload.account_id, msg.payload.username);
          }
          break;
        }

        case 'AuthError': {
          if (msg.payload.client_id !== this.myPlayerId) break;
          this.ui.showAuthError(msg.payload.message);
          break;
        }

        case 'Welcome': {
          this.myPlayerId = msg.payload.your_id;
          this.ui.setMyPlayerId(this.myPlayerId);
          this.worldView.syncNPCs(msg.payload.npcs);
          this.worldView.syncMobs(msg.payload.mobs);
          this.worldView.syncGatherNodes(msg.payload.gather_nodes);
          this.worldView.syncMarkers(msg.payload.markers);
          this.ui.syncMarket(msg.payload.market_listings);

          this.latestNPCs = msg.payload.npcs;
          this.latestMobs = msg.payload.mobs;
          this.latestGatherNodes = msg.payload.gather_nodes || [];
          this.latestMarkers = msg.payload.markers;

          const others = msg.payload.players.filter((p) => p.id !== this.myPlayerId);
          this.latestOtherPlayers = others;
          this.worldView.syncOtherPlayers(others);

          const me = msg.payload.players.find((p) => p.id === this.myPlayerId);
          if (me && this.myWorldPlayer) {
            if (!this.hasSyncedInitialPosition) {
              this.hasSyncedInitialPosition = true;
              this.myWorldPlayer.pos = { ...me.pos };
            }
            this.myWorldPlayer.id = this.myPlayerId;
            this.myWorldPlayer.name = me.name;
            this.myWorldPlayer.class = me.class;
            this.myWorldPlayer.team = me.team;
            this.myWorldPlayer.kingdom = me.kingdom;
            this.myWorldPlayer.level = me.level;
            this.myWorldPlayer.exp = me.exp;
            this.myWorldPlayer.yang = me.yang;
            this.myWorldPlayer.hp = me.hp;
            this.myWorldPlayer.max_hp = me.max_hp;
            if (me.outfit) (this.myWorldPlayer as any).outfit = me.outfit;
            if (me.gender) (this.myWorldPlayer as any).gender = me.gender;
            this.worldView.syncPlayers([this.myWorldPlayer], this.myPlayerId || 'me');
            this.ui.updateWorldPlayerStats(this.myWorldPlayer);
          }
          break;
        }

        case 'WorldUpdate': {
          this.worldView.syncMobs(msg.payload.mobs);
          this.worldView.syncGatherNodes(msg.payload.gather_nodes);
          this.worldView.syncMarkers(msg.payload.markers);

          this.latestMobs = msg.payload.mobs;
          this.latestGatherNodes = msg.payload.gather_nodes || [];
          this.latestMarkers = msg.payload.markers;

          // Sincronizar otros jugadores suavemente
          const others = msg.payload.players.filter((p) => p.id !== this.myPlayerId && p.id !== 'me');
          this.latestOtherPlayers = others;
          this.worldView.syncOtherPlayers(others);

          const me = msg.payload.players.find((p) => p.id === this.myPlayerId);
          if (me && this.myWorldPlayer) {
            if (!this.hasSyncedInitialPosition) {
              this.hasSyncedInitialPosition = true;
              this.myWorldPlayer.pos = { ...me.pos };
            }
            this.myWorldPlayer.level = me.level;
            this.myWorldPlayer.exp = me.exp;
            this.myWorldPlayer.yang = me.yang;
            this.myWorldPlayer.hp = me.hp;
            this.myWorldPlayer.max_hp = me.max_hp;
            this.myWorldPlayer.name = me.name;
            this.myWorldPlayer.class = me.class;
            this.myWorldPlayer.team = me.team;
            this.myWorldPlayer.kingdom = me.kingdom;
            if (me.outfit) (this.myWorldPlayer as any).outfit = me.outfit;
            if (me.gender) (this.myWorldPlayer as any).gender = me.gender;
            this.worldView.syncPlayers([this.myWorldPlayer], this.myPlayerId || 'me');
            this.ui.updateWorldPlayerStats(this.myWorldPlayer);
          }
          break;
        }

        case 'EnteredCombat':
          this.ui.playCombatTransition(() => {
            this.enterCombatMode(msg.payload.combat_id, msg.payload.state, msg.payload.is_leader);
          });
          break;

        case 'CombatStateUpdate':
          if (this.currentCombatId === msg.payload.combat_id) {
            this.latestCombatState = msg.payload.state;
            this.characters.syncPlayers(msg.payload.state.players);
            this.ui.updateCombatState(msg.payload.state, false);
            this.refreshCombatHighlights(this.ui.getSelectedSpell());

            // Marcar celda del jugador que tiene el turno activo (estilo Dofus)
            const activeId = msg.payload.state.turn_order[msg.payload.state.current_turn_index];
            const activePlayer = msg.payload.state.players.find((p) => p.id === activeId);
            if (activePlayer && activePlayer.is_alive) {
              this.boardView.setActiveTurnIndicator(activePlayer.pos);
            } else {
              this.boardView.setActiveTurnIndicator(null);
            }
          }
          break;

        case 'CombatPlayerMoved': {
          if (this.currentCombatId === msg.payload.combat_id) {
            this.characters.animatePath(msg.payload.player_id, msg.payload.path, () => {
              if (this.latestCombatState) {
                const activeId = this.latestCombatState.turn_order[this.latestCombatState.current_turn_index];
                if (activeId === msg.payload.player_id && msg.payload.path.length > 0) {
                  const lastPos = msg.payload.path[msg.payload.path.length - 1];
                  this.boardView.setActiveTurnIndicator(lastPos);
                }
              }
            });
          }
          break;
        }

        case 'CombatSpellCast': {
          if (this.currentCombatId === msg.payload.combat_id) {
            const res = msg.payload.result;
            const targetPos = this.boardView.gridToWorld(res.target_pos.x, res.target_pos.y);

            this.characters.playSpellCast(res.caster_id, res.target_pos, res.spell.effect_key);

            if (res.is_target_dead || res.target_new_hp <= 0) {
              if (res.affected_player_id) {
                this.characters.playDeath(res.affected_player_id);
              }
            }

            if (res.damage > 0) {
              const isCrit = res.damage >= 35;
              this.combatVFX.showFloatingText(targetPos, isCrit ? `¡CRÍTICO! -${res.damage}` : `-${res.damage}`, '#ef4444', isCrit);
              SoundManager.getInstance().playImpact();

              const sId = res.spell.id.toLowerCase();
              if (sId.includes('corte_tres') || sId.includes('tres_maneras') || sId.includes('samyeon')) {
                SoundManager.getInstance().playSlash();
                this.combatVFX.playTripleSlashVFX(targetPos);
              } else if (sId.includes('giro') || sId.includes('palbang') || sId.includes('spin')) {
                SoundManager.getInstance().playSlash();
                this.combatVFX.playGiroVFX(targetPos);
              } else if (sId.includes('corte') || sId.includes('espada') || sId.includes('ataque')) {
                SoundManager.getInstance().playSlash();
                this.combatVFX.playSlashVFX(targetPos);
              } else if (sId.includes('llama') || sId.includes('dragon') || sId.includes('fuego')) {
                SoundManager.getInstance().playFire();
                this.combatVFX.playFireExplosion(targetPos);
              } else {
                this.combatVFX.playMetinPulse(targetPos);
              }
            } else if (res.heal > 0) {
              this.combatVFX.showFloatingText(targetPos, `+${res.heal} HP`, '#4ade80');
              SoundManager.getInstance().playHeal();
              this.combatVFX.playHealVFX(targetPos);
            } else if (res.spell.is_self_buff) {
              this.combatVFX.showFloatingText(targetPos, `${res.spell.name}!`, '#fbbf24');
              SoundManager.getInstance().playHeal();
              const sId = res.spell.id.toLowerCase();
              if (sId.includes('aura') || sId.includes('geomgyeong')) {
                this.combatVFX.playAuraVFX(targetPos);
              }
            }
          }
          break;
        }

        case 'DuelRequested':
          this.ui.showDuelPrompt(msg.payload.challenger_id, msg.payload.challenger_name);
          break;

        case 'DuelResponse':
          if (!msg.payload.accepted) {
            this.ui.addChatMessage(`❌ ${msg.payload.target_name} ha rechazado el Duelo de Honor.`);
          }
          break;

        case 'CombatTurnChanged': {
          if (this.currentCombatId === msg.payload.combat_id) {
            if (this.latestCombatState) {
              const idx = this.latestCombatState.turn_order.indexOf(msg.payload.active_player_id);
              if (idx !== -1) {
                this.latestCombatState.current_turn_index = idx;
                this.latestCombatState.turn_count = msg.payload.turn_count;
              }
            }
            this.ui.onCombatTurnChanged(msg.payload.active_player_id, msg.payload.turn_count);
            if (this.latestCombatState) {
              this.ui.updateCombatState(this.latestCombatState, false);
            }
            this.refreshCombatHighlights(this.ui.getSelectedSpell());
          }
          break;
        }

        case 'ExitedCombat':
          this.isCombatFinished = true;
          this.hoveredCombatCell = null;
          this.boardView.clearMoveHighlights();
          this.boardView.clearSpellHighlights();
          // Esperar 1.8s para que la animación de muerte del monstruo o personaje se reproduzca completa
          setTimeout(() => {
            if (msg.payload.is_victory) {
              this.ui.showCombatVictory(
                msg.payload.exp_gained,
                msg.payload.yang_gained,
                msg.payload.dropped_items,
                () => {
                  this.exitCombatMode();
                }
              );
            } else {
              this.ui.showCombatDefeat(() => {
                this.exitCombatMode();
              });
            }
          }, 1800);
          break;

        case 'ChatBroadcast':
          this.ui.addChatMessage(msg.payload.message);
          break;

        case 'ActionError':
          if (!msg.payload.message.includes('Destino inalcanzable')) {
            this.ui.addChatMessage(`⚠️ ${msg.payload.message}`);
          }
          break;

        case 'NPCDialog':
          this.ui.showNPCDialog(msg.payload);
          break;

        case 'UpgradeResult':
          this.ui.showUpgradeResult(msg.payload);
          break;

        case 'RepairResult':
          this.ui.showRepairResult(msg.payload);
          break;

        case 'InventorySync':
          this.ui.syncInventory(msg.payload);
          if (this.myWorldPlayer) {
            this.myWorldPlayer.yang = msg.payload.yang;
            this.ui.updateWorldPlayerStats(this.myWorldPlayer);
          }
          break;

        case 'StatsSync':
          this.ui.updateStats(msg.payload);
          if (this.myWorldPlayer) {
            this.myWorldPlayer.level = msg.payload.level;
            this.myWorldPlayer.exp = msg.payload.exp;
            this.myWorldPlayer.max_exp = msg.payload.max_exp;
            this.myWorldPlayer.hp = msg.payload.hp;
            this.myWorldPlayer.max_hp = msg.payload.max_hp;
            this.myWorldPlayer.stat_points = msg.payload.stat_points;
            this.myWorldPlayer.vit = msg.payload.vit;
            this.myWorldPlayer.int_stat = msg.payload.int_stat;
            this.myWorldPlayer.str_stat = msg.payload.str_stat;
            this.myWorldPlayer.dex = msg.payload.dex;
            this.ui.updateWorldPlayerStats(this.myWorldPlayer);
          }
          break;

        case 'PartyInviteReceived':
          this.ui.showPartyInvite(msg.payload.leader_id, msg.payload.leader_name);
          break;

        case 'PartyUpdate':
          this.ui.updateParty(msg.payload.party_id, msg.payload.leader_id, msg.payload.members);
          break;

        case 'PartyDisbanded':
          this.ui.disbandParty();
          break;

        case 'PrivateShopsUpdate':
          this.latestShops = msg.payload.shops;
          this.worldView.syncPrivateShops(this.latestShops);
          break;

        case 'GatherResult': {
          if (msg.payload.success) {
            SoundManager.getInstance().playImpact();
            this.ui.addChatMessage(msg.payload.message);
          }
          break;
        }

        case 'CraftResult': {
          if (msg.payload.success) {
            SoundManager.getInstance().playBlacksmithSuccess();
            this.ui.addChatMessage(msg.payload.message);
          }
          break;
        }

        case 'StashSync': {
          this.ui.syncStash(msg.payload.stash, msg.payload.stash_yang);
          break;
        }

        case 'MarketSync': {
          this.ui.syncMarket(msg.payload.listings);
          break;
        }

        case 'MarketBuyResult': {
          if (msg.payload.success) {
            SoundManager.getInstance().playYangCoin();
            this.ui.addChatMessage(msg.payload.message);
          }
          break;
        }
      }
    });
  }

  private enterCombatMode(combatId: string, state: GameState, isLeader: boolean): void {
    this.mode = 'combat';
    this.currentCombatId = combatId;
    this.latestCombatState = state;
    this.isCombatFinished = false;
    this.clickTarget = null;
    this.isCurrentlyMoving = false;

    // Música de combate auténtica de Metin2
    SoundManager.getInstance().playCombatBGM();

    this.worldView.setVisible(false);
    this.boardView.setVisible(true);
    this.characters.setVisible(true);
    this.boardView.buildMap(state.map);

    // Pasar outfit/gender del jugador local al CharacterManager antes de sincronizar
    if (this.myPlayerId && this.myWorldPlayer) {
      this.characters.setLocalPlayerInfo(
        this.myPlayerId,
        (this.myWorldPlayer as any).outfit || 1,
        (this.myWorldPlayer as any).gender || undefined
      );
    }

    this.characters.syncPlayers(state.players);

    this.ui.setMode('combat');
    this.ui.updateCombatState(state, isLeader);

    // Marcar celda del personaje activo inicial
    const activeId = state.turn_order[state.current_turn_index];
    const activePlayer = state.players.find((p) => p.id === activeId);
    if (activePlayer && activePlayer.is_alive) {
      this.boardView.setActiveTurnIndicator(activePlayer.pos);
    }

    // Cámara isométrica táctica Dofus (diagonal 45° exacto — las casillas se ven como rombos auténticos)
    // Encuadre elevado y centrado hacia el sur para dejar margen generoso sobre la barra inferior
    this.combatPanOffset.set(0, 0, 0);
    this.camera.fov = 38;
    this.camera.updateProjectionMatrix();
    this.camera.position.copy(this.combatCameraBasePos);
    this.camera.lookAt(this.combatCameraBaseLookAt);
  }

  private exitCombatMode(): void {
    this.mode = 'overworld';
    this.currentCombatId = null;
    this.latestCombatState = null;
    this.isCombatFinished = false;
    this.clickTarget = null;
    this.isCurrentlyMoving = false;

    // Música de overworld de Metin2
    SoundManager.getInstance().playOverworldBGM();

    // Restaurar FOV del mundo abierto
    this.camera.fov = 45;
    this.camera.updateProjectionMatrix();

    this.boardView.setActiveTurnIndicator(null);
    this.boardView.clearMoveHighlights();
    this.boardView.clearSpellHighlights();

    this.worldView.setVisible(true);
    this.boardView.setVisible(false);
    this.characters.setVisible(false);
    this.ui.setMode('overworld');
    this.ui.clearSelectedSpell();
  }

  private handleClick(): void {
    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (this.mode === 'overworld') {
      // 1. Raycast contra Jugadores, Mobs, NPCs o Marcadores de Combate
      const intersects = this.raycaster.intersectObjects(this.worldView.group.children, true);
      for (const hit of intersects) {
        let curr: THREE.Object3D | null = hit.object;

        // Comprobar que ningún ancestro sea invisible (ej: mob derrotado / en combate)
        let isVisibleHierarchy = true;
        let checkVis: THREE.Object3D | null = curr;
        while (checkVis && checkVis !== this.worldView.group) {
          if (!checkVis.visible) {
            isVisibleHierarchy = false;
            break;
          }
          checkVis = checkVis.parent;
        }
        if (!isVisibleHierarchy) continue;

        while (curr && curr !== this.worldView.group) {
          if (curr.userData && curr.userData.playerId && !curr.userData.isMe) {
            const pl = this.latestOtherPlayers.find((p) => p.id === curr!.userData.playerId);
            if (pl) {
              this.ui.showPlayerTargetCard(pl);
              SoundManager.getInstance().playButtonClick();
              return;
            }
          }
          if (curr.userData && curr.userData.shopSellerId) {
            const shop = this.latestShops.find((s) => s.seller_id === curr!.userData.shopSellerId);
            if (shop) {
              this.ui.showViewPrivateShopModal(shop);
              SoundManager.getInstance().playButtonClick();
              return;
            }
          }
          if (curr.userData && curr.userData.npcId) {
            this.network.send({
              type: 'InteractNPC',
              payload: { npc_id: curr.userData.npcId },
            });
            return;
          }
          if (curr && curr.userData && curr.userData.gatherNodeId) {
            const nodeId = curr.userData.gatherNodeId;
            const node = this.latestGatherNodes.find((n) => n.id === nodeId);
            if (node && this.myWorldPlayer) {
              const dist = Math.hypot(node.pos.x - this.myWorldPlayer.pos.x, node.pos.z - this.myWorldPlayer.pos.z);
              if (dist <= 3.5) {
                this.startGathering(node);
              } else {
                this.cancelGathering();
                this.pendingGatherNodeId = node.id;
                this.clickTarget = new THREE.Vector3(node.pos.x, 0, node.pos.z);
              }
            }
            return;
          }
          if (curr.userData && curr.userData.mobId) {
            this.cancelGathering();
            this.ui.playCombatTransition();
            this.network.send({
              type: 'StartMobCombat',
              payload: { mob_id: curr.userData.mobId },
            });
            return;
          }
          if (curr.userData && curr.userData.combatId) {
            this.cancelGathering();
            this.ui.playCombatTransition();
            this.network.send({
              type: 'JoinCombat',
              payload: { combat_id: curr.userData.combatId },
            });
            return;
          }
          curr = curr.parent;
        }
      }

      // 2. Click-and-Move fluido en el suelo
      this.cancelGathering();
      const hitPoint = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.groundPlane, hitPoint)) {
        const clamped = this.clampMapBounds(hitPoint.x, hitPoint.z, performance.now());
        hitPoint.x = clamped.x;
        hitPoint.z = clamped.z;
        this.clickTarget = hitPoint.clone();
        this.worldView.showClickIndicator(hitPoint);
        SoundManager.getInstance().playButtonClick();
        if (this.myWorldPlayer) {
          this.network.send({
            type: 'WorldSyncPos',
            payload: {
              pos: this.myWorldPlayer.pos,
              target: { x: hitPoint.x, z: hitPoint.z },
            },
          });
        }
      }
    } else {
      // Modo Combate Táctico
      if (this.isCombatFinished || !this.hoveredCombatCell || !this.latestCombatState || !this.myPlayerId || !this.currentCombatId) {
        return;
      }

      if (this.latestCombatState.status !== 'InBattle') {
        return;
      }

      const activeId = this.latestCombatState.turn_order[this.latestCombatState.current_turn_index];
      if (activeId !== this.myPlayerId) {
        return;
      }

      const selectedSpell = this.ui.getSelectedSpell();
      if (selectedSpell) {
        this.network.send({
          type: 'CombatCastSpell',
          payload: {
            combat_id: this.currentCombatId,
            spell_id: selectedSpell.id,
            target: this.hoveredCombatCell,
          },
        });
        this.ui.clearSelectedSpell();
        this.refreshCombatHighlights(null);
      } else {
        // Moverse: solo si es mi turno, tengo PM > 0, la casilla destino NO está ocupada, es transitable y está en rango de PM
        const myPlayer = this.latestCombatState.players.find((p) => p.id === this.myPlayerId);
        if (!myPlayer || !myPlayer.is_alive || myPlayer.pm <= 0) return;

        const dist = Math.abs(this.hoveredCombatCell!.x - myPlayer.pos.x) + Math.abs(this.hoveredCombatCell!.y - myPlayer.pos.y);
        if (dist <= 0 || dist > myPlayer.pm) return;

        const isOccupied = this.latestCombatState.players.some(
          (p) => p.is_alive && p.pos.x === this.hoveredCombatCell!.x && p.pos.y === this.hoveredCombatCell!.y
        );
        const cellData = this.latestCombatState.map.cells.find(
          (c) => c.x === this.hoveredCombatCell!.x && c.y === this.hoveredCombatCell!.y
        );
        if (isOccupied || (cellData && !cellData.is_walkable)) {
          return;
        }

        this.network.send({
          type: 'CombatMove',
          payload: {
            combat_id: this.currentCombatId,
            target: this.hoveredCombatCell,
          },
        });
      }
    }
  }

  private updateCombatHover(): void {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hitPoint = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, hitPoint);

    if (hit) {
      const cell = this.boardView.worldToGrid(hitPoint);
      this.hoveredCombatCell = cell;
      this.boardView.setHoverTile(cell);
    } else {
      this.hoveredCombatCell = null;
      this.boardView.setHoverTile(null);
    }
  }

  private refreshCombatHighlights(selectedSpell: Spell | null): void {
    if (!this.latestCombatState || !this.myPlayerId) return;

    const myPlayer = this.latestCombatState.players.find((p) => p.id === this.myPlayerId);
    const activeId = this.latestCombatState.turn_order[this.latestCombatState.current_turn_index];
    const isMyTurn = myPlayer && activeId === this.myPlayerId && myPlayer.is_alive;

    if (!isMyTurn || !myPlayer) {
      this.boardView.clearMoveHighlights();
      this.boardView.clearSpellHighlights();
      return;
    }

    if (selectedSpell) {
      this.boardView.clearMoveHighlights();
      const spellCells: Position[] = [];
      for (const cell of this.latestCombatState.map.cells) {
        const dist = Math.abs(cell.x - myPlayer.pos.x) + Math.abs(cell.y - myPlayer.pos.y);
        const isLinear = cell.x === myPlayer.pos.x || cell.y === myPlayer.pos.y;
        if (dist >= selectedSpell.min_range && dist <= selectedSpell.max_range) {
          if (!selectedSpell.is_linear || isLinear) {
            spellCells.push({ x: cell.x, y: cell.y });
          }
        }
      }
      this.boardView.showSpellRangeTiles(spellCells);
    } else {
      this.boardView.clearSpellHighlights();
      const reachable: Position[] = [];
      const occupied = this.latestCombatState.players.filter((p) => p.is_alive).map((p) => p.pos);

      for (const cell of this.latestCombatState.map.cells) {
        if (!cell.is_walkable) continue;
        const dist = Math.abs(cell.x - myPlayer.pos.x) + Math.abs(cell.y - myPlayer.pos.y);
        if (dist > 0 && dist <= myPlayer.pm) {
          const isOccupied = occupied.some((o) => o.x === cell.x && o.y === cell.y);
          if (!isOccupied) {
            reachable.push({ x: cell.x, y: cell.y });
          }
        }
      }
      this.boardView.showReachableTiles(reachable);
    }
  }

  private renderLoop(time: number): void {
    requestAnimationFrame(this.renderLoopBound);

    const delta = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    // Contador FPS (actualiza cada 500ms sin coste visible)
    this.fpsAccTime += delta;
    this.fpsFrameCount++;
    if (this.fpsAccTime >= 0.5) {
      const fps = Math.round(this.fpsFrameCount / this.fpsAccTime);
      if (this.fpsDisplayEl) {
        this.fpsDisplayEl.textContent = `${fps} fps`;
        this.fpsDisplayEl.style.color = fps >= 55 ? '#4ade80' : fps >= 30 ? '#fbbf24' : '#f87171';
      }
      this.fpsFrameCount = 0;
      this.fpsAccTime = 0;
    }

    this.combatVFX.update(delta);

    if (this.mode === 'overworld') {
      this.worldView.update(delta);

      this.minimap.setVisible(true);
      if (time - this.lastMinimapRenderTime > 90) {
        this.lastMinimapRenderTime = time;
        const rot = this.worldView.getLocalPlayerMesh()?.rotation.y || 0;
        this.minimap.render(
          this.myWorldPlayer ? this.myWorldPlayer.pos : null,
          rot,
          this.latestOtherPlayers,
          this.latestMobs,
          this.latestNPCs,
          this.latestMarkers,
          this.latestGatherNodes
        );
      }

      if (this.myWorldPlayer) {
        // 1. Detección de teclas WASD / Flechas
        let inputX = 0;
        let inputZ = 0;

        if (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp')) inputZ -= 1;
        if (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown')) inputZ += 1;
        if (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft')) inputX -= 1;
        if (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight')) inputX += 1;

        const hasWASD = inputX !== 0 || inputZ !== 0;

        if (hasWASD) {
          this.cancelGathering();
          this.clickTarget = null; // Teclas tienen prioridad y cancelan destino de clic
          const len = Math.hypot(inputX, inputZ);
          inputX /= len;
          inputZ /= len;

          const speed = this.myWorldPlayer.speed || 8.5;
          const rawX = this.myWorldPlayer.pos.x + inputX * speed * delta;
          const rawZ = this.myWorldPlayer.pos.z + inputZ * speed * delta;
          const clamped = this.clampMapBounds(rawX, rawZ, time);
          this.myWorldPlayer.pos.x = clamped.x;
          this.myWorldPlayer.pos.z = clamped.z;

          const facingAngle = Math.atan2(inputX, inputZ);
          this.worldView.updatePlayerVisual(
            this.myPlayerId || 'me',
            this.myWorldPlayer.pos,
            true,
            facingAngle,
            delta
          );
          this.isCurrentlyMoving = true;
        } else if (this.clickTarget) {
          // Si el jugador iba a recolectar un nodo, comprobar distancia
          if (this.pendingGatherNodeId && this.myWorldPlayer) {
            const pNode = this.latestGatherNodes.find((n) => n.id === this.pendingGatherNodeId);
            if (pNode) {
              const distToNode = Math.hypot(pNode.pos.x - this.myWorldPlayer.pos.x, pNode.pos.z - this.myWorldPlayer.pos.z);
              if (distToNode <= 3.5) {
                this.clickTarget = null;
                this.isCurrentlyMoving = false;
                this.startGathering(pNode);
              }
            }
          }

          if (this.clickTarget) {
            // 2. Click-and-Move fluido
            const dx = this.clickTarget.x - this.myWorldPlayer.pos.x;
            const dz = this.clickTarget.z - this.myWorldPlayer.pos.z;
            const dist = Math.hypot(dx, dz);

            if (dist > 0.15) {
              const speed = this.myWorldPlayer.speed || 8.5;
              const step = Math.min(speed * delta, dist);
              const rawX = this.myWorldPlayer.pos.x + (dx / dist) * step;
              const rawZ = this.myWorldPlayer.pos.z + (dz / dist) * step;
              const clamped = this.clampMapBounds(rawX, rawZ, time);
              this.myWorldPlayer.pos.x = clamped.x;
              this.myWorldPlayer.pos.z = clamped.z;

              const facingAngle = Math.atan2(dx, dz);
              this.worldView.updatePlayerVisual(
                this.myPlayerId || 'me',
                this.myWorldPlayer.pos,
                true,
                facingAngle,
                delta
              );
              this.isCurrentlyMoving = true;
            } else {
              const clamped = this.clampMapBounds(this.clickTarget.x, this.clickTarget.z, time);
              this.myWorldPlayer.pos.x = clamped.x;
              this.myWorldPlayer.pos.z = clamped.z;
              this.clickTarget = null;
              this.isCurrentlyMoving = false;
              this.worldView.updatePlayerVisual(
                this.myPlayerId || 'me',
                this.myWorldPlayer.pos,
                false,
                0,
                delta
              );
              this.network.send({
                type: 'WorldSyncPos',
                payload: { pos: this.myWorldPlayer.pos, target: undefined },
              });
            }
          }
        } else if (this.isCurrentlyMoving) {
          // Detenido
          this.isCurrentlyMoving = false;
          this.worldView.updatePlayerVisual(
            this.myPlayerId || 'me',
            this.myWorldPlayer.pos,
            false,
            0,
            delta
          );
          this.network.send({
            type: 'WorldSyncPos',
            payload: { pos: this.myWorldPlayer.pos, target: undefined },
          });
        }

        // Sincronizar periódicamente con el servidor (12 veces por segundo)
        if (this.isCurrentlyMoving && time - this.lastSyncTime > 80) {
          this.lastSyncTime = time;
          this.network.send({
            type: 'WorldSyncPos',
            payload: {
              pos: this.myWorldPlayer.pos,
              target: this.clickTarget ? { x: this.clickTarget.x, z: this.clickTarget.z } : undefined,
            },
          });
        }

        // Cámara cercana con interpolación exponencial suave (elimina 100% de saltos y micro-stutter)
        const targetCamX = this.myWorldPlayer.pos.x;
        const targetCamY = 13.5;
        const targetCamZ = this.myWorldPlayer.pos.z + 12.5;

        const damp = 1 - Math.exp(-22 * delta);
        this.camera.position.x += (targetCamX - this.camera.position.x) * damp;
        this.camera.position.y += (targetCamY - this.camera.position.y) * damp;
        this.camera.position.z += (targetCamZ - this.camera.position.z) * damp;

        this.camera.lookAt(this.myWorldPlayer.pos.x, 1.2, this.myWorldPlayer.pos.z);
      } else {
        this.camera.lookAt(0, 0, 0);
      }
    } else {
      this.minimap.setVisible(false);
      this.boardView.update(delta);
      this.characters.update(delta, this.camera);

      // Paneo dinámico de cámara de combate: permite arrastrar con clic derecho/central
      this.camera.position.set(
        this.combatCameraBasePos.x + this.combatPanOffset.x,
        this.combatCameraBasePos.y,
        this.combatCameraBasePos.z + this.combatPanOffset.z
      );
      this.camera.lookAt(
        this.combatCameraBaseLookAt.x + this.combatPanOffset.x,
        this.combatCameraBaseLookAt.y,
        this.combatCameraBaseLookAt.z + this.combatPanOffset.z
      );
    }

    this.renderer.render(this.scene, this.camera);
  }

  private clampMapBounds(rawX: number, rawZ: number, time: number): { x: number; z: number } {
    let x = rawX;
    let z = rawZ;

    // Camino Norte hacia Valle de Seungryong (z = -65, x centrado en 0)
    const isNorthCorridor = Math.abs(x) <= 4.8 && z <= -50;
    // Camino Este hacia Desierto de Yongbi (x = 65, z centrado en 0)
    const isEastCorridor = Math.abs(z) <= 4.8 && x >= 50;

    if (isNorthCorridor) {
      if (z <= -62) {
        z = -62;
        if (time - this.lastPortalWarningTime > 5000) {
          this.lastPortalWarningTime = time;
          this.ui.addChatMessage('🚧 [Guardia Fronterizo]: El paso hacia el Valle de Seungryong se abrirá en la próxima actualización.');
          SoundManager.getInstance().playButtonClick();
        }
      }
    } else if (isEastCorridor) {
      if (x >= 62) {
        x = 62;
        if (time - this.lastPortalWarningTime > 5000) {
          this.lastPortalWarningTime = time;
          this.ui.addChatMessage('🚧 [Guardia Fronterizo]: El paso hacia el Desierto de Yongbi se abrirá en la próxima actualización.');
          SoundManager.getInstance().playButtonClick();
        }
      }
    } else {
      // Límites montañosos del valle de Aldea 1
      x = Math.max(-58, Math.min(58, x));
      z = Math.max(-58, Math.min(72, z));

      // 1. Colisión de Agua de Metin2 (z = 47.0..57.0):
      // No se puede caminar sobre el agua; el jugador solo puede cruzar por los dos puentes o pisar el muelle de pesca
      if (z >= 47.0 && z <= 57.0) {
        const onBridge1 = Math.abs(x - 0) <= 2.8; // Puente Central
        const onBridge2 = Math.abs(x - 32) <= 2.8; // Puente Este
        const onPier = Math.abs(x - (-8)) <= 2.2 && z <= 51.5; // Muelle de pesca

        if (!onBridge1 && !onBridge2 && !onPier) {
          if (z < 52.0) {
            z = 46.9; // Detener en la orilla norte
          } else {
            z = 57.1; // Detener en la orilla sur
          }
        }
      }

      // 2. Colisión física sólida con Edificios de la Aldea (AABBs):
      // Evita atravesar paredes o que personajes aparezcan dentro de los edificios
      const buildings = [
        { minX: -23.0, maxX: -13.0, minZ: -23.0, maxZ: -13.0 }, // Banco
        { minX: 13.0, maxX: 23.0, minZ: -23.0, maxZ: -13.0 },   // Itemshop
        { minX: -26.5, maxX: -17.5, minZ: 9.5, maxZ: 18.5 },   // Casa 1
        { minX: 17.5, maxX: 26.5, minZ: 9.5, maxZ: 18.5 },    // Casa 2
        { minX: -19.5, maxX: -12.5, minZ: 38.0, maxZ: 45.0 },  // Pabellón / Glorieta
      ];

      for (const b of buildings) {
        if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) {
          const dLeft = Math.abs(x - b.minX);
          const dRight = Math.abs(b.maxX - x);
          const dTop = Math.abs(z - b.minZ);
          const dBottom = Math.abs(b.maxZ - z);
          const minOverlap = Math.min(dLeft, dRight, dTop, dBottom);

          if (minOverlap === dLeft) x = b.minX;
          else if (minOverlap === dRight) x = b.maxX;
          else if (minOverlap === dTop) z = b.minZ;
          else z = b.maxZ;
        }
      }
    }

    return { x, z };
  }

  private startGathering(node: WorldGatherNode): void {
    if (this.isGathering) {
      this.cancelGathering();
    }
    this.isGathering = true;
    this.pendingGatherNodeId = null;
    this.clickTarget = null;
    this.isCurrentlyMoving = false;

    // Orientar al jugador hacia el nodo
    const dx = node.pos.x - (this.myWorldPlayer?.pos.x || 0);
    const dz = node.pos.z - (this.myWorldPlayer?.pos.z || 0);
    const facingAngle = Math.atan2(dx, dz);
    if (this.myWorldPlayer) {
      this.worldView.updatePlayerVisual(this.myPlayerId || 'me', this.myWorldPlayer.pos, false, facingAngle, 0);
    }

    // Animación de ataque / recolección
    const localMesh = this.worldView.getLocalPlayerMesh();
    const charInst = localMesh?.userData.charInstance;
    if (charInst) {
      charInst.playAnimation('attack', 0.1, false);
    }

    let actionLabel = '⛏️ Extrayendo';
    if (node.node_type === 'Woodcutting') actionLabel = '🪓 Talando';
    else if (node.node_type === 'Fishing') actionLabel = '🎣 Pescando';

    this.ui.showGatheringProgress(`${actionLabel} ${node.name}...`, 2.5);

    this.gatheringTimer = setTimeout(() => {
      if (!this.isGathering) return;
      this.isGathering = false;
      this.ui.hideGatheringProgress();
      if (charInst) {
        charInst.playAnimation('idle', 0.15);
      }
      this.network.send({
        type: 'GatherResource',
        payload: { node_id: node.id },
      });
      SoundManager.getInstance().playYangCoin();
    }, 2500);
  }

  private cancelGathering(): void {
    if (!this.isGathering) return;
    this.isGathering = false;
    this.pendingGatherNodeId = null;
    if (this.gatheringTimer) {
      clearTimeout(this.gatheringTimer);
      this.gatheringTimer = null;
    }
    this.ui.hideGatheringProgress();
    const localMesh = this.worldView.getLocalPlayerMesh();
    const charInst = localMesh?.userData.charInstance;
    if (charInst) {
      charInst.playAnimation('idle', 0.15);
    }
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    (window as any).gameApp = new GameApp();
  });
} else {
  (window as any).gameApp = new GameApp();
}
