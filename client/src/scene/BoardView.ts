import * as THREE from 'three';
import type { BattleMap, Position } from '../types';
import { AssetManager } from './AssetManager';

export class BoardView {
  public scene: THREE.Scene;
  public group: THREE.Group = new THREE.Group();
  public tileSize = 2.0;

  private map: BattleMap | null = null;
  private tileMeshes: Map<string, THREE.Mesh> = new Map();
  private obstacleMeshes: THREE.Group = new THREE.Group();
  private highlightGroup: THREE.Group = new THREE.Group();
  private arenaDecorGroup: THREE.Group = new THREE.Group();

  private hoverMesh: THREE.Mesh;
  private moveHighlightMeshes: THREE.Mesh[] = [];
  private attackHighlightMeshes: THREE.Mesh[] = [];
  private activeTurnIndicator: THREE.Mesh | null = null;
  private animTime = 0;

  // Cache de geometrías, texturas y materiales para inicialización instantánea de combate
  private tileGeo: THREE.BoxGeometry;
  private matGrassLight: THREE.MeshStandardMaterial;
  private matGrassDark: THREE.MeshStandardMaterial;
  private matStoneLight: THREE.MeshStandardMaterial;
  private matStoneDark: THREE.MeshStandardMaterial;
  private rockMat1: THREE.MeshStandardMaterial;
  private rockMat2: THREE.MeshStandardMaterial;
  private baseMat: THREE.MeshStandardMaterial;
  private curbMat: THREE.MeshStandardMaterial;
  private trunkMat: THREE.MeshStandardMaterial;
  private foliageMat: THREE.MeshStandardMaterial;
  private accentStoneMat: THREE.MeshStandardMaterial;
  private stemMat: THREE.MeshBasicMaterial;
  private petalMatYellow: THREE.MeshBasicMaterial;
  private petalMatBlue: THREE.MeshBasicMaterial;
  private combatLightsGroup: THREE.Group = new THREE.Group();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.add(this.arenaDecorGroup);
    this.group.add(this.obstacleMeshes);
    this.group.add(this.highlightGroup);
    this.group.add(this.combatLightsGroup);
    this.scene.add(this.group);

    // 1. Pre-carga de texturas de combate
    const texLoader = new THREE.TextureLoader();
    const grassTex = texLoader.load('/assets/textures/grass.png');
    grassTex.colorSpace = THREE.SRGBColorSpace;
    grassTex.wrapS = THREE.RepeatWrapping;
    grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.repeat.set(1, 1);

    const stoneTex1 = texLoader.load('/assets/textures/mt2_stone01.png');
    stoneTex1.colorSpace = THREE.SRGBColorSpace;
    stoneTex1.wrapS = THREE.RepeatWrapping;
    stoneTex1.wrapT = THREE.RepeatWrapping;
    stoneTex1.repeat.set(1, 1);

    const stoneTex2 = texLoader.load('/assets/textures/mt2_stone02.png');
    stoneTex2.colorSpace = THREE.SRGBColorSpace;
    stoneTex2.wrapS = THREE.RepeatWrapping;
    stoneTex2.wrapT = THREE.RepeatWrapping;
    stoneTex2.repeat.set(4, 1);

    // 2. Pre-creación de materiales para 0 delay en buildMap
    this.tileGeo = new THREE.BoxGeometry(this.tileSize * 0.98, 0.18, this.tileSize * 0.98);

    this.matGrassLight = new THREE.MeshStandardMaterial({
      map: grassTex,
      color: 0x98d488,
      roughness: 0.7,
      metalness: 0.05,
    });
    this.matGrassDark = new THREE.MeshStandardMaterial({
      map: grassTex,
      color: 0x5da852,
      roughness: 0.75,
      metalness: 0.05,
    });
    this.matStoneLight = new THREE.MeshStandardMaterial({
      map: stoneTex1,
      color: 0xffffff,
      roughness: 0.7,
      metalness: 0.1,
    });
    this.matStoneDark = new THREE.MeshStandardMaterial({
      map: stoneTex1,
      color: 0xb5afa6,
      roughness: 0.75,
      metalness: 0.1,
    });

    this.rockMat1 = new THREE.MeshStandardMaterial({
      map: stoneTex1,
      roughness: 0.8,
      metalness: 0.1,
    });
    this.rockMat2 = new THREE.MeshStandardMaterial({
      map: stoneTex2,
      roughness: 0.8,
      metalness: 0.1,
    });

    this.baseMat = new THREE.MeshStandardMaterial({
      map: stoneTex2,
      roughness: 0.85,
      metalness: 0.15,
    });
    this.curbMat = new THREE.MeshStandardMaterial({
      map: stoneTex1,
      roughness: 0.8,
      metalness: 0.2,
    });

    this.trunkMat = new THREE.MeshStandardMaterial({ color: 0x422915, roughness: 0.9 });
    this.foliageMat = new THREE.MeshStandardMaterial({ color: 0x245524, roughness: 0.8 });
    this.accentStoneMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.9 });
    this.stemMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
    this.petalMatYellow = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    this.petalMatBlue = new THREE.MeshBasicMaterial({ color: 0x60a5fa });

    // Indicador de casilla bajo el cursor (Hover dorado suave)
    const hoverGeo = new THREE.PlaneGeometry(this.tileSize * 0.95, this.tileSize * 0.95);
    const hoverMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.hoverMesh = new THREE.Mesh(hoverGeo, hoverMat);
    this.hoverMesh.rotation.x = -Math.PI / 2;
    this.hoverMesh.position.y = 0.05;
    this.hoverMesh.visible = false;
    this.highlightGroup.add(this.hoverMesh);
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  public gridToWorld(x: number, y: number): THREE.Vector3 {
    if (!this.map) return new THREE.Vector3(0, 0, 0);
    const offsetX = (x - this.map.width / 2 + 0.5) * this.tileSize;
    const offsetZ = (y - this.map.height / 2 + 0.5) * this.tileSize;
    return new THREE.Vector3(offsetX, 0, offsetZ);
  }

  public worldToGrid(point: THREE.Vector3): Position | null {
    if (!this.map) return null;
    const x = Math.floor((point.x + (this.map.width * this.tileSize) / 2) / this.tileSize);
    const y = Math.floor((point.z + (this.map.height * this.tileSize) / 2) / this.tileSize);
    if (x >= 0 && x < this.map.width && y >= 0 && y < this.map.height) {
      return { x, y };
    }
    return null;
  }

  public buildMap(map: BattleMap): void {
    this.map = map;

    // Limpiar mallas anteriores
    this.tileMeshes.forEach((m) => this.group.remove(m));
    this.tileMeshes.clear();
    while (this.obstacleMeshes.children.length > 0) {
      this.obstacleMeshes.remove(this.obstacleMeshes.children[0]);
    }
    while (this.arenaDecorGroup.children.length > 0) {
      this.arenaDecorGroup.remove(this.arenaDecorGroup.children[0]);
    }

    // 1. Plataforma perimetral táctica con texturas oficiales de Metin2
    this.buildTacticalArenaPlatform(map.width, map.height);

    // 2. Generar casillas en damero de alto contraste estilo Dofus con textura Metin2 compartida
    for (const cell of map.cells) {
      const worldPos = this.gridToWorld(cell.x, cell.y);
      const isChecker = (cell.x + cell.y) % 2 === 0;
      const isPath = cell.tile_type === 'StonePath';

      // Uso directo de materiales cacheados (0 asignación y 0 recompilación de shaders)
      const mat = isPath
        ? (isChecker ? this.matStoneLight : this.matStoneDark)
        : (isChecker ? this.matGrassLight : this.matGrassDark);

      const tileMesh = new THREE.Mesh(this.tileGeo, mat);
      tileMesh.position.set(worldPos.x, -0.09, worldPos.z);
      tileMesh.receiveShadow = true;
      this.group.add(tileMesh);
      this.tileMeshes.set(`${cell.x}_${cell.y}`, tileMesh);

      // Obstáculos: modelos y rocas auténticas de Metin2
      if (cell.tile_type === 'Rock') {
        const rockGroup = new THREE.Group();
        rockGroup.position.set(worldPos.x, 0, worldPos.z);
        this.obstacleMeshes.add(rockGroup);
        const rockCluster = this.createRockCluster(cell.x, cell.y);
        rockGroup.add(rockCluster);
      } else if (cell.tile_type === 'Tree') {
        // Cargar árbol auténtico de Metin2 a escala táctica que no obstruya la visibilidad
        const treeGroup = new THREE.Group();
        treeGroup.position.set(worldPos.x, 0, worldPos.z);
        this.obstacleMeshes.add(treeGroup);

        AssetManager.getInstance().getInstancedModel('tree').then((treeModel) => {
          if (treeModel) {
            treeModel.scale.setScalar(0.38);
            treeModel.position.set(0, 0, 0);
            treeGroup.add(treeModel);
          } else {
            const bush = this.createTacticalBushMesh();
            treeGroup.add(bush);
          }
        });
      } else if (cell.is_walkable && (cell.x * 11 + cell.y * 7) % 11 === 0) {
        // Detalles sutiles de ambiente solo en casillas transitables
        const detail = this.createTileAccent(cell.x, cell.y);
        if (detail) {
          detail.position.set(worldPos.x, 0.0, worldPos.z);
          this.arenaDecorGroup.add(detail);
        }
      }
    }

    // 3. Luces de combate dedicadas (iluminación isométrica estilo Dofus)
    this.addCombatLights(map.width, map.height);
  }

  /**
   * Plataforma y marco perimetral con texturas oficiales de Metin2
   */
  private buildTacticalArenaPlatform(width: number, height: number): void {
    const totalW = width * this.tileSize;
    const totalH = height * this.tileSize;
    const halfW = totalW / 2;
    const halfH = totalH / 2;

    // Base de piedra oscura bajo el tablero (reutiliza baseMat cacheado)
    const baseGeo = new THREE.BoxGeometry(totalW + 2.4, 0.5, totalH + 2.4);
    const baseMesh = new THREE.Mesh(baseGeo, this.baseMat);
    baseMesh.position.set(0, -0.42, 0);
    baseMesh.receiveShadow = true;
    this.arenaDecorGroup.add(baseMesh);

    const curbH = 0.28;
    const curbThick = 0.5;

    // Bordes Norte y Sur con textura de piedra Metin2 (reutiliza curbMat)
    const horizGeo = new THREE.BoxGeometry(totalW + curbThick * 2, curbH, curbThick);
    const northCurb = new THREE.Mesh(horizGeo, this.curbMat);
    northCurb.position.set(0, 0.04, -halfH - curbThick / 2);
    northCurb.receiveShadow = true;
    this.arenaDecorGroup.add(northCurb);

    const southCurb = new THREE.Mesh(horizGeo, this.curbMat);
    southCurb.position.set(0, 0.04, halfH + curbThick / 2);
    southCurb.receiveShadow = true;
    this.arenaDecorGroup.add(southCurb);

    // Bordes Este y Oeste
    const vertGeo = new THREE.BoxGeometry(curbThick, curbH, totalH);
    const eastCurb = new THREE.Mesh(vertGeo, this.curbMat);
    eastCurb.position.set(halfW + curbThick / 2, 0.04, 0);
    eastCurb.receiveShadow = true;
    this.arenaDecorGroup.add(eastCurb);

    const westCurb = new THREE.Mesh(vertGeo, this.curbMat);
    westCurb.position.set(-halfW - curbThick / 2, 0.04, 0);
    westCurb.receiveShadow = true;
    this.arenaDecorGroup.add(westCurb);

    // En las 4 esquinas del tablero: Braseros auténticos de Metin2 (furnace_brazier)
    const corners: [number, number][] = [
      [-halfW - curbThick / 2, -halfH - curbThick / 2],
      [halfW + curbThick / 2, -halfH - curbThick / 2],
      [-halfW - curbThick / 2, halfH + curbThick / 2],
      [halfW + curbThick / 2, halfH + curbThick / 2],
    ];

    corners.forEach(([cx, cz], i) => {
      // Brasero oficial de Metin2
      AssetManager.getInstance().getInstancedModel('furnace_brazier').then((brazier) => {
        if (brazier) {
          brazier.scale.setScalar(0.0045);
          brazier.position.set(cx, 0.15, cz);
          this.arenaDecorGroup.add(brazier);
        }
      });

      // Luz cálida de fuego en cada esquina
      const fireLight = new THREE.PointLight(0xff6600, 1.8, 8);
      fireLight.position.set(cx, 1.2, cz);
      fireLight.userData.isCrystalLight = true;
      fireLight.userData.phase = i * Math.PI * 0.5;
      this.arenaDecorGroup.add(fireLight);
    });

    // Barriles y cajas de pertrechos auténticos de Metin2 a los costados de la arena
    const borderDecor: [number, number][] = [
      [-halfW - curbThick * 1.5, 0],
      [halfW + curbThick * 1.5, 0],
      [0, -halfH - curbThick * 1.5],
      [0, halfH + curbThick * 1.5],
    ];

    borderDecor.forEach(([bx, bz], idx) => {
      if (idx % 2 === 0) {
        AssetManager.getInstance().getInstancedModel('wood_barrel').then((barrel) => {
          if (barrel) {
            barrel.scale.setScalar(0.009);
            barrel.position.set(bx, 0.1, bz);
            this.arenaDecorGroup.add(barrel);
          }
        });
      } else {
        AssetManager.getInstance().getInstancedModel('wood_box').then((box) => {
          if (box) {
            box.scale.setScalar(0.0065);
            box.position.set(bx, 0.1, bz);
            this.arenaDecorGroup.add(box);
          }
        });
      }
    });
  }

  /** Luces de combate dedicadas para iluminación isométrica estilo Dofus */
  private addCombatLights(width: number, height: number): void {
    // Limpiar luces anteriores para evitar acumulación
    while (this.combatLightsGroup.children.length > 0) {
      this.combatLightsGroup.remove(this.combatLightsGroup.children[0]);
    }

    const totalW = width * this.tileSize;
    const totalH = height * this.tileSize;

    // Luz direccional principal desde arriba-izquierda isométrica
    const combatSun = new THREE.DirectionalLight(0xfff5e0, 2.2);
    combatSun.position.set(-totalW * 0.6, totalH * 1.2, -totalH * 0.4);
    combatSun.target.position.set(0, 0, 0);
    combatSun.castShadow = true;
    combatSun.shadow.mapSize.width = 1024;
    combatSun.shadow.mapSize.height = 1024;
    combatSun.shadow.camera.near = 1;
    combatSun.shadow.camera.far = 60;
    combatSun.shadow.camera.left = -(totalW + 4);
    combatSun.shadow.camera.right = totalW + 4;
    combatSun.shadow.camera.top = totalH + 4;
    combatSun.shadow.camera.bottom = -(totalH + 4);
    combatSun.shadow.bias = -0.001;
    this.combatLightsGroup.add(combatSun);
    this.combatLightsGroup.add(combatSun.target);

    // Luz de relleno desde abajo-derecha (complemento isométrico)
    const fillLight = new THREE.DirectionalLight(0xa0c8ff, 0.6);
    fillLight.position.set(totalW * 0.5, totalH * 0.5, totalH * 0.6);
    this.combatLightsGroup.add(fillLight);

    // Luz ambiental de combate (tonalidad mágica cálida)
    const ambientCombat = new THREE.AmbientLight(0x1a2040, 1.8);
    this.combatLightsGroup.add(ambientCombat);
  }

  /** Roca táctica compacta y de estilo Metin2 que no oculta a los personajes */
  private createRockCluster(x: number, y: number): THREE.Group {
    const group = new THREE.Group();
    const seed = Math.abs((x * 13 + y * 19) % 100);
    const rockMat = seed % 2 === 0 ? this.rockMat1 : this.rockMat2;

    // Peñón principal
    const mainGeo = new THREE.DodecahedronGeometry(0.68 + (seed % 5) * 0.04);
    const mainRock = new THREE.Mesh(mainGeo, rockMat);
    mainRock.position.set(0, 0.42, 0);
    mainRock.rotation.set((seed * 0.3) % 3, (seed * 0.7) % 3, (seed * 1.1) % 3);
    mainRock.scale.set(1.1, 0.72, 1.0);
    mainRock.castShadow = true;
    mainRock.receiveShadow = true;
    group.add(mainRock);

    // Piedra secundaria acompañante
    const subGeo = new THREE.DodecahedronGeometry(0.35);
    const subRock = new THREE.Mesh(subGeo, rockMat);
    subRock.position.set(0.45, 0.2, -0.3);
    subRock.scale.set(1.0, 0.6, 1.0);
    subRock.castShadow = true;
    group.add(subRock);

    return group;
  }

  /** Arbusto táctico compacto de baja altura para celdas con árboles */
  private createTacticalBushMesh(): THREE.Group {
    const group = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.5, 6);
    const trunk = new THREE.Mesh(trunkGeo, this.trunkMat);
    trunk.position.y = 0.25;
    group.add(trunk);

    const foliageGeo = new THREE.DodecahedronGeometry(0.55);
    const foliage = new THREE.Mesh(foliageGeo, this.foliageMat);
    foliage.position.y = 0.7;
    foliage.scale.set(1.0, 0.75, 1.0);
    foliage.castShadow = true;
    group.add(foliage);

    return group;
  }

  /** Detalles sutiles en casillas del damero: pequeñas piedras o briznas de hierba */
  private createTileAccent(x: number, y: number): THREE.Object3D | null {
    const type = (x + y) % 3;
    if (type === 0) {
      // 2 pequeñas piedras planas decorativas
      const group = new THREE.Group();
      const p1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08), this.accentStoneMat);
      p1.position.set(-0.3, 0.02, 0.2);
      p1.scale.set(1.2, 0.4, 0.9);
      group.add(p1);

      const p2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06), this.accentStoneMat);
      p2.position.set(0.25, 0.02, -0.25);
      p2.scale.set(1.0, 0.4, 1.0);
      group.add(p2);
      return group;
    } else {
      // Pequeño brote silvestre
      const flowerGroup = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.15, 4), this.stemMat);
      stem.position.set(0.1, 0.08, 0.1);
      flowerGroup.add(stem);

      const petalMat = type === 1 ? this.petalMatYellow : this.petalMatBlue;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 5), petalMat);
      petal.position.set(0.1, 0.16, 0.1);
      flowerGroup.add(petal);

      return flowerGroup;
    }
  }

  public setHoverTile(pos: Position | null): void {
    if (!pos) {
      this.hoverMesh.visible = false;
      return;
    }
    const worldPos = this.gridToWorld(pos.x, pos.y);
    this.hoverMesh.position.set(worldPos.x, 0.05, worldPos.z);
    this.hoverMesh.visible = true;
  }

  /** Marca el tile del jugador activo con un indicador pulsante amarillo dorado (estilo Dofus) */
  public setActiveTurnIndicator(pos: Position | null): void {
    if (this.activeTurnIndicator) {
      this.highlightGroup.remove(this.activeTurnIndicator);
      this.activeTurnIndicator = null;
    }
    if (!pos) return;

    const worldPos = this.gridToWorld(pos.x, pos.y);
    const geo = new THREE.PlaneGeometry(this.tileSize * 0.92, this.tileSize * 0.92);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(worldPos.x, 0.06, worldPos.z);
    this.highlightGroup.add(mesh);
    this.activeTurnIndicator = mesh;
  }

  public showReachableTiles(cells: Position[]): void {
    this.clearMoveHighlights();
    const geo = new THREE.PlaneGeometry(this.tileSize * 0.92, this.tileSize * 0.92);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    for (const cell of cells) {
      const mesh = new THREE.Mesh(geo, mat);
      const worldPos = this.gridToWorld(cell.x, cell.y);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(worldPos.x, 0.04, worldPos.z);
      this.highlightGroup.add(mesh);
      this.moveHighlightMeshes.push(mesh);
    }
  }

  public clearMoveHighlights(): void {
    for (const m of this.moveHighlightMeshes) {
      this.highlightGroup.remove(m);
    }
    this.moveHighlightMeshes = [];
  }

  public showSpellRangeTiles(cells: Position[]): void {
    this.clearSpellHighlights();
    const geo = new THREE.PlaneGeometry(this.tileSize * 0.92, this.tileSize * 0.92);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xdc2626,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    for (const cell of cells) {
      const mesh = new THREE.Mesh(geo, mat);
      const worldPos = this.gridToWorld(cell.x, cell.y);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(worldPos.x, 0.045, worldPos.z);
      this.highlightGroup.add(mesh);
      this.attackHighlightMeshes.push(mesh);
    }
  }

  public clearSpellHighlights(): void {
    for (const m of this.attackHighlightMeshes) {
      this.highlightGroup.remove(m);
    }
    this.attackHighlightMeshes = [];
  }

  public update(delta: number): void {
    if (!this.group.visible) return;

    this.animTime += delta;

    // Pulsación suave del indicador de turno activo (estilo Dofus)
    if (this.activeTurnIndicator) {
      const mat = this.activeTurnIndicator.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.45 + Math.sin(this.animTime * 4.0) * 0.2;
    }

    // Animación de los cristales flotantes en las esquinas y sus luces
    this.arenaDecorGroup.traverse((obj) => {
      if (obj.userData.isFloatingCrystal) {
        const phase = (obj.userData.phase as number) || 0;
        const baseY = (obj.userData.baseY as number) || 2.15;
        obj.position.y = baseY + Math.sin(this.animTime * 1.8 + phase) * 0.12;
        obj.rotation.y = this.animTime * 0.9 + phase;
        // Pulsar emissiveIntensity para efecto de energía mágica
        const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (mat && mat.emissiveIntensity !== undefined) {
          mat.emissiveIntensity = 0.7 + Math.sin(this.animTime * 2.5 + phase) * 0.4;
        }
      }
      if (obj.userData.isCrystalLight) {
        const phase = (obj.userData.phase as number) || 0;
        const light = obj as THREE.PointLight;
        light.intensity = 1.2 + Math.sin(this.animTime * 2.5 + phase) * 0.5;
      }
    });
  }
}
