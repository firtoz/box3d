import * as THREE from 'three';
import { Box3DRuntime, PhysicsBody, PhysicsWorld } from './box3d.js';

type Vec3 = [number, number, number];

type BoxParams = {
  size?: Vec3;
  position?: Vec3;
  static?: boolean;
  density?: number;
  color?: number;
  roughness?: number;
  metalness?: number;
};

type SphereParams = {
  radius?: number;
  position?: Vec3;
  velocity?: Vec3;
  density?: number;
  color?: number;
  roughness?: number;
  metalness?: number;
};

type BodyHit = {
  body: PhysicsBody;
  point: THREE.Vector3;
  normal: THREE.Vector3;
};

export class ThreeWorld {
  private readonly scene: THREE.Scene;
  readonly physics: PhysicsWorld;
  readonly bodies: PhysicsBody[];
  private hoveredBody: PhysicsBody | null;

  constructor(runtime: Box3DRuntime, scene: THREE.Scene, { gravity = [0, -9.81, 0] }: { gravity?: Vec3 } = {}) {
    this.scene = scene;
    this.physics = runtime.createWorld({ gravity });
    this.bodies = [];
    this.hoveredBody = null;
  }

  box({
    size = [1, 1, 1],
    position = [0, 0, 0],
    static: isStatic = false,
    density = 1,
    color = 0xd1d5db,
    roughness = 0.75,
    metalness = 0.05,
  }: BoxParams = {}): PhysicsBody {
    const body = this.physics.box({ size, position, static: isStatic, density });
    const geometry = new THREE.BoxGeometry(size[0] * 2, size[1] * 2, size[2] * 2);
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const mesh = new THREE.Mesh(geometry, material);

    mesh.castShadow = !isStatic;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    body.isStatic = isStatic;
    mesh.userData.body = body;
    body.attachMesh(mesh, () => {
      geometry.dispose();
      material.dispose();
    });
    this.bodies.push(body);
    return body;
  }

  sphere({
    radius = 0.5,
    position = [0, 0, 0],
    velocity = [0, 0, 0],
    density = 1,
    color = 0xf8fafc,
    roughness = 0.55,
    metalness = 0.12,
  }: SphereParams = {}): PhysicsBody {
    const body = this.physics.sphere({ radius, position, velocity, density });
    const geometry = new THREE.SphereGeometry(radius, 24, 16);
    const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const mesh = new THREE.Mesh(geometry, material);

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    body.isStatic = false;
    mesh.userData.body = body;
    body.attachMesh(mesh, () => {
      geometry.dispose();
      material.dispose();
    });
    this.bodies.push(body);
    return body;
  }

  step(dt = 1 / 60, substeps = 4): void {
    this.physics.step(dt, substeps);
  }

  sync(): void {
    for (const body of this.bodies) {
      body.sync();
    }
  }

  destroy(): void {
    for (const body of [...this.bodies]) {
      body.destroy();
    }
    this.bodies.length = 0;
    this.physics.destroy();
  }

  pickBody(raycaster: THREE.Raycaster): BodyHit | null {
    const meshes: THREE.Mesh[] = [];
    for (const body of this.bodies) {
      if (body.mesh !== null) {
        meshes.push(body.mesh);
      }
    }

    const hits = raycaster.intersectObjects(meshes, false);
    for (const hit of hits) {
      const body = hit.object.userData.body as PhysicsBody | undefined;
      if (body === undefined) {
        continue;
      }

      const faceNormal = hit.face?.normal;
      const normal = faceNormal !== undefined
        ? faceNormal.clone().transformDirection(hit.object.matrixWorld).normalize()
        : new THREE.Vector3(0, 1, 0);

      return { body, point: hit.point.clone(), normal };
    }

    return null;
  }

  setHoveredBody(body: PhysicsBody | null): void {
    const nextBody = body !== null && body.isStatic ? null : body;

    if (this.hoveredBody === nextBody) {
      return;
    }

    if (this.hoveredBody !== null && this.hoveredBody.mesh !== null) {
      this.hoveredBody.mesh.material = this.hoveredBody.mesh.userData.baseMaterial as THREE.Material;
    }

    this.hoveredBody = nextBody;

    if (nextBody !== null && nextBody.mesh !== null) {
      nextBody.mesh.userData.baseMaterial = nextBody.mesh.material;
      const sourceMaterial = nextBody.mesh.material as THREE.MeshStandardMaterial;
      nextBody.mesh.material = sourceMaterial.clone();
      const hoveredMaterial = nextBody.mesh.material as THREE.MeshStandardMaterial;
      hoveredMaterial.emissive = new THREE.Color(0x334155);
      hoveredMaterial.emissiveIntensity = 0.55;
    }
  }
}
