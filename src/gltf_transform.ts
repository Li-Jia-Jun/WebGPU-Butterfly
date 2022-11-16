import * as GLTFSpace from 'gltf-loader-ts/lib/gltf';
import {mat4} from 'gl-matrix';


export default class GLDFTransform
{
    gltf : GLTFSpace.GlTf;
    transform : mat4;

    nodeMatrics : Map<GLTFSpace.Node, mat4>;

    constructor(gltf : GLTFSpace.GlTf, transform : mat4 = [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])
    {
        this.gltf = gltf;
        this.transform = transform;

        // Calculate matrix for each node 
        // since gltf alone does not give this info directly
        this.nodeMatrics = new Map<GLTFSpace.Node, mat4>();
        for(const node of this.gltf.nodes)
        {
            this.#calcNodeMatrix(node, transform);
        }
    }

    #calcNodeMatrix(node : GLTFSpace.Node, parentMat : mat4)
    {
        if(this.nodeMatrics.has(node))
            return;

        // Get node matrix
        let mat : number[] = node.matrix !== undefined ? node.matrix : [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
        let nodeMat : mat4 = mat4.fromValues(
            mat[0], mat[1], mat[2], mat[3],
            mat[4], mat[5], mat[6], mat[7],
            mat[8], mat[9], mat[10], mat[11],
            mat[12], mat[13], mat[14], mat[15]);

        // Accumulate it with parent matrix
        mat4.mul(nodeMat, nodeMat, parentMat); 
        this.nodeMatrics.set(node, nodeMat);
        
        if(node.children !== undefined)
        {
            for(const child of node.children)
            {
                this.#calcNodeMatrix(this.gltf.nodes[child], nodeMat);
            }
        }
    }
};