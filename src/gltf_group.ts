import * as GLTFSpace from 'gltf-loader-ts/lib/gltf';
import {GltfLoader}  from 'gltf-loader-ts';
import {GltfAsset}  from 'gltf-loader-ts';
import {mat4, vec4, vec3, quat, glMatrix} from 'gl-matrix';
import {cloneDeep} from 'lodash';



function quatToEulerAngles(q : quat) : number[]
{

    // The rotation order is Z-Y-X

    let x, y, z;

    const sinr_cosp = 2 * (q[3]*q[0] + q[1]*q[2]);
    const cosr_cosp = 1 - 2 * (q[0]*q[0] + q[1]*q[1]);
    x = Math.atan2(sinr_cosp, cosr_cosp);
    
    const sinp = 2 * (q[3]*q[1] - q[2]*q[0]);
    if(Math.abs(sinp) >= 1)
    {
        y = sinp >= 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    else
    {
        y = Math.asin(sinp);
    }

    const siny_cosp = 2 * (q[3]*q[2] + q[0]*q[1]);
    const cosy_cosp = 1 - 2 * (q[1]*q[1] + q[2]*q[2]);
    z = Math.atan2(siny_cosp, cosy_cosp);

    const iPI = 1.0 / Math.PI;

    return [x * 180.0 * iPI, y * 180.0 * iPI, z * 180.0 * iPI, 0];
}


function eulerToRotationMatrix(rot : number[]) : mat4
{
    // The reconstruct order is Z-Y-X
    // The is correct

    let theta = glMatrix.toRadian(rot[0]);
    let cosTheta = Math.cos(theta);
    let sinTheta = Math.sin(theta);
    let xMat = mat4.fromValues(
        1, 0, 0, 0,
        0, cosTheta, sinTheta, 0,
        0, -sinTheta, cosTheta, 0,
        0, 0, 0, 1
    );  

    theta = glMatrix.toRadian(rot[1]);
    cosTheta = Math.cos(theta);
    sinTheta = Math.sin(theta);
    let yMat = mat4.fromValues(
        cosTheta, 0 , -sinTheta, 0,
        0, 1, 0, 0,
        sinTheta, 0, cosTheta, 0,
        0, 0, 0, 1
    );

    theta = glMatrix.toRadian(rot[2]);
    cosTheta = Math.cos(theta);
    sinTheta = Math.sin(theta);
    let zMat = mat4.fromValues(
        cosTheta, sinTheta, 0, 0,
        -sinTheta, cosTheta, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    );

    let result : mat4 = mat4.create();
    mat4.mul(result, zMat, yMat);
    mat4.mul(result, result, xMat);
    return result;
    //return zMat * yMat * xMat;
}

export class Joint
{
    // Local transformation, ther are all vec4
    translate : number[];   
    rotate : number[];      // Euler angles in degree, the compute order is Z-Y-X
    scale : number[];

    children : number[];    // Children joint indices, we can assume the max children number is 8

    constructor()
    {
        this.children = new Array();
    }
}

export class Skeleton
{
    joints : Joint[];

    constructor()
    {
        this.joints = new Array();
    }
}

// Gltf and all of its instances
export default class GLTFGroup
{
    uri : string;
    gltf : GLTFSpace.GlTf;
    asset: GltfAsset;

    armatureTransform : mat4;                   // Model local transformation

    nodeMatrics : Map<GLTFSpace.Node, mat4>;    // Mark each gltf node matrix, all instances share this data

    jtParentIndices : number[]; // Mark each joint's parent index; first element is joint number
    skRootIndices : number[];   // Mark each skeleton's children indices; first element is root joint number
    jtLayerArray : number[];    // Array of joint indices in a layered order, each layer is seperated by a '-1';
                                //  first element is the array length
    skeletons : Skeleton[];

    transforms : mat4[];
    velocity: vec4[];           // velocity vectors to pass
    forward: vec4[];
    names : string[];
    targetPosition: vec4;
    behavior: vec4;
    instanceCount;

    hasJoint : boolean;
    jointsMap : Map<string, number>; // Map of joint name and its index in GLTF (not node index)
    
    constructor(){}

    async init(uri : string, instanceCount : number = 1, names : string[] = [""], transforms : mat4[] = [[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]])
    { 
        this.uri = uri;

        this.transforms = transforms;
        this.names = names;
        this.instanceCount = instanceCount;

        // Load gltf using gltf-loader-ts
        let loader: GltfLoader = new GltfLoader();
        this.asset = await loader.load(this.uri);
        this.gltf = this.asset.gltf;   
        this.asset.preFetchAll();

        // Build skeleton if GLTF includes rigging
        this.hasJoint = this.gltf.skins !== undefined && this.gltf.skins[0].joints !== undefined && this.gltf.skins[0].joints.length > 0; 
        if(this.hasJoint)
        {
            this.#initSkeletons();
        }

        // Calculate matrix for each node locally (since gltf alone does not give this info directly)
        this.nodeMatrics = new Map<GLTFSpace.Node, mat4>();
        const defaultTransform : mat4 = mat4.fromValues(1,0,0,0,  0,1,0,0,  0,0,1,0,  0,0,0,1);
        for(const [index, node] of this.gltf.nodes.entries())
        {
            this.#calcNodeMatrix(index, node, defaultTransform, false);
        }
        this.targetPosition = vec4.fromValues(50, 50, -10, 0);
        this.behavior = vec4.fromValues(0,1,0,0);
        this.initVelocity();
        this.initForwardVectors();
        this.#printAnything();
    }

    refreshInstance(instanceCount : number = 1, names : string[] = [""], transforms : mat4[] = [[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]])
    {
        this.transforms = transforms;
        this.names = names;
        this.instanceCount = instanceCount;

        this.hasJoint = this.gltf.skins !== undefined && this.gltf.skins[0].joints !== undefined && this.gltf.skins[0].joints.length > 0; 
        if(this.hasJoint)
        {
            this.#initSkeletons();
        }

        this.nodeMatrics = new Map<GLTFSpace.Node, mat4>();
        const defaultTransform : mat4 = mat4.fromValues(1,0,0,0,  0,1,0,0,  0,0,1,0,  0,0,0,1);
        for(const [index, node] of this.gltf.nodes.entries())
        {
            this.#calcNodeMatrix(index, node, defaultTransform, false);
        }

        this.initVelocity();
        this.initForwardVectors();
    }

    initVelocity() {
        this.velocity = new Array();
        for(let i = 0; i < this.instanceCount; i++) {
            var v = vec4.fromValues(0, 0, 0, 0);
            this.velocity.push(v);
        }
    }

    initForwardVectors(){
        this.forward = new Array();
        for (let i = 0; i < this.instanceCount; i++) {
            var f = vec4.fromValues(0, 0, -1, 0);
            this.forward.push(f);
        }
    }

    #initSkeletons()
    {
        const jointNum = this.gltf.skins[0].joints.length;

        this.jtParentIndices = new Array(jointNum).fill(-1);

        this.skRootIndices = new Array();

        // Build skeletons
        this.skeletons = new Array();
        for(let i = 0; i < this.instanceCount; ++i)
        {
            this.skeletons.push(new Skeleton());

            if(i == 0)
            {
                // Temp array to help identify root joints
                let rootJointMarks : boolean[] = new Array(jointNum).fill(true);

                for(const [index, joint] of this.gltf.skins[0].joints.entries())
                {
                    this.#addJointToSkeleton(this.skeletons[i], this.gltf.nodes[joint], rootJointMarks);
                }

                // Gather root joints
                for(const [index, value] of rootJointMarks.entries())
                {
                    if(value == true)
                    {
                        this.skRootIndices.push(index);
                    }
                }

                // Build joint name map for debugging purpose
                this.jointsMap = new Map<string, number>();
                for(const [jointIndex, nodeIndex] of this.gltf.skins[0].joints.entries())
                {
                   this.jointsMap.set(this.gltf.nodes[nodeIndex].name, jointIndex);
                }
            }
            else
            {
                // All instances share the same start pose
                // so other instances can copy the data from the first instance
                this.skeletons[i].joints = cloneDeep(this.skeletons[0].joints);
            }
        }

        // Build layer array
        let curr = 0;
        this.jtLayerArray = [...this.skRootIndices];
        this.jtLayerArray.push(-1);
        for(let i = 0; i < Number.MAX_SAFE_INTEGER; i++)
        {
            const len = this.jtLayerArray.length;

            // Go through each node of the current layer 
            // and put their children into the next layer
            for(let j = curr; j < len - 1; ++j)
            {
                const jointIndex = this.jtLayerArray[j];
                const joint = this.skeletons[0].joints[jointIndex];
                if(joint.children !== undefined)
                {
                    for(const child of joint.children)
                    {
                        this.jtLayerArray.push(child);
                    }
                }
            }
            
            if(this.jtLayerArray.length > len)
            {
                this.jtLayerArray.push(-1); // -1 to seperate each layer
                curr = len;
            }
            else
            {
                break;
            }     
        }
    }

    #addJointToSkeleton(skeleton : Skeleton, node : GLTFSpace.Node, rootJointMarks : boolean[])
    {
        let joint = new Joint();

        let t : number[] = node.translation !== undefined ? [node.translation[0], node.translation[1], node.translation[2], 1] : [0, 0, 0, 0];
        let r : number[] = node.rotation !== undefined? node.rotation : [0, 0, 0, 1];  // Quaternion
        let s : number[] = node.scale !== undefined? [node.scale[0], node.scale[1], node.scale[2], 0] : [1, 1, 1, 0];

        joint.translate = t;

        let quatRot = quat.fromValues(r[0], r[1], r[2], r[3]);
        joint.rotate = quatToEulerAngles(quatRot);
        
        joint.scale = s;

        skeleton.joints.push(joint);

        // Joint children
        if(node.children !== undefined)
        {
            for(const childNodeIndex of node.children)
            {
                const childJointIndex = this.gltf.skins[0].joints.findIndex(nodeIndex => nodeIndex == childNodeIndex);
                rootJointMarks[childJointIndex] = false; // All children joints are not root joints
                joint.children.push(childJointIndex);

                this.jtParentIndices[childJointIndex] = skeleton.joints.length - 1;   // Mark child's parent joint to be the current joint
            }
        }      
    }

    #calcNodeMatrix(index : number, node : GLTFSpace.Node, parentMat : mat4, parentUpdate : boolean)
    {
        if(node.name == 'Armature')
        {
            this.armatureTransform = this.#getNodeMatrix(node);
        }

        const notNeedToUpdate = parentUpdate == false && this.nodeMatrics.has(node);
        const onlyUpdateParent = parentUpdate == true && this.nodeMatrics.has(node);

        if(notNeedToUpdate)
        {
            return;
        }

        // Read Node matrix from gltf or this.nodeMatrics
        let nodeMat : mat4 = this.#getNodeMatrix(node);

        // Accumulate it with parent matrix
        mat4.mul(nodeMat, parentMat, nodeMat);

        this.nodeMatrics.set(node, nodeMat);
        
        if(node.children !== undefined)
        {
            for(const child of node.children)
            {
                if(onlyUpdateParent)
                {
                    this.#calcNodeMatrix(child, this.gltf.nodes[child], parentMat, true);
                }
                else
                {
                    this.#calcNodeMatrix(child, this.gltf.nodes[child], nodeMat, true);
                }
            }
        }
    }

    #getNodeMatrix(node : GLTFSpace.Node) : mat4
    {
        if(this.nodeMatrics.has(node))
        {
            return this.nodeMatrics.get(node);
        }
        else if(node.matrix !== undefined)
        {
            let mat : number[] = node.matrix;
            return mat4.fromValues(            
                mat[0], mat[1], mat[2], mat[3],
                mat[4], mat[5], mat[6], mat[7],
                mat[8], mat[9], mat[10], mat[11],
                mat[12], mat[13], mat[14], mat[15]);
        }
        else if(node.translation !== undefined || node.rotation !== undefined || node.scale !== undefined)
        {
            let t : number[] = node.translation !== undefined ? node.translation : [0, 0, 0];
            let r : number[] = node.rotation !== undefined? node.rotation : [0, 0, 0, 1];  // Quaternion
            let s : number[] = node.scale !== undefined? node.scale : [1, 1, 1];

            let tMat : mat4 = mat4.create();
            let rMat : mat4 = mat4.create();
            let sMat : mat4 = mat4.create();

            mat4.fromTranslation(tMat, vec3.fromValues(t[0], t[1], t[2]));
            mat4.fromQuat(rMat, quat.fromValues(r[0], r[1], r[2], r[3]));
            mat4.fromScaling(sMat, vec3.fromValues(s[0], s[1], s[2]));

            let result : mat4 = mat4.create();
            mat4.mul(result, tMat, rMat);
            mat4.mul(result, result, sMat);

            return result;
        }
        else
        {
            // Default transform for the node
            return mat4.fromValues(1,0,0,0,  0,1,0,0,  0,0,1,0,  0,0,0,1);
        }
    }

    // For debugging
    #printNodeMatrix(index : number)
    {
        let node = this.gltf.nodes[index];
        let nodeMat = this.nodeMatrics.get(node);

        //console.log("node " + index +" [" + node.name + "] mat = " + nodeMat);

        let trans = vec3.create();
        mat4.getTranslation(trans, nodeMat);
        console.log("node " + index +" [" + node.name + "] trans = " + trans);

        let rot = quat.create();
        let angle = vec3.create();
        mat4.getRotation(rot, nodeMat);
        console.log("node " + index+ " [" + node.name + "] quat rot = " + rot);

        let scale = vec3.create();
        mat4.getScaling(scale, nodeMat);
        console.log("node " + index + " [" + node.name + "] scale = " + scale);
    }

    #printAnything()
    {
        // console.log(this.jointsMap);
        // console.log("root indices = " + this.skRootIndices);
        // console.log("parent indices = " + this.jtParentIndices);
        // console.log("layer array = " + this.jtLayerArray);              
        // for(const jointIndex of this.skRootIndices)
        // {
        //     console.log("skeleton root joint rotate = " + this.skeletons[0].joints[jointIndex].rotate);
        // }

        
        // Quat to Euler to Rotation Matrix test (correct)
        // let euler = quatToEulerAngles(quat.fromValues(0.0704393, 0.2968829, 0.2831141, 0.9092553)); // Euler = (20,30,40), the compute order is Z-Y-X
        // let rotMat = eulerToRotationMatrix(euler);
        // console.log("euler = " + euler);
        // console.log("rotation mat = " + rotMat);

        // let bone000 = this.skeletons[0].joints[0];      
        // console.log("bone000 scale = " + bone000.scale);
        // let euler = bone000.rotate;
        // let rotMat = eulerToRotationMatrix(euler);
        // mat4.mul(rotMat, this.armatureTransform, rotMat);
        // console.log("Bone003 euler angle, calc matrix, actrual matrix:");
        // console.log(euler);
        // console.log(rotMat);
        // console.log(this.nodeMatrics.get(this.gltf.nodes[7]));

        // let bone003 = this.skeletons[0].joints[3];
        
        // let euler = bone003.rotate;
        // let rotMat = eulerToRotationMatrix(euler);
        // mat4.mul(rotMat, this.armatureTransform, rotMat);
        // console.log("Bone003 euler angle, calc matrix, actrual matrix:");
        // console.log(euler);
        // console.log(rotMat);
        // console.log(this.nodeMatrics.get(this.gltf.nodes[7]));
    }
};