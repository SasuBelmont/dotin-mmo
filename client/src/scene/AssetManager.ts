import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

export interface CharacterInstance {
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  currentAction: string | null;
  isOneShotActive?: boolean;
  isDead?: boolean;
  playAnimation: (animName: string, fadeDuration?: number, once?: boolean, onFinish?: () => void) => void;
  update: (delta: number) => void;
  rightHand?: THREE.Object3D;
  leftHand?: THREE.Object3D;
  attachWeapon: (weaponGroup: THREE.Object3D, isDual?: boolean) => void;
}

export function getCharacterModelKey(
  classType: string,
  outfit: number = 1,
  gender?: string
): string {
  const c = (classType || 'Warrior').toLowerCase();
  const o = outfit || 1;
  const defaultGender = (c === 'ninja' || c === 'shaman') ? 'female' : 'male';
  const g = (gender || defaultGender).toLowerCase();
  if (c === 'warrior') {
    return g === 'female' ? `warrior_female_${o}` : `warrior_${o}`;
  } else if (c === 'ninja') {
    return g === 'male' ? `ninja_male_${o}` : `ninja_${o}`;
  } else if (c === 'sura') {
    return g === 'female' ? `sura_female_${o}` : `sura_${o}`;
  } else if (c === 'shaman') {
    return g === 'male' ? `shaman_male_${o}` : `shaman_${o}`;
  }
  return `warrior_${o}`;
}

export function getStarterWeaponForClass(classType: string): string {
  const c = (classType || 'Warrior').toLowerCase();
  if (c === 'ninja') return 'dagger';
  if (c === 'shaman') return 'fan';    // Shaman usa Abanico +0 inicial
  if (c === 'sura') return 'sword';     // Sura usa espada oscura
  return 'starter_sword';              // Warrior usa espada de principiante
}

export class AssetManager {
  private static instance: AssetManager | null = null;
  private gltfLoader: GLTFLoader;
  private loadedModels: Map<string, GLTF> = new Map();
  private loadPromises: Map<string, Promise<GLTF | null>> = new Map();

  public static getInstance(): AssetManager {
    if (!AssetManager.instance) {
      AssetManager.instance = new AssetManager();
    }
    return AssetManager.instance;
  }

  constructor() {
    this.gltfLoader = new GLTFLoader();
  }

  /**
   * Intenta cargar un modelo GLTF/GLB desde /assets/models/<modelName>.glb
   * Si no existe o da error, resuelve null limpiamente sin romper el juego.
   */
  public async loadModel(modelName: string): Promise<GLTF | null> {
    if (this.loadedModels.has(modelName)) {
      return this.loadedModels.get(modelName)!;
    }

    if (this.loadPromises.has(modelName)) {
      return this.loadPromises.get(modelName)!;
    }

    const url = `/assets/models/${modelName}.glb`;
    const promise = new Promise<GLTF | null>((resolve) => {
      this.gltfLoader.load(
        url,
        (gltf) => {
          this.loadedModels.set(modelName, gltf);
          resolve(gltf);
        },
        undefined,
        (err) => {
          console.warn(`[AssetManager] Could not load model ${modelName}:`, err);
          resolve(null);
        }
      );
    });

    this.loadPromises.set(modelName, promise);
    return promise;
  }

  /**
   * Clona un modelo cargado o retorna null para usar el fallback procedural
   */
  public async getInstancedModel(modelName: string): Promise<THREE.Group | null> {
    const gltf = await this.loadModel(modelName);
    if (!gltf) return null;

    const clone = SkeletonUtils.clone(gltf.scene) as THREE.Group;
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const meshNameLower = mesh.name.toLowerCase();
        const isFace = meshNameLower.includes('face') || meshNameLower === 'object01';
        const isHairMesh = meshNameLower.includes('hair');

        for (const mat of mats) {
          if (mat instanceof THREE.Material) {
            mat.side = THREE.DoubleSide;
            mat.depthWrite = true;
            mat.depthTest = true;

            const matName = (mat.name || '').toLowerCase();
            const isHair = matName.includes('hair') || isHairMesh;

            if (isHair) {
              // Cabello con alphaTest / recortado opaco (alpha cutout):
              // transparent DEBE ser false para evitar desorden de profundidad con la cara
              mat.transparent = false;
              (mat as any).alphaTest = 0.5;
              mat.depthWrite = true;
              mat.needsUpdate = true;
            } else if (isFace) {
              // Cara 100% sólida opaca sin transparencias erróneas
              mat.transparent = false;
              (mat as any).alphaTest = 0.0;
              mat.depthWrite = true;
              mat.needsUpdate = true;
            } else if ((mat as any).transparent) {
              mat.transparent = true;
              (mat as any).alphaTest = 0.5;
              mat.depthWrite = true;
              mat.needsUpdate = true;
            }
          }
        }

        // Render order para evitar oclusión indeseada
        if (isFace) {
          mesh.renderOrder = 0;
        } else if (isHairMesh) {
          mesh.renderOrder = 1;
        } else {
          mesh.renderOrder = 0;
        }
      }
    });

    return clone;
  }

  /**
   * Crea una instancia completa de personaje animado con SkeletonUtils y AnimationMixer
   */
  public async createCharacterInstance(modelName: string): Promise<CharacterInstance | null> {
    const gltf = await this.loadModel(modelName);
    if (!gltf) return null;

    const rootGroup = new THREE.Group();
    const clone = SkeletonUtils.clone(gltf.scene) as THREE.Group;

    // Quitar cámaras o luces residuales del gltf si las tuviera
    const toRemove: THREE.Object3D[] = [];
    clone.traverse((child) => {
      if (child.type.includes('Light') || child.type.includes('Camera')) {
        toRemove.push(child);
      }
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const meshNameLower = mesh.name.toLowerCase();
        const isFace = meshNameLower.includes('face') || meshNameLower === 'object01';
        const isHairMesh = meshNameLower.includes('hair');

        for (const mat of mats) {
          if (mat instanceof THREE.Material) {
            mat.side = THREE.DoubleSide;
            mat.depthWrite = true;
            mat.depthTest = true;

            const matName = (mat.name || '').toLowerCase();
            const isHair = matName.includes('hair') || isHairMesh;

            if (isHair) {
              // Cabello con alphaTest / recortado opaco (alpha cutout):
              // transparent DEBE ser false para evitar desorden de profundidad con la cara
              mat.transparent = false;
              (mat as any).alphaTest = 0.5;
              mat.depthWrite = true;
              mat.needsUpdate = true;
            } else if (isFace) {
              // Cara 100% sólida opaca sin transparencias erróneas
              mat.transparent = false;
              (mat as any).alphaTest = 0.0;
              mat.depthWrite = true;
              mat.needsUpdate = true;
            } else if ((mat as any).transparent) {
              mat.transparent = true;
              (mat as any).alphaTest = 0.5;
              mat.depthWrite = true;
              mat.needsUpdate = true;
            }
          }
        }

        // Render order para evitar oclusión indeseada
        if (isFace) {
          mesh.renderOrder = 0;
        } else if (isHairMesh) {
          mesh.renderOrder = 1;
        } else {
          mesh.renderOrder = 0;
        }
      }
    });
    for (const obj of toRemove) {
      obj.removeFromParent();
    }

    rootGroup.add(clone);

    const mixer = new THREE.AnimationMixer(clone);
    const actions = new Map<string, THREE.AnimationAction>();

    for (const clip of gltf.animations) {
      const lower = clip.name.toLowerCase();
      const action = mixer.clipAction(clip);
      actions.set(lower, action);
      actions.set(clip.name, action);

      // Limpiar sufijos comunes de armaduras como _bip01
      const cleanName = lower.replace(/_bip\d+/i, '').trim();
      actions.set(cleanName, action);

      // Mapear nombres de Metin2 a estándares universales
      if (cleanName.includes('wait') || cleanName.includes('idle') || cleanName.includes('stand')) {
        actions.set('idle', action);
        actions.set('wait', action);
      }
      if (cleanName.includes('run') || cleanName.includes('running')) {
        actions.set('run', action);
        actions.set('running', action);
      }
      if (cleanName.includes('walk') || cleanName.includes('walking')) {
        actions.set('walk', action);
      }
      if (cleanName === 'attack' || cleanName.startsWith('attack')) {
        if (!actions.has('attack')) {
          actions.set('attack', action);
        }
      }
    }

    // Fallbacks robustos para que ningún personaje se quede sin animación de movimiento o reposo
    if (!actions.has('run') && actions.has('walk')) {
      actions.set('run', actions.get('walk')!);
      actions.set('running', actions.get('walk')!);
    }
    if (!actions.has('walk') && actions.has('run')) {
      actions.set('walk', actions.get('run')!);
    }
    if (!actions.has('run') && actions.has('idle')) {
      actions.set('run', actions.get('idle')!);
      actions.set('running', actions.get('idle')!);
    }
    if (!actions.has('idle') && actions.has('wait')) {
      actions.set('idle', actions.get('wait')!);
    }

    let currentActionName: string | null = null;

    let oneShotTimeoutId: any = null;

    const playAnimation = (
      animName: string,
      fadeDuration = 0.2,
      once = false,
      onFinish?: () => void
    ) => {
      const lower = animName.toLowerCase();
      // Si el personaje o monstruo ya está muerto, bloquear cualquier intento de volver a idle o run
      if (charInstanceObj?.isDead && lower !== 'death' && lower !== 'revive') return;

      if (lower === 'revive') {
        if (charInstanceObj) charInstanceObj.isDead = false;
      }

      let targetAction = actions.get(lower) || actions.get(animName);

      if (!targetAction && (lower === 'idle' || lower === 'wait')) {
        targetAction = actions.get('idle') || actions.get('wait');
      }
      if (!targetAction && (lower === 'running' || lower === 'run')) {
        targetAction = actions.get('run') || actions.get('running') || actions.get('walk');
      }
      if (!targetAction && (lower.includes('attack') || lower.includes('slash') || lower.includes('palbang') || lower.includes('samyeon') || lower.includes('geomgyeong') || lower.includes('cheongeun') || lower.includes('jeongwi') || lower.includes('geompung') || lower.includes('punch') || lower.includes('hit') || lower.includes('corte') || lower.includes('giro') || lower.includes('tiro') || lower.includes('aura') || lower.includes('skill') || lower.includes('spell'))) {
        targetAction = actions.get('attack') || actions.get('attack_1') || actions.get('attack_2') || actions.get('punch1') || actions.get('slash1');
      }
      if (!targetAction && lower === 'death') {
        targetAction = actions.get('death') || actions.get('damage');
      }
      if (!targetAction) return;

      // Para animaciones en curso: si ya está reproduciendo 'death', no reiniciar cada fotograma
      if (currentActionName === animName) {
        if (lower === 'death' && (targetAction.isRunning() || targetAction.paused)) return;
        if (targetAction.isRunning() && !once) return;
      }

      if (oneShotTimeoutId) {
        clearTimeout(oneShotTimeoutId);
        oneShotTimeoutId = null;
      }

      // Detener o atenuar acción previa
      if (currentActionName) {
        const prevAction = actions.get(currentActionName.toLowerCase()) || actions.get(currentActionName);
        if (prevAction && prevAction !== targetAction) {
          prevAction.fadeOut(fadeDuration);
        }
      }

      targetAction.reset();
      targetAction.paused = false;
      targetAction.enabled = true;
      targetAction.setEffectiveTimeScale(1);
      targetAction.setEffectiveWeight(1);

      if (lower === 'death') {
        if (charInstanceObj) {
          charInstanceObj.isDead = true;
          charInstanceObj.isOneShotActive = true;
        }
        targetAction.setLoop(THREE.LoopOnce, 1);
        targetAction.clampWhenFinished = true;
        const duration = targetAction.getClip().duration;

        oneShotTimeoutId = setTimeout(() => {
          oneShotTimeoutId = null;
          // Al morir, NUNCA volver a idle, quedarse en el suelo en su pose final
          if (onFinish) onFinish();
        }, Math.max(250, duration * 1000));
      } else if (once) {
        if (charInstanceObj) charInstanceObj.isOneShotActive = true;
        targetAction.setLoop(THREE.LoopOnce, 1);
        targetAction.clampWhenFinished = true;
        const duration = targetAction.getClip().duration;

        oneShotTimeoutId = setTimeout(() => {
          oneShotTimeoutId = null;
          if (charInstanceObj) charInstanceObj.isOneShotActive = false;
          if (onFinish) {
            onFinish();
          } else {
            playAnimation('idle', 0.15);
          }
        }, Math.max(250, duration * 1000));
      } else {
        if (charInstanceObj) charInstanceObj.isOneShotActive = false;
        targetAction.setLoop(THREE.LoopRepeat, Infinity);
        targetAction.clampWhenFinished = false;
      }

      targetAction.fadeIn(fadeDuration).play();
      currentActionName = animName;
    };

    // Iniciar con idle / wait inmediatamente si hay alguna animación (NUNCA reproducir damage como inicial)
    const initialAction = actions.get('idle') || actions.get('wait');
    if (initialAction) {
      initialAction.play();
      currentActionName = 'idle';
    }

    // Buscar hueso de mano derecha e izquierda para armas
    // Metin2: Warrior usa equip_right_hand; Ninja/Sura/Shaman usan equip_right
    let rightHand =
      clone.getObjectByName('equip_right_hand') ||
      clone.getObjectByName('equip_right') ||
      clone.getObjectByName('Bip01 R Hand') ||
      clone.getObjectByName('RightHand') ||
      clone.getObjectByName('RightHandThumb1') ||
      clone.getObjectByName('RightForeArm');

    let leftHand =
      clone.getObjectByName('equip_left_hand') ||
      clone.getObjectByName('equip_left') ||
      clone.getObjectByName('Bip01 L Hand') ||
      clone.getObjectByName('LeftHand') ||
      clone.getObjectByName('LeftHandThumb1') ||
      clone.getObjectByName('LeftForeArm');

    const attachWeapon = (weaponObj: THREE.Object3D, isDual = false) => {
      if (rightHand) {
        rightHand.add(weaponObj);
      } else {
        clone.add(weaponObj);
      }
      if (isDual && leftHand) {
        const leftClone = weaponObj.clone(true);
        leftHand.add(leftClone);
      }
    };

    const charInstanceObj: CharacterInstance = {
      group: rootGroup,
      mixer,
      actions,
      get currentAction() {
        return currentActionName;
      },
      isOneShotActive: false,
      playAnimation,
      update: (delta: number) => {
        mixer.update(delta);
      },
      rightHand: rightHand || undefined,
      leftHand: leftHand || undefined,
      attachWeapon,
    };

    return charInstanceObj;
  }

  /**
   * Carga y prepara el arma inicial Espada +0.
   * Si hay un GLB llamado 'starter_sword' lo usa; si no, construye una proceduralmente
   * al estilo de la espada corta de principiante de Metin2 (hoja delgada, marrón oscura, sin brillo).
   */
  public async getWeaponModel(weaponName = 'starter_sword'): Promise<THREE.Group | null> {
    // 1. Intentar cargar desde archivo GLB
    const gltf = await this.loadModel(weaponName);
    if (gltf) {
      const group = new THREE.Group();
      const clone = SkeletonUtils.clone(gltf.scene) as THREE.Group;
      clone.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      clone.scale.set(1.0, 1.0, 1.0);
      clone.position.set(0, 0, 0);
      clone.rotation.set(Math.PI / 2, 0, 0);
      group.add(clone);
      return group;
    }

    // 2. Fallback procedural: Espada corta de principiante de Metin2 (+0)
    //    Hoja plana y delgada, guardia simple, empuñadura de cuero marrón oscuro.
    const group = new THREE.Group();

    // Hoja (blade): delgada, plateada sin brillo (metal barato)
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x9eacb5,
      metalness: 0.55,
      roughness: 0.65,
    });
    const bladeGeo = new THREE.BoxGeometry(0.055, 0.85, 0.012);
    const blade = new THREE.Mesh(bladeGeo, bladeMat);
    blade.position.set(0, 0.46, 0);
    blade.castShadow = true;
    group.add(blade);

    // Punta de la hoja (cónica)
    const tipGeo = new THREE.ConeGeometry(0.028, 0.14, 4);
    const tip = new THREE.Mesh(tipGeo, bladeMat);
    tip.position.set(0, 0.96, 0);
    tip.rotation.z = Math.PI / 4;
    group.add(tip);

    // Guardia (guard): marrón oscura simple
    const guardMat = new THREE.MeshStandardMaterial({ color: 0x4a3016, metalness: 0.3, roughness: 0.8 });
    const guardGeo = new THREE.BoxGeometry(0.22, 0.045, 0.045);
    const guard = new THREE.Mesh(guardGeo, guardMat);
    guard.position.set(0, 0.025, 0);
    group.add(guard);

    // Empuñadura (grip): cuero marrón envuelto
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x3d1f0a, metalness: 0.0, roughness: 0.95 });
    const gripGeo = new THREE.CylinderGeometry(0.028, 0.025, 0.28, 6);
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.set(0, -0.16, 0);
    grip.castShadow = true;
    group.add(grip);

    // Pomo (pommel): metálico simple
    const pommelGeo = new THREE.SphereGeometry(0.038, 6, 4);
    const pommel = new THREE.Mesh(pommelGeo, guardMat);
    pommel.position.set(0, -0.315, 0);
    group.add(pommel);

    // Orientación: igual que el GLB, girar para que apunte a lo largo del antebrazo
    group.rotation.set(Math.PI / 2, 0, 0);
    return group;
  }
}
