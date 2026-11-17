import * as THREE from 'three';

interface FloatingItem {
  sprite: THREE.Sprite;
  startPos: THREE.Vector3;
  velocity: THREE.Vector3;
  startTime: number;
  duration: number;
}

interface ParticleEmitter {
  points: THREE.Points;
  velocities: THREE.Vector3[];
  startTime: number;
  duration: number;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  startTime: number;
  duration: number;
  maxRadius: number;
}

export class CombatVFX {
  public group: THREE.Group;
  private floatingItems: FloatingItem[] = [];
  private particleEmitters: ParticleEmitter[] = [];
  private shockwaves: ShockwaveRing[] = [];

  constructor() {
    this.group = new THREE.Group();
  }

  /**
   * Muestra un número o texto flotante en 3D (Damage, Heal, Crítico)
   */
  public showFloatingText(
    pos: THREE.Vector3,
    text: string,
    color: string = '#ef4444',
    isCritical: boolean = false
  ): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, 256, 128);

    // Sombra de texto
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;

    ctx.font = isCritical ? 'bold 44px "Cinzel", sans-serif' : 'bold 36px "Cinzel", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Borde
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, 128, 64);

    // Relleno
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 64);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(spriteMat);

    const baseScale = isCritical ? 2.6 : 2.0;
    sprite.scale.set(baseScale, baseScale * 0.5, 1);

    const initialPos = pos.clone().add(new THREE.Vector3(
      (Math.random() - 0.5) * 0.4,
      1.8 + Math.random() * 0.3,
      (Math.random() - 0.5) * 0.4
    ));
    sprite.position.copy(initialPos);

    this.group.add(sprite);

    this.floatingItems.push({
      sprite,
      startPos: initialPos,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.5, 2.2, (Math.random() - 0.5) * 0.5),
      startTime: performance.now(),
      duration: isCritical ? 1400 : 1100,
    });
  }

  /**
   * Aura de Espada (Geomgyeong): Columnas doradas ascendentes de chi y brillo místico
   */
  public playAuraVFX(pos: THREE.Vector3): void {
    // Anillo expansivo dorado en el suelo
    this.createShockwave(pos, 0xfbbf24, 2.2, 550);

    // Cilindro translúcido de poder ascendente
    const auraGeo = new THREE.CylinderGeometry(0.7, 0.9, 2.6, 24, 1, true);
    const auraMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
    const auraMesh = new THREE.Mesh(auraGeo, auraMat);
    auraMesh.position.copy(pos).add(new THREE.Vector3(0, 1.3, 0));
    this.group.add(auraMesh);

    // Partículas de chi dorado
    this.spawnParticleBurst(pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xfef08a, 32, 2.5, 600);

    const startTime = performance.now();
    const duration = 650;
    const animateAura = () => {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / duration;
      if (progress >= 1) {
        this.group.remove(auraMesh);
        auraGeo.dispose();
        auraMat.dispose();
        return;
      }
      auraMesh.rotation.y += 0.08;
      auraMesh.scale.set(1 + progress * 0.4, 1 + progress * 0.2, 1 + progress * 0.4);
      auraMat.opacity = 0.8 * (1 - progress);
      requestAnimationFrame(animateAura);
    };
    animateAura();
  }

  /**
   * Giro de Espada (Palbang): Tajo ciclónico giratorio de 360 grados
   */
  public playGiroVFX(pos: THREE.Vector3): void {
    this.createShockwave(pos, 0xef4444, 3.2, 450);

    const ringGeo = new THREE.TorusGeometry(1.8, 0.22, 12, 48);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(pos).add(new THREE.Vector3(0, 1.0, 0));
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);

    this.spawnParticleBurst(pos.clone().add(new THREE.Vector3(0, 1.0, 0)), 0xff6b6b, 40, 4.0, 500);

    const startTime = performance.now();
    const duration = 400;
    const animateGiro = () => {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / duration;
      if (progress >= 1) {
        this.group.remove(ring);
        ringGeo.dispose();
        ringMat.dispose();
        return;
      }
      ring.scale.setScalar(1 + progress * 1.2);
      ring.rotation.z += 0.25;
      ringMat.opacity = 0.9 * (1 - progress);
      requestAnimationFrame(animateGiro);
    };
    animateGiro();
  }

  /**
   * Corte de Tres Maneras (Samyeon): Ráfaga de 3 tajos sucesivos rápidos
   */
  public playTripleSlashVFX(pos: THREE.Vector3): void {
    this.playSlashVFX(pos);
    setTimeout(() => {
      this.playSlashVFX(pos.clone().add(new THREE.Vector3(0.2, 0.2, 0)));
    }, 120);
    setTimeout(() => {
      this.playSlashVFX(pos.clone().add(new THREE.Vector3(-0.2, -0.1, 0)));
      this.spawnParticleBurst(pos.clone().add(new THREE.Vector3(0, 0.9, 0)), 0xffe066, 25, 3.0, 400);
    }, 240);
  }

  /**
   * Tajo de espada cortante
   */
  public playSlashVFX(pos: THREE.Vector3): void {
    const geo = new THREE.RingGeometry(0.3, 1.4, 24, 1, 0, Math.PI * 0.85);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffea70,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const slash = new THREE.Mesh(geo, mat);
    slash.position.copy(pos).add(new THREE.Vector3(0, 0.8, 0));
    slash.rotation.x = Math.PI / 3;
    slash.rotation.z = Math.random() * Math.PI;

    this.group.add(slash);

    const startTime = performance.now();
    const duration = 280;

    const animateSlash = () => {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / duration;
      if (progress >= 1) {
        this.group.remove(slash);
        geo.dispose();
        mat.dispose();
        return;
      }

      slash.scale.setScalar(1 + progress * 0.8);
      slash.rotation.z += 0.08;
      mat.opacity = 0.9 * (1 - progress);
      requestAnimationFrame(animateSlash);
    };
    animateSlash();
  }

  /**
   * Explosión de Fuego (Sura / Magia)
   */
  public playFireExplosion(pos: THREE.Vector3): void {
    // 1. Onda expansiva en el suelo
    this.createShockwave(pos, 0xf97316, 2.4, 450);

    // 2. Partículas incandescentes hacia arriba
    const count = 35;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y + 0.2;
      positions[i * 3 + 2] = pos.z;

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 2.5;
      velocities.push(new THREE.Vector3(
        Math.cos(angle) * speed,
        2.5 + Math.random() * 3.5,
        Math.sin(angle) * speed
      ));
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xfbbf24,
      size: 0.25,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    this.group.add(points);

    this.particleEmitters.push({
      points,
      velocities,
      startTime: performance.now(),
      duration: 650,
    });
  }

  /**
   * Pulso místico oscuro (Piedra Metin)
   */
  public playMetinPulse(pos: THREE.Vector3): void {
    this.createShockwave(pos, 0xa855f7, 3.2, 600);

    const count = 30;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y + 1.2;
      positions[i * 3 + 2] = pos.z;

      const angle = Math.random() * Math.PI * 2;
      velocities.push(new THREE.Vector3(
        Math.cos(angle) * 2.0,
        1.0 + Math.random() * 2.5,
        Math.sin(angle) * 2.0
      ));
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xc084fc,
      size: 0.3,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    this.group.add(points);

    this.particleEmitters.push({
      points,
      velocities,
      startTime: performance.now(),
      duration: 700,
    });
  }

  /**
   * Espiral de Sanación Verde / Oro (Chamán)
   */
  public playHealVFX(pos: THREE.Vector3): void {
    this.createShockwave(pos, 0x4ade80, 1.8, 500);

    const count = 25;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 0.6;
      positions[i * 3] = pos.x + Math.cos(angle) * radius;
      positions[i * 3 + 1] = pos.y + 0.1;
      positions[i * 3 + 2] = pos.z + Math.sin(angle) * radius;

      velocities.push(new THREE.Vector3(
        -Math.sin(angle) * 0.8,
        2.2 + Math.random() * 1.5,
        Math.cos(angle) * 0.8
      ));
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x86efac,
      size: 0.22,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    this.group.add(points);

    this.particleEmitters.push({
      points,
      velocities,
      startTime: performance.now(),
      duration: 800,
    });
  }

  private spawnParticleBurst(
    pos: THREE.Vector3,
    color: number,
    count: number,
    speedMax: number,
    duration: number
  ): void {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * speedMax;
      velocities.push(
        new THREE.Vector3(
          Math.cos(angle) * speed,
          1.0 + Math.random() * speedMax,
          Math.sin(angle) * speed
        )
      );
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.22,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    this.group.add(points);

    this.particleEmitters.push({
      points,
      velocities,
      startTime: performance.now(),
      duration,
    });
  }

  private createShockwave(pos: THREE.Vector3, color: number, maxRadius: number, duration: number): void {
    const geo = new THREE.RingGeometry(0.1, 0.35, 32);
    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos).add(new THREE.Vector3(0, 0.05, 0));
    mesh.rotation.x = -Math.PI / 2;

    this.group.add(mesh);

    this.shockwaves.push({
      mesh,
      startTime: performance.now(),
      duration,
      maxRadius,
    });
  }

  /**
   * Actualización por frame (llamado desde render loop)
   */
  public update(delta: number): void {
    const now = performance.now();

    // 1. Textos flotantes
    for (let i = this.floatingItems.length - 1; i >= 0; i--) {
      const item = this.floatingItems[i];
      const elapsed = now - item.startTime;
      const progress = elapsed / item.duration;

      if (progress >= 1) {
        this.group.remove(item.sprite);
        item.sprite.material.map?.dispose();
        item.sprite.material.dispose();
        this.floatingItems.splice(i, 1);
        continue;
      }

      // Elevación y desaceleración suave
      item.sprite.position.x += item.velocity.x * delta;
      item.sprite.position.y += item.velocity.y * delta;
      item.sprite.position.z += item.velocity.z * delta;
      item.velocity.y *= 0.94;

      // Desvanecimiento al final
      const opacity = progress < 0.6 ? 1 : (1 - progress) / 0.4;
      item.sprite.material.opacity = Math.max(0, opacity);
    }

    // 2. Emisores de partículas
    for (let i = this.particleEmitters.length - 1; i >= 0; i--) {
      const emitter = this.particleEmitters[i];
      const elapsed = now - emitter.startTime;
      const progress = elapsed / emitter.duration;

      if (progress >= 1) {
        this.group.remove(emitter.points);
        emitter.points.geometry.dispose();
        (emitter.points.material as THREE.Material).dispose();
        this.particleEmitters.splice(i, 1);
        continue;
      }

      const posAttr = emitter.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;

      for (let j = 0; j < emitter.velocities.length; j++) {
        arr[j * 3] += emitter.velocities[j].x * delta;
        arr[j * 3 + 1] += emitter.velocities[j].y * delta;
        arr[j * 3 + 2] += emitter.velocities[j].z * delta;

        emitter.velocities[j].y -= 4.0 * delta; // Gravedad
      }
      posAttr.needsUpdate = true;

      const mat = emitter.points.material as THREE.PointsMaterial;
      mat.opacity = 1 - progress;
    }

    // 3. Ondas expansivas
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      const elapsed = now - sw.startTime;
      const progress = elapsed / sw.duration;

      if (progress >= 1) {
        this.group.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        (sw.mesh.material as THREE.Material).dispose();
        this.shockwaves.splice(i, 1);
        continue;
      }

      const currentScale = 0.5 + progress * sw.maxRadius;
      sw.mesh.scale.set(currentScale, currentScale, 1);
      (sw.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - progress);
    }
  }
}
