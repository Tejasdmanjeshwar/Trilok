import * as THREE from "three";
import { remainingCapabilities, validateAnatomicalGraph,
  validateCharacterInjuryState, type AnatomicalGraphV1, type CharacterInjuryStateV1,
} from "@trilok/character-core";

export interface CharacterRuntimeOptions {
  /** Exactly those resources explicitly owned by this instance; shared geometry stays intact. */
  readonly ownedResources?: readonly { dispose(): void }[];
  /** Default false so parent scene/application owns the root lifecycle. */
  readonly detachRootOnDispose?: boolean;
}
/** One semantic lookup contract for Studio and combat; C2 will attach SkinnedMesh. */
export class SemanticCharacter {
  readonly root: THREE.Object3D;
  readonly graph: AnatomicalGraphV1;
  private readonly jointObjects: ReadonlyMap<string, THREE.Object3D>;
  private readonly ownedResources: ReadonlySet<{ dispose(): void }>;
  private readonly detachRootOnDispose: boolean;
  private disposed = false;
  constructor(graph: AnatomicalGraphV1, root: THREE.Object3D,
    jointObjects: ReadonlyMap<string, THREE.Object3D>, options:CharacterRuntimeOptions={}) {
    validateAnatomicalGraph(graph);
    const known=new Set<THREE.Object3D>();
    root.traverse(obj=>{known.add(obj);});
    for(const joint of graph.joints) {
      const object=jointObjects.get(joint.id);
      if(!object || !known.has(object)) throw new Error("Missing runtime joint: "+joint.id);
    }
    if(jointObjects.size!==graph.joints.length)
      throw new Error("Unexpected runtime joint mapping");
    this.root=root; this.graph=graph;
    this.jointObjects=new Map(jointObjects);
    this.ownedResources=new Set(options.ownedResources??[]);
    this.detachRootOnDispose=options.detachRootOnDispose??false;
  }
  private live():void { if(this.disposed)throw new Error("Character runtime disposed"); }
  joint(id:string): THREE.Object3D {
    this.live();
    const object=this.jointObjects.get(id);
    if(!object)throw new Error("Unknown semantic joint: "+id);
    return object;
  }
  findJoints(role:string):readonly THREE.Object3D[] {
    this.live();
    return this.graph.joints.filter(j=>j.role===role).map(j=>this.joint(j.id));
  }
  socketWorld(id:string,out=new THREE.Matrix4()):THREE.Matrix4 {
    this.live();
    const socket=this.graph.sockets.find(s=>s.id===id);
    if(!socket)throw new Error("Unknown semantic socket: "+id);
    this.root.updateWorldMatrix(true,true);
    const local=new THREE.Matrix4().compose(
      new THREE.Vector3(...socket.localTranslation),
      new THREE.Quaternion(...socket.localQuaternion),new THREE.Vector3(1,1,1));
    return out.multiplyMatrices(this.joint(socket.parentJointId).matrixWorld,local);
  }
  capabilities(injury?:CharacterInjuryStateV1):ReadonlySet<string> {
    this.live();
    if(injury) {
      validateCharacterInjuryState(injury,this.graph);
      return remainingCapabilities(this.graph,injury);
    }
    return new Set(this.graph.segments.flatMap(s=>s.capabilityIds));
  }
  dispose():void {
    if(this.disposed)return;
    this.disposed=true;
    for(const item of this.ownedResources)item.dispose();
    if(this.detachRootOnDispose)this.root.removeFromParent();
  }
}
