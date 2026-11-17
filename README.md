# ⚔️ DOTIN • MiniMMO Tactical RPG (Dofus x Metin2)

**Dotin** es una demo jugable de un **MiniMMO** que fusiona la exploración y ambientación de la **Aldea 1 de Metin2** con el sistema de **combate táctico cooperativo por turnos de Dofus**.

---

## 🌟 Nuevas Características del MiniMMO

### 1. Mundo Abierto en Tiempo Real (Aldea 1 de Metin2)
* **Exploración Libre:** Camina fluidamente haciendo clic en cualquier parte del mapa. La cámara 3D sigue a tu personaje.
* **Multijugador Sincronizado:** Ves a tus amigos corriendo por la aldea, con sus placas de nombre, nivel y colores de reino (🔵 Jinno vs 🔴 Shinsoo).
* **Entorno Oriental:** Plaza de adoquines central, puertas torii bermellón, cerezos en flor (sakura), casas de madera con farolillos encendidos.
* **NPCs Clásicos:**
  * 🛡️ **Guardián de la Aldea**
  * 🔨 **Herrero** (con yunque y fragua)
  * 🧪 **Vendedora** (tienda general)
* **Chat en Vivo de Aldea:** Puedes chatear en tiempo real con todos los jugadores conectados pulsando `Enter`.

### 2. Monstruos Errantes y Burbuja de Combate (Estilo Dofus)
* **Monstruos en los Alrededores:** *Perros Salvajes [Lv.1]*, *Lobos Hambrientos [Lv.3]*, *Lobos Alfa [Lv.5]* y *Piedras Metin [Lv.5]* patrullando fuera de las puertas de la aldea.
* **Transición de Combate por Turnos:**
  1. Haces clic en un monstruo.
  2. En el Overworld aparece una **marca de combate con espadas cruzadas ⚔️** y se abre una **fase de preparación de 12 segundos**.
  3. Tus amigos pueden hacer clic en las espadas cruzadas para **unirse a tu grupo**.
  4. La cámara hace una transición suave hacia la **arena táctica** y comienza el combate por turnos (con PA, PM, cuadrícula y hechizos).
  5. Al derrotar al monstruo, recibes **EXP y Yang**, y regresas automáticamente a la aldea en tiempo real.

### 3. Progresión del Personaje (HUD MMO)
* Marco de personaje superior con **Nivel**, barra de **HP**, barra de **EXP** y contador de **Yang (oro)**.
* Sistema de niveles: acumula EXP en combates para subir de nivel y aumentar tu vida máxima.

---

## 🚀 Cómo Iniciar el MiniMMO (1 Clic)

En la carpeta `Dotin`:
1. Haz doble clic en **`start-all.bat`**.
2. Se iniciará el servidor de Rust y el cliente de Three.js, y se abrirá el juego automáticamente en `http://localhost:5173`.
3. Para jugar con tus amigos:
   * **En la misma red Wi-Fi:** pásales tu IP local (ej. `http://192.168.1.X:5173`).
   * **Por Internet:** usa una VPN como **Tailscale**, **ZeroTier** o **Hamachi**.
   * Abre dos pestañas de navegador si quieres probar el multijugador cooperativo tú mismo en la misma máquina.

---

## 🎨 Importar Modelos Originales de Metin2 (`.gr2` -> `.glb`)
Coloca tus modelos convertidos en:
```
client/public/assets/models/
  ├── warrior.glb
  ├── sura.glb
  ├── ninja.glb
  └── shaman.glb
```
*(Si la carpeta está vacía, el juego usa automáticamente los modelos 3D procedurales integrados).*
