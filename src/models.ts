import * as THREE from "three";
import warningPath from "./assets/warning.png";

const textureLoader = new THREE.TextureLoader();
const warning = textureLoader.load(warningPath);
const wireframeMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  wireframe: true,
});

export class Machine extends THREE.Object3D {
  public status: string | undefined;
  private warningSprite: THREE.Sprite;

  constructor(
    x: number,
    y: number,
    z: number,
    xRot: number,
    yRot: number,
    zRot: number,
    public simuloId: number,
  ) {
    super();
    this.position.set(x, y, z);
    this.rotation.set(xRot, yRot, zRot);

    this.warningSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: warning, transparent: true }),
    );
    this.warningSprite.position.set(0, 2, 0);
    this.warningSprite.scale.set(2, 2, 2);
    this.add(this.warningSprite);

    this.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(2, 1, 2, 2, 1, 2),
        wireframeMaterial,
      ),
    );

    const cone = new THREE.Mesh(
      new THREE.TetrahedronGeometry(0.75, 0),
      wireframeMaterial,
    );
    cone.position.set(0, -1.25, 0);
    cone.rotation.set(Math.PI / 5, 0, -Math.PI / 4);
    this.add(cone);

    const field = new THREE.Mesh(
      new THREE.ConeGeometry(5, 9),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        opacity: 0.5,
        transparent: true,
      }),
    );
    field.position.set(0, -(9 / 2) - 0.5, 0);
    this.add(field);
  }

  update() {
    if (this.status === "offline") {
      const sine = Math.sin(Date.now() / 200) / 5 + 0.8;
      this.warningSprite.material.opacity = sine;
    } else {
      this.warningSprite.material.opacity = 0;
    }
  }

  onClick() {}
}
