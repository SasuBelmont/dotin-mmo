import * as THREE from 'three';
import type { ActiveCombatMarker, WorldGatherNode, WorldMob, WorldNPC, WorldPlayer, WorldPrivateShop } from '../types';
import { AssetManager, type CharacterInstance, getCharacterModelKey, getStarterWeaponForClass } from './AssetManager';

export interface NameplateOptions {
  theme?: 'player' | 'npc' | 'mob' | 'metin' | 'portal' | 'resource' | 'shop' | 'combat';
  badgeType?: 'level' | 'crown' | 'skull' | 'metin' | 'portal' | 'resource' | 'shop' | 'combat';
  badgeText?: string;
  level?: number;
  subtitle?: string;
  subtitleColor?: string;
  titleColor?: string;
  accentColor?: string;
  plateWidth?: number;
}

export class WorldView {
  public scene: THREE.Scene;
  public group: THREE.Group = new THREE.Group();

  // Materiales compartidos para optimizar draw calls y memoria GPU
  private sharedRockMat?: THREE.MeshStandardMaterial;
  private sharedHighlightMat?: THREE.MeshStandardMaterial;
  private sharedWoodMat?: THREE.MeshStandardMaterial;
  private sharedRoofMat?: THREE.MeshStandardMaterial;
  private sharedStoneMat?: THREE.MeshStandardMaterial;
  private sharedLanternFlameMat?: THREE.MeshBasicMaterial;

  private playerMeshes: Map<string, THREE.Group> = new Map();
  private mobMeshes: Map<string, THREE.Group> = new Map();
  private npcMeshes: Map<string, THREE.Group> = new Map();
  private markerMeshes: Map<string, THREE.Group> = new Map();
  private shopMeshes: Map<string, THREE.Group> = new Map();
  private gatherMeshes: Map<string, THREE.Group> = new Map();

  private clickIndicator: THREE.Mesh;
  private clickIndicatorLife = 0;

  private portalVortexAnimators: Array<{
    vortexMesh: THREE.Mesh;
    runeMesh: THREE.Mesh;
    groundRune: THREE.Mesh;
    sparks: THREE.Mesh[];
    time: number;
  }> = [];
  private metinShards: THREE.Group[] = [];
  private waterTex?: THREE.Texture;

  public onMobClicked?: (mobId: string) => void;
  public onMarkerClicked?: (combatId: string) => void;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.scene.add(this.group);
    this.buildVillageEnvironment();
    this.initDefaultNPCs();
    this.initDefaultMobs();

    // Indicador circular de clic
    const clickGeo = new THREE.RingGeometry(0.3, 0.5, 24);
    const clickMat = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    });
    this.clickIndicator = new THREE.Mesh(clickGeo, clickMat);
    this.clickIndicator.rotation.x = -Math.PI / 2;
    this.clickIndicator.position.y = 0.05;
    this.group.add(this.clickIndicator);
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public showClickIndicator(point: THREE.Vector3): void {
    this.clickIndicator.position.set(point.x, 0.05, point.z);
    this.clickIndicator.scale.set(1, 1, 1);
    (this.clickIndicator.material as THREE.MeshBasicMaterial).opacity = 0.8;
    this.clickIndicatorLife = 0.45;
  }

  private buildVillageEnvironment(): void {
    const texLoader = new THREE.TextureLoader();

    // 1. Suelo del Overworld (Hierba y tierra exterior con textura Metin2)
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.05,
    });
    const grassTex = texLoader.load(
      '/assets/textures/grass.jpg',
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(28, 28);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        groundMat.needsUpdate = true;
      },
      undefined,
      (err) => console.warn('Could not load grass texture:', err)
    );
    grassTex.wrapS = THREE.RepeatWrapping;
    grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(28, 28);
    grassTex.colorSpace = THREE.SRGBColorSpace;
    groundMat.map = grassTex;

    const groundGeo = new THREE.PlaneGeometry(160, 160, 24, 24);
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.group.add(ground);

    // 1.1 Río de Metin2 con orillas de arena y muelle de madera para pesca
    this.waterTex = texLoader.load('/assets/textures/water.png', (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(12, 2);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
    });
    this.waterTex.wrapS = THREE.RepeatWrapping;
    this.waterTex.wrapT = THREE.RepeatWrapping;
    this.waterTex.repeat.set(12, 2);

    const riverGroup = new THREE.Group();

    // Orilla Norte de arena (z = 45.5..47.5)
    const sandTex = texLoader.load('/assets/textures/sand.png', (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(16, 1);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
    });
    sandTex.wrapS = THREE.RepeatWrapping;
    sandTex.wrapT = THREE.RepeatWrapping;
    sandTex.repeat.set(16, 1);
    const bankMat = new THREE.MeshStandardMaterial({
      map: sandTex,
      roughness: 0.9,
    });
    const northBankGeo = new THREE.PlaneGeometry(140, 2.8);
    const northBank = new THREE.Mesh(northBankGeo, bankMat);
    northBank.rotation.x = -Math.PI / 2;
    northBank.position.set(0, 0.01, 46.2);
    northBank.receiveShadow = true;
    riverGroup.add(northBank);

    // Orilla Sur de arena (z = 56.5..58.5)
    const southBankGeo = new THREE.PlaneGeometry(140, 2.8);
    const southBank = new THREE.Mesh(southBankGeo, bankMat);
    southBank.rotation.x = -Math.PI / 2;
    southBank.position.set(0, 0.01, 57.8);
    southBank.receiveShadow = true;
    riverGroup.add(southBank);

    // Superficie y cauce de agua cristalina animada de Metin2
    const waterMat = new THREE.MeshStandardMaterial({
      map: this.waterTex,
      color: 0x1f7a8c,
      transparent: true,
      opacity: 0.85,
      roughness: 0.12,
      metalness: 0.25,
    });
    const waterGeo = new THREE.PlaneGeometry(140, 10.5);
    const riverWater = new THREE.Mesh(waterGeo, waterMat);
    riverWater.rotation.x = -Math.PI / 2;
    riverWater.position.set(0, 0.02, 52.0);
    riverWater.receiveShadow = true;
    riverGroup.add(riverWater);

    // Muelle de Madera Oficial de Metin2 para Pesca
    const pierGroup = new THREE.Group();
    pierGroup.position.set(-8, 0, 48.5);

    const woodPlanksTex = texLoader.load('/assets/textures/mt2_dock_continuous.png?v=9');
    woodPlanksTex.wrapS = THREE.ClampToEdgeWrapping;
    woodPlanksTex.wrapT = THREE.ClampToEdgeWrapping;
    woodPlanksTex.repeat.set(1, 1);
    woodPlanksTex.colorSpace = THREE.SRGBColorSpace;

    const pierDeckMat = new THREE.MeshStandardMaterial({
      map: woodPlanksTex,
      roughness: 0.85,
      metalness: 0.05,
    });

    const pierTimberMat = new THREE.MeshStandardMaterial({
      color: 0x422a18,
      roughness: 0.85,
    });

    // Plataforma principal del muelle a ras de agua (y ≈ 0.28) con textura continua de madera de extremo a extremo
    const pierDeckGeo = new THREE.BoxGeometry(4.2, 0.22, 10.5);
    const deckMats = [
      pierTimberMat,
      pierTimberMat,
      pierDeckMat, // Top face (superficie del muelle)
      pierTimberMat,
      pierTimberMat,
      pierTimberMat,
    ];
    const pierDeck = new THREE.Mesh(pierDeckGeo, deckMats);
    pierDeck.position.set(0, 0.26, 3.2);
    pierDeck.receiveShadow = true;
    pierDeck.castShadow = true;
    pierGroup.add(pierDeck);

    // Pilotes de madera clavados en el lecho del río
    for (let x = -1.8; x <= 1.8; x += 3.6) {
      for (let z = -1.0; z <= 7.5; z += 2.8) {
        const pileGeo = new THREE.CylinderGeometry(0.16, 0.18, 2.2, 8);
        const pile = new THREE.Mesh(pileGeo, pierTimberMat);
        pile.position.set(x, -0.6, z);
        pile.castShadow = true;
        pierGroup.add(pile);

        // Bolardo de amarre sobre la tarima
        const bollardGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.65, 8);
        const bollard = new THREE.Mesh(bollardGeo, pierTimberMat);
        bollard.position.set(x, 0.6, z);
        bollard.castShadow = true;
        pierGroup.add(bollard);
      }
    }

    // Barandillas laterales de cuerda y madera
    for (let i = -1; i <= 1; i += 2) {
      const railGeo = new THREE.BoxGeometry(0.12, 0.14, 9.8);
      const rail = new THREE.Mesh(railGeo, pierTimberMat);
      rail.position.set(i * 1.9, 0.75, 3.2);
      pierGroup.add(rail);
    }

    // Poste con farol de pesca en el extremo del muelle
    const lanternPostGeo = new THREE.CylinderGeometry(0.1, 0.12, 2.8, 6);
    const lanternPost = new THREE.Mesh(lanternPostGeo, pierTimberMat);
    lanternPost.position.set(1.8, 1.4, 7.8);
    pierGroup.add(lanternPost);

    const lanternArmGeo = new THREE.BoxGeometry(0.6, 0.08, 0.08);
    const lanternArm = new THREE.Mesh(lanternArmGeo, pierTimberMat);
    lanternArm.position.set(1.5, 2.6, 7.8);
    pierGroup.add(lanternArm);

    const pierLantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffbb33 })
    );
    pierLantern.position.set(1.2, 2.45, 7.8);
    pierGroup.add(pierLantern);

    // Bote de pesca tradicional de Metin2 amarrado junto al muelle
    AssetManager.getInstance().getInstancedModel('fishing_boat').then((boat) => {
      if (boat) {
        boat.scale.setScalar(0.0055);
        boat.position.set(-3.2, 0.08, 4.0);
        boat.rotation.y = 0.25;
        pierGroup.add(boat);
      }
    });

    // Barriles de madera en el muelle
    AssetManager.getInstance().getInstancedModel('wood_barrel').then((barrel) => {
      if (barrel) {
        barrel.scale.setScalar(0.011);
        barrel.position.set(1.2, 0.38, 1.2);
        pierGroup.add(barrel);
      }
    });

    // Cajas de aparejos de madera de Metin2
    AssetManager.getInstance().getInstancedModel('wood_box').then((box) => {
      if (box) {
        box.scale.setScalar(0.008);
        box.position.set(1.2, 0.38, 2.5);
        box.rotation.y = 0.3;
        pierGroup.add(box);
      }
    });

    // Fogata con brasas de pescador en el inicio del muelle
    AssetManager.getInstance().getInstancedModel('campfire').then((camp) => {
      if (camp) {
        camp.scale.setScalar(0.014);
        camp.position.set(-1.2, 0.15, -2.4);
        pierGroup.add(camp);
      }
    });

    riverGroup.add(pierGroup);

    // Puentes oficiales de madera de Metin2 (b-general_wbridge01) que cruzan el río
    // Puente Central en x = 0, z = 52
    AssetManager.getInstance().getInstancedModel('bridge').then((bridge1) => {
      if (bridge1) {
        bridge1.scale.setScalar(0.0035);
        bridge1.rotation.y = Math.PI / 2;
        bridge1.position.set(0, 0.1, 52);
        this.group.add(bridge1);
      }
    });

    // Puente Este en x = 32, z = 52
    AssetManager.getInstance().getInstancedModel('bridge').then((bridge2) => {
      if (bridge2) {
        bridge2.scale.setScalar(0.0035);
        bridge2.rotation.y = Math.PI / 2;
        bridge2.position.set(32, 0.1, 52);
        this.group.add(bridge2);
      }
    });

    // Pabellón / Glorieta oriental de Metin2 (milgyo_pavilion) junto al río (Imagen 3)
    AssetManager.getInstance().getInstancedModel('gazebo').then((gazebo) => {
      if (gazebo) {
        gazebo.scale.setScalar(0.0045);
        gazebo.position.set(-16, 0.05, 41.5);
        gazebo.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
              if (mat instanceof THREE.MeshStandardMaterial) {
                mat.side = THREE.DoubleSide;
                mat.roughness = 0.72;
                mat.metalness = 0.05;
                if (mat.map) {
                  mat.map.colorSpace = THREE.SRGBColorSpace;
                }
              }
            }
          }
        });
        this.group.add(gazebo);
      }
    });

    this.group.add(riverGroup);

    // 2. Plaza central de adoquines de la aldea
    const plazaMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.75,
      metalness: 0.1,
    });
    const stoneTex = texLoader.load(
      '/assets/textures/stone.jpg',
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(8, 8);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        plazaMat.needsUpdate = true;
      },
      undefined,
      (err) => console.warn('Could not load stone texture:', err)
    );
    stoneTex.wrapS = THREE.RepeatWrapping;
    stoneTex.wrapT = THREE.RepeatWrapping;
    stoneTex.repeat.set(8, 8);
    stoneTex.colorSpace = THREE.SRGBColorSpace;
    plazaMat.map = stoneTex;

    const plazaGeo = new THREE.CircleGeometry(16, 32);
    const plaza = new THREE.Mesh(plazaGeo, plazaMat);
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.01;
    plaza.receiveShadow = true;
    this.group.add(plaza);

    // Material de calzada para los caminos
    const pathMat = new THREE.MeshStandardMaterial({
      map: stoneTex,
      color: 0xffffff,
      roughness: 0.8,
    });

    // 1. Camino Principal hacia el Norte (Hacia el Valle de Seungryong / Frontera Norte)
    // Se extiende desde la plaza central (z = -14) hasta el portal norte (z = -65)
    const northPathGeo = new THREE.PlaneGeometry(7.5, 52);
    const northPath = new THREE.Mesh(northPathGeo, pathMat);
    northPath.rotation.x = -Math.PI / 2;
    northPath.position.set(0, 0.02, -39.5);
    northPath.receiveShadow = true;
    this.group.add(northPath);

    // Faroles orientales alineados en el camino Norte
    this.createStoneLantern(new THREE.Vector3(-4.5, 0, -22));
    this.createStoneLantern(new THREE.Vector3(4.5, 0, -22));
    this.createStoneLantern(new THREE.Vector3(-4.5, 0, -36));
    this.createStoneLantern(new THREE.Vector3(4.5, 0, -36));
    this.createStoneLantern(new THREE.Vector3(-4.5, 0, -50));
    this.createStoneLantern(new THREE.Vector3(4.5, 0, -50));

    // 2. Camino Principal hacia el Este (Hacia el Desierto de Yongbi / Frontera Este)
    // Se extiende desde la plaza central (x = 14) hasta el portal este (x = 65)
    const eastPathGeo = new THREE.PlaneGeometry(52, 7.5);
    const eastPath = new THREE.Mesh(eastPathGeo, pathMat);
    eastPath.rotation.x = -Math.PI / 2;
    eastPath.position.set(39.5, 0.02, 0);
    eastPath.receiveShadow = true;
    this.group.add(eastPath);

    // Faroles orientales y cerezos alineados en el camino Este
    this.createStoneLantern(new THREE.Vector3(22, 0, -4.5));
    this.createStoneLantern(new THREE.Vector3(22, 0, 4.5));
    this.createStoneLantern(new THREE.Vector3(36, 0, -4.5));
    this.createStoneLantern(new THREE.Vector3(36, 0, 4.5));
    this.createStoneLantern(new THREE.Vector3(50, 0, -4.5));
    this.createStoneLantern(new THREE.Vector3(50, 0, 4.5));
    this.createTree(new THREE.Vector3(28, 0, 8), true);
    this.createTree(new THREE.Vector3(44, 0, -8), true);

    // 3. Sendero local menor hacia el sur (Hacia la zona de caza y Piedra Metin)
    const southPathGeo = new THREE.PlaneGeometry(6, 22);
    const southPath = new THREE.Mesh(southPathGeo, pathMat);
    southPath.rotation.x = -Math.PI / 2;
    southPath.position.set(0, 0.02, 24);
    southPath.receiveShadow = true;
    this.group.add(southPath);

    // 4. Puertas interiores de bienvenida a la plaza de la aldea
    this.createOrientalGate(new THREE.Vector3(0, 0, -18), 0);
    this.createOrientalGate(new THREE.Vector3(18, 0, 0), -Math.PI / 2);
    this.createOrientalGate(new THREE.Vector3(0, 0, 18), Math.PI);
    this.createOrientalGate(new THREE.Vector3(-18, 0, 0), Math.PI / 2);

    // 5. Los Dos Grandes Portales Fronterizos
    // Portal Norte (Valle de Seungryong) en z = -65
    this.createMapPortal(
      new THREE.Vector3(0, 0, -65),
      0,
      'Valle de Seungryong',
      'Frontera Norte (Próximamente)',
      0x38bdf8
    );

    // Portal Este (Desierto de Yongbi) en x = 65
    this.createMapPortal(
      new THREE.Vector3(65, 0, 0),
      -Math.PI / 2,
      'Desierto de Yongbi',
      'Frontera Este (Próximamente)',
      0xc084fc
    );

    // 6. Límites del Mapa: Cordilleras montañosas, empalizadas y torres defensivas
    this.buildMapBoundaries();

    // 7. Edificios de la Aldea con modelos oficiales de Metin2 (Bank, Itemshop, Casas)
    this.createHouse(new THREE.Vector3(-18, 0, -18), 0.3, 'bank');
    this.createHouse(new THREE.Vector3(18, 0, -18), -0.3, 'itemshop');
    this.createHouse(new THREE.Vector3(-22, 0, 14), Math.PI / 4, 'house');
    this.createHouse(new THREE.Vector3(22, 0, 14), -Math.PI / 4, 'house');

    // 8. Árboles (Modelos oficiales de Metin2 con corteza y hojas auténticas)
    // Se colocan en los bordes de la aldea y en la naturaleza, evitando la plaza, los caminos y el río
    const treePositions = [
      new THREE.Vector3(-12, 0, -28),
      new THREE.Vector3(12, 0, -28),
      new THREE.Vector3(-28, 0, -12),
      new THREE.Vector3(28, 0, -12),
      new THREE.Vector3(-32, 0, 8),
      new THREE.Vector3(32, 0, 8),
      new THREE.Vector3(-18, 0, 32),
      new THREE.Vector3(18, 0, 32),
      new THREE.Vector3(-36, 0, 36),
      new THREE.Vector3(36, 0, 36),
      new THREE.Vector3(-42, 0, -22),
      new THREE.Vector3(42, 0, -22),
      new THREE.Vector3(-14, 0, 68),
      new THREE.Vector3(14, 0, 68),
      new THREE.Vector3(-30, 0, 68),
      new THREE.Vector3(30, 0, 68),
    ];
    for (let i = 0; i < treePositions.length; i++) {
      this.createTree(treePositions[i], i % 2 === 0);
    }
  }

  private initDefaultNPCs(): void {
    const defaultNPCs: WorldNPC[] = [
      { id: 'npc_guardian', name: 'Guardián de la Aldea', title: 'Comandante', pos: { x: 0, z: -5 } },
      { id: 'npc_blacksmith', name: 'Herrero', title: 'Mejora de Equipamiento', pos: { x: -12, z: 0 } },
      { id: 'npc_store', name: 'Vendedora', title: 'Pociones y Vituallas', pos: { x: 12, z: 0 } },
      { id: 'npc_storekeeper', name: 'Almacenero', title: 'Depósito Seguro y Yang', pos: { x: -6, z: -10 } },
      { id: 'npc_market_board', name: 'Tablón de Mercado', title: 'Casa de Subastas Central', pos: { x: 6, z: -10 } },
      { id: 'npc_furnace', name: 'Horno de Fundición', title: 'Refinado y Crafteo', pos: { x: -16, z: -2 } },
    ];
    this.syncNPCs(defaultNPCs);
  }

  private initDefaultMobs(): void {
    const defaultMobs: WorldMob[] = [
      { id: 'mob_1', name: 'Perro Salvaje', mob_type: 'wild_dog', pos: { x: 14, z: 32 }, spawn_pos: { x: 14, z: 32 }, level: 1, hp: 60, max_hp: 60, is_alive: true },
      { id: 'mob_2', name: 'Perro Salvaje', mob_type: 'wild_dog', pos: { x: -14, z: 32 }, spawn_pos: { x: -14, z: 32 }, level: 1, hp: 60, max_hp: 60, is_alive: true },
      { id: 'mob_3', name: 'Perro Salvaje', mob_type: 'wild_dog', pos: { x: 32, z: -32 }, spawn_pos: { x: 32, z: -32 }, level: 1, hp: 60, max_hp: 60, is_alive: true },
      { id: 'mob_4', name: 'Lobo Hambriento', mob_type: 'wolf', pos: { x: -34, z: -30 }, spawn_pos: { x: -34, z: -30 }, level: 3, hp: 110, max_hp: 110, is_alive: true },
      { id: 'mob_5', name: 'Lobo Hambriento', mob_type: 'wolf', pos: { x: 28, z: 26 }, spawn_pos: { x: 28, z: 26 }, level: 3, hp: 110, max_hp: 110, is_alive: true },
      { id: 'mob_6', name: 'Lobo Alfa', mob_type: 'wolf', pos: { x: -32, z: 26 }, spawn_pos: { x: -32, z: 26 }, level: 5, hp: 160, max_hp: 160, is_alive: true },
      { id: 'mob_7', name: 'Piedra Metin de Dolor', mob_type: 'metin_stone', pos: { x: 0, z: 68 }, spawn_pos: { x: 0, z: 68 }, level: 5, hp: 260, max_hp: 260, is_alive: true },
    ];
    this.syncMobs(defaultMobs);
  }

  private createOrientalGate(pos: THREE.Vector3, rotY: number): void {
    const gate = new THREE.Group();
    gate.position.copy(pos);
    gate.rotation.y = rotY;

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b1e0f, roughness: 0.65 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x3d1007, roughness: 0.75 });

    // Pilares con zócalos de piedra y ménsulas Dougong
    for (let i = -1; i <= 1; i += 2) {
      const baseGeo = new THREE.CylinderGeometry(0.42, 0.48, 0.5, 8);
      const baseMesh = new THREE.Mesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.9 }));
      baseMesh.position.set(i * 2.8, 0.25, 0);
      gate.add(baseMesh);

      const pillarGeo = new THREE.CylinderGeometry(0.28, 0.34, 4.6, 8);
      const pillar = new THREE.Mesh(pillarGeo, woodMat);
      pillar.position.set(i * 2.8, 2.55, 0);
      pillar.castShadow = true;
      gate.add(pillar);

      // Bloques de ménsula (Dougong oriental)
      const bracketGeo = new THREE.BoxGeometry(0.85, 0.42, 0.85);
      const bracket = new THREE.Mesh(bracketGeo, darkWoodMat);
      bracket.position.set(i * 2.8, 4.75, 0);
      gate.add(bracket);
    }

    // Travesaño secundario (Nuki)
    const nukiGeo = new THREE.BoxGeometry(6.6, 0.26, 0.42);
    const nuki = new THREE.Mesh(nukiGeo, woodMat);
    nuki.position.set(0, 4.15, 0);
    gate.add(nuki);

    // Viga dintel principal superior (Kashinoki)
    const beamGeo = new THREE.BoxGeometry(7.6, 0.45, 0.75);
    const beam = new THREE.Mesh(beamGeo, woodMat);
    beam.position.y = 4.95;
    beam.castShadow = true;
    gate.add(beam);

    // Tejado pagoda oriental auténtico de Metin2:
    // Estructura a dos aguas con aleros extendidos y cumbrera (elimina el cono triangular deformado)
    const gateTexLoader = new THREE.TextureLoader();
    const gateRoofTex = gateTexLoader.load('/assets/textures/mt2_roof_clean.png?v=2');
    gateRoofTex.wrapS = THREE.RepeatWrapping;
    gateRoofTex.wrapT = THREE.RepeatWrapping;
    gateRoofTex.repeat.set(4, 2);
    gateRoofTex.colorSpace = THREE.SRGBColorSpace;

    const gateRoofMat = new THREE.MeshStandardMaterial({
      map: gateRoofTex,
      roughness: 0.65,
      metalness: 0.1,
    });

    // Vertiente delantera del tejado
    const pitchFrontGeo = new THREE.BoxGeometry(8.2, 0.16, 1.55);
    const pitchFront = new THREE.Mesh(pitchFrontGeo, gateRoofMat);
    pitchFront.position.set(0, 5.38, 0.62);
    pitchFront.rotation.x = 0.35;
    pitchFront.castShadow = true;
    gate.add(pitchFront);

    // Vertiente trasera del tejado
    const pitchBackGeo = new THREE.BoxGeometry(8.2, 0.16, 1.55);
    const pitchBack = new THREE.Mesh(pitchBackGeo, gateRoofMat);
    pitchBack.position.set(0, 5.38, -0.62);
    pitchBack.rotation.x = -0.35;
    pitchBack.castShadow = true;
    gate.add(pitchBack);

    // Cumbrera central decorativa (Ridge cap)
    const ridgeGeo = new THREE.BoxGeometry(8.6, 0.32, 0.52);
    const ridge = new THREE.Mesh(ridgeGeo, darkWoodMat);
    ridge.position.set(0, 5.68, 0);
    ridge.castShadow = true;
    gate.add(ridge);

    // Remates decorativos en los extremos de la cumbrera
    for (let end = -1; end <= 1; end += 2) {
      const finialGeo = new THREE.BoxGeometry(0.48, 0.52, 0.42);
      const finial = new THREE.Mesh(finialGeo, new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4 }));
      finial.position.set(end * 4.35, 5.86, 0);
      finial.rotation.z = -end * 0.4;
      gate.add(finial);
    }

    this.group.add(gate);
  }

  private createHouse(pos: THREE.Vector3, rotY: number, houseType: 'house' | 'itemshop' | 'bank' = 'house'): void {
    const house = new THREE.Group();
    house.position.copy(pos);
    house.rotation.y = rotY;

    // Cargar modelo oficial de Metin2 (building_bank para banco, itemshop para tienda, house para casas)
    const modelKey = houseType === 'bank' ? 'building_bank' : houseType === 'itemshop' ? 'itemshop' : 'house';

    AssetManager.getInstance().getInstancedModel(modelKey).then((model) => {
      if (model) {
        model.scale.setScalar(0.008);
        model.position.set(0, 0, 0);

        // Ajustar materiales para realzar las tejas de tejado y paredes de madera/piedra de Metin2
        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
              if (mat instanceof THREE.MeshStandardMaterial) {
                mat.roughness = 0.82;
                mat.metalness = 0.05;
                if (mat.map) {
                  mat.map.colorSpace = THREE.SRGBColorSpace;
                }
              }
            }
          }
        });

        house.add(model);
      }
    });

    // Linterna emissiva (MeshBasicMaterial — cero coste de lighting por edificio)
    const lanternGeo = new THREE.SphereGeometry(0.3, 8, 8);
    const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    const lantern = new THREE.Mesh(lanternGeo, lanternMat);
    lantern.position.set(0, 2.8, 3.2);
    house.add(lantern);

    this.group.add(house);
  }

  private createTree(pos: THREE.Vector3, isSakura: boolean): void {
    const tree = new THREE.Group();
    tree.position.copy(pos);

    AssetManager.getInstance().getInstancedModel('tree').then((model) => {
      if (model) {
        model.scale.setScalar(1.0);
        model.position.set(0, 0, 0);
        tree.add(model);
      } else {
        const trunkGeo = new THREE.CylinderGeometry(0.2, 0.35, 2.5, 7);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2716, roughness: 0.9 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 1.25;
        trunk.castShadow = true;
        tree.add(trunk);

        const leavesColor = isSakura ? 0xf472b6 : 0x15803d;
        const leavesMat = new THREE.MeshStandardMaterial({ color: leavesColor, roughness: 0.7 });
        for (let i = 0; i < 3; i++) {
          const geo = new THREE.DodecahedronGeometry(1.2 - i * 0.25);
          const m = new THREE.Mesh(geo, leavesMat);
          m.position.y = 2.4 + i * 0.8;
          m.castShadow = true;
          tree.add(m);
        }
      }
    });

    this.group.add(tree);
  }

  private buildMapBoundaries(): void {
    // 1. Picos gigantes en las 4 esquinas del mapa
    this.createMountainPeak(new THREE.Vector3(-72, 0, -72), 14, 22);
    this.createMountainPeak(new THREE.Vector3(72, 0, -72), 14, 22);
    this.createMountainPeak(new THREE.Vector3(-76, 0, 80), 14, 22);
    this.createMountainPeak(new THREE.Vector3(76, 0, 80), 14, 22);

    // 2. Cordillera Norte (z ≈ -72): Montañas masivas a izquierda y derecha del paso del portal
    for (let x = -64; x <= -10; x += 11) {
      this.createMountainPeak(new THREE.Vector3(x, 0, -72), 9, 15 + ((x * 3) % 4));
    }
    for (let x = 10; x <= 64; x += 11) {
      this.createMountainPeak(new THREE.Vector3(x, 0, -72), 9, 15 + ((x * 5) % 4));
    }

    // Telón de fondo montañoso sellado detrás del Portal Norte (Valle de Seungryong z = -65):
    // Elimina el hueco de cielo azul visible detrás de la torre y el portal (Imagen 1)
    this.createMountainPeak(new THREE.Vector3(0, 0, -84), 18, 26);
    this.createMountainPeak(new THREE.Vector3(-12, 0, -81), 15, 24);
    this.createMountainPeak(new THREE.Vector3(12, 0, -81), 15, 24);
    this.createMountainPeak(new THREE.Vector3(-6, 0, -77), 13, 22);
    this.createMountainPeak(new THREE.Vector3(6, 0, -77), 13, 22);
    this.createMountainPeak(new THREE.Vector3(-20, 0, -82), 16, 26);
    this.createMountainPeak(new THREE.Vector3(-28, 0, -80), 16, 26);
    this.createMountainPeak(new THREE.Vector3(20, 0, -82), 16, 26);
    this.createMountainPeak(new THREE.Vector3(28, 0, -80), 16, 26);

    // 3. Cordillera Este (x ≈ 72): Montañas masivas a izquierda y derecha del paso del portal
    for (let z = -64; z <= -10; z += 11) {
      this.createMountainPeak(new THREE.Vector3(72, 0, z), 9, 15 + ((z * 3) % 4));
    }
    for (let z = 10; z <= 64; z += 11) {
      this.createMountainPeak(new THREE.Vector3(72, 0, z), 9, 15 + ((z * 5) % 4));
    }

    // Telón de fondo montañoso sellado detrás del Portal Este (Desierto de Yongbi x = 65)
    this.createMountainPeak(new THREE.Vector3(84, 0, 0), 16, 24);
    this.createMountainPeak(new THREE.Vector3(80, 0, -12), 13, 22);
    this.createMountainPeak(new THREE.Vector3(80, 0, 12), 13, 22);
    this.createMountainPeak(new THREE.Vector3(77, 0, -6), 11, 20);
    this.createMountainPeak(new THREE.Vector3(77, 0, 6), 11, 20);

    // 4. Cordillera Sur (z ≈ 80): Cadena montañosa continua e infranqueable rodeando la zona de caza y Piedra Metin
    for (let x = -72; x <= 72; x += 9.5) {
      this.createMountainPeak(new THREE.Vector3(x, 0, 80), 8.5, 14 + ((x * 7) % 5));
    }

    // 5. Cordillera Oeste (x ≈ -72): Cadena montañosa continua e infranqueable
    for (let z = -64; z <= 64; z += 9.5) {
      this.createMountainPeak(new THREE.Vector3(-72, 0, z), 8.5, 14 + ((z * 7) % 5));
    }

    // 6. Torres de vigilancia orientales de guardia
    this.createWatchTower(new THREE.Vector3(-12, 0, -64));
    this.createWatchTower(new THREE.Vector3(12, 0, -64));
    this.createWatchTower(new THREE.Vector3(64, 0, -12));
    this.createWatchTower(new THREE.Vector3(64, 0, 12));
    this.createWatchTower(new THREE.Vector3(-55, 0, 68));
    this.createWatchTower(new THREE.Vector3(55, 0, 68));
  }

  private createMountainPeak(pos: THREE.Vector3, radius: number, height: number): void {
    const peak = new THREE.Group();
    peak.position.copy(pos);

    if (!this.sharedRockMat) {
      const texLoader = new THREE.TextureLoader();
      const rockTex = texLoader.load('/assets/textures/mt2_stone01.png');
      rockTex.wrapS = THREE.RepeatWrapping;
      rockTex.wrapT = THREE.RepeatWrapping;
      rockTex.repeat.set(3, 3);
      rockTex.colorSpace = THREE.SRGBColorSpace;

      const cliffTex = texLoader.load('/assets/textures/mt2_stone02.png');
      cliffTex.wrapS = THREE.RepeatWrapping;
      cliffTex.wrapT = THREE.RepeatWrapping;
      cliffTex.repeat.set(2, 2);
      cliffTex.colorSpace = THREE.SRGBColorSpace;

      this.sharedRockMat = new THREE.MeshStandardMaterial({
        map: rockTex,
        roughness: 0.88,
        metalness: 0.1,
      });
      this.sharedHighlightMat = new THREE.MeshStandardMaterial({
        map: cliffTex,
        roughness: 0.85,
        metalness: 0.08,
      });
    }

    // Formación de risco montañoso escalonado de Metin2 (materiales compartidos, sin castShadow innecesario)
    const mainGeo = new THREE.CylinderGeometry(radius * 0.35, radius, height, 7, 1);
    const mainMesh = new THREE.Mesh(mainGeo, this.sharedRockMat);
    mainMesh.position.y = height / 2;
    mainMesh.rotation.y = ((pos.x * 37 + pos.z * 19) % 314) / 100;
    mainMesh.castShadow = false;
    mainMesh.receiveShadow = true;
    peak.add(mainMesh);

    // Salientes rocosos y peñascos angulares superpuestos estilo Metin2
    for (let b = 0; b < 3; b++) {
      const bRad = radius * (0.35 + b * 0.15);
      const bGeo = new THREE.DodecahedronGeometry(bRad, 0);
      const bMesh = new THREE.Mesh(bGeo, this.sharedHighlightMat!);
      const ang = (b * Math.PI * 2) / 3;
      bMesh.position.set(Math.cos(ang) * radius * 0.45, (height * (b + 1)) / 4.5, Math.sin(ang) * radius * 0.45);
      bMesh.scale.set(1.2, 0.85 + b * 0.2, 1.1);
      bMesh.castShadow = false;
      bMesh.receiveShadow = false;
      peak.add(bMesh);
    }

    this.group.add(peak);
  }

  private createWatchTower(pos: THREE.Vector3): void {
    const tower = new THREE.Group();
    tower.position.copy(pos);

    if (!this.sharedWoodMat) this.sharedWoodMat = new THREE.MeshStandardMaterial({ color: 0x3d2716, roughness: 0.85 });
    if (!this.sharedRoofMat) {
      const roofTex = new THREE.TextureLoader().load('/assets/textures/mt2_roof_clean.png?v=2');
      roofTex.wrapS = THREE.RepeatWrapping;
      roofTex.wrapT = THREE.RepeatWrapping;
      roofTex.repeat.set(4, 4);
      roofTex.colorSpace = THREE.SRGBColorSpace;
      this.sharedRoofMat = new THREE.MeshStandardMaterial({
        map: roofTex,
        roughness: 0.65,
        metalness: 0.1,
      });
    }
    if (!this.sharedLanternFlameMat) this.sharedLanternFlameMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

    // 4 postes principales
    for (let x = -1; x <= 1; x += 2) {
      for (let z = -1; z <= 1; z += 2) {
        const postGeo = new THREE.CylinderGeometry(0.18, 0.22, 6.5, 6);
        const post = new THREE.Mesh(postGeo, this.sharedWoodMat);
        post.position.set(x * 1.3, 3.25, z * 1.3);
        tower.add(post);
      }
    }

    // Plataforma de guardia con barandillas
    const platGeo = new THREE.BoxGeometry(3.6, 0.28, 3.6);
    const plat = new THREE.Mesh(platGeo, this.sharedWoodMat);
    plat.position.y = 5.2;
    tower.add(plat);

    // Tejado pagoda de doble alero auténtico estilo Metin2 (aleros inclinados a cuatro aguas)
    // 1. Alero inferior ancho
    const eaveLowerGeo = new THREE.ConeGeometry(3.6, 0.85, 4);
    const eaveLower = new THREE.Mesh(eaveLowerGeo, this.sharedRoofMat);
    eaveLower.position.y = 6.0;
    eaveLower.rotation.y = Math.PI / 4;
    eaveLower.castShadow = true;
    tower.add(eaveLower);

    // 2. Alero superior pagoda
    const eaveUpperGeo = new THREE.ConeGeometry(2.5, 0.75, 4);
    const eaveUpper = new THREE.Mesh(eaveUpperGeo, this.sharedRoofMat);
    eaveUpper.position.y = 6.8;
    eaveUpper.rotation.y = Math.PI / 4;
    eaveUpper.castShadow = true;
    tower.add(eaveUpper);

    // 3. Remate / Aguja ornamental de bronce en el vértice
    const spireGeo = new THREE.CylinderGeometry(0.08, 0.28, 0.9, 6);
    const spireMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.3 });
    const spire = new THREE.Mesh(spireGeo, spireMat);
    spire.position.y = 7.7;
    tower.add(spire);

    // Farol de guardia brillante (sin coste de PointLight dinámico innecesario)
    const lanternGeo = new THREE.SphereGeometry(0.25, 8, 8);
    const lantern = new THREE.Mesh(lanternGeo, this.sharedLanternFlameMat);
    lantern.position.set(0, 5.0, 0);
    tower.add(lantern);

    this.group.add(tower);
  }

  private createStoneLantern(pos: THREE.Vector3): void {
    const lantern = new THREE.Group();
    lantern.position.copy(pos);

    if (!this.sharedStoneMat) {
      const stoneTex = new THREE.TextureLoader().load('/assets/textures/mt2_stone_lantern.png?v=3');
      stoneTex.wrapS = THREE.RepeatWrapping;
      stoneTex.wrapT = THREE.RepeatWrapping;
      stoneTex.repeat.set(1, 1);
      stoneTex.colorSpace = THREE.SRGBColorSpace;
      this.sharedStoneMat = new THREE.MeshStandardMaterial({
        map: stoneTex,
        roughness: 0.85,
        metalness: 0.08,
      });
    }
    if (!this.sharedLanternFlameMat) {
      this.sharedLanternFlameMat = new THREE.MeshBasicMaterial({ color: 0xffcc44 });
    }

    // 1. Base cúbica de piedra tallada con reborde
    const baseGeo = new THREE.BoxGeometry(0.72, 0.42, 0.72);
    const base = new THREE.Mesh(baseGeo, this.sharedStoneMat);
    base.position.y = 0.21;
    base.receiveShadow = true;
    base.castShadow = true;
    lantern.add(base);

    // 2. Pilar central hexagonal
    const poleGeo = new THREE.CylinderGeometry(0.16, 0.2, 1.55, 6);
    const pole = new THREE.Mesh(poleGeo, this.sharedStoneMat);
    pole.position.y = 1.18;
    pole.receiveShadow = true;
    pole.castShadow = true;
    lantern.add(pole);

    // 3. Bandeja soporte de la lámpara (chashir)
    const shelfGeo = new THREE.BoxGeometry(0.68, 0.14, 0.68);
    const shelf = new THREE.Mesh(shelfGeo, this.sharedStoneMat);
    shelf.position.y = 1.98;
    shelf.receiveShadow = true;
    shelf.castShadow = true;
    lantern.add(shelf);

    // 4. Ventanal de fuego: 4 postes de esquina y núcleo ardiente central
    for (let x = -0.24; x <= 0.24; x += 0.48) {
      for (let z = -0.24; z <= 0.24; z += 0.48) {
        const postGeo = new THREE.BoxGeometry(0.08, 0.48, 0.08);
        const post = new THREE.Mesh(postGeo, this.sharedStoneMat);
        post.position.set(x, 2.26, z);
        post.castShadow = true;
        lantern.add(post);
      }
    }

    // Fuego místico visible en el centro
    const fireGeo = new THREE.SphereGeometry(0.18, 10, 10);
    const fire = new THREE.Mesh(fireGeo, this.sharedLanternFlameMat);
    fire.position.y = 2.26;
    lantern.add(fire);

    // Iluminación cálida nocturna suave
    const light = new THREE.PointLight(0xff9922, 1.25, 8.5);
    light.position.set(0, 2.3, 0);
    lantern.add(light);

    // 5. Tejado oriental de pagoda con alero ancho
    const eaveGeo = new THREE.BoxGeometry(0.82, 0.08, 0.82);
    const eave = new THREE.Mesh(eaveGeo, this.sharedStoneMat);
    eave.position.y = 2.54;
    eave.castShadow = true;
    lantern.add(eave);

    const roofGeo = new THREE.ConeGeometry(0.66, 0.4, 4);
    const roof = new THREE.Mesh(roofGeo, this.sharedStoneMat);
    roof.position.y = 2.76;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    lantern.add(roof);

    // Remate superior en punta / esfera
    const finialGeo = new THREE.SphereGeometry(0.09, 8, 8);
    const finial = new THREE.Mesh(finialGeo, this.sharedStoneMat);
    finial.position.y = 3.02;
    lantern.add(finial);

    this.group.add(lantern);
  }

  private createMapPortal(
    pos: THREE.Vector3,
    rotY: number,
    title: string,
    subTitle: string,
    colorHex: number
  ): THREE.Group {
    const portalGroup = new THREE.Group();
    portalGroup.position.copy(pos);
    portalGroup.rotation.y = rotY;

    // Cargar modelo 3D oficial del Portal de Teletransporte de Metin2 (warpgate.glb)
    AssetManager.getInstance().getInstancedModel('warpgate').then((gateModel) => {
      if (gateModel) {
        gateModel.scale.setScalar(0.009);
        gateModel.position.set(0, 0, 0);
        gateModel.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            const cName = (child.name || '').toLowerCase();
            if (cName.includes('cube')) {
              mesh.visible = false;
              return;
            }
            const isCurtain = cName.includes('object01') || cName.includes('curtain') || cName.includes('gate02');
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
              if (mat instanceof THREE.Material) {
                if (isCurtain) {
                  mat.transparent = true;
                  mat.opacity = 0.82;
                  mat.depthWrite = false;
                  if (mat instanceof THREE.MeshStandardMaterial) {
                    mat.emissive = new THREE.Color(colorHex);
                    mat.emissiveIntensity = 0.7;
                  }
                } else {
                  // Elementos de piedra (arco warpgate01-01 y pilares warpgate01-02): 100% sólidos y opacos
                  mat.transparent = false;
                  mat.depthWrite = true;
                  if (mat instanceof THREE.MeshStandardMaterial) {
                    mat.emissiveIntensity = 0;
                  }
                }
              }
            }
          }
        });
        portalGroup.add(gateModel);
      }
    });

    // 1. Texturas oficiales del Vórtice Dimensional de Metin2
    const texLoader = new THREE.TextureLoader();
    const vortexTex = texLoader.load('/assets/textures/mt2_portal_vortex.png');
    vortexTex.colorSpace = THREE.SRGBColorSpace;
    const runesTex = texLoader.load('/assets/textures/mt2_portal_runes.png');
    runesTex.colorSpace = THREE.SRGBColorSpace;

    // 2. Vórtice vertical central dimensionado al arco (3.6m x 4.4m)
    const vortexGeo = new THREE.PlaneGeometry(3.6, 4.4);
    const vortexMat = new THREE.MeshBasicMaterial({
      map: vortexTex,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const vortexMesh = new THREE.Mesh(vortexGeo, vortexMat);
    vortexMesh.position.set(0, 3.2, 0.0);
    portalGroup.add(vortexMesh);

    // 3. Anillo de runas mágicas
    const runeGeo = new THREE.PlaneGeometry(3.8, 4.6);
    const runeMat = new THREE.MeshBasicMaterial({
      map: runesTex,
      color: 0x818cf8,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const runeMesh = new THREE.Mesh(runeGeo, runeMat);
    runeMesh.position.set(0, 3.2, 0.05);
    portalGroup.add(runeMesh);

    // 4. Círculo de teletransporte en el suelo
    const groundRuneGeo = new THREE.PlaneGeometry(4.2, 4.2);
    const groundRuneMat = new THREE.MeshBasicMaterial({
      map: runesTex,
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const groundRune = new THREE.Mesh(groundRuneGeo, groundRuneMat);
    groundRune.rotation.x = -Math.PI / 2;
    groundRune.position.set(0, 0.08, 0);
    portalGroup.add(groundRune);

    // Luz etérea emanada del núcleo del portal
    const portalLight = new THREE.PointLight(colorHex, 1.2, 10);
    portalLight.position.set(0, 3.2, 0.3);
    portalGroup.add(portalLight);

    // 5. Destellos etéreos que orbitan y ascienden por el portal
    const sparkGeo = new THREE.SphereGeometry(0.09, 6, 6);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const sparks: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const spark = new THREE.Mesh(sparkGeo, sparkMat);
      const angle = (i / 8) * Math.PI * 2;
      const rad = 1.0 + Math.random() * 1.2;
      spark.position.set(Math.cos(angle) * rad, 1.2 + Math.random() * 4.5, (Math.random() - 0.5) * 0.6);
      spark.userData = {
        angle: angle,
        rad: rad,
        speed: 0.9 + Math.random() * 0.7,
        ySpeed: 0.8 + Math.random() * 1.2,
      };
      sparks.push(spark);
      portalGroup.add(spark);
    }

    this.portalVortexAnimators.push({
      vortexMesh,
      runeMesh,
      groundRune,
      sparks,
      time: Math.random() * 10,
    });

    // Rótulo flotante de portal
    const titleColor = colorHex === 0x38bdf8 ? '#38bdf8' : '#c084fc';
    const nameSprite = this.createNameplate(title, titleColor, {
      theme: 'portal',
      badgeType: 'portal',
      subtitle: `‹ Hacia ${subTitle} ›`,
      subtitleColor: '#7dd3fc',
      titleColor: '#e0f2fe',
      accentColor: titleColor,
      plateWidth: 390,
    });
    nameSprite.position.y = 11.2;
    portalGroup.add(nameSprite);

    this.group.add(portalGroup);
    return portalGroup;
  }

  public syncNPCs(npcs: WorldNPC[]): void {
    for (const npc of npcs) {
      if (!this.npcMeshes.has(npc.id)) {
        const mesh = this.createNPCMesh(npc);
        this.group.add(mesh);
        this.npcMeshes.set(npc.id, mesh);
      }
    }
  }

  public syncGatherNodes(nodes: WorldGatherNode[]): void {
    const activeIds = new Set(nodes.map((n) => n.id));

    // Eliminar nodos que ya no existan
    for (const [id, group] of this.gatherMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.group.remove(group);
        this.gatherMeshes.delete(id);
      }
    }

    for (const node of nodes) {
      let group = this.gatherMeshes.get(node.id);
      if (!group) {
        group = this.createGatherNodeMesh(node);
        this.group.add(group);
        this.gatherMeshes.set(node.id, group);
      }

      // Actualizar posición y estado
      group.position.set(node.pos.x, 0, node.pos.z);
      group.userData = {
        gatherNodeId: node.id,
        isDepleted: node.is_depleted,
        nodeName: node.name,
      };

      // Si está agotado, reducir sutilmente la opacidad/escala
      const s = node.is_depleted ? 0.75 : 1.0;
      group.scale.set(s, node.is_depleted ? 0.6 : 1.0, s);
    }
  }

  private createGatherNodeMesh(node: WorldGatherNode): THREE.Group {
    const group = new THREE.Group();
    group.position.set(node.pos.x, 0, node.pos.z);
    group.userData = { gatherNodeId: node.id, isDepleted: node.is_depleted, nodeName: node.name };

    if (node.node_type === 'Mining') {
      const isCopper = node.id.includes('copper');
      const isEbony = node.id.includes('ebony');
      const veinModelName = isCopper ? 'copper_vein' : isEbony ? 'ebony_vein' : 'iron_vein';

      // Cargar modelo 3D oficial de Veta Mineral de Metin2
      AssetManager.getInstance().getInstancedModel(veinModelName).then((model) => {
        if (model) {
          model.scale.setScalar(0.012);
          model.position.set(0, 0, 0);
          group.add(model);
        }
      });

      // Brillo emissivo de la veta (cero PointLight — usa emissive en el modelo GLB cargado)

      const nameplate = this.createNameplate(`⛏️ ${node.name}`, isCopper ? '#f59e0b' : isEbony ? '#c084fc' : '#e2e8f0');
      nameplate.position.y = 2.4;
      group.add(nameplate);

    } else if (node.node_type === 'Woodcutting') {
      // Sauce Místico / Árbol de Tala: Modelo oficial SpeedTree de Metin2 (tree.glb)
      // Con corteza auténtica de Metin2 (beechbark), ramas orgánicas y follaje con aura mística
      const willowGroup = new THREE.Group();

      AssetManager.getInstance().getInstancedModel('tree').then((model) => {
        if (model) {
          model.scale.setScalar(1.38);
          model.position.set(0, 0, 0);

          // Aplicar aura esmeralda mística a las hojas oficiales de Metin2
          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              const nameLower = mesh.name.toLowerCase();
              if (nameLower.includes('leaf') || nameLower.includes('canopy')) {
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                for (const mat of mats) {
                  if (mat instanceof THREE.MeshStandardMaterial) {
                    mat.emissive = new THREE.Color(0x065f46);
                    mat.emissiveIntensity = 0.45;
                    mat.roughness = 0.65;
                    mat.side = THREE.DoubleSide;
                  }
                }
              }
            }
          });

          willowGroup.add(model);
        }
      });

      // Anillo rúnico místico en la base para identificar el punto de interacción
      const ringGeo = new THREE.RingGeometry(1.6, 1.9, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x34d399,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      willowGroup.add(ring);

      // Espíritus del bosque (orbes místicos de luz feérica que flotan alrededor de la copa)
      for (let s = 0; s < 5; s++) {
        const angle = (s / 5) * Math.PI * 2;
        const wispGeo = new THREE.SphereGeometry(0.18, 8, 8);
        const wispMat = new THREE.MeshBasicMaterial({ color: s % 2 === 0 ? 0x6ee7b7 : 0xa7f3d0 });
        const wisp = new THREE.Mesh(wispGeo, wispMat);
        wisp.position.set(Math.cos(angle) * 2.2, 2.8 + (s % 2) * 1.4, Math.sin(angle) * 2.2);
        willowGroup.add(wisp);
      }

      group.add(willowGroup);

      const nameplate = this.createNameplate(`🪓 ${node.name}`, '#4ade80');
      nameplate.position.y = 5.4;
      group.add(nameplate);

    } else {
      // Zona de pesca oficial de Metin2 con plataforma de pesca, aparejos y bote en la orilla
      const fishGroup = new THREE.Group();

      const texLoader = new THREE.TextureLoader();
      const woodTex = texLoader.load('/assets/textures/mt2_dock_continuous.png?v=9');
      woodTex.wrapS = THREE.ClampToEdgeWrapping;
      woodTex.wrapT = THREE.ClampToEdgeWrapping;
      woodTex.repeat.set(1, 1);
      woodTex.colorSpace = THREE.SRGBColorSpace;
      const woodDeckMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.85, metalness: 0.05 });
      const woodPillarMat = new THREE.MeshStandardMaterial({ color: 0x452a17, roughness: 0.85 });

      // Pequeña tarima de pesca en la orilla con textura continua
      const dockGeo = new THREE.BoxGeometry(2.4, 0.18, 3.2);
      const smallDockMats = [
        woodPillarMat,
        woodPillarMat,
        woodDeckMat, // Top face
        woodPillarMat,
        woodPillarMat,
        woodPillarMat,
      ];
      const dock = new THREE.Mesh(dockGeo, smallDockMats);
      dock.position.set(0, 0.22, 0);
      dock.receiveShadow = true;
      fishGroup.add(dock);

      // Pilotes en el agua
      for (let px = -1.0; px <= 1.0; px += 2.0) {
        for (let pz = -1.2; pz <= 1.2; pz += 2.4) {
          const pilGeo = new THREE.CylinderGeometry(0.12, 0.14, 1.4, 6);
          const pil = new THREE.Mesh(pilGeo, woodPillarMat);
          pil.position.set(px, -0.4, pz);
          fishGroup.add(pil);
        }
      }

      // Caña de pescar apoyada en un soporte de horquilla hacia el agua
      const rodPoleGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.9, 6);
      const rodStand = new THREE.Mesh(rodPoleGeo, woodPillarMat);
      rodStand.position.set(0.8, 0.65, 1.2);
      fishGroup.add(rodStand);

      const rodGeo = new THREE.CylinderGeometry(0.02, 0.04, 3.2, 6);
      const rodMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
      const rod = new THREE.Mesh(rodGeo, rodMat);
      rod.position.set(0.8, 1.6, 2.2);
      rod.rotation.x = 0.5;
      fishGroup.add(rod);

      // Bote tradicional de Metin2
      AssetManager.getInstance().getInstancedModel('fishing_boat').then((boat) => {
        if (boat) {
          boat.scale.setScalar(0.0048);
          boat.position.set(-2.4, 0.08, 0.6);
          boat.rotation.y = 0.35;
          fishGroup.add(boat);
        }
      });

      // Barril de pesca y cubo
      AssetManager.getInstance().getInstancedModel('wood_barrel').then((barrel) => {
        if (barrel) {
          barrel.scale.setScalar(0.011);
          barrel.position.set(-0.7, 0.32, -0.6);
          fishGroup.add(barrel);
        }
      });

      AssetManager.getInstance().getInstancedModel('wood_box').then((box) => {
        if (box) {
          box.scale.setScalar(0.0075);
          box.position.set(0.6, 0.22, -0.8);
          box.rotation.y = 0.5;
          fishGroup.add(box);
        }
      });

      // Linterna cálida de pesca
      const lanternGeo = new THREE.SphereGeometry(0.18, 8, 8);
      const lanternMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
      const lantern = new THREE.Mesh(lanternGeo, lanternMat);
      lantern.position.set(-0.7, 0.95, -0.6);
      fishGroup.add(lantern);

      // Onda de agua en el río donde pican los peces
      const rippleGeo = new THREE.RingGeometry(0.4, 0.7, 16);
      const rippleMat = new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
      });
      const ripple = new THREE.Mesh(rippleGeo, rippleMat);
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.set(0.8, 0.04, 3.4);
      fishGroup.add(ripple);

      group.add(fishGroup);

      const nameplate = this.createNameplate(`🎣 ${node.name}`, '#38bdf8');
      nameplate.position.y = 2.4;
      group.add(nameplate);
    }

    // Colisionador invisible para raycaster de clic
    const clickHitGeo = new THREE.CylinderGeometry(1.6, 1.6, 2.6, 8);
    const clickHitMat = new THREE.MeshBasicMaterial({ visible: false });
    const clickHit = new THREE.Mesh(clickHitGeo, clickHitMat);
    clickHit.position.y = 1.2;
    clickHit.userData = { gatherNodeId: node.id };
    group.add(clickHit);

    return group;
  }

  private createNPCMesh(npc: WorldNPC): THREE.Group {
    const group = new THREE.Group();
    group.position.set(npc.pos.x, 0, npc.pos.z);
    group.userData.npcId = npc.id;

    // ─── NPC map: id → { modelKey, scale, rotY, isStaticProp }
    // Humanoid NPCs: load via createCharacterInstance (animated skinned mesh)
    // Static props: load via getInstancedModel (no skeleton)
    const humanoidNPCs: Record<string, { modelKey: string; scale: number; rotY: number }> = {
      npc_blacksmith: { modelKey: 'blacksmith', scale: 0.009, rotY: Math.PI / 4 },
      npc_storekeeper: { modelKey: 'bank', scale: 0.009, rotY: -Math.PI / 6 },
      npc_store: { modelKey: 'general_store', scale: 0.009, rotY: Math.PI },
      npc_guardian: { modelKey: 'guard_leader', scale: 0.009, rotY: Math.PI },
    };

    const staticProps: Record<string, { modelKey: string; scale: number; rotY: number; posY: number }> = {
      npc_market_board: { modelKey: 'market_board', scale: 0.012, rotY: 0, posY: 0 },
      npc_furnace: { modelKey: 'furnace_brazier', scale: 0.012, rotY: 0, posY: 0 },
    };

    const hConfig = humanoidNPCs[npc.id];
    if (hConfig) {
      // Placeholder invisible mientras carga el modelo real
      const phGeo = new THREE.CylinderGeometry(0.3, 0.4, 1.8, 8);
      const phMat = new THREE.MeshStandardMaterial({ visible: false });
      const placeholder = new THREE.Mesh(phGeo, phMat);
      placeholder.position.y = 0.9;
      group.add(placeholder);

      AssetManager.getInstance().createCharacterInstance(hConfig.modelKey).then((charInstance) => {
        if (!charInstance) return;
        placeholder.visible = false;
        charInstance.group.scale.setScalar(hConfig.scale);
        charInstance.group.position.set(0, 0, 0);
        charInstance.group.rotation.y = hConfig.rotY;
        group.add(charInstance.group);
        group.userData.charInstance = charInstance;
      });
    } else {
      const sConfig = staticProps[npc.id];
      if (sConfig) {
        // Static prop — no skeleton
        const phGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const phMat = new THREE.MeshStandardMaterial({ visible: false });
        const placeholder = new THREE.Mesh(phGeo, phMat);
        placeholder.position.y = 0.25;
        group.add(placeholder);

        AssetManager.getInstance().getInstancedModel(sConfig.modelKey).then((model) => {
          if (!model) return;
          placeholder.visible = false;
          model.scale.setScalar(sConfig.scale);
          model.position.set(0, sConfig.posY, 0);
          model.rotation.y = sConfig.rotY;
          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          group.add(model);
        });
      }
    }

    // Colisionador invisible para click fácil
    const hitBoxGeo = new THREE.CylinderGeometry(1.2, 1.2, 2.5);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
    hitBox.position.y = 1.25;
    group.add(hitBox);

    const npcSubtitle = npc.title
      ? `‹ ${npc.title} ›`
      : npc.name.includes('Guardián')
      ? '‹ Protector Imperial ›'
      : npc.name.includes('Almacén') || npc.name.includes('Almacenero')
      ? '‹ Custodia & Depósito ›'
      : npc.name.includes('Mercado') || npc.name.includes('Tablón')
      ? '‹ Comercio & Subastas ›'
      : '‹ Habitante de la Aldea ›';

    const nameSprite = this.createNameplate(npc.name, '#ffd700', {
      theme: 'npc',
      badgeType: 'crown',
      subtitle: npcSubtitle,
      subtitleColor: '#f59e0b',
      titleColor: '#fef08a',
      accentColor: '#eab308',
      plateWidth: 380,
    });
    nameSprite.position.y = 2.45;
    group.add(nameSprite);

    group.traverse((child) => {
      child.userData.npcId = npc.id;
    });

    return group;
  }

  public syncMobs(mobs: WorldMob[]): void {
    const activeIds = new Set(mobs.map((m) => m.id));

    for (const [id, group] of this.mobMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.group.remove(group);
        this.mobMeshes.delete(id);
      }
    }

    for (const mob of mobs) {
      let group = this.mobMeshes.get(mob.id);
      if (!group) {
        group = this.createMobMesh(mob);
        group.position.set(mob.pos.x, 0, mob.pos.z);
        this.group.add(group);
        this.mobMeshes.set(mob.id, group);
      }

      group.visible = mob.is_alive && !mob.in_combat_id;
      group.userData.mobId = mob.id;
      group.userData.mobData = mob;

      // Guardar posición objetivo para interpolación suave continua a 60 FPS en update()
      if (mob.mob_type !== 'metin_stone') {
        if (!group.userData.targetPos) {
          group.userData.targetPos = new THREE.Vector3(mob.pos.x, 0, mob.pos.z);
        } else {
          (group.userData.targetPos as THREE.Vector3).set(mob.pos.x, 0, mob.pos.z);
        }
      } else {
        group.position.set(mob.pos.x, 0, mob.pos.z);
      }
    }
  }

  private createMobMesh(mob: WorldMob): THREE.Group {
    const group = new THREE.Group();
    group.userData = { mobId: mob.id };

    const proceduralGroup = new THREE.Group();
    group.add(proceduralGroup);

    if (mob.mob_type === 'metin_stone') {
      // Núcleo monolítico de obsidiana de la Piedra Metin
      const coreGeo = new THREE.ConeGeometry(1.6, 4.2, 5);
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0x181024,
        emissive: 0x9333ea,
        emissiveIntensity: 0.85,
        roughness: 0.35,
        metalness: 0.9,
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.y = 2.1;
      core.rotation.y = 0.4;
      core.castShadow = true;
      proceduralGroup.add(core);

      // Luz pulsante violeta (emissive en el material del núcleo — sin PointLight)
      // metinLight eliminado — emissiveIntensity en coreMat ya da el brillo visual

      // Fragmentos de roca mágica flotantes orbitando
      const shardGroup = new THREE.Group();
      shardGroup.position.y = 2.0;
      const shardMat = new THREE.MeshStandardMaterial({
        color: 0x581c87,
        emissive: 0xc084fc,
        emissiveIntensity: 0.9,
      });
      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI) / 2;
        const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), shardMat);
        shard.position.set(Math.cos(ang) * 2.2, Math.sin(i * 1.5) * 0.35, Math.sin(ang) * 2.2);
        shard.rotation.set(0.5, 0.5, 0);
        shardGroup.add(shard);
      }
      group.add(shardGroup);
      this.metinShards.push(shardGroup);

      // Cargar modelo 3D oficial de Metin2
      AssetManager.getInstance().getInstancedModel('metin_stone').then((model) => {
        if (!model) return;
        proceduralGroup.visible = false;
        model.scale.setScalar(0.009);
        model.position.y = 0;
        group.add(model);
        model.traverse((child) => {
          child.userData.mobId = mob.id;
        });
      });
    } else {
      const isWolf = mob.mob_type === 'wolf';
      const bodyColor = isWolf ? 0x4b5563 : 0x92400e;
      const bodyGeo = new THREE.BoxGeometry(0.6, 0.6, 1.2);
      const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.8 });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.5;
      proceduralGroup.add(body);

      const headGeo = new THREE.ConeGeometry(0.35, 0.7, 4);
      const head = new THREE.Mesh(headGeo, bodyMat);
      head.position.set(0, 0.7, 0.8);
      head.rotation.x = Math.PI / 2;
      proceduralGroup.add(head);

      const modelKey = isWolf ? 'wolf' : 'wild_dog';
      AssetManager.getInstance().createCharacterInstance(modelKey).then((charInstance) => {
        if (!charInstance) return;
        proceduralGroup.visible = false;
        charInstance.group.scale.setScalar(0.012);
        charInstance.group.rotation.y = 0; // Orientar hacia el frente de movimiento
        group.add(charInstance.group);
        group.userData.charInstance = charInstance;
        charInstance.group.traverse((child) => {
          child.userData.mobId = mob.id;
        });
      });
    }

    // Colisionador invisible para click fácil
    const hitBoxRadius = mob.mob_type === 'metin_stone' ? 1.4 : 1.2;
    const hitBoxHeight = mob.mob_type === 'metin_stone' ? 2.8 : 2.0;
    const hitBoxGeo = new THREE.CylinderGeometry(hitBoxRadius, hitBoxRadius, hitBoxHeight);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
    hitBox.position.y = hitBoxHeight / 2;
    group.add(hitBox);

    const nameSprite = this.createMobNameplate(mob);
    nameSprite.position.y = mob.mob_type === 'metin_stone' ? 3.4 : 1.9;
    group.add(nameSprite);

    group.traverse((child) => {
      child.userData.mobId = mob.id;
    });

    return group;
  }

  private createMobNameplate(mob: WorldMob): THREE.Sprite {
    const isMetin = mob.mob_type === 'metin_stone';
    if (isMetin) {
      return this.createNameplate(mob.name, '#c084fc', {
        theme: 'metin',
        badgeType: 'metin',
        subtitle: `‹ Nivel ${mob.level} • Destructible ›`,
        subtitleColor: '#d8b4fe',
        titleColor: '#f3e8ff',
        accentColor: '#c084fc',
        plateWidth: 380,
      });
    } else {
      return this.createNameplate(mob.name, '#ef4444', {
        theme: 'mob',
        badgeType: 'skull',
        subtitle: `‹ Hostil • Nivel ${mob.level} ›`,
        subtitleColor: '#f87171',
        titleColor: '#fee2e2',
        accentColor: '#ef4444',
        plateWidth: 330,
      });
    }
  }

  public syncMarkers(markers: ActiveCombatMarker[]): void {
    const activeIds = new Set(markers.map((m) => m.combat_id));

    for (const [id, group] of this.markerMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.group.remove(group);
        this.markerMeshes.delete(id);
      }
    }

    for (const m of markers) {
      let group = this.markerMeshes.get(m.combat_id);
      if (!group) {
        group = this.createMarkerMesh(m);
        this.group.add(group);
        this.markerMeshes.set(m.combat_id, group);
      }

      group.position.set(m.pos.x, 0, m.pos.z);
      group.userData = { combatId: m.combat_id };
    }
  }

  private createMarkerMesh(marker: ActiveCombatMarker): THREE.Group {
    const group = new THREE.Group();

    const swordMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
    for (let i = -1; i <= 1; i += 2) {
      const bladeGeo = new THREE.BoxGeometry(0.12, 1.8, 0.3);
      const blade = new THREE.Mesh(bladeGeo, swordMat);
      blade.position.y = 2.0;
      blade.rotation.z = i * (Math.PI / 4);
      group.add(blade);
    }
    // Sin PointLight en marcadores de combate — swords son emissivas (MeshBasicMaterial)

    const title = marker.is_preparation
      ? `⚔️ ${marker.leader_name} vs ${marker.mob_name} (${Math.ceil(marker.prep_time_left)}s) [Clic para Unirse]`
      : `⚔️ Combate en Curso (${marker.participants_count} héroes)`;

    const nameSprite = this.createNameplate(title, '#ef4444');
    nameSprite.position.y = 3.3;
    group.add(nameSprite);

    return group;
  }

  public syncOtherPlayers(otherPlayers: WorldPlayer[]): void {
    const activeIds = new Set(otherPlayers.map((p) => p.id));

    // Eliminar jugadores que se fueron (excepto el local)
    for (const [id, group] of this.playerMeshes.entries()) {
      if (!group.userData.isMe && !activeIds.has(id)) {
        this.group.remove(group);
        this.playerMeshes.delete(id);
      }
    }

    for (const player of otherPlayers) {
      let group = this.playerMeshes.get(player.id);
      if (group && group.userData.playerData) {
        const oldP = group.userData.playerData;
        const cChanged = oldP.class !== player.class;
        const oChanged = (oldP as any).outfit !== (player as any).outfit;
        const gChanged = (oldP as any).gender !== (player as any).gender;
        if (cChanged || oChanged || gChanged) {
          this.group.remove(group);
          this.playerMeshes.delete(player.id);
          group = undefined;
        }
      }

      if (!group) {
        group = this.createWorldPlayerMesh(player, false);
        group.position.set(player.pos.x, 0, player.pos.z);
        this.group.add(group);
        this.playerMeshes.set(player.id, group);
      }

      group.visible = !player.in_combat_id;

      if (!group.userData.targetPos) {
        group.userData.targetPos = new THREE.Vector3(player.pos.x, 0, player.pos.z);
      } else {
        (group.userData.targetPos as THREE.Vector3).set(player.pos.x, 0, player.pos.z);
      }
    }
  }

  public removePlayerMesh(playerId: string): void {
    const group = this.playerMeshes.get(playerId);
    if (group) {
      this.group.remove(group);
      this.playerMeshes.delete(playerId);
    }
  }

  public syncPlayers(players: WorldPlayer[], myPlayerId: string | null): void {
    for (const player of players) {
      let group = this.playerMeshes.get(player.id);
      const isMe = player.id === myPlayerId || player.id === 'me';

      // Si el grupo ya existe pero cambió de clase, outfit o género, reconstruir la malla inmediatamente
      if (group && group.userData.playerData) {
        const oldP = group.userData.playerData;
        const cChanged = oldP.class !== player.class;
        const oChanged = (oldP as any).outfit !== (player as any).outfit;
        const gChanged = (oldP as any).gender !== (player as any).gender;
        if (cChanged || oChanged || gChanged) {
          this.group.remove(group);
          this.playerMeshes.delete(player.id);
          group = undefined;
        }
      }

      if (!group) {
        group = this.createWorldPlayerMesh(player, isMe);
        group.position.set(player.pos.x, 0, player.pos.z);
        this.group.add(group);
        this.playerMeshes.set(player.id, group);
      }
      group.visible = !player.in_combat_id;
    }
  }

  public getLocalPlayerMesh(): THREE.Group | undefined {
    return this.playerMeshes.get('me') || Array.from(this.playerMeshes.values()).find((g) => g.userData.isMe);
  }

  public updatePlayerVisual(
    playerId: string,
    pos: { x: number; z: number },
    isMoving: boolean,
    facingAngle: number,
    delta: number
  ): void {
    let group = this.playerMeshes.get(playerId);
    if (!group) {
      // Intentar buscar 'me'
      group = this.playerMeshes.get('me');
    }
    if (!group) return;

    group.position.set(pos.x, 0, pos.z);

    if (isMoving) {
      let diff = facingAngle - group.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      group.rotation.y += diff * Math.min(1.0, delta * 15);
    }

    this.animateLegs(group, isMoving, delta);

    const charInstance = group.userData.charInstance as CharacterInstance | undefined;
    if (charInstance) {
      if (isMoving) {
        charInstance.playAnimation('running');
      } else if (!charInstance.isOneShotActive) {
        charInstance.playAnimation('idle');
      }
    }
  }

  private animateLegs(group: THREE.Group, isMoving: boolean, delta: number): void {
    const data = group.userData;
    if (!data.legLeft || !data.legRight) return;

    if (isMoving) {
      data.walkTime = (data.walkTime || 0) + delta * 14;
      data.legLeft.rotation.x = Math.sin(data.walkTime) * 0.65;
      data.legRight.rotation.x = -Math.sin(data.walkTime) * 0.65;
      if (data.body) {
        data.body.position.y = 1.05 + Math.abs(Math.sin(data.walkTime)) * 0.08;
      }
    } else {
      data.legLeft.rotation.x = THREE.MathUtils.lerp(data.legLeft.rotation.x, 0, 0.3);
      data.legRight.rotation.x = THREE.MathUtils.lerp(data.legRight.rotation.x, 0, 0.3);
      if (data.body) {
        data.body.position.y = 1.05;
      }
    }
  }

  private createWorldPlayerMesh(player: WorldPlayer, isMe: boolean): THREE.Group {
    const group = new THREE.Group();
    const color = player.team === 0 ? 0x1e88e5 : 0xe53935;

    // Peana circular brillante indicando reino
    const ringGeo = new THREE.RingGeometry(0.7, 0.85, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: isMe ? 0x4ade80 : color,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);

    // Contenedor de mallas procedimentales (fallback inicial mientras carga el GLB)
    const proceduralGroup = new THREE.Group();
    group.add(proceduralGroup);

    // Torso con armadura de placas oriental
    const bodyGeo = new THREE.BoxGeometry(0.78, 0.95, 0.52);
    const armorMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.75 });
    const body = new THREE.Mesh(bodyGeo, armorMat);
    body.position.y = 1.05;
    body.castShadow = true;
    proceduralGroup.add(body);

    // Borde / Pechera dorada central
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

    // Cabeza y Casco dorado de guerrero imperial
    const headGeo = new THREE.BoxGeometry(0.45, 0.45, 0.45);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.7;
    head.castShadow = true;
    proceduralGroup.add(head);

    // Cresta ornamental del casco
    const crestGeo = new THREE.BoxGeometry(0.08, 0.35, 0.45);
    const crest = new THREE.Mesh(crestGeo, goldMat);
    crest.position.set(0, 2.05, 0);
    proceduralGroup.add(crest);

    // Piernas articuladas con grebas de combate
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
    const legGeo = new THREE.BoxGeometry(0.24, 0.6, 0.3);

    const legLeft = new THREE.Mesh(legGeo, bodyMat);
    legLeft.position.set(-0.22, 0.3, 0);
    legLeft.castShadow = true;
    proceduralGroup.add(legLeft);

    const legRight = new THREE.Mesh(legGeo, bodyMat);
    legRight.position.set(0.22, 0.3, 0);
    legRight.castShadow = true;
    proceduralGroup.add(legRight);

    // Armas según clase para el procedimental
    if (player.class === 'Warrior') {
      const swordGroup = new THREE.Group();
      swordGroup.position.set(0.55, 1.15, 0.25);
      swordGroup.rotation.x = 0.35;

      // Hoja curvada ancha de la Espada Luna Llena (FMS) con resplandor celeste místico
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

      const hiltGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6);
      const hiltMat = new THREE.MeshStandardMaterial({ color: 0x8b0000 });
      const hilt = new THREE.Mesh(hiltGeo, hiltMat);
      hilt.position.y = -0.5;
      swordGroup.add(hilt);

      // Resplandor celeste de la FMS (+9) — emissive en bladeMat es suficiente, sin PointLight

      proceduralGroup.add(swordGroup);
    } else if (player.class === 'Sura') {
      const demonArmGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.8, 8);
      const demonMat = new THREE.MeshStandardMaterial({ color: 0x4a0e4e, emissive: 0x9c27b0, emissiveIntensity: 0.6 });
      const demonArm = new THREE.Mesh(demonArmGeo, demonMat);
      demonArm.position.set(-0.48, 1.05, 0);
      proceduralGroup.add(demonArm);

      const swordGeo = new THREE.BoxGeometry(0.08, 1.2, 0.18);
      const swordMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 });
      const sword = new THREE.Mesh(swordGeo, swordMat);
      sword.position.set(0.5, 1.1, 0.25);
      proceduralGroup.add(sword);
    } else if (player.class === 'Ninja') {
      for (let i = -1; i <= 1; i += 2) {
        const daggerGeo = new THREE.BoxGeometry(0.06, 0.65, 0.12);
        const daggerMat = new THREE.MeshStandardMaterial({ color: 0x88e0ef, metalness: 0.9 });
        const dagger = new THREE.Mesh(daggerGeo, daggerMat);
        dagger.position.set(i * 0.45, 0.9, 0.25);
        dagger.rotation.x = 0.3;
        proceduralGroup.add(dagger);
      }
    } else if (player.class === 'Shaman') {
      const bellGeo = new THREE.OctahedronGeometry(0.3, 1);
      const bellMat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffa000, emissiveIntensity: 0.4 });
      const bell = new THREE.Mesh(bellGeo, bellMat);
      bell.position.set(0.5, 1.3, 0.2);
      proceduralGroup.add(bell);
    }

    // Placa de nombre
    const nameColor = isMe ? '#fef08a' : player.team === 0 ? '#38bdf8' : '#f87171';
    const kingdomName = player.kingdom || (player.team === 0 ? 'Jinno' : player.team === 1 ? 'Shinsoo' : 'Chunjo');
    const nameSprite = this.createNameplate(player.name, nameColor, {
      theme: 'player',
      badgeType: 'level',
      badgeText: String(player.level || 1),
      subtitle: `‹ Reino ${kingdomName} • ${isMe ? 'Héroe Local' : 'Viajero'} ›`,
      subtitleColor: isMe ? '#7dd3fc' : '#cbd5e1',
      titleColor: isMe ? '#fef08a' : '#ffffff',
      accentColor: isMe ? '#38bdf8' : (player.team === 0 ? '#60a5fa' : '#f87171'),
      plateWidth: 360,
    });
    nameSprite.position.y = 2.45;
    group.add(nameSprite);

    // Colisionador invisible para interacción
    const hitBoxGeo = new THREE.CylinderGeometry(1.0, 1.0, 2.4);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
    hitBox.position.y = 1.2;
    group.add(hitBox);

    group.traverse((child) => {
      child.userData.playerId = player.id;
      child.userData.isMe = isMe;
    });

    group.userData = {
      ...group.userData,
      playerId: player.id,
      playerData: player,
      isMe,
      legLeft,
      legRight,
      body,
      walkTime: 0,
    };

    // Determinar modelo 3D según clase, vestimenta y género
    const outfitNum = (player as any).outfit || 1;
    const gender = (player as any).gender;
    const modelKey = getCharacterModelKey(player.class, outfitNum, gender);

    // Cargar modelo 3D Metin2 y equipar arma inicial correspondiente a la clase
    AssetManager.getInstance().createCharacterInstance(modelKey).then((charInstance) => {
      if (!charInstance) return;
      proceduralGroup.visible = false;
      charInstance.group.scale.setScalar(0.012);
      charInstance.group.position.set(0, 0, 0);
      charInstance.playAnimation('idle');
      group.add(charInstance.group);
      group.userData.charInstance = charInstance;

      // Equipar arma inicial de clase (Dagas gemelas para Ninja, Fan para Chamán, Espada para Guerrero/Sura)
      const weaponName = getStarterWeaponForClass(player.class);
      const isDual = (player.class || '').toLowerCase() === 'ninja';
      AssetManager.getInstance().getWeaponModel(weaponName).then((weapon) => {
        if (weapon && group.userData.charInstance) {
          charInstance.attachWeapon(weapon, isDual);
        }
      });
    });

    return group;
  }

  private drawCartouchePath(ctx: CanvasRenderingContext2D, left: number, top: number, right: number, bottom: number, cy: number, tip = 15): void {
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
    // Medallón base
    ctx.fillStyle = '#080a0f';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Aro exterior metálico
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // Aro interior sutil
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r - 3, 0, Math.PI * 2);
    ctx.stroke();

    if (type === 'level' && text) {
      ctx.font = 'bold 18px "Cinzel", Georgia, serif';
      ctx.fillStyle = '#fef08a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y + 1);
    } else if (type === 'crown') {
      // Corona imperial de 3 puntas
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.moveTo(x - 11, y + 8);
      ctx.lineTo(x + 11, y + 8);
      ctx.lineTo(x + 10, y - 3);
      ctx.lineTo(x + 6, y + 2);
      ctx.lineTo(x, y - 9);
      ctx.lineTo(x - 6, y + 2);
      ctx.lineTo(x - 10, y - 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#b45309';
      ctx.fillRect(x - 10, y + 6, 20, 2.5);
    } else if (type === 'metin') {
      // Estrella astral de 4 puntas (cristal metin)
      ctx.fillStyle = '#e9d5ff';
      ctx.beginPath();
      ctx.moveTo(x, y - 13);
      ctx.quadraticCurveTo(x, y, x + 13, y);
      ctx.quadraticCurveTo(x, y, x, y + 13);
      ctx.quadraticCurveTo(x, y, x - 13, y);
      ctx.quadraticCurveTo(x, y, x, y - 13);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'skull') {
      // Calavera / Colmillo de mob
      ctx.fillStyle = '#fca5a5';
      ctx.beginPath();
      ctx.arc(x, y - 3, 9, Math.PI * 0.8, Math.PI * 0.2);
      ctx.lineTo(x + 5, y + 8);
      ctx.lineTo(x - 5, y + 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#450a0a';
      ctx.beginPath();
      ctx.arc(x - 3.5, y - 3, 2.2, 0, Math.PI * 2);
      ctx.arc(x + 3.5, y - 3, 2.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'portal') {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 6, Math.PI * 0.5, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#bae6fd';
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'combat') {
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⚔️', x, y);
    } else if (type === 'resource' && text) {
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    } else if (type === 'shop') {
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏪', x, y);
    }
    ctx.restore();
  }

  private createNameplate(text: string, color: string, options?: NameplateOptions): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d')!;

    // Si no se pasaron opciones explícitas, deducir inteligentemente del texto existente
    const opts: NameplateOptions = { ...options };
    let mainTitle = text;

    if (!opts.theme) {
      if (text.startsWith('[Lv.') || text.includes('[Lv.')) {
        opts.theme = 'player';
        opts.badgeType = 'level';
        const match = text.match(/\[Lv\.(\d+)\]\s*(.*)/);
        if (match) {
          opts.badgeText = match[1];
          mainTitle = match[2];
          opts.subtitle = '‹ Héroe Aventurero ›';
        }
      } else if (text.startsWith('[NPC]')) {
        opts.theme = 'npc';
        opts.badgeType = 'crown';
        mainTitle = text.replace('[NPC]', '').trim();
        opts.subtitle = '‹ Protector de la Aldea ›';
        opts.accentColor = '#eab308';
        opts.titleColor = '#fef08a';
      } else if (text.startsWith('[Portal]')) {
        opts.theme = 'portal';
        opts.badgeType = 'portal';
        const parts = text.replace('[Portal]', '').trim().split('•');
        mainTitle = parts[0]?.trim() || 'Portal';
        if (parts[1]) opts.subtitle = `‹ ${parts[1].trim()} ›`;
      } else if (text.startsWith('⛏️') || text.startsWith('🪓') || text.startsWith('🎣')) {
        opts.theme = 'resource';
        opts.badgeType = 'resource';
        const icon = text.slice(0, 2);
        opts.badgeText = icon;
        mainTitle = text.slice(2).trim();
        opts.subtitle = icon === '⛏️' ? '‹ Minería • Recurso ›' : icon === '🪓' ? '‹ Tala • Recurso ›' : '‹ Pesca • Recurso ›';
      } else if (text.startsWith('⚔️')) {
        opts.theme = 'combat';
        opts.badgeType = 'combat';
        mainTitle = text.replace('⚔️', '').trim();
        opts.subtitle = '‹ Campo de Batalla ›';
      } else if (text.startsWith('🏪')) {
        opts.theme = 'shop';
        opts.badgeType = 'shop';
        mainTitle = text.replace('🏪', '').trim();
        opts.subtitle = '‹ Tienda Privada ›';
      } else {
        opts.theme = 'player';
      }
    }

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const plateW = opts.plateWidth || (opts.subtitle ? 460 : 380);
    const left = cx - plateW / 2;
    const right = cx + plateW / 2;
    const top = 8;
    const bottom = h - 8;

    // 1. Fondo Cartouche / Listón Oriental
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.90)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;

    const bgGrad = ctx.createLinearGradient(0, top, 0, bottom);
    if (opts.theme === 'npc') {
      bgGrad.addColorStop(0, 'rgba(28, 20, 12, 0.94)');
      bgGrad.addColorStop(0.5, 'rgba(14, 10, 6, 0.97)');
      bgGrad.addColorStop(1, 'rgba(28, 20, 12, 0.94)');
    } else if (opts.theme === 'mob') {
      bgGrad.addColorStop(0, 'rgba(38, 12, 14, 0.94)');
      bgGrad.addColorStop(0.5, 'rgba(18, 6, 8, 0.97)');
      bgGrad.addColorStop(1, 'rgba(38, 12, 14, 0.94)');
    } else if (opts.theme === 'metin') {
      bgGrad.addColorStop(0, 'rgba(32, 14, 46, 0.94)');
      bgGrad.addColorStop(0.5, 'rgba(16, 8, 26, 0.97)');
      bgGrad.addColorStop(1, 'rgba(32, 14, 46, 0.94)');
    } else if (opts.theme === 'portal') {
      bgGrad.addColorStop(0, 'rgba(14, 28, 44, 0.94)');
      bgGrad.addColorStop(0.5, 'rgba(8, 14, 26, 0.97)');
      bgGrad.addColorStop(1, 'rgba(14, 28, 44, 0.94)');
    } else {
      bgGrad.addColorStop(0, 'rgba(14, 18, 28, 0.94)');
      bgGrad.addColorStop(0.5, 'rgba(8, 10, 16, 0.97)');
      bgGrad.addColorStop(1, 'rgba(14, 18, 28, 0.94)');
    }

    ctx.fillStyle = bgGrad;
    this.drawCartouchePath(ctx, left, top, right, bottom, cy, 18);
    ctx.fill();
    ctx.restore();

    // 2. Borde Metálico Ornamentado
    ctx.save();
    const borderGrad = ctx.createLinearGradient(left, 0, right, 0);
    const accent = opts.accentColor || color || '#38bdf8';
    borderGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    borderGrad.addColorStop(0.2, accent);
    borderGrad.addColorStop(0.5, '#ffffff');
    borderGrad.addColorStop(0.8, accent);
    borderGrad.addColorStop(1, 'rgba(255, 255, 255, 0.15)');

    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 2.4;
    this.drawCartouchePath(ctx, left, top, right, bottom, cy, 18);
    ctx.stroke();

    // Remaches en las esquinas
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(left + 10, cy, 3, 0, Math.PI * 2);
    ctx.arc(right - 10, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. Medallón Izquierdo
    const badgeX = left + 40;
    const badgeY = cy;
    this.drawVectorBadge(ctx, badgeX, badgeY, 22, opts.badgeType || 'level', accent, opts.badgeText);

    // 4. Textos de Cabecera y Nombre
    const textStartX = badgeX + 32;
    const textEndX = right - 18;
    const midTextX = (textStartX + textEndX) / 2;

    ctx.save();
    ctx.textAlign = 'center';

    if (opts.subtitle) {
      // Subtítulo
      ctx.font = 'italic 700 15px "Cinzel", Georgia, serif';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(opts.subtitle, midTextX, cy - 14);
      ctx.fillStyle = opts.subtitleColor || '#94a3b8';
      ctx.fillText(opts.subtitle, midTextX, cy - 14);

      // Nombre
      ctx.font = '900 24px "Cinzel", "Times New Roman", serif';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(mainTitle, midTextX, cy + 14);
      ctx.fillStyle = opts.titleColor || '#ffffff';
      ctx.fillText(mainTitle, midTextX, cy + 14);
    } else {
      ctx.font = '900 28px "Cinzel", "Times New Roman", serif';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(mainTitle, midTextX, cy);
      ctx.fillStyle = opts.titleColor || '#ffffff';
      ctx.fillText(mainTitle, midTextX, cy);
    }
    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.5, 0.65, 1);
    return sprite;
  }

  public syncPrivateShops(shops: WorldPrivateShop[]): void {
    const activeIds = new Set(shops.map((s) => s.seller_id));

    for (const [id, group] of this.shopMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.group.remove(group);
        this.shopMeshes.delete(id);
      }
    }

    for (const shop of shops) {
      let group = this.shopMeshes.get(shop.seller_id);
      if (!group) {
        group = this.createShopMesh(shop);
        this.group.add(group);
        this.shopMeshes.set(shop.seller_id, group);
      }
      group.position.set(shop.pos.x, 0, shop.pos.z);
    }
  }

  private createShopMesh(shop: WorldPrivateShop): THREE.Group {
    const group = new THREE.Group();

    // 1. Tarima de madera
    const baseGeo = new THREE.BoxGeometry(2.4, 0.3, 1.8);
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.7 });
    const base = new THREE.Mesh(baseGeo, woodMat);
    base.position.y = 0.15;
    base.castShadow = true;
    group.add(base);

    // 2. Postes de madera
    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8);
    const postCoords = [
      [-1.0, -0.7],
      [1.0, -0.7],
      [-1.0, 0.7],
      [1.0, 0.7],
    ];
    for (const [px, pz] of postCoords) {
      const post = new THREE.Mesh(postGeo, woodMat);
      post.position.set(px, 1.1, pz);
      post.castShadow = true;
      group.add(post);
    }

    // 3. Toldo de lona oriental a rayas rojo y dorado estilo mercado Metin2
    const shopRoofTex = new THREE.TextureLoader().load('/assets/textures/mt2_shop_roof.png');
    shopRoofTex.wrapS = THREE.RepeatWrapping;
    shopRoofTex.wrapT = THREE.RepeatWrapping;
    shopRoofTex.repeat.set(3, 1);
    shopRoofTex.colorSpace = THREE.SRGBColorSpace;
    const roofMat = new THREE.MeshStandardMaterial({
      map: shopRoofTex,
      roughness: 0.65,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    // Vertiente del toldo
    const roofGeo = new THREE.BoxGeometry(2.3, 0.08, 1.8);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, 2.3, 0);
    roof.rotation.x = 0.15;
    roof.castShadow = true;
    group.add(roof);

    // Faldón decorativo frontal de seda
    const valanceGeo = new THREE.BoxGeometry(2.3, 0.28, 0.04);
    const valance = new THREE.Mesh(valanceGeo, roofMat);
    valance.position.set(0, 2.12, 0.88);
    group.add(valance);

    // 4. Cesta de mercancías brillantes
    const basketGeo = new THREE.BoxGeometry(0.8, 0.3, 0.6);
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.3 });
    const basket = new THREE.Mesh(basketGeo, goldMat);
    basket.position.set(0, 0.45, 0);
    group.add(basket);

    // Colisionador invisible
    const hitBoxGeo = new THREE.CylinderGeometry(1.5, 1.5, 2.8);
    const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
    const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
    hitBox.position.y = 1.4;
    group.add(hitBox);

    // Cartel del Nombre de la Tienda
    const nameSprite = this.createNameplate(`🏪 ${shop.title}`, '#fbbf24');
    nameSprite.position.y = 2.9;
    group.add(nameSprite);

    group.traverse((child) => {
      child.userData.shopSellerId = shop.seller_id;
    });

    return group;
  }

  public update(delta: number): void {
    // 0. Flujo y oleaje del agua de Metin2
    if (this.waterTex) {
      this.waterTex.offset.x = (this.waterTex.offset.x + delta * 0.04) % 1;
      this.waterTex.offset.y = (this.waterTex.offset.y + delta * 0.02) % 1;
    }

    // 1. Rotación mística de los Vórtices de los Portales Fronterizos de Metin2
    for (const p of this.portalVortexAnimators) {
      p.time += delta;
      p.vortexMesh.rotation.z += delta * 1.7;
      p.runeMesh.rotation.z -= delta * 0.85;
      p.groundRune.rotation.z += delta * 0.45;

      const pulse = 1.0 + Math.sin(p.time * 2.8) * 0.05;
      p.vortexMesh.scale.set(pulse, pulse, 1.0);

      for (const sp of p.sparks) {
        const u = sp.userData;
        u.angle += delta * u.speed;
        sp.position.x = Math.cos(u.angle) * u.rad;
        sp.position.y += delta * u.ySpeed;
        if (sp.position.y > 6.2) {
          sp.position.y = 1.2;
        }
      }
    }

    // 2. Rotación de los fragmentos mágicos de la Piedra Metin de Dolor
    for (const s of this.metinShards) {
      s.rotation.y += delta * 1.2;
    }

    for (const marker of this.markerMeshes.values()) {
      marker.rotation.y += delta * 2.5;
    }

    // 60 FPS: Interpolación suave y continua de jugadores remotos
    for (const playerGroup of this.playerMeshes.values()) {
      const charInstance = playerGroup.userData.charInstance as CharacterInstance | undefined;
      if (charInstance) {
        charInstance.update(delta);
      }

      if (!playerGroup.userData.isMe) {
        const targetPos = playerGroup.userData.targetPos as THREE.Vector3 | undefined;
        if (targetPos) {
          const dist = playerGroup.position.distanceTo(targetPos);
          if (dist > 0.05) {
            const dx = targetPos.x - playerGroup.position.x;
            const dz = targetPos.z - playerGroup.position.z;
            const targetAngle = Math.atan2(dx, dz);
            let diff = targetAngle - playerGroup.rotation.y;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            playerGroup.rotation.y += diff * Math.min(1.0, delta * 14);

            const lerpFactor = 1 - Math.exp(-14 * delta);
            playerGroup.position.lerp(targetPos, lerpFactor);
            this.animateLegs(playerGroup, true, delta);
            if (charInstance) {
              charInstance.playAnimation('running');
            }
          } else {
            playerGroup.position.copy(targetPos);
            this.animateLegs(playerGroup, false, delta);
            if (charInstance) {
              charInstance.playAnimation('idle');
            }
          }
        }
      }
    }

    // 60 FPS: Interpolación suave y continua de movimiento de monstruos (sin micro-stuttering)
    for (const mobGroup of this.mobMeshes.values()) {
      if (!mobGroup.visible) continue; // Omitir mobs derrotados / en combate
      const charInstance = mobGroup.userData.charInstance as CharacterInstance | undefined;
      if (charInstance) {
        charInstance.update(delta);
      }

      const targetPos = mobGroup.userData.targetPos as THREE.Vector3 | undefined;
      if (targetPos) {
        const dist = mobGroup.position.distanceTo(targetPos);
        if (dist > 0.06) {
          const dx = targetPos.x - mobGroup.position.x;
          const dz = targetPos.z - mobGroup.position.z;
          const targetAngle = Math.atan2(dx, dz);
          let diff = targetAngle - mobGroup.rotation.y;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          mobGroup.rotation.y += diff * Math.min(1.0, delta * 12);

          const lerpFactor = 1 - Math.exp(-12 * delta);
          mobGroup.position.lerp(targetPos, lerpFactor);

          if (charInstance) {
            charInstance.playAnimation('running');
          }
        } else {
          mobGroup.position.copy(targetPos);
          if (charInstance) {
            charInstance.playAnimation('idle');
          }
        }
      }
    }

    for (const npcGroup of this.npcMeshes.values()) {
      const charInstance = npcGroup.userData.charInstance as CharacterInstance | undefined;
      if (charInstance) {
        charInstance.update(delta);
      }
    }

    if (this.clickIndicatorLife > 0) {
      this.clickIndicatorLife -= delta;
      const progress = 1 - this.clickIndicatorLife / 0.45;
      const scale = 1 + progress * 0.8;
      this.clickIndicator.scale.set(scale, scale, 1);
      (this.clickIndicator.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 * (1 - progress));
    }
  }
}
