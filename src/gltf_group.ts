import * as GLTFSpace from 'gltf-loader-ts/lib/gltf';
import {GltfLoader}  from 'gltf-loader-ts';
import {GltfAsset}  from 'gltf-loader-ts';
import {mat4, vec3, quat} from 'gl-matrix';


// Gltf and all of its instances
export default class GLTFGroup
{
    uri : string;
    gltf : GLTFSpace.GlTf;
    asset: GltfAsset;

    nodeMatrics : Map<GLTFSpace.Node, mat4>;

    transforms : mat4[];
    names : string[];
    instanceCount;

    matrixUpdate : boolean;
    
    constructor(){}

    async init(uri : string, instanceCount : number = 1, names : string[] = [""], transforms : mat4[] = [[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]])
    { 
        this.uri = uri;

        this.transforms = transforms;
        this.names = names;
        this.instanceCount = instanceCount;

        this.matrixUpdate = false;

        // Load gltf using gltf-loader-ts
        let loader: GltfLoader = new GltfLoader();
        this.asset = await loader.load(this.uri);
        this.gltf = this.asset.gltf;   
        this.asset.preFetchAll();

        // Calculate matrix for each node locally
        // since gltf alone does not give this info directly
        this.nodeMatrics = new Map<GLTFSpace.Node, mat4>();

        // Force set root to identity matrix
        //this.nodeMatrics.set(this.gltf.nodes[0], mat4.fromValues(1,0,0,0,  0,1,0,0,  0,0,1,0,  0,0,0,1));

        const defaultTransform : mat4 = mat4.fromValues(1,0,0,0,  0,1,0,0,  0,0,1,0,  0,0,0,1);
        for(const [index, node] of this.gltf.nodes.entries())
        {
            this.#calcNodeMatrix(index, node, defaultTransform, false);
        }
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