import type { ActiveCombatMarker, WorldGatherNode, WorldMob, WorldNPC, WorldPlayer } from '../types';

export class Minimap {
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private zoomRadius: number = 45; // Metros de radio visible en el radar
  private isVisible: boolean = true;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'minimap-radar-container';
    this.container.className = 'interactive';
    this.container.style.cssText = `
      position: absolute;
      top: 16px;
      right: 16px;
      width: 150px;
      height: 150px;
      border-radius: 50%;
      border: 3px solid #b8860b;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.8), 0 0 12px rgba(184, 134, 11, 0.4);
      background: radial-gradient(circle, #0e121a 0%, #06080d 100%);
      overflow: hidden;
      z-index: 45;
      user-select: none;
    `;

    this.canvas = document.createElement('canvas');
    this.canvas.width = 150;
    this.canvas.height = 150;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;

    // Controles de Zoom (+ / -) y ocultar
    const controls = document.createElement('div');
    controls.style.cssText = `
      position: absolute;
      bottom: 4px;
      right: 4px;
      display: flex;
      gap: 3px;
      z-index: 50;
    `;
    controls.innerHTML = `
      <button id="btn-mm-zoom-in" style="width: 18px; height: 18px; font-size: 11px; background: rgba(0,0,0,0.7); color: #ffd700; border: 1px solid #666; border-radius: 3px; cursor: pointer; padding: 0; line-height: 16px;">+</button>
      <button id="btn-mm-zoom-out" style="width: 18px; height: 18px; font-size: 11px; background: rgba(0,0,0,0.7); color: #ffd700; border: 1px solid #666; border-radius: 3px; cursor: pointer; padding: 0; line-height: 16px;">-</button>
    `;
    this.container.appendChild(controls);

    const mount = document.getElementById('dofus-minimap-mount');
    if (mount) {
      this.mountTo(mount);
    } else {
      document.body.appendChild(this.container);
    }

    controls.querySelector('#btn-mm-zoom-in')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.zoomRadius = Math.max(25, this.zoomRadius - 10);
    });
    controls.querySelector('#btn-mm-zoom-out')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.zoomRadius = Math.min(80, this.zoomRadius + 10);
    });

    // Tecla M para alternar minimapa
    window.addEventListener('keydown', (e) => {
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active.offsetParent !== null) {
        return;
      }
      if (e.code === 'KeyM' || e.key.toLowerCase() === 'm') {
        this.toggle();
      }
    });
  }

  public toggle(): void {
    this.isVisible = !this.isVisible;
    this.container.style.display = this.isVisible ? 'block' : 'none';
  }

  public mountTo(parent: HTMLElement): void {
    this.container.style.position = 'relative';
    this.container.style.top = '0';
    this.container.style.right = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.border = 'none';
    this.container.style.boxShadow = 'none';
    this.container.style.borderRadius = '50%';
    parent.appendChild(this.container);
  }

  public setVisible(v: boolean): void {
    this.isVisible = v;
    this.container.style.display = v ? 'block' : 'none';
  }

  public render(
    playerPos: { x: number; z: number } | null,
    playerRotation: number,
    otherPlayers: WorldPlayer[],
    mobs: WorldMob[],
    npcs: WorldNPC[],
    markers: ActiveCombatMarker[],
    gatherNodes: WorldGatherNode[] = []
  ): void {
    if (!this.isVisible) return;
    const ctx = this.ctx;
    const size = 150;
    const center = size / 2;

    ctx.clearRect(0, 0, size, size);

    // Fondo y cuadrícula circular de radar
    ctx.fillStyle = '#0a0d14';
    ctx.beginPath();
    ctx.arc(center, center, center - 2, 0, Math.PI * 2);
    ctx.fill();

    // Círculos concéntricos de distancia
    ctx.strokeStyle = 'rgba(184, 134, 11, 0.2)';
    ctx.lineWidth = 1;
    [center * 0.35, center * 0.7, center * 0.95].forEach((r) => {
      ctx.beginPath();
      ctx.arc(center, center, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Cruz de coordenadas
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(center, 4);
    ctx.lineTo(center, size - 4);
    ctx.moveTo(4, center);
    ctx.lineTo(size - 4, center);
    ctx.stroke();

    // Puntos cardinales N
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('N', center, 6);

    if (!playerPos) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, center - 3, 0, Math.PI * 2);
    ctx.clip();

    const scale = (center - 8) / this.zoomRadius;

    // Función auxiliar para transformar coordenadas mundiales a canvas
    const toCanvas = (worldX: number, worldZ: number): { x: number; y: number; inBounds: boolean } => {
      const dx = worldX - playerPos.x;
      const dz = worldZ - playerPos.z;
      const cx = center + dx * scale;
      const cy = center + dz * scale;
      const dist = Math.hypot(dx * scale, dz * scale);
      return { x: cx, y: cy, inBounds: dist <= center - 4 };
    };

    // 0. Dibujar Caminos y Plaza de Aldea 1
    const pCenter = toCanvas(0, 0);
    ctx.fillStyle = 'rgba(180, 150, 110, 0.2)';
    ctx.beginPath();
    ctx.arc(pCenter.x, pCenter.y, Math.max(8, 14 * scale), 0, Math.PI * 2);
    ctx.fill();

    // Camino Norte hacia Valle de Seungryong (z = -65)
    const pNorthStart = toCanvas(0, -10);
    const pNorthEnd = toCanvas(0, -65);
    ctx.strokeStyle = 'rgba(217, 119, 6, 0.45)';
    ctx.lineWidth = Math.max(3, 7.5 * scale);
    ctx.beginPath();
    ctx.moveTo(pNorthStart.x, pNorthStart.y);
    ctx.lineTo(pNorthEnd.x, pNorthEnd.y);
    ctx.stroke();

    // Camino Este hacia Desierto de Yongbi (x = 65)
    const pEastStart = toCanvas(10, 0);
    const pEastEnd = toCanvas(65, 0);
    ctx.beginPath();
    ctx.moveTo(pEastStart.x, pEastStart.y);
    ctx.lineTo(pEastEnd.x, pEastEnd.y);
    ctx.stroke();

    // Camino Sur hacia Zona de Caza (z = 35)
    const pSouthStart = toCanvas(0, 10);
    const pSouthEnd = toCanvas(0, 35);
    ctx.strokeStyle = 'rgba(180, 140, 90, 0.35)';
    ctx.lineWidth = Math.max(2, 6 * scale);
    ctx.beginPath();
    ctx.moveTo(pSouthStart.x, pSouthStart.y);
    ctx.lineTo(pSouthEnd.x, pSouthEnd.y);
    ctx.stroke();

    // Portales Fronterizos
    // Portal Norte: Valle de Seungryong (0, -65)
    const pPortalN = toCanvas(0, -65);
    ctx.fillStyle = '#06b6d4';
    ctx.strokeStyle = '#cffafe';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pPortalN.x, pPortalN.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = 'bold 8px sans-serif';
    ctx.fillStyle = '#67e8f9';
    ctx.textAlign = 'center';
    ctx.fillText('Valle', pPortalN.x, pPortalN.y - 7);

    // Portal Este: Desierto de Yongbi (65, 0)
    const pPortalE = toCanvas(65, 0);
    ctx.fillStyle = '#a855f7';
    ctx.strokeStyle = '#f3e8ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pPortalE.x, pPortalE.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.font = 'bold 8px sans-serif';
    ctx.fillStyle = '#d8b4fe';
    ctx.textAlign = 'center';
    ctx.fillText('Desierto', pPortalE.x, pPortalE.y - 7);

    // 1. Dibujar NPCs (Amarillo dorado con borde)
    for (const npc of npcs) {
      const p = toCanvas(npc.pos.x, npc.pos.z);
      if (p.inBounds) {
        ctx.fillStyle = '#eab308';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 1.5. Dibujar Nodos de Recolección (Vetas, Árboles, Pesca)
    for (const node of gatherNodes) {
      const p = toCanvas(node.pos.x, node.pos.z);
      if (p.inBounds) {
        if (node.is_depleted) {
          ctx.fillStyle = '#64748b'; // Agotado
        } else if (node.node_type === 'Mining') {
          ctx.fillStyle = node.resource_name.includes('Cobre') ? '#f97316' : node.resource_name.includes('Hierro') ? '#94a3b8' : '#c084fc';
        } else if (node.node_type === 'Woodcutting') {
          ctx.fillStyle = '#22c55e';
        } else {
          ctx.fillStyle = '#06b6d4'; // Pesca
        }
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 2. Dibujar Mobs
    for (const mob of mobs) {
      if (!mob.is_alive) continue;
      const p = toCanvas(mob.pos.x, mob.pos.z);
      if (p.inBounds) {
        if (mob.mob_type === 'metin_stone') {
          // Piedra Metin: Rombo púrpura brillante
          ctx.fillStyle = '#a855f7';
          ctx.strokeStyle = '#f3e8ff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - 5);
          ctx.lineTo(p.x + 5, p.y);
          ctx.lineTo(p.x, p.y + 5);
          ctx.lineTo(p.x - 5, p.y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          // Monstruo normal: Punto rojo
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 3. Dibujar Marcadores de combate activo (Espadas cruzadas)
    for (const m of markers) {
      const p = toCanvas(m.pos.x, m.pos.z);
      if (p.inBounds) {
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚔️', p.x, p.y);
      }
    }

    // 4. Dibujar Otros Jugadores (Azul Jinno / Rojo Shinsoo)
    for (const pl of otherPlayers) {
      const p = toCanvas(pl.pos.x, pl.pos.z);
      if (p.inBounds) {
        ctx.fillStyle = pl.team === 0 ? '#38bdf8' : '#f87171';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 5. Dibujar Jugador Local (Flecha dorada en el centro)
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(playerRotation);

    ctx.fillStyle = '#ffd700';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    ctx.restore();
  }
}
