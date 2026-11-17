import * as THREE from 'three';
import type { Player, Position } from '../types';
import { BoardView } from './BoardView';
import { AssetManager, type CharacterInstance, getCharacterModelKey, getStarterWeaponForClass } from './AssetManager';

interface FloatingText {
  element: HTMLDivElement;
  worldPos: THREE.Vector3;
  lifetime: number;
  maxLifetime: number;
}

export class CharacterManager {
  private scene: THREE.Scene;
  public group: THREE.Group = new THREE.Group();
  private board: BoardView;
  private characterMeshes: Map<string, THREE.Group> = new Map();
  private movingCharacters: Map<
    string,
    { path: THREE.Vector3[]; currentIndex: number; progress: number; onComplete?: () => void }
  > = new Map();

  private floatingTexts: FloatingText[] = [];
  private textContainer: HTMLDivElement;

  // Info del jugador local para preservar outfit/gender en combate
  private localPlayerId: string | null = null;
  private localOutfit: number = 1;
  private localGender: string | undefined = undefined;

  constructor(scene: THREE.Scene, board: BoardView) {
    this.scene = scene;
    this.board = board;
    this.scene.add(this.group);

    // Contenedor DOM para números de daño flotantes sobre los personajes
    this.textContainer = document.createElement('div');
    this.textContainer.style.position = 'absolute';
    this.textContainer.style.top = '0';
    this.textContainer.style.left = '0';
    this.textContainer.style.width = '100%';
    this.textContainer.style.height = '100%';
    this.textContainer.style.pointerEvents = 'none';
    this.textContainer.style.overflow = 'hidden';
    document.body.appendChild(this.textContainer);
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  /** Almacena outfit/gender del jugador local para usarlo en combate */
  public setLocalPlayerInfo(playerId: string, outfit: number, gender?: string): void {
    this.localPlayerId = playerId;
    this.localOutfit = outfit;
    this.localGender = gender;
  }

  public syncPlayers(players: Player[]): void {
    const activeIds = new Set(players.map((p) => p.id));

    // Eliminar los que ya no están
    for (const [id, group] of this.characterMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.group.remove(group);
        this.characterMeshes.delete(id);
      }
    }

    // Actualizar o crear
    for (const player of players) {
      let group = this.characterMeshes.get(player.id);
      if (!group) {
        group = this.createCharacterModel(player);
        this.group.add(group);
        this.characterMeshes.set(player.id, group);

        // Posición inicial
        const pos = this.board.gridToWorld(player.pos.x, player.pos.y);
        group.position.set(pos.x, 0, pos.z);
      } else {
        // Si no se está moviendo con animación de ruta, colocarlo en su celda
        if (!this.movingCharacters.has(player.id)) {
          const target = this.board.gridToWorld(player.pos.x, player.pos.y);
          group.position.set(target.x, 0, target.z);
        }

        // Actualizar referencia al objeto player
        group.userData.player = player;

        // Actualizar barra de vida y recursos si ha cambiado
        if (
          group.userData.lastHp !== player.hp ||
          group.userData.lastMaxHp !== player.max_hp ||
          group.userData.lastAp !== player.ap ||
          group.userData.lastPm !== player.pm
        ) {
          if (group.userData.nameplateSprite) {
            this.drawNameplateCanvas(group.userData.nameplateCanvas, player);
            group.userData.nameplateTexture.needsUpdate = true;
          }
          group.userData.lastHp = player.hp;
          group.userData.lastMaxHp = player.max_hp;
          group.userData.lastAp = player.ap;
          group.userData.lastPm = player.pm;
        }
      }

      // Visibilidad y efectos según estado vivo/muerto
      if (!player.is_alive) {
        group.visible = true; // Mantener visible para la animación de derrota
        const charInstance = group.userData.charInstance as CharacterInstance | undefined;
        if (charInstance) {
          charInstance.playAnimation('death', 0.1, true);
        } else {
          group.rotation.x = Math.PI / 2;
          group.position.y = 0.2;
        }
        // Ocultar placa de vida al caer derrotado
        if (group.userData.nameplateSprite) {
          group.userData.nameplateSprite.visible = false;
        }
      } else {
        group.visible = true;
        if (group.userData.nameplateSprite) {
          group.userData.nameplateSprite.visible = true;
        }
      }
    }
  }

  public playDeath(playerId: string): void {
    const group = this.characterMeshes.get(playerId);
    if (!group) return;
    if (group.userData.player) {
      group.userData.player.is_alive = false;
    }
    const charInstance = group.userData.charInstance as CharacterInstance | undefined;
    if (charInstance) {
      charInstance.playAnimation('death', 0.1, true);
      // Si el modelo 3D no tiene un clip específico de muerte (ej. personajes humanos iniciales),
      // realizar una caída marcial procedural suave hacia atrás
      if (!charInstance.actions.has('death')) {
        const startRot = group.rotation.x;
        const targetRot = Math.PI / 2.3;
        const startTime = performance.now();
        const duration = 500;
        const animateFall = () => {
          const t = Math.min(1, (performance.now() - startTime) / duration);
          group.rotation.x = startRot + (targetRot - startRot) * t;
          group.position.y = (1 - t) * 0.0 + t * 0.15;
          if (t < 1) requestAnimationFrame(animateFall);
        };
        requestAnimationFrame(animateFall);
      }
    } else if (group.userData.isMetin) {
      // Destrucción épica de la Piedra Metin
      this.spawnSpellEffect(group.position, group.position, 'metin_pulse');
    } else {
      group.rotation.x = Math.PI / 2;
      group.position.y = 0.2;
    }
    if (group.userData.nameplateSprite) {
      group.userData.nameplateSprite.visible = false;
    }
  }

  public animatePath(playerId: string, gridPath: Position[], onComplete?: () => void): void {
    const group = this.characterMeshes.get(playerId);
    if (!group || gridPath.length < 2) {
      if (onComplete) onComplete();
      return;
    }

    const worldPoints = gridPath.map((pos) => this.board.gridToWorld(pos.x, pos.y));
    this.movingCharacters.set(playerId, {
      path: worldPoints,
      currentIndex: 0,
      progress: 0,
      onComplete,
    });
  }

  public playSpellCast(casterId: string, targetPos: Position, effectKey: string): void {
    const casterGroup = this.characterMeshes.get(casterId);
    if (!casterGroup) return;

    const targetWorld = this.board.gridToWorld(targetPos.x, targetPos.y);

    // Girar hacia el objetivo
    casterGroup.lookAt(targetWorld.x, casterGroup.position.y, targetWorld.z);

    // Embestida física marcial hacia el objetivo (lunge y recuperación inmediata)
    const startPos = casterGroup.position.clone();
    const forwardDir = new THREE.Vector3().subVectors(targetWorld, startPos).setY(0);
    if (forwardDir.lengthSq() > 0.001) {
      forwardDir.normalize();
      const lungeDist = 0.45;
      const lungeTarget = startPos.clone().addScaledVector(forwardDir, lungeDist);
      const startTime = performance.now();
      const lungeDuration = 380; // 380ms

      const animateLunge = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(1, elapsed / lungeDuration);
        const step = Math.sin(t * Math.PI);
        casterGroup.position.lerpVectors(startPos, lungeTarget, step);
        if (t < 1) {
          requestAnimationFrame(animateLunge);
        } else {
          casterGroup.position.copy(startPos);
        }
      };
      requestAnimationFrame(animateLunge);
    }

    const charInstance = casterGroup.userData.charInstance as CharacterInstance | undefined;
    if (charInstance) {
      const lowerKey = (effectKey || '').toLowerCase();
      // Fade a 0.0 para que el primer fotograma del ataque comience con 100% de fuerza
      const attackFade = 0.02;
      if (lowerKey.includes('spin') || lowerKey.includes('giro') || lowerKey.includes('palbang')) {
        charInstance.playAnimation('palbang', attackFade, true, () => charInstance.playAnimation('idle', 0.15));
      } else if (lowerKey.includes('triple') || lowerKey.includes('samyeon') || lowerKey.includes('corte') || lowerKey.includes('tres')) {
        charInstance.playAnimation('samyeon', attackFade, true, () => charInstance.playAnimation('idle', 0.15));
      } else if (lowerKey.includes('aura') || lowerKey.includes('geomgyeong')) {
        charInstance.playAnimation('geomgyeong', attackFade, true, () => charInstance.playAnimation('idle', 0.15));
      } else if (lowerKey.includes('iron') || lowerKey.includes('cheongeun') || lowerKey.includes('cuerpo')) {
        charInstance.playAnimation('cheongeun', attackFade, true, () => charInstance.playAnimation('idle', 0.15));
      } else if (lowerKey.includes('berserk') || lowerKey.includes('jeongwi')) {
        charInstance.playAnimation('jeongwi', attackFade, true, () => charInstance.playAnimation('idle', 0.15));
      } else if (lowerKey.includes('geompung') || lowerKey.includes('slash') || lowerKey.includes('rafaga')) {
        charInstance.playAnimation('geompung', attackFade, true, () => charInstance.playAnimation('idle', 0.15));
      } else {
        charInstance.playAnimation('attack', attackFade, true, () => charInstance.playAnimation('idle', 0.15));
      }
    } else {
      // Inclinación hacia adelante
      const originalRot = casterGroup.rotation.x;
      casterGroup.rotation.x -= 0.4;
      setTimeout(() => {
        casterGroup.rotation.x = originalRot;
      }, 250);
    }

    // Efecto visual de partículas / tajo
    this.spawnSpellEffect(casterGroup.position, targetWorld, effectKey);
  }

  private spawnSpellEffect(_from: THREE.Vector3, to: THREE.Vector3, effectKey: string): void {
    const effectGroup = new THREE.Group();

    if (effectKey === 'slash_red' || effectKey === 'dagger_slash') {
      // Tajo de espada o daga
      const slashGeo = new THREE.TorusGeometry(1.2, 0.15, 8, 24, Math.PI * 0.8);
      const slashMat = new THREE.MeshBasicMaterial({
        color: effectKey === 'slash_red' ? 0xff2200 : 0x00ffcc,
        side: THREE.DoubleSide,
      });
      const slash = new THREE.Mesh(slashGeo, slashMat);
      slash.position.set(to.x, 1.2, to.z);
      slash.rotation.x = Math.PI / 2;
      effectGroup.add(slash);
    } else if (effectKey === 'fireball' || effectKey === 'flame_burst' || effectKey === 'dragon_flame') {
      // Proyectil de fuego / llama
      const fireGeo = new THREE.SphereGeometry(0.7, 12, 12);
      const fireMat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
      const fire = new THREE.Mesh(fireGeo, fireMat);
      fire.position.set(to.x, 1.0, to.z);
      effectGroup.add(fire);

      const light = new THREE.PointLight(0xff4400, 3, 5);
      light.position.set(to.x, 1.0, to.z);
      effectGroup.add(light);
    } else {
      // Aura / Curación celestial
      const auraGeo = new THREE.CylinderGeometry(0.8, 0.8, 2.0, 16, 1, true);
      const auraMat = new THREE.MeshBasicMaterial({
        color: effectKey === 'holy_light' ? 0xffee44 : 0xaa00ff,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      });
      const aura = new THREE.Mesh(auraGeo, auraMat);
      aura.position.set(to.x, 1.0, to.z);
      effectGroup.add(aura);
    }

    this.group.add(effectGroup);
    setTimeout(() => {
      this.group.remove(effectGroup);
    }, 450);
  }

  public showFloatingText(pos: Position, text: string, color: string): void {
    const worldPos = this.board.gridToWorld(pos.x, pos.y);
    worldPos.y = 2.2;

    const el = document.createElement('div');
    el.innerText = text;
    el.style.position = 'absolute';
    el.style.color = color;
    el.style.fontWeight = '900';
    el.style.fontSize = '22px';
    el.style.fontFamily = 'Cinzel, Georgia, serif';
    el.style.textShadow = '0 0 8px rgba(0,0,0,0.9), 0 0 4px #000';
    el.style.userSelect = 'none';
    el.style.transform = 'translate(-50%, -50%)';
    this.textContainer.appendChild(el);

    this.floatingTexts.push({
      element: el,
      worldPos: worldPos.clone(),
      lifetime: 0,
      maxLifetime: 1.2,
    });
  }

  private createCharacterModel(player: Player): THREE.Group {
    const group = new THREE.Group();

    // Colores según reino de Metin2: Jinno (Azul), Shinsoo (Rojo)
    const kingdomColor = player.team === 0 ? 0x1e88e5 : 0xe53935;
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.5,
      metalness: 0.6,
    });
    const armorMat = new THREE.MeshStandardMaterial({
      color: kingdomColor,
      roughness: 0.4,
      metalness: 0.7,
    });

    // Peana / Anillo indicador de turno en el suelo
    const ringGeo = new THREE.RingGeometry(0.7, 0.85, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: kingdomColor,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    group.add(ring);

    // Contenedor de mallas procedimentales (fallback inicial mientras carga el GLB)
    const proceduralGroup = new THREE.Group();
    group.add(proceduralGroup);

    // Torso / Armadura de placas oriental
    const torsoGeo = new THREE.BoxGeometry(0.78, 0.95, 0.52);
    const torso = new THREE.Mesh(torsoGeo, armorMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    proceduralGroup.add(torso);

    const emblemGeo = new THREE.BoxGeometry(0.35, 0.5, 0.15);
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 });
    const emblem = new THREE.Mesh(emblemGeo, goldMat);
    emblem.position.set(0, 1.15, 0.24);
    proceduralGroup.add(emblem);

    // Hombreras de guerra orientales puntiagudas estilo Metin2 (Dragon Plate)
    for (let i = -1; i <= 1; i += 2) {
      const shoulderGeo = new THREE.ConeGeometry(0.24, 0.55, 4);
      const shoulder = new THREE.Mesh(shoulderGeo, goldMat);
      shoulder.position.set(i * 0.48, 1.35, 0);
      shoulder.rotation.z = -i * 0.6;
      shoulder.rotation.y = Math.PI / 4;
      shoulder.castShadow = true;
      proceduralGroup.add(shoulder);
    }

    // Cabeza / Casco
    const headGeo = new THREE.BoxGeometry(0.45, 0.45, 0.45);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.7;
    head.castShadow = true;
    proceduralGroup.add(head);

    const crestGeo = new THREE.BoxGeometry(0.08, 0.35, 0.45);
    const crest = new THREE.Mesh(crestGeo, goldMat);
    crest.position.set(0, 2.05, 0);
    proceduralGroup.add(crest);

    // Piernas
    for (let i = -1; i <= 1; i += 2) {
      const legGeo = new THREE.BoxGeometry(0.25, 0.6, 0.3);
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.set(i * 0.22, 0.3, 0);
      leg.castShadow = true;
      proceduralGroup.add(leg);
    }

    // Armas y accesorios según la clase
    if (player.class === 'Warrior') {
      const swordGroup = new THREE.Group();
      swordGroup.position.set(0.55, 1.15, 0.25);
      swordGroup.rotation.x = 0.35;

      const bladeGeo = new THREE.BoxGeometry(0.12, 1.6, 0.28);
      const bladeMat = new THREE.MeshStandardMaterial({
        color: 0xdbeafe,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.75,
        metalness: 0.9,
        roughness: 0.15,
      });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.position.y = 0.5;
      swordGroup.add(blade);

      const guardGeo = new THREE.BoxGeometry(0.3, 0.08, 0.18);
      const guard = new THREE.Mesh(guardGeo, goldMat);
      guard.position.y = -0.3;
      swordGroup.add(guard);

      const glowLight = new THREE.PointLight(0x38bdf8, 1.3, 3);
      glowLight.position.y = 0.5;
      swordGroup.add(glowLight);

      proceduralGroup.add(swordGroup);
    } else if (player.class === 'Sura') {
      // Brazo demoníaco púrpura con brillo
      const demonArmGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.8, 8);
      const demonMat = new THREE.MeshStandardMaterial({
        color: 0x4a0e4e,
        emissive: 0x9c27b0,
        emissiveIntensity: 0.6,
      });
      const demonArm = new THREE.Mesh(demonArmGeo, demonMat);
      demonArm.position.set(-0.48, 1.05, 0);
      proceduralGroup.add(demonArm);

      // Espada curva
      const swordGeo = new THREE.BoxGeometry(0.08, 1.2, 0.18);
      const swordMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 });
      const sword = new THREE.Mesh(swordGeo, swordMat);
      sword.position.set(0.5, 1.1, 0.25);
      proceduralGroup.add(sword);
    } else if (player.class === 'Ninja') {
      // Dagas gemelas
      for (let i = -1; i <= 1; i += 2) {
        const daggerGeo = new THREE.BoxGeometry(0.06, 0.65, 0.12);
        const daggerMat = new THREE.MeshStandardMaterial({ color: 0x88e0ef, metalness: 0.9 });
        const dagger = new THREE.Mesh(daggerGeo, daggerMat);
        dagger.position.set(i * 0.45, 0.9, 0.25);
        dagger.rotation.x = 0.3;
        proceduralGroup.add(dagger);
      }
    } else if (player.class === 'Shaman') {
      // Campana flotante mística / Abanico
      const bellGeo = new THREE.OctahedronGeometry(0.3, 1);
      const bellMat = new THREE.MeshStandardMaterial({
        color: 0xffd700,
        emissive: 0xffa000,
        emissiveIntensity: 0.4,
      });
      const bell = new THREE.Mesh(bellGeo, bellMat);
      bell.position.set(0.5, 1.3, 0.2);
      bell.userData = { isBell: true };
      proceduralGroup.add(bell);
    }

    // Determinar qué modelo 3D cargar según si es jugador o monstruo
    const nameLower = player.name.toLowerCase();
    const idLower = player.id.toLowerCase();
    let modelType = 'warrior_1';
    let modelScale = 0.012;
    let isMetin = false;
    let isMob = false;

    if (nameLower.includes('perro') || idLower.includes('wild_dog')) {
      modelType = 'wild_dog';
      modelScale = 0.012;
      isMob = true;
    } else if (nameLower.includes('lobo') || idLower.includes('wolf')) {
      modelType = 'wolf';
      modelScale = 0.012;
      isMob = true;
    } else if (nameLower.includes('metin') || idLower.includes('metin')) {
      modelType = 'metin_stone';
      modelScale = 0.009; // Reducida a escala auténtica proporcional
      isMetin = true;
      isMob = true;
    } else {
      // Es un jugador humano con su clase, vestimenta y género elegidos
      const isLocalPlayer = this.localPlayerId && player.id === this.localPlayerId;
      const outfitNum = (player as any).outfit || (isLocalPlayer ? this.localOutfit : 1);
      const gender = (player as any).gender || (isLocalPlayer ? this.localGender : undefined);
      modelType = getCharacterModelKey(player.class, outfitNum, gender);
    }

    // Nombre y barra de vida sobre la cabeza (Alta Definición y Legibilidad Táctica)
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 140;
    this.drawNameplateCanvas(canvas, player);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const nameSprite = new THREE.Sprite(mat);
    nameSprite.scale.set(4.2, 1.15, 1);
    nameSprite.position.y = isMetin ? 3.4 : 2.55;
    group.add(nameSprite);

    group.userData = {
      player,
      isMetin,
      isMob,
      nameplateCanvas: canvas,
      nameplateTexture: texture,
      nameplateSprite: nameSprite,
      lastHp: player.hp,
      lastMaxHp: player.max_hp,
      lastAp: player.ap,
      lastPm: player.pm,
    };

    if (isMetin) {
      AssetManager.getInstance().getInstancedModel('metin_stone').then((model) => {
        if (!model) return;
        proceduralGroup.visible = false;
        model.scale.setScalar(modelScale);
        model.position.set(0, 0, 0);
        group.add(model);
        group.userData.meshModel = model;
      });
    } else {
      AssetManager.getInstance().createCharacterInstance(modelType).then((charInstance) => {
        if (!charInstance) return;
        proceduralGroup.visible = false;
        charInstance.group.scale.setScalar(modelScale);
        charInstance.group.position.set(0, 0, 0);
        charInstance.playAnimation('idle');
        group.add(charInstance.group);
        group.userData.charInstance = charInstance;

        // Si es humano, equipar arma inicial auténtica según su clase (Dagas dobles para Ninja)
        if (!isMob) {
          const starterWeapon = getStarterWeaponForClass(player.class);
          const isDual = (player.class || '').toLowerCase() === 'ninja';
          AssetManager.getInstance().getWeaponModel(starterWeapon).then((weapon) => {
            if (weapon && group.userData.charInstance) {
              charInstance.attachWeapon(weapon, isDual);
            }
          });
        }
      });
    }

    return group;
  }

  private drawCartouchePath(ctx: CanvasRenderingContext2D, left: number, top: number, right: number, bottom: number, cy: number, tip = 16): void {
    ctx.beginPath();
    ctx.moveTo(left + tip, top);
    ctx.lineTo(right - tip, top);
    ctx.lineTo(right, cy);
    ctx.lineTo(right - tip, bottom);
    ctx.lineTo(left + tip, bottom);
    ctx.lineTo(left, cy);
    ctx.closePath();
  }

  private drawVectorBadge(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, type: string, color: string, text?: string): void {
    ctx.save();
    ctx.fillStyle = '#080a0f';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r - 3, 0, Math.PI * 2);
    ctx.stroke();

    if (type === 'level' && text) {
      ctx.font = 'bold 14px "Cinzel", Georgia, serif';
      ctx.fillStyle = '#fef08a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 0.5);
    } else if (type === 'metin') {
      ctx.fillStyle = '#e9d5ff';
      ctx.beginPath();
      ctx.moveTo(x, y - 11);
      ctx.quadraticCurveTo(x, y, x + 11, y);
      ctx.quadraticCurveTo(x, y, x, y + 11);
      ctx.quadraticCurveTo(x, y, x - 11, y);
      ctx.quadraticCurveTo(x, y, x, y - 11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'skull') {
      ctx.fillStyle = '#fca5a5';
      ctx.beginPath();
      ctx.arc(x, y - 2, 7, Math.PI * 0.8, Math.PI * 0.2);
      ctx.lineTo(x + 4, y + 6);
      ctx.lineTo(x - 4, y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#450a0a';
      ctx.beginPath();
      ctx.arc(x - 3, y - 2, 1.8, 0, Math.PI * 2);
      ctx.arc(x + 3, y - 2, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawNameplateCanvas(canvas: HTMLCanvasElement, player: Player): void {
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const isAlly = player.team === 0;
    const isMetin = (player.name || '').toLowerCase().includes('metin') || player.id.toLowerCase().includes('metin');
    const borderColor = isAlly ? '#38bdf8' : (isMetin ? '#c084fc' : '#ef4444');

    const left = 8;
    const right = w - 8;
    const top = 6;
    const bottom = h - 6;
    const cy = (top + bottom) / 2;

    // 1. Fondo de Cartouche Táctico
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    const bgGrad = ctx.createLinearGradient(0, top, 0, bottom);
    bgGrad.addColorStop(0, 'rgba(16, 20, 28, 0.96)');
    bgGrad.addColorStop(0.5, 'rgba(8, 10, 15, 0.98)');
    bgGrad.addColorStop(1, 'rgba(16, 20, 28, 0.96)');
    ctx.fillStyle = bgGrad;

    this.drawCartouchePath(ctx, left, top, right, bottom, cy, 16);
    ctx.fill();
    ctx.restore();

    // 2. Borde Metálico con Bisel y Resplandor
    ctx.save();
    const borderGrad = ctx.createLinearGradient(left, 0, right, 0);
    borderGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    borderGrad.addColorStop(0.3, borderColor);
    borderGrad.addColorStop(0.5, '#ffffff');
    borderGrad.addColorStop(0.7, borderColor);
    borderGrad.addColorStop(1, 'rgba(255, 255, 255, 0.15)');

    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 2.2;
    this.drawCartouchePath(ctx, left, top, right, bottom, cy, 16);
    ctx.stroke();

    // Remaches en extremos
    ctx.fillStyle = borderColor;
    ctx.beginPath();
    ctx.arc(left + 8, cy, 2.5, 0, Math.PI * 2);
    ctx.arc(right - 8, cy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. Medallón de Nivel / Tipo
    const badgeX = left + 36;
    const badgeY = top + 26;
    const badgeType = isMetin ? 'metin' : (isAlly ? 'level' : 'skull');
    const playerLevel = (player as any).level || 1;
    this.drawVectorBadge(ctx, badgeX, badgeY, 17, badgeType, borderColor, String(playerLevel));

    // 4. Cabecera: Nombre y Rol
    const displayName = player.name;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 20px "Cinzel", "Times New Roman", serif';

    ctx.lineWidth = 5;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(displayName, badgeX + 26, badgeY);

    ctx.fillStyle = isAlly ? '#f0f9ff' : (isMetin ? '#f3e8ff' : '#fee2e2');
    ctx.fillText(displayName, badgeX + 26, badgeY);
    ctx.restore();

    // 5. Barra de Salud (HP Bar) 3D Beveled
    const barX = 24;
    const barY = 48;
    const barW = w - 48;
    const barH = 34;

    // Ranura/Fondo de barra
    ctx.save();
    ctx.fillStyle = '#06080c';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 7);
    ctx.fill();

    ctx.strokeStyle = '#252b3b';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Relleno de salud con gradiente
    const pct = Math.max(0, Math.min(1, player.hp / (player.max_hp || 1)));
    const fillW = Math.max(0, barW * pct);

    if (fillW > 0) {
      ctx.beginPath();
      ctx.roundRect(barX, barY, fillW, barH, 7);
      ctx.clip();

      const grad = ctx.createLinearGradient(barX, barY, barX, barY + barH);
      if (pct < 0.25) {
        grad.addColorStop(0, '#f97316');
        grad.addColorStop(1, '#dc2626');
      } else if (isAlly) {
        grad.addColorStop(0, '#34d399');
        grad.addColorStop(0.5, '#10b981');
        grad.addColorStop(1, '#047857');
      } else if (isMetin) {
        grad.addColorStop(0, '#d8b4fe');
        grad.addColorStop(0.5, '#a855f7');
        grad.addColorStop(1, '#6b21a8');
      } else {
        grad.addColorStop(0, '#f87171');
        grad.addColorStop(0.5, '#ef4444');
        grad.addColorStop(1, '#991b1b');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(barX, barY, fillW, barH);

      // Brillo superior efecto cristal glossy
      ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
      ctx.fillRect(barX, barY, fillW, barH * 0.42);
    }
    ctx.restore();

    // Muescas tácticas a 25%, 50%, 75% estilo Dofus
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1.5;
    for (const tickPct of [0.25, 0.5, 0.75]) {
      const tx = barX + barW * tickPct;
      ctx.beginPath();
      ctx.moveTo(tx, barY + 2);
      ctx.lineTo(tx, barY + barH - 2);
      ctx.stroke();
    }
    ctx.restore();

    // Texto de Salud centrado
    ctx.save();
    ctx.font = 'bold 18px "Cinzel", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const hpStr = `${Math.max(0, player.hp)} / ${player.max_hp}  (${Math.round(pct * 100)}%)`;

    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.95)';
    ctx.strokeText(hpStr, w / 2, barY + barH / 2);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(hpStr, w / 2, barY + barH / 2);
    ctx.restore();

    // 6. Indicadores Tácticos de PA y PM en la base
    const bottomY = 108;
    ctx.save();
    ctx.font = 'bold 15px Arial, sans-serif';
    ctx.textBaseline = 'middle';

    // PA (Puntos de Acción)
    ctx.textAlign = 'left';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(`🔵 ${player.ap ?? 6} PA`, barX + 6, bottomY);
    ctx.fillStyle = '#60a5fa';
    ctx.fillText(`🔵 ${player.ap ?? 6} PA`, barX + 6, bottomY);

    // PM (Puntos de Movimiento)
    ctx.textAlign = 'right';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(`🟢 ${player.pm ?? 3} PM`, barX + barW - 6, bottomY);
    ctx.fillStyle = '#4ade80';
    ctx.fillText(`🟢 ${player.pm ?? 3} PM`, barX + barW - 6, bottomY);

    // Buffs activos (centro)
    const hasAtk = (player.attack_buff_turns ?? 0) > 0;
    const hasDef = (player.defense_buff_turns ?? 0) > 0;
    if (hasAtk || hasDef) {
      ctx.textAlign = 'center';
      const buffText = [hasAtk ? '⚔️ +ATK' : '', hasDef ? '🛡️ +DEF' : ''].filter(Boolean).join('  ');
      ctx.fillStyle = '#fde047';
      ctx.fillText(buffText, w / 2, bottomY);
    }
    ctx.restore();
  }

  public update(delta: number, camera: THREE.Camera): void {
    // 0. Actualizar animaciones de personajes 3D
    for (const [playerId, group] of this.characterMeshes.entries()) {
      const player = group.userData.player as Player | undefined;
      const charInstance = group.userData.charInstance as CharacterInstance | undefined;

      if (charInstance) {
        if (player && !player.is_alive) {
          // Si el personaje o monstruo ha muerto, actualizar el mixer de animación pero NUNCA volver a idle o run
          charInstance.update(delta);
          continue;
        }
        if (this.movingCharacters.has(playerId)) {
          charInstance.playAnimation('running');
        } else if (!charInstance.isOneShotActive && !charInstance.isDead) {
          charInstance.playAnimation('idle');
        }
        charInstance.update(delta);
      } else {
        // Objetos sin charInstance (ej. Piedra Metin o fallback procedural)
        if (player && !player.is_alive) {
          if (group.userData.isMetin) {
            // Hundimiento y fragmentación de la Piedra Metin al ser destruida
            if (group.position.y > -2.5) {
              group.position.y -= delta * 1.6;
              group.scale.multiplyScalar(Math.max(0.01, 1 - delta * 0.9));
            } else {
              group.visible = false;
            }
          }
        }
      }
    }

    // 1. Procesar movimiento a lo largo del camino
    for (const [playerId, moveData] of this.movingCharacters.entries()) {
      const group = this.characterMeshes.get(playerId);
      if (!group) continue;

      const p0 = moveData.path[moveData.currentIndex];
      const p1 = moveData.path[moveData.currentIndex + 1];

      if (!p1) {
        // Fin de la ruta
        if (moveData.onComplete) moveData.onComplete();
        this.movingCharacters.delete(playerId);
        continue;
      }

      // Mirar en dirección de marcha
      group.lookAt(p1.x, group.position.y, p1.z);

      // Velocidad de carrera (4 casillas por segundo)
      moveData.progress += delta * 4.5;
      if (moveData.progress >= 1.0) {
        moveData.currentIndex++;
        moveData.progress = 0;
        group.position.set(p1.x, 0, p1.z);
      } else {
        group.position.lerpVectors(p0, p1, moveData.progress);
        // Pequeño bamboleo al correr
        group.position.y = Math.abs(Math.sin(moveData.progress * Math.PI)) * 0.15;
      }
    }

    // 2. Animaciones sutiles idle
    for (const group of this.characterMeshes.values()) {
      const bell = group.children.find((c) => c.userData.isBell);
      if (bell) {
        bell.rotation.y += delta * 2;
        bell.position.y = 1.3 + Math.sin(Date.now() * 0.005) * 0.1;
      }
    }

    // 3. Textos flotantes proyectados en pantalla
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.lifetime += delta;
      ft.worldPos.y += delta * 0.6; // Subir

      if (ft.lifetime >= ft.maxLifetime) {
        this.textContainer.removeChild(ft.element);
        this.floatingTexts.splice(i, 1);
        continue;
      }

      // Proyectar coordenadas 3D a 2D
      const screenPos = ft.worldPos.clone().project(camera);
      const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;

      ft.element.style.left = `${x}px`;
      ft.element.style.top = `${y}px`;
      ft.element.style.opacity = `${1 - ft.lifetime / ft.maxLifetime}`;
    }
  }
}
