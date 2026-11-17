import * as THREE from 'three';
import { AssetManager, type CharacterInstance } from './AssetManager';
import type { CharacterClass } from '../types';

export class CharacterPreview {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private currentInstance: CharacterInstance | null = null;
  private characterGroup: THREE.Group;
  private isRunning = false;
  private animFrameId: number | null = null;
  private lastTime = 0;
  private isDragging = false;
  private prevMouseX = 0;
  private rotationSpeed = 0.0;

  constructor(container: HTMLElement) {
    this.container = container;
    const width = container.clientWidth || 240;
    const height = container.clientHeight || 280;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 50);
    this.camera.position.set(0, 1.05, 4.2);
    this.camera.lookAt(0, 0.82, 0);

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    // Luces de estudio
    const amb = new THREE.AmbientLight(0xffffff, 1.4);
    this.scene.add(amb);

    const dirLight = new THREE.DirectionalLight(0xffeedd, 2.2);
    dirLight.position.set(2, 4, 3);
    this.scene.add(dirLight);

    const backLight = new THREE.DirectionalLight(0x90cdf4, 1.0);
    backLight.position.set(-2, 2, -2);
    this.scene.add(backLight);

    // Pedestal estilo Dofus 1.29 / Metin2
    const pedestalGeo = new THREE.CylinderGeometry(0.75, 0.85, 0.12, 32);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x3d352b,
      roughness: 0.8,
      metalness: 0.2,
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = -0.06;
    this.scene.add(pedestal);

    // Grupo de personaje para rotación suave
    this.characterGroup = new THREE.Group();
    this.scene.add(this.characterGroup);

    this.setupInteraction();
    this.startLoop();
  }

  private setupInteraction(): void {
    const el = this.renderer.domElement;
    el.style.cursor = 'grab';

    el.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.prevMouseX = e.clientX;
      el.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.prevMouseX;
      this.prevMouseX = e.clientX;
      this.characterGroup.rotation.y += dx * 0.015;
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        el.style.cursor = 'grab';
      }
    });
  }

  public async setCharacter(
    classType: CharacterClass,
    outfit: number = 1,
    gender: 'male' | 'female' = 'male'
  ): Promise<void> {
    const cLower = (classType || 'Warrior').toLowerCase();
    let modelKey = 'warrior_1';

    if (cLower === 'warrior') {
      modelKey = gender === 'female' ? `warrior_female_${outfit}` : `warrior_${outfit}`;
    } else if (cLower === 'ninja') {
      modelKey = gender === 'male' ? `ninja_male_${outfit}` : `ninja_${outfit}`;
    } else if (cLower === 'sura') {
      modelKey = gender === 'female' ? `sura_female_${outfit}` : `sura_${outfit}`;
    } else if (cLower === 'shaman') {
      modelKey = gender === 'male' ? `shaman_male_${outfit}` : `shaman_${outfit}`;
    }

    // Limpiar personaje anterior
    while (this.characterGroup.children.length > 0) {
      this.characterGroup.remove(this.characterGroup.children[0]);
    }
    this.characterGroup.rotation.y = 0;
    this.currentInstance = null;

    const charInstance = await AssetManager.getInstance().createCharacterInstance(modelKey);
    if (!charInstance) return;

    this.currentInstance = charInstance;
    charInstance.group.scale.setScalar(0.0125);
    charInstance.group.position.set(0, 0, 0);
    this.characterGroup.add(charInstance.group);

    charInstance.playAnimation('idle');
    // Sin arma en la creación de personaje (según especificación del usuario)
  }

  public resize(): void {
    const w = this.container.clientWidth || 240;
    const h = this.container.clientHeight || 280;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private startLoop(): void {
    this.isRunning = true;
    this.lastTime = performance.now();

    const loop = (time: number) => {
      if (!this.isRunning) return;
      const delta = Math.min((time - this.lastTime) / 1000, 0.1);
      this.lastTime = time;

      if (!this.isDragging) {
        this.characterGroup.rotation.y += delta * this.rotationSpeed;
      }

      if (this.currentInstance) {
        this.currentInstance.update(delta);
      }

      this.renderer.render(this.scene, this.camera);
      this.animFrameId = requestAnimationFrame(loop);
    };

    this.animFrameId = requestAnimationFrame(loop);
  }

  public pause(): void {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public resume(): void {
    if (!this.isRunning) {
      this.startLoop();
      this.resize();
    }
  }

  public destroy(): void {
    this.pause();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
