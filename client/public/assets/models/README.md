# 🗡️ Carpeta de Modelos 3D de Metin2 (Dotin Mini-MMO)

Coloca aquí tus modelos 3D en formato `.glb` o `.gltf` (extraídos de los archivos `.gr2` de Metin2 con Blender + Granny plugin).
El motor Three.js de Dotin los detectará y cargará **automáticamente**. Si algún modelo no está presente, el juego usará los avatares low-poly procedurales sin ningún error.

---

### 📂 Nombres de Archivo Reconocidos:

#### 1. Clases de Personajes:
* `warrior.glb` -> Guerrero (Guerreo corporal / mental de Metin2)
* `sura.glb` -> Sura (Magia negra / armas mágicas)
* `ninja.glb` -> Ninja (Dagas / arco)
* `shaman.glb` -> Chamán (Dragón / luz)

#### 2. Monstruos y Mobs:
* `wild_dog.glb` -> Perro Salvaje
* `wolf.glb` -> Lobo Hambriento / Lobo Alfa
* `metin_stone.glb` -> Piedra Metin de Dolor

#### 3. Armas y Objetos:
* `fms.glb` -> Espada de Luna Llena (+0 a +9)
* `bamboo_sword.glb` -> Espada de Bambú

---

### 💡 Instrucciones para convertir .gr2 a .glb:
1. Usa el plugin de Blender **Granny 3D (.gr2)** para importar los modelos y esqueletos de Metin2 (`ymir work`).
2. Centra el origen en los pies del modelo (`(0, 0, 0)`).
3. Exporta desde Blender como **glTF 2.0 Binary (`.glb`)**.
4. Guárdalo en esta carpeta con el nombre correspondiente (por ejemplo `warrior.glb`).
