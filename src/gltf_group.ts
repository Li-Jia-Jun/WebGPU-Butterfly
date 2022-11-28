import * as GLTFSpace from 'gltf-loader-ts/lib/gltf';
import {GltfLoader}  from 'gltf-loader-ts';
import {GltfAsset}  from 'gltf-loader-ts';
import {mat4, vec3, quat} from 'gl-matrix';
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

    return [x * 180.0 * iPI, y * 180.0 * iPI, z * 180.0 * iPI];
}


export class Joint
{
    // Local transformation
    translate : number[];
    rotate : number[];      // Euler angles in degree, the order is Z-Y-X
    scale : number[];

    children : number[];    // children joint indices, we can assume the max children number is 8

    constructor()
    {
        this.children = new Array();
    }
}

export class Skeleton
{
    rootIndices : number[]; // Some model may have multiple root joints
    joints : Joint[];

    constructor()
    {
        this.rootIndices = new Array();
        this.joints = new Array();
    }
}

// Gltf and all of its instances
export default class GLTFGroup
{
    uri : string;
    gltf : GLTFSpace.GlTf;
    asset: GltfAsset;

    nodeMatrics : Map<GLTFSpace.Node, mat4>;

    skeletons : Skeleton[];

    transforms : mat4[];
    names : string[];
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
        this.hasJoint = this.gltf.skins !== undefined; 
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
    }

    #initSkeletons()
    {
        this.skeletons = new Array();
        for(let i = 0; i < this.instanceCount; ++i)
        {
            this.skeletons.push(new Skeleton());

            if(i == 0)
            {
                // Temp array to help identify root joints
                const jointNum = this.gltf.skins[0].joints.length;
                let rootJointMarks : boolean[] = new Array(jointNum).fill(true);

                for(const [index, joint] of this.gltf.skins[0].joints.entries())
                {
                    this.#addJointToSkeleton(this.skeletons[i], this.gltf.nodes[joint], rootJointMarks);
                }

                // Root jointss
                for(const [index, value] of rootJointMarks.entries())
                {
                    if(value == true)
                    {
                        this.skeletons[i].rootIndices.push(index);
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
                // The other skeleton simply copy the data from first skeleton
                this.skeletons[i].rootIndices = cloneDeep(this.skeletons[0].rootIndices);
                this.skeletons[i].joints = cloneDeep(this.skeletons[0].joints);
            }
        }
        console.log(this.jointsMap);
    }

    #addJointToSkeleton(skeleton : Skeleton, node : GLTFSpace.Node, rootJointMarks : boolean[])
    {
        // First assume that this joint is root joint
        // Will correct it along the way

        let joint = new Joint();

        let t : number[] = node.translation !== undefined ? node.translation : [0, 0, 0];
        let r : number[] = node.rotation !== undefined? node.rotation : [0, 0, 0, 1];  // Quaternion
        let s : number[] = node.scale !== undefined? node.scale : [1, 1, 1];

        joint.translate = t;

        let quatRot = quat.fromValues(r[0], r[1], r[2], r[3]);
        joint.rotate = quatToEulerAngles(quatRot);
        
        joint.scale = s;

        // Joint children
        if(node.children !== undefined)
        {
            for(const child of node.children)
            {
                const jointIndex = this.gltf.skins[0].joints.findIndex(nodeIndex => nodeIndex == child);
                rootJointMarks[jointIndex] = false; // All children joints are not root joints
                joint.children.push(jointIndex);
            }
        }

        skeleton.joints.push(joint);
    }

    #calcNodeMatrix(index : number, node : GLTFSpace.Node, parentMat : mat4, parentUpdate : boolean)
    {
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
};