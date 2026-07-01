import type { Mesh } from 'three';

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

export enum BodyType {
  Static = 0,
  Kinematic = 1,
  Dynamic = 2,
}

interface EmscriptenModuleOptions {
  locateFile(path: string): string;
}

interface EmscriptenModule {
  cwrap(name: string, returnType: 'number', argTypes: readonly string[]): (...args: number[]) => number;
  cwrap(name: string, returnType: null, argTypes: readonly string[]): (...args: number[]) => void;
  HEAPF32: Float32Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
}

interface EmscriptenModuleFactory {
  (options: EmscriptenModuleOptions): Promise<EmscriptenModule>;
}

interface ModuleImport {
  default: EmscriptenModuleFactory;
}

type WorldOptions = {
  gravity?: Vec3;
};

type BodyOptions = {
  type?: BodyType;
  position?: Vec3;
  enableSleep?: boolean;
  awake?: boolean;
};

type BoxOptions = {
  size?: Vec3;
  position?: Vec3;
  static?: boolean;
  density?: number;
};

type SphereOptions = {
  radius?: number;
  position?: Vec3;
  velocity?: Vec3;
  density?: number;
};

type BodyTransform = {
  position: Vec3;
  rotation: Quat;
};

function createVec3(x = 0, y = 0, z = 0): Vec3 {
  return [x, y, z];
}

export class Box3DRuntime {
  static async load(): Promise<Box3DRuntime> {
    const moduleUrl = `${import.meta.env.BASE_URL}wasm/box3d-web.js`;
    const source = await fetch(moduleUrl).then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load ${moduleUrl}: ${response.status} ${response.statusText}`);
      }
      return response.text();
    });

    const blobUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const moduleImport = (await import(/* @vite-ignore */ blobUrl)) as ModuleImport;
    URL.revokeObjectURL(blobUrl);

    const module = await moduleImport.default({
      locateFile(path: string): string {
        return new URL(path, moduleUrl).href;
      },
    });

    return new Box3DRuntime(module);
  }

  private readonly module: EmscriptenModule;
  private readonly createWorldFn: (...args: number[]) => number;
  private readonly destroyWorldFn: (...args: number[]) => void;
  private readonly createBodyFn: (...args: number[]) => number;
  private readonly createBoxFn: (...args: number[]) => number;
  private readonly createSphereFn: (...args: number[]) => number;
  private readonly destroyBodyFn: (...args: number[]) => void;
  private readonly destroyJointFn: (...args: number[]) => void;
  private readonly setBodyTransformFn: (...args: number[]) => void;
  private readonly setBodyAwakeFn: (...args: number[]) => void;
  private readonly getBodyLocalPointFn: (...args: number[]) => void;
  private readonly createMotorJointFn: (...args: number[]) => number;
  private readonly stepFn: (...args: number[]) => void;
  private readonly getBodyTransformFn: (...args: number[]) => void;
  private readonly transformPtr: number;
  private readonly pointPtr: number;

  constructor(module: EmscriptenModule) {
    this.module = module;
    this.createWorldFn = module.cwrap('b3wCreateWorld', 'number', ['number', 'number', 'number']);
    this.destroyWorldFn = module.cwrap('b3wDestroyWorld', null, ['number']);
    this.createBodyFn = module.cwrap('b3wCreateBody', 'number', ['number', 'number', 'number', 'number', 'number', 'number']);
    this.createBoxFn = module.cwrap('b3wCreateBox', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']);
    this.createSphereFn = module.cwrap('b3wCreateSphere', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']);
    this.destroyBodyFn = module.cwrap('b3wDestroyBody', null, ['number']);
    this.destroyJointFn = module.cwrap('b3wDestroyJoint', null, ['number']);
    this.setBodyTransformFn = module.cwrap('b3wSetBodyTransform', null, ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']);
    this.setBodyAwakeFn = module.cwrap('b3wSetBodyAwake', null, ['number', 'number']);
    this.getBodyLocalPointFn = module.cwrap('b3wGetBodyLocalPoint', null, ['number', 'number', 'number', 'number', 'number']);
    this.createMotorJointFn = module.cwrap('b3wCreateMotorJoint', 'number', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number']);
    this.stepFn = module.cwrap('b3wStep', null, ['number', 'number', 'number']);
    this.getBodyTransformFn = module.cwrap('b3wGetBodyTransform', null, ['number', 'number']);
    this.transformPtr = module._malloc(7 * 4);
    this.pointPtr = module._malloc(3 * 4);
  }

  destroy(): void {
    if (this.transformPtr !== 0) {
      this.module._free(this.transformPtr);
    }
    if (this.pointPtr !== 0) {
      this.module._free(this.pointPtr);
    }
  }

  createWorld(options: WorldOptions = {}): PhysicsWorld {
    const gravity = options.gravity ?? createVec3(0, -9.81, 0);
    const handle = this.createWorldFn(gravity[0], gravity[1], gravity[2]);
    return new PhysicsWorld(this, handle);
  }

  createBody(worldHandle: number, options: BodyOptions = {}): number {
    const position = options.position ?? createVec3();
    const type = options.type ?? BodyType.Static;
    const enableSleep = options.enableSleep ?? true;
    const awake = options.awake ?? true;
    return this.createBodyFn(worldHandle, type, position[0], position[1], position[2], enableSleep ? 1 : 0, awake ? 1 : 0);
  }

  readBodyTransform(handle: number): BodyTransform {
    this.getBodyTransformFn(handle, this.transformPtr);
    const heap = this.module.HEAPF32;
    const base = this.transformPtr >> 2;
    return {
      position: [heap[base + 0], heap[base + 1], heap[base + 2]],
      rotation: [heap[base + 3], heap[base + 4], heap[base + 5], heap[base + 6]],
    };
  }

  createBox(worldHandle: number, options: Required<BoxOptions>): number {
    const size = options.size;
    const position = options.position;
    return this.createBoxFn(
      worldHandle,
      position[0],
      position[1],
      position[2],
      size[0],
      size[1],
      size[2],
      options.static ? 1 : 0,
      options.density,
    );
  }

  createSphere(worldHandle: number, options: Required<SphereOptions>): number {
    const position = options.position;
    const velocity = options.velocity;
    return this.createSphereFn(
      worldHandle,
      position[0],
      position[1],
      position[2],
      options.radius,
      velocity[0],
      velocity[1],
      velocity[2],
      options.density,
    );
  }

  destroyBody(bodyHandle: number): void {
    this.destroyBodyFn(bodyHandle);
  }

  destroyJoint(jointHandle: number): void {
    this.destroyJointFn(jointHandle);
  }

  setBodyTransform(bodyHandle: number, position: Vec3, rotation: Quat = [0, 0, 0, 1]): void {
    this.setBodyTransformFn(bodyHandle, position[0], position[1], position[2], rotation[0], rotation[1], rotation[2], rotation[3]);
  }

  setBodyAwake(bodyHandle: number, awake: boolean): void {
    this.setBodyAwakeFn(bodyHandle, awake ? 1 : 0);
  }

  getBodyLocalPoint(bodyHandle: number, worldPoint: Vec3): Vec3 {
    this.getBodyLocalPointFn(bodyHandle, worldPoint[0], worldPoint[1], worldPoint[2], this.pointPtr);
    const heap = this.module.HEAPF32;
    const base = this.pointPtr >> 2;
    return [heap[base + 0], heap[base + 1], heap[base + 2]];
  }

  createMotorJoint(
    worldHandle: number,
    bodyAHandle: number,
    bodyBHandle: number,
    localPoint: Vec3,
    linearHertz: number,
    linearDampingRatio: number,
    maxSpringForce: number,
  ): number {
    return this.createMotorJointFn(
      worldHandle,
      bodyAHandle,
      bodyBHandle,
      localPoint[0],
      localPoint[1],
      localPoint[2],
      linearHertz,
      linearDampingRatio,
      maxSpringForce,
    );
  }

  step(worldHandle: number, dt: number, substeps: number): void {
    this.stepFn(worldHandle, dt, substeps);
  }

  destroyWorld(worldHandle: number): void {
    this.destroyWorldFn(worldHandle);
  }
}

export class PhysicsWorld {
  readonly runtime: Box3DRuntime;
  readonly handle: number;
  readonly bodies: Set<PhysicsBody>;
  private destroyed: boolean;

  constructor(runtime: Box3DRuntime, handle: number) {
    this.runtime = runtime;
    this.handle = handle;
    this.bodies = new Set<PhysicsBody>();
    this.destroyed = false;
  }

  createBody(options: BodyOptions = {}): number {
    return this.runtime.createBody(this.handle, options);
  }

  destroyBody(bodyHandle: number): void {
    this.runtime.destroyBody(bodyHandle);
  }

  destroyJoint(jointHandle: number): void {
    this.runtime.destroyJoint(jointHandle);
  }

  setBodyTransform(bodyHandle: number, position: Vec3, rotation: Quat = [0, 0, 0, 1]): void {
    this.runtime.setBodyTransform(bodyHandle, position, rotation);
  }

  setBodyAwake(bodyHandle: number, awake: boolean): void {
    this.runtime.setBodyAwake(bodyHandle, awake);
  }

  getBodyLocalPoint(bodyHandle: number, worldPoint: Vec3): Vec3 {
    return this.runtime.getBodyLocalPoint(bodyHandle, worldPoint);
  }

  createMotorJoint(
    bodyAHandle: number,
    bodyBHandle: number,
    localPoint: Vec3,
    linearHertz: number,
    linearDampingRatio: number,
    maxSpringForce: number,
  ): number {
    return this.runtime.createMotorJoint(this.handle, bodyAHandle, bodyBHandle, localPoint, linearHertz, linearDampingRatio, maxSpringForce);
  }

  box(options: BoxOptions = {}): PhysicsBody {
    const bodyHandle = this.runtime.createBox(this.handle, {
      size: options.size ?? [1, 1, 1],
      position: options.position ?? [0, 0, 0],
      static: options.static ?? false,
      density: options.density ?? 1,
    });
    const body = new PhysicsBody(this, bodyHandle);
    this.bodies.add(body);
    return body;
  }

  sphere(options: SphereOptions = {}): PhysicsBody {
    const bodyHandle = this.runtime.createSphere(this.handle, {
      radius: options.radius ?? 0.5,
      position: options.position ?? [0, 0, 0],
      velocity: options.velocity ?? [0, 0, 0],
      density: options.density ?? 1,
    });
    const body = new PhysicsBody(this, bodyHandle);
    this.bodies.add(body);
    return body;
  }

  step(dt = 1 / 60, substeps = 4): void {
    if (this.destroyed) {
      return;
    }
    this.runtime.step(this.handle, dt, substeps);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    for (const body of this.bodies) {
      body.destroy();
    }
    this.bodies.clear();
    this.runtime.destroyWorld(this.handle);
  }

  _removeBody(body: PhysicsBody): void {
    this.bodies.delete(body);
  }
}

export class PhysicsBody {
  private readonly world: PhysicsWorld;
  private readonly runtime: Box3DRuntime;
  handle: number;
  mesh: Mesh | null;
  disposeMesh: (() => void) | null;
  destroyed: boolean;
  isStatic: boolean;

  constructor(world: PhysicsWorld, handle: number) {
    this.world = world;
    this.runtime = world.runtime;
    this.handle = handle;
    this.mesh = null;
    this.disposeMesh = null;
    this.destroyed = false;
    this.isStatic = false;
  }

  attachMesh(mesh: Mesh, disposeMesh: (() => void) | null = null): PhysicsBody {
    this.mesh = mesh;
    this.disposeMesh = disposeMesh;
    return this;
  }

  sync(): void {
    if (this.destroyed || this.mesh === null) {
      return;
    }
    const transform = this.runtime.readBodyTransform(this.handle);
    this.mesh.position.set(transform.position[0], transform.position[1], transform.position[2]);
    this.mesh.quaternion.set(transform.rotation[0], transform.rotation[1], transform.rotation[2], transform.rotation[3]);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.world._removeBody(this);
    this.runtime.destroyBody(this.handle);
    this.handle = 0;
    if (this.mesh !== null && this.mesh.parent !== null) {
      this.mesh.parent.remove(this.mesh);
    }
    if (this.disposeMesh !== null) {
      this.disposeMesh();
    }
    this.mesh = null;
    this.disposeMesh = null;
  }
}
