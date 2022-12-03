

import compShaderCode from './shaders/comp.wgsl';

import * as GLTFSpace from 'gltf-loader-ts/lib/gltf';
import {mat4, vec3, vec4} from 'gl-matrix';
import GLTFGroup from './gltf_group';


// Make sure the shaders follow this mapping
const ShaderLocations : Map<string, number> = new Map
([
    ['POSITION', 0],
    ['NORMAL', 1],
    ['JOINTS_0', 2],
    ['WEIGHTS_0', 3],
    ['TEXCOORD_0', 4],
]);

// Store Primitive GPUBuffer
class GPUPrimitiveBufferInfo
{
    buffer : GPUBuffer;
    offset : number;
}

// Store Primitive data in GPU side
class GPUPrimitiveInfo
{
    pipeline : GPURenderPipeline;
    buffers :  GPUPrimitiveBufferInfo[];
    drawCount : number;

    indexBuffer? : GPUBuffer;
    indexOffset? : number;
    indexType?: GPUIndexFormat;
}

export default class GltfRenderer
{
    static loadImageSlots = [];

    // Associates a glTF node or primitive with its WebGPU resources
    primitiveGpuData : Map<GLTFSpace.MeshPrimitive, GPUPrimitiveInfo>;
    gpuBuffers : GPUBuffer[];
   
    // GLTF stuff
    gltf_group : GLTFGroup;
 
    // WebGPU stuff
    adapter : GPUAdapter;
    device : GPUDevice;
    queue: GPUQueue;

    // Frame Bind Group
    static readonly FRAMEBUFFERSIZE : number = Float32Array.BYTES_PER_ELEMENT * 36; // 16+16+3+1
    cameraBuffer : GPUBuffer;
    instanceBuffer : GPUBuffer; // Inverse Bind Matrix
    jointTransformBuffer : GPUBuffer;
    frameBindGroupLayout : GPUBindGroupLayout;
    frameBindGroup : GPUBindGroup;

    // Node Bind Group
    nodeBindGroupLayout : GPUBindGroupLayout;
    nodeGpuData : Map<GLTFSpace.Node, GPUBindGroup>;

    // Constant Bind Group
    jointInfoBuffer : GPUBuffer;
    inverseBindMatrixBuffer : GPUBuffer;
    
    baseColorTexture: GPUTexture;
    normalTexture: GPUTexture;
    metallicRoughnessTexture: GPUTexture;
    textureSampler: GPUSampler;

    constantBindGroupLayout: GPUBindGroupLayout;
    constantBindGroup : GPUBindGroup;

    // Pipeline
    gltfPipelineLayout : GPUPipelineLayout;
    shaderModule : GPUShaderModule;
    vertShaderModule : GPUShaderModule;
    fragShaderModule : GPUShaderModule;

    context: GPUCanvasContext;
    colorTexture: GPUTexture;
    colorTextureView: GPUTextureView;
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;
 
    commandEncoder: GPUCommandEncoder;
    passEncoder: GPURenderPassEncoder;

    //ComputePipeline
    computepassEncoder: GPUComputePassEncoder;
    computePipeline: GPUComputePipeline;
    computePipelineLayout: GPUPipelineLayout;
    computeBindGroup: GPUBindGroup;
    computeBindGroupLayout: GPUBindGroupLayout;
    computeBuffer: GPUBuffer;
    compShaderModule : GPUShaderModule;

    compSkeletonInfoBuffer: GPUBuffer;
    rootIdxBuffer: GPUBuffer;
    parentIdxBuffer: GPUBuffer;
    layerArrayBuffer: GPUBuffer;
    jointsTRSBuffer: GPUBuffer
    skeletonBindGroup: GPUBindGroup;
    skeletonBindGroupLayout: GPUBindGroupLayout;

    //time
    timeBuffer: GPUBuffer;
    velocityBuffer: GPUBuffer;
    // Web stuff
    canvas : HTMLCanvasElement;

    isFirstRenderer : boolean;

    // Temp
    hasJoint : boolean;


    constructor(){}

    async init(adapter : GPUAdapter, device : GPUDevice, queue : GPUQueue, canvas : HTMLCanvasElement, context : GPUCanvasContext,
        gltf_group : GLTFGroup, depthTexture : GPUTexture, depthTextureView : GPUTextureView, vertShader : GPUShaderModule, fragShader : GPUShaderModule, isFirstRenderer : boolean = false)
    {     
        this.adapter = adapter;
        this.device = device;
        this.queue = queue;

        this.canvas = canvas;

        this.context = context; 

        this.gltf_group = gltf_group;

        this.depthTexture = depthTexture;
        this.depthTextureView = depthTextureView;

        this.vertShaderModule = vertShader;
        this.fragShaderModule = fragShader;

        this.isFirstRenderer = isFirstRenderer;

        // Temp
        this.hasJoint = this.gltf_group.gltf.skins !== undefined && 
        this.gltf_group.gltf.skins[0].joints !== undefined && 
        this.gltf_group.gltf.skins[0].joints.length > 0 ? true : false;

        this.nodeGpuData = new Map();
        this.primitiveGpuData = new Map();

        //this.resizeBackings();
        await this.initializeWebGPUAndGLTF(); 
    }


    async initializeWebGPUAndGLTF()
    {
        // Load all gltf data into GPUBuffers 
        await this.loadGPUBuffers();

        // Bind Groups
        await this.initConstantBindGroup();
        this.initFrameBindGroup();
        this.initNodeBindGroup();

        // Temporary way to decide if this is butterfly
        if(this.hasJoint)
        {
            this.initComputeBindGroup();
            this.initSkeletonsBindGroup();

            //create compute pipeline here, maybe not
            this.computePipelineLayout = this.device.createPipelineLayout
            ({
                label: 'glTF Compute Pipeline Layout',
                bindGroupLayouts: [
                    this.computeBindGroupLayout,
                    this.skeletonBindGroupLayout
                ]

            });
            const computeModule = this.getComputeShaderModule();
            this.computePipeline = this.device.createComputePipeline({
                layout:  this.computePipelineLayout,
                compute: {
                    module: computeModule, 
                    entryPoint: 'simulate',
                },
            });
            }


            // Pipeline Layout
            this.gltfPipelineLayout = this.device.createPipelineLayout
            ({
                label: 'glTF Pipeline Layout',
                bindGroupLayouts: [
                    this.constantBindGroupLayout,
                    this.frameBindGroupLayout,
                    this.nodeBindGroupLayout,
            ]});

        // Loop through each primitive of each mesh and create a compatible WebGPU pipeline.
        for (const mesh of this.gltf_group.gltf.meshes) 
        {
            for (const primitive of mesh.primitives) 
            {
                this.setupPrimitive(primitive);
            }
        }
    }

    initFrameBindGroup()
    {
        // Camera
        this.cameraBuffer = this.device.createBuffer
        ({
            size: GltfRenderer.FRAMEBUFFERSIZE * Float32Array.BYTES_PER_ELEMENT,   // proj mat, view mat, pos, time
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Instance Matrices
        const instanceNum = this.gltf_group.instanceCount;
        this.instanceBuffer = this.device.createBuffer
        ({
            size: 16 * instanceNum * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });
        this.setInstanceBuffer();

        // Joint Transforms
        const hasJoint = this.gltf_group.gltf.skins !== undefined;
        if(hasJoint)
        {
            const jointNum = this.gltf_group.gltf.skins[0].joints.length;
            this.jointTransformBuffer = this.device.createBuffer
            ({
                size: 16 * jointNum * instanceNum * Float32Array.BYTES_PER_ELEMENT,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
            });          

            // Init joint transform buffer with node matrix to represent default pose
            let jointTransformArrayBuffer = new ArrayBuffer(16 * jointNum * Float32Array.BYTES_PER_ELEMENT);
            for(let [index, joint] of this.gltf_group.gltf.skins[0].joints.entries())
            {
                let node : GLTFSpace.Node = this.gltf_group.gltf.nodes[joint];
                let mat : mat4 = this.gltf_group.nodeMatrics.get(node);
                let st = index * 16 * Float32Array.BYTES_PER_ELEMENT;
                let arr = new Float32Array(jointTransformArrayBuffer, st, 16);
                arr.set(mat);

            }  
            for(let i = 0; i < instanceNum; i++)
            {
                this.device.queue.writeBuffer(this.jointTransformBuffer, i * 16 * jointNum * Float32Array.BYTES_PER_ELEMENT, jointTransformArrayBuffer);
            }
        }
        else
        {
            // Create empty buffer
            this.jointTransformBuffer = this.device.createBuffer
            ({
                size: 4 * Float32Array.BYTES_PER_ELEMENT,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
            });
        }

        this.frameBindGroupLayout = this.device.createBindGroupLayout
        ({
            label: `Frame BindGroupLayout`,
            entries: 
            [{
                binding: 0, // Camera uniforms
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: 'uniform'},
            },
            {
                binding: 1, // Instance matrices
                visibility: GPUShaderStage.VERTEX,
                buffer: {type: 'read-only-storage'}
            },
            {
                binding: 2, // Joint Transforms
                visibility: GPUShaderStage.VERTEX,
                buffer: {type: 'read-only-storage'}
            }],
        });
        this.frameBindGroup = this.device.createBindGroup
        ({
            label: `Frame BindGroup`,
            layout: this.frameBindGroupLayout,
            entries: 
            [{
                binding: 0, // Camera uniforms
                resource: { buffer: this.cameraBuffer }
            },
            {
                binding: 1,
                resource: { buffer: this.instanceBuffer}
            },
            {
                binding: 2,
                resource: { buffer: this.jointTransformBuffer}
            }],
        });
    }

    initNodeBindGroup()
    {
        // Bind group layout for the transform uniforms of each node.
        this.nodeBindGroupLayout = this.device.createBindGroupLayout({
            label: `glTF Node BindGroupLayout`,
            entries: [{
                binding: 0, // Node uniforms
                visibility: GPUShaderStage.VERTEX,
                buffer: {},
            }],
            });

        // Find every node with a mesh and create a bind group containing the node's transform.
        for (const node of this.gltf_group.gltf.nodes)
        {
            if ('mesh' in node) 
            {
                this.setupMeshNodeBindGroup(node);
            }
        }
    }

    async initConstantBindGroup()
    {
        // Joint info
        const hasJoint = this.hasJoint ? 1 : 0;
        const jointNum = hasJoint ? this.gltf_group.gltf.skins[0].joints.length : 0;
 
        this.jointInfoBuffer = this.device.createBuffer
        ({
            size: 4 * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        }); 

        let jointInfoArrayBuffer = new ArrayBuffer(4 * Float32Array.BYTES_PER_ELEMENT);
        let jointInfoArray = new Float32Array(jointInfoArrayBuffer, 0, 4);
        jointInfoArray.set(vec4.fromValues(hasJoint, jointNum, 0, 0));
        this.device.queue.writeBuffer(this.jointInfoBuffer, 0, jointInfoArrayBuffer);

        // Inverse Bind Matrices
        if(hasJoint)
        {
            const accessor : number = this.gltf_group.gltf.skins[0].inverseBindMatrices;
            const bufferView : number = this.gltf_group.gltf.accessors[accessor].bufferView;
            this.inverseBindMatrixBuffer = this.gpuBuffers[bufferView];
        }
        else
        {
            // If not joints in this gltf, then create an empty buffer
            this.inverseBindMatrixBuffer = this.device.createBuffer
            ({            
                size: 4 * Float32Array.BYTES_PER_ELEMENT,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
            });
        }

        let material = this.gltf_group.gltf.materials;
        let textures = this.gltf_group.gltf.textures;
        console.log("Material info: ", material);
        console.log("Material info: ", material[0].normalTexture);
        
        let hasNormalMap = material[0].normalTexture != undefined ? 1 : 0;
        console.log("hasNormalMap: ", hasNormalMap);

        console.log("Material info: ", material[0].pbrMetallicRoughness.metallicRoughnessTexture);
        let hasMetallicRoughness= material[0].pbrMetallicRoughness.metallicRoughnessTexture !== undefined ? 1 : 0;
        console.log("hasMRMap: ", hasNormalMap);

        console.log("Material info: ", material[0].pbrMetallicRoughness.baseColorTexture);
        console.log("Material info: ", material[0].pbrMetallicRoughness.roughnessFactor);
        console.log("Material info: ", material[0].pbrMetallicRoughness.metallicFactor);


        let baseColorTextureIdx = material[0].pbrMetallicRoughness.baseColorTexture.index;
        let normalTextureIdx = -1;
        let metallicRoughnessTextureIdx  = -1

        if (hasNormalMap)
        {
            normalTextureIdx = material[0].normalTexture.index;
            console.log("Normal map index:",normalTextureIdx );
        }
        if (hasMetallicRoughness)
        {
            metallicRoughnessTextureIdx= material[0].pbrMetallicRoughness.metallicRoughnessTexture.index;
            console.log("metallicRoughnessTextureIdx map index:", metallicRoughnessTextureIdx);
        }

        console.log('normalTextureIdx:', normalTextureIdx);
        console.log('metallicRoughnessTextureIdx:', normalTextureIdx);
        if (normalTextureIdx == undefined)
        {
            console.log("No normal texture");
        }

        if (metallicRoughnessTextureIdx == undefined)
        {
            console.log("No normal texture");
        }


        //console.log("Texture info: ", texture, texture.length);
        const hasSampler = this.gltf_group.gltf.samplers[0] !== undefined ? 1:0;
        if (hasSampler)
        {
            console.log("Sampler", this.gltf_group.gltf.samplers[0]);
            let sampler = this.gltf_group.gltf.samplers[0];

            function gpuAddressModeForWrap(wrap) {
                switch (wrap) {
                  case WebGLRenderingContext.CLAMP_TO_EDGE: return 'clamp-to-edge';
                  case WebGLRenderingContext.MIRRORED_REPEAT: return 'mirror-repeat';
                  default: return 'repeat';
                }
              }

                var descriptor:GPUSamplerDescriptor = {
                  addressModeU: gpuAddressModeForWrap(sampler.wrapS),
                  addressModeV: gpuAddressModeForWrap(sampler.wrapT),
                  magFilter: 'linear',
                  minFilter: 'linear',
                  mipmapFilter: 'linear',
                };
            
              // WebGPU's default min/mag/mipmap filtering is nearest, se we only have to override it if we
              // want linear filtering for some aspect.
              if (!sampler.magFilter || sampler.magFilter == WebGLRenderingContext.LINEAR) {
                descriptor.magFilter = 'linear';
              }
            
              switch (sampler.minFilter) {
                case WebGLRenderingContext.NEAREST:
                  break;
                case WebGLRenderingContext.LINEAR:
                case WebGLRenderingContext.LINEAR_MIPMAP_NEAREST:
                  descriptor.minFilter = 'linear';
                  break;
                case WebGLRenderingContext.NEAREST_MIPMAP_LINEAR:
                  descriptor.mipmapFilter = 'linear';
                  break;
                case WebGLRenderingContext.LINEAR_MIPMAP_LINEAR:
                default:
                  descriptor.minFilter = 'linear';
                  descriptor.mipmapFilter = 'linear';
                  break;
              }
              this.textureSampler = this.device.createSampler(descriptor);
        }
        // If no sampler specified, use the default configuration
        else
        {
            console.log("Default Sampler used");
            this.textureSampler = this.device.createSampler(
                {
                    addressModeU: 'repeat',
                    addressModeV: 'repeat',
                    magFilter: 'linear',
                    minFilter: 'linear',
                    mipmapFilter: 'linear',
                }
            )
        }
         
            let gltf = this.gltf_group.gltf;

            // Base Color Texture
            let baseColorTexture = this.gltf_group.gltf.images[baseColorTextureIdx];
            let blob;
            if (baseColorTexture.uri) {
                // Image is given as a URI
                console.log(gltf.asset);
                //const response = await this.gltf_group.gltf.imageData.get(this.gltf_group.gltf.images[baseColorTextureIdx]);
                blob = await this.gltf_group.asset.imageData.get(baseColorTextureIdx);
                //const response = await fetch(baseColorTexture.uri);
                //blob = await response.blob();
            } 
              else {
                // Image is given as a bufferView.
                const bufferView = gltf.bufferViews[baseColorTexture.bufferView];
                //console.log(bufferView);
                const buffer = await this.getArrayBufferForGltfBuffer(bufferView);
                //console.log(buffer);
                blob = new Blob(
                  [new Uint8Array(buffer, bufferView.byteOffset, bufferView.byteLength)],
                  { type: baseColorTexture.mimeType }
                );
              }
            let imgBitmap = await createImageBitmap(blob);
            this.baseColorTexture = this.device.createTexture
            ({
                size: { width: imgBitmap.width, height: imgBitmap.height },
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST |GPUTextureUsage.RENDER_ATTACHMENT,
            });
            this.device.queue.copyExternalImageToTexture(
            { source: imgBitmap },
            { texture: this.baseColorTexture },
            [imgBitmap.width, imgBitmap.height]
            );


                const emptyTexture = this.device.createTexture(
                    {
                        size: {width: 1, height: 1},
                        format: 'rgba8unorm',
                        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST |GPUTextureUsage.RENDER_ATTACHMENT,
                    }
                );


            // Normal
            if (hasNormalMap)
            {
                let normalTexture = this.gltf_group.gltf.images[normalTextureIdx];
                //let blob;
                if (normalTexture.uri) {
                    // Image is given as a URI
                    const response = await fetch(normalTexture.uri);
                    blob = await response.blob();
                } 
                else {
                    // Image is given as a bufferView.
                    const bufferView = gltf.bufferViews[normalTexture.bufferView];
                    //console.log(bufferView);
                    const buffer = await this.getArrayBufferForGltfBuffer(bufferView);
                    //console.log(buffer);
                    blob = new Blob(
                    [new Uint8Array(buffer, bufferView.byteOffset, bufferView.byteLength)],
                    { type: normalTexture.mimeType }
                    );
                }
                imgBitmap = await createImageBitmap(blob);
                this.normalTexture = this.device.createTexture
                ({
                    size: { width: imgBitmap.width, height: imgBitmap.height },
                    format: 'rgba8unorm',
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST |GPUTextureUsage.RENDER_ATTACHMENT,
                });
                this.device.queue.copyExternalImageToTexture(
                { source: imgBitmap },
                { texture: this.normalTexture },
                [imgBitmap.width, imgBitmap.height]
                );

                // metallic and roughness
                let metallicRoughnessTexture = this.gltf_group.gltf.images[metallicRoughnessTextureIdx];
                //let blob;
                if (metallicRoughnessTexture.uri) {
                    // Image is given as a URI
                    const response = await fetch(metallicRoughnessTexture.uri);
                    blob = await response.blob();
                    } 
                    else {
                    // Image is given as a bufferView.
                    const bufferView = gltf.bufferViews[metallicRoughnessTexture.bufferView];
                    //console.log(bufferView);
                    const buffer = await this.getArrayBufferForGltfBuffer(bufferView);
                    //console.log(buffer);
                    blob = new Blob(
                        [new Uint8Array(buffer, bufferView.byteOffset, bufferView.byteLength)],
                        { type: metallicRoughnessTexture.mimeType }
                    );
                    }
                imgBitmap = await createImageBitmap(blob);
                this.metallicRoughnessTexture = this.device.createTexture
                ({
                    size: { width: imgBitmap.width, height: imgBitmap.height },
                    format: 'rgba8unorm',
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST |GPUTextureUsage.RENDER_ATTACHMENT,
                });
                this.device.queue.copyExternalImageToTexture(
                { source: imgBitmap },
                { texture: this.metallicRoughnessTexture },
                [imgBitmap.width, imgBitmap.height]
                );
            }
            

        this.constantBindGroupLayout = this.device.createBindGroupLayout
        ({
            label: `Constant BindGroupLayout`,
            entries:
            [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: {type: 'uniform'}
            },
            {
                binding: 1,
                visibility: GPUShaderStage.VERTEX,
                buffer: {type: 'read-only-storage'}
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {}
            },
            {
                binding: 3,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {}
            },
            {
                binding: 4,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {}  
            },
            {
                binding: 5,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {}  
            },
        ]
        });

        this.constantBindGroup = this.device.createBindGroup
        ({
            label: `Constant BindGroup`,
            layout: this.constantBindGroupLayout,
            entries:
            [{
                binding: 0,
                resource: {buffer: this.jointInfoBuffer}
            },
            {
                binding: 1,
                resource: {buffer: this.inverseBindMatrixBuffer}
            },
            {
                binding: 2,
                resource: this.textureSampler,
            },
            {
                binding: 3,
                resource: this.baseColorTexture.createView(),
            },
            {
                binding: 4,
                resource: hasNormalMap? this.normalTexture.createView() : emptyTexture.createView(),
            },
            {
                binding: 5,
                resource: hasMetallicRoughness? this.metallicRoughnessTexture.createView() : emptyTexture.createView(),
            }
        ]
        });
    }

    initComputeBindGroup() {
        //a 4x4 transformation matrix
        const computeBufferSize = 4 * 16;
        this.computeBuffer = this.instanceBuffer;
        this.computeBindGroupLayout = this.device.createBindGroupLayout
        ({
            label: `Compute BindGroupLayout`,
            entries: 
            [{
                binding: 0, // model transformation matrix
                visibility: GPUShaderStage.COMPUTE,
                buffer: {type: 'storage'},
            },
            {
                binding: 1, // time
                visibility: GPUShaderStage.COMPUTE,
                buffer: {type: 'uniform'},
            },
            {
                binding: 2, // joint transformation matrix
                visibility: GPUShaderStage.COMPUTE,
                buffer: {type: 'storage'},
            },
            {
                binding: 3,
                visibility: GPUShaderStage.COMPUTE,
                buffer: {type: 'storage'},
            }
        ],
        });    

        this.timeBuffer = this.device.createBuffer
        ({            
            size: Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.velocityBuffer = this.device.createBuffer
        ({
            size:3 * Float32Array.BYTES_PER_ELEMENT * this.gltf_group.instanceCount,
            usage:GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        })

        this.setVelocityBuffer();
        
        this.computeBindGroup = this.device.createBindGroup
        ({
            label: `Compute BindGroup`,
            layout: this.computeBindGroupLayout,
            entries: 
            [{
                binding: 0, // model transformation matrix
                resource: { buffer: this.computeBuffer },
            },
            {
                binding: 1, // time
                resource: { buffer: this.timeBuffer },
            },
            {
                binding: 2, // joint transformation matrix
                resource: { buffer: this.jointTransformBuffer},
            },
            {
                binding: 3, //instance velocity 
                resource: { buffer: this.velocityBuffer} 
            }
            ],
        });
    }

    initSkeletonsBindGroup() {
        //TODO: Two buffers: rootIndices, joints
        const hasSkeleton = this.gltf_group.gltf.skin !== undefined? 1:0;
        console.log("Has skeleton? ", hasSkeleton);

        let numJoint = -1;
        let numSkeleton = -1; // = 1
        
        numJoint = this.gltf_group.gltf.skins[0].joints.length;
        numSkeleton = this.gltf_group.skeletons.length; // = 1

        //for one skeleton
        const skeletonInfoSize = Float32Array.BYTES_PER_ELEMENT * (20 + numJoint * 20); // 4 + 16 + jointNum * jointSize(20)
        this.compSkeletonInfoBuffer = this.device.createBuffer({
            size: skeletonInfoSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        const rootIdxBufferSize = Int32Array.BYTES_PER_ELEMENT * this.gltf_group.skRootIndices.length;
        this.rootIdxBuffer = this.device.createBuffer({
            size: rootIdxBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        const parentIdxBufferSize = Int32Array.BYTES_PER_ELEMENT * this.gltf_group.jtParentIndices.length;
        this.parentIdxBuffer = this.device.createBuffer({
            size: parentIdxBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        const layerBufferSize = Int32Array.BYTES_PER_ELEMENT * this.gltf_group.jtLayerArray.length;
        this.layerArrayBuffer = this.device.createBuffer({
            size: layerBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        })

        var skeletonInfoData1 = new Float32Array([          // JointNum, rootJointNum, layerSize, pedding
            this.gltf_group.skeletons[0].joints.length, 
            this.gltf_group.skRootIndices.length,
            this.gltf_group.jtLayerArray.length, 
            -1,]).buffer;

            var skeletonInfoData2 = new Float32Array(this.gltf_group.armatureTransform).buffer; // armatureTransform
            this.device.queue.writeBuffer(this.compSkeletonInfoBuffer, 0, skeletonInfoData1);
            this.device.queue.writeBuffer(this.compSkeletonInfoBuffer, 4 * Float32Array.BYTES_PER_ELEMENT, skeletonInfoData2);
            this.loadJointsIntoBuffer(0, this.compSkeletonInfoBuffer, 20 * Float32Array.BYTES_PER_ELEMENT); // default pose

            var rootIdxData =  new Int32Array (this.gltf_group.skRootIndices).buffer;
            this.device.queue.writeBuffer(this.rootIdxBuffer, 0, rootIdxData);

            var parentIdxData = new Int32Array(this.gltf_group.jtParentIndices).buffer;
            this.device.queue.writeBuffer(this.parentIdxBuffer, 0, parentIdxData);

            var layerArrayData = new Int32Array(this.gltf_group.jtLayerArray).buffer;
            this.device.queue.writeBuffer(this.layerArrayBuffer, 0, layerArrayData);

        this.skeletonBindGroupLayout = this.device.createBindGroupLayout
        ({
            label: `Skeleton BindGroupLayout`,
            entries: 
            [
            {
                binding: 0, // skeleton info
                visibility: GPUShaderStage.COMPUTE,
                buffer: {type: 'read-only-storage'},
            },
            {
                binding: 1, // skeleton rootIndices
                visibility: GPUShaderStage.COMPUTE,
                buffer: {type: 'read-only-storage'},
            },
            {
                binding: 2, // joint parentIndices
                visibility: GPUShaderStage.COMPUTE,
                buffer: {type: 'read-only-storage'},
            },
            {
                binding: 3, // layer array
                visibility: GPUShaderStage.COMPUTE,
                buffer: {type: 'read-only-storage'},
            },
            {
                binding: 4, // joints
                visibility: GPUShaderStage.COMPUTE,
                buffer:{type: 'storage'},
            }
        ],
        });

        //for one now
        const jointsBufferSize =this.gltf_group.instanceCount * numSkeleton * Float32Array.BYTES_PER_ELEMENT * this.gltf_group.skeletons[0].joints.length * 20; //(4 + 4 + 4 + 8)
        //each single joint
        const jointBufferSize = Float32Array.BYTES_PER_ELEMENT * 20;
        
        this.jointsTRSBuffer = this.device.createBuffer({
            size: jointsBufferSize,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        this.loadJointsIntoBuffer(0, this.jointsTRSBuffer, 0);
        this.skeletonBindGroup = this.device.createBindGroup
        ({
            label: `Skeleton BindGroup`,
            layout: this.skeletonBindGroupLayout,
            entries: 
            [{
                binding: 0, // skeleton info
                resource: { buffer: this.compSkeletonInfoBuffer },
            },{
                binding: 1, // skeleton root indices
                resource: { buffer: this.rootIdxBuffer },
            },
            {
                binding: 2, // joint parent indices
                resource: { buffer: this.parentIdxBuffer },
            },
            {
                binding: 3, // joint parent indices
                resource: { buffer: this.layerArrayBuffer },
            },
            {
                binding: 4, // TRS Children
                resource: { buffer: this.jointsTRSBuffer },
            }
            ],
        });
    }

    writeBuffer(whichSkeleton: number, buffer: GPUBuffer, offset: number, jointBufferSize: number, totalCount: number): number {
        var count = totalCount;
        for (var i = 0; i < this.gltf_group.skeletons[whichSkeleton].joints.length; i++) {

            let jointArrayBuffer = new ArrayBuffer(jointBufferSize);
            // add each joint into the buffer
            let translate = new Float32Array(jointArrayBuffer, 0, 4);

            let rotation = new Float32Array(jointArrayBuffer, 4 * Float32Array.BYTES_PER_ELEMENT, 4);

            let scale = new Float32Array(jointArrayBuffer, 8 * Float32Array.BYTES_PER_ELEMENT, 4);

            let children = new Float32Array(jointArrayBuffer, 12 * Float32Array.BYTES_PER_ELEMENT, 8);

            translate.set(this.gltf_group.skeletons[0].joints[i].translate);
            rotation.set(this.gltf_group.skeletons[0].joints[i].rotate);
            scale.set(this.gltf_group.skeletons[0].joints[i].scale);

            for (var j = 0; j < 8; j++) {
                if (j >= this.gltf_group.skeletons[0].joints[i].children.length) {
                    children[j] = -1;
                } else {
                    children[j] = this.gltf_group.skeletons[0].joints[i].children[j];
                }
            }
            
            this.device.queue.writeBuffer(buffer, offset + count * 20 * Float32Array.BYTES_PER_ELEMENT, jointArrayBuffer);
            count++;
        }
        return count;
    }
    loadJointsIntoBuffer(whichSkeleton : number, buffer : GPUBuffer, offset : number)
    {
        const jointBufferSize = Float32Array.BYTES_PER_ELEMENT * 20;    // 4+4+4+8
        //total i
        var totalCount = 0;
        totalCount = this.writeBuffer(whichSkeleton, buffer, offset, jointBufferSize, totalCount);
        if (buffer == this.jointsTRSBuffer) {
            for(var c = 0; c < this.gltf_group.instanceCount-1; c++){
                console.log(totalCount);
                totalCount = this.writeBuffer(whichSkeleton, buffer, offset, jointBufferSize, totalCount);
            }
        }
    }
    async loadImage(gltf, image)
    {
        let blob;
        if (image.uri) {
            // Image is given as a URI
            const response = await fetch(image.uri);
            blob = await response.blob();
          } else {
            // Image is given as a bufferView.
            const bufferView = gltf.bufferViews[image.bufferView];
            console.log(bufferView);
            const buffer = await this.getArrayBufferForGltfBuffer(bufferView);
            console.log(buffer);
            blob = new Blob(
              [new Uint8Array(buffer, bufferView.byteOffset, bufferView.byteLength)],
              { type: image.mimeType }
            );
          }
        const imgBitmap = await createImageBitmap(blob);
        return imgBitmap;
    }

    async getArrayBufferForGltfBuffer(bufferView)
    {   
        let wholeArray = new Uint8Array(10);
        await this.gltf_group.asset.bufferData.get(0).then((value) => {wholeArray = value;}); // Load buffer data from gltf

        let subArray = wholeArray.subarray(bufferView.byteOffset, bufferView.byteOffset + bufferView.byteLength);
        return subArray;
    }

    async loadGPUBuffers()
    {     
        // Mark GPUBufferUsage by accessor for each bufferview 
        // since in many cases bufferviews do not have 'target' property
        const bufferViewUsages : Map<number, number> = new Map();
        for (const mesh of this.gltf_group.gltf.meshes) 
        {
            for (const primitive of mesh.primitives) 
            {
                if (primitive.indices !== undefined) 
                {
                    const accessor = this.gltf_group.gltf.accessors[primitive.indices];
                    bufferViewUsages.set(accessor.bufferView, GPUBufferUsage.INDEX);
                    bufferViewUsages[accessor.bufferView] = GPUBufferUsage.INDEX;
                }
                for (const attribute of Object.values(primitive.attributes))
                {
                    const accessor = this.gltf_group.gltf.accessors[attribute];
                    bufferViewUsages.set(accessor.bufferView, GPUBufferUsage.VERTEX);
                    bufferViewUsages[accessor.bufferView] = GPUBufferUsage.VERTEX;
                }
            }
        }

        // Some bufferviews are not referenced by accessors in the meshes
        const hasJoint = this.gltf_group.gltf.skins !== undefined;
        let inverseMatrixBufferView = -1;
        if(hasJoint)
        {
            const accesor = this.gltf_group.gltf.skins[0].inverseBindMatrices;
            const bufferView = this.gltf_group.gltf.accessors[accesor].bufferView;
            bufferViewUsages.set(bufferView, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
            bufferViewUsages[bufferView] = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;      
            //console.log("mark joint inverseBindmatrices bufferview: " + bufferView + ", usage = " + bufferViewUsages[bufferView]);
            inverseMatrixBufferView = bufferView;
        }
        
        // Create GPUBuffer for each bufferview (TODO:: reduce duplicate bufferview)    
        this.gpuBuffers = [];
        for(let i = 0; i < this.gltf_group.gltf.bufferViews.length; i++)
        {  
            if(bufferViewUsages.has(i))
            {
                const bufferView = this.gltf_group.gltf.bufferViews[i];
                const gpuBuffer = this.device.createBuffer
                ({
                    label: bufferView.name,
                    size: Math.ceil(bufferView.byteLength / 4) * 4, // Round up to multiple of 4
                    usage: bufferViewUsages[i],
                    mappedAtCreation: true,
                });
    
                let gpuBufferArray = new Uint8Array(gpuBuffer.getMappedRange());
                let wholeArray = new Uint8Array(10);
                await this.gltf_group.asset.bufferData.get(0).then((value) => {wholeArray = value;}); // Load buffer data from gltf

                let subArray = wholeArray.subarray(bufferView.byteOffset, bufferView.byteOffset + bufferView.byteLength);
                gpuBufferArray.set(subArray);
                gpuBuffer.unmap();
                this.gpuBuffers.push(gpuBuffer);
            }
            else
            {
                // For those not yet supported usages, create empty gpu buffer
                this.gpuBuffers.push(this.device.createBuffer
                ({
                    label: 'empty buffer',
                    size: 4,
                    usage: GPUBufferUsage.COPY_DST
                }));
            }
        }    
    }

    getComputeShaderModule() {
        if (!this.compShaderModule)
        {
            this.compShaderModule = this.device.createShaderModule({
                label: 'glTF compute shader module',
                code : compShaderCode
            });
        }
        return this.compShaderModule;
    }

    setupMeshNodeBindGroup(node : GLTFSpace.Node)
    {
        // Bind node transform matrix
        const nodeUniformBuffer = this.device.createBuffer
        ({
            size: 16 * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        let bufferData = new Float32Array(this.gltf_group.nodeMatrics.get(node)).buffer;

        this.device.queue.writeBuffer(nodeUniformBuffer, 0, bufferData);

        // Create a bind group containing the uniform buffer for this node.
        const bindGroup = this.device.createBindGroup
        ({
            label: `glTF Node BindGroup`,
            layout: this.nodeBindGroupLayout,
            entries: 
            [{
                binding: 0, // Node uniforms
                resource: { buffer: nodeUniformBuffer },
            }],
        });

        this.nodeGpuData.set(node, bindGroup);
    }

    setupPrimitive(primitive : GLTFSpace.MeshPrimitive)
    {
        const bufferLayout : GPUVertexBufferLayout[] = [];
        const primitiveGpuBuffers : GPUPrimitiveBufferInfo[] = [];
        let drawCount = 0;

        // Explicit create GPUBuffer for each vertex shader attributes
        for(const [atrrNameInShader, location] of ShaderLocations)
        {
            // First check if the attribute required in shader can be found in GLTF
            let createdFromGLTF : boolean = false;
            for (const [attribName, accessorIndex] of Object.entries(primitive.attributes)) 
            {
                if(attribName != atrrNameInShader)
                {
                    continue;
                }

                createdFromGLTF = true;

                const accessor = this.gltf_group.gltf.accessors[accessorIndex];
                const bufferView = this.gltf_group.gltf.bufferViews[accessor.bufferView];
                
                // console.log("build vertex buffer layout for: " + attribName);

                // Create a new vertex buffer entry for the render pipeline that describes this
                // attribute. Implicitly assumes that one buffer will be bound per attribute, even if
                // the attribute data is interleaved.
                bufferLayout.push({
                    arrayStride: bufferView.byteStride || GLTFUtil.packedArrayStrideForAccessor(accessor),
                    attributes : [{                
                        format: GLTFUtil.gpuFormatForAccessor(accessor) as GPUVertexFormat,
                        offset: 0,  // Explicitly set to zero now.
                        shaderLocation: location}]
                });

                // Since we're skipping some attributes, we need to track the WebGPU buffers that are
                // used here so that we can bind them in the correct order at draw time.
                primitiveGpuBuffers.push({
                    buffer: this.gpuBuffers[accessor.bufferView],
                    offset: accessor.byteOffset});  // Save the attribute offset as a buffer offset instead.

                drawCount = accessor.count;

                break;
            }

            // If GLTF does not provide this attribute, we still need to create a vertex buffer since it is required by shader
            if(!createdFromGLTF)
            {
                // TODO:: create default vertex buffer
            }
        }


        // Get GPUBuffer for each accessor inside the primitive
        for (const [attribName, accessorIndex] of Object.entries(primitive.attributes)) 
        {
            const accessor = this.gltf_group.gltf.accessors[accessorIndex];
            const bufferView = this.gltf_group.gltf.bufferViews[accessor.bufferView];

            // Get the shader location for this attribute. If it doesn't have one skip over the
            // attribute because we don't need it for rendering (yet).
            const shaderLocation = ShaderLocations[attribName];
            if (shaderLocation === undefined) { continue; }

            //console.log("build vertex buffer layout for: " + attribName);

            // Create a new vertex buffer entry for the render pipeline that describes this
            // attribute. Implicitly assumes that one buffer will be bound per attribute, even if
            // the attribute data is interleaved.
            bufferLayout.push({
                arrayStride: bufferView.byteStride || GLTFUtil.packedArrayStrideForAccessor(accessor),
                attributes : [{                
                    format: GLTFUtil.gpuFormatForAccessor(accessor) as GPUVertexFormat,
                    offset: 0,  // Explicitly set to zero now.
                    shaderLocation: shaderLocation}]
            });

            // Since we're skipping some attributes, we need to track the WebGPU buffers that are
            // used here so that we can bind them in the correct order at draw time.
            primitiveGpuBuffers.push({
                buffer: this.gpuBuffers[accessor.bufferView],
                offset: accessor.byteOffset});  // Save the attribute offset as a buffer offset instead.

            drawCount = accessor.count;
        }

        const pipeline = this.device.createRenderPipeline({
            label: 'glTF renderer pipeline',
            layout: this.gltfPipelineLayout,
            vertex: {
              module: this.vertShaderModule,
              entryPoint: 'vertexMain',
              buffers: bufferLayout,
            },
            primitive: {
              topology: GLTFUtil.gpuPrimitiveTopologyForMode(primitive.mode),
              cullMode: 'back', // 'back'
            },
            // multisample: {
            //   count: this.app.sampleCount,
            // },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus-stencil8'
            },
            fragment: {
              module : this.fragShaderModule,
              entryPoint: 'fragmentMain',
              targets: [{
                format: 'bgra8unorm'
              }],
            },
        });
        
        // Store data needed to render this primitive.
        const gpuPrimitive = new GPUPrimitiveInfo();
        gpuPrimitive.pipeline = pipeline;
        gpuPrimitive.buffers = primitiveGpuBuffers;
        gpuPrimitive.drawCount = drawCount;

        // If the primitive has index data, store the index buffer, offset, type, count as well.
        if ('indices' in primitive) 
        {
            const accessor = this.gltf_group.gltf.accessors[primitive.indices];
            gpuPrimitive.indexBuffer = this.gpuBuffers[accessor.bufferView];
            gpuPrimitive.indexOffset = accessor.byteOffset;
            gpuPrimitive.indexType = GLTFUtil.gpuIndexFormatForComponentType(accessor.componentType);
            gpuPrimitive.drawCount = accessor.count;
        }

        this.primitiveGpuData.set(primitive, gpuPrimitive);
    }

    renderGLTF()
    {
        // Acquire next image from context
        this.colorTexture = this.context.getCurrentTexture();
        this.colorTextureView = this.colorTexture.createView();

        // Command Encoder
        const loadOp = this.isFirstRenderer ? 'clear' : 'load';
        let colorAttachment: GPURenderPassColorAttachment = {
            view: this.colorTextureView,
            clearValue: { r: 135 / 255.0, g: 206 / 255.0, b: 250 / 255.0, a: 1 },   // Blue background
            loadOp: loadOp,
            storeOp: 'store'
        };
        const depthAttachment: GPURenderPassDepthStencilAttachment = {
            view: this.depthTextureView,
            depthClearValue: 1,
            depthLoadOp: loadOp, //'clear'
            depthStoreOp: 'store',
            stencilClearValue: 0,
            stencilLoadOp: loadOp, // 'clear'
            stencilStoreOp: 'store'
        };

        let renderPassDesc: GPURenderPassDescriptor = {
            colorAttachments: [colorAttachment],
            depthStencilAttachment: depthAttachment
        };

        this.commandEncoder = this.device.createCommandEncoder();

        //compute shader first

        if(this.hasJoint)
        {
            this.computepassEncoder = this.commandEncoder.beginComputePass();
            this.computepassEncoder.setPipeline(this.computePipeline);
            this.computepassEncoder.setBindGroup(0, this.computeBindGroup);
            this.computepassEncoder.setBindGroup(1, this.skeletonBindGroup);
            this.computepassEncoder.dispatchWorkgroups(1);
            this.computepassEncoder.end();
        }

        // Render pass
        this.passEncoder = this.commandEncoder.beginRenderPass(renderPassDesc);

        this.passEncoder.setBindGroup(0, this.constantBindGroup);
        this.passEncoder.setBindGroup(1, this.frameBindGroup);

        // Bind gltf data to render pass
        for (const [node, bindGroup] of this.nodeGpuData)
        {
            this.passEncoder.setBindGroup(2, bindGroup);

            const mesh = this.gltf_group.gltf.meshes[node.mesh];
            for (const primitive of mesh.primitives)
            {
                const gpuPrimitive = this.primitiveGpuData.get(primitive);

                this.passEncoder.setPipeline(gpuPrimitive.pipeline);

                for(let i = 0; i < gpuPrimitive.buffers.length; i++)
                {
                    const bufferInfo = gpuPrimitive.buffers[i];
                    this.passEncoder.setVertexBuffer(i, bufferInfo.buffer, bufferInfo.offset);
                }

                if(gpuPrimitive.indexBuffer !== undefined)
                {                  
                    this.passEncoder.setIndexBuffer(gpuPrimitive.indexBuffer, gpuPrimitive.indexType, gpuPrimitive.indexOffset);
                    this.passEncoder.drawIndexed(gpuPrimitive.drawCount, this.gltf_group.instanceCount, 0, 0, 0);
                }
                else
                {
                    this.passEncoder.draw(gpuPrimitive.drawCount, this.gltf_group.instanceCount, 0, 0);
                }
            }
        }

        // Set viewport
        this.passEncoder.setViewport(
            0,
            0,
            this.canvas.width,
            this.canvas.height,
            0,
            1
        );
        this.passEncoder.setScissorRect(
            0,
            0,
            this.canvas.width,
            this.canvas.height
        );

        this.passEncoder.end();
        
        // Submit command queue
        this.queue.submit([this.commandEncoder.finish()]);   
    }

    updateCameraBuffer(projMat : mat4, viewMat : mat4, pos : vec3, time : number)
    {  
        // Update renderer frame buffer
        let frameArrayBuffer = new ArrayBuffer(GltfRenderer.FRAMEBUFFERSIZE);
        let projectionMatrix = new Float32Array(frameArrayBuffer, 0, 16);
        let viewMatrix = new Float32Array(frameArrayBuffer, 16 * Float32Array.BYTES_PER_ELEMENT, 16);
        let cameraPosition = new Float32Array(frameArrayBuffer, 32 * Float32Array.BYTES_PER_ELEMENT, 3);
        let timeArray = new Float32Array(frameArrayBuffer, 35 * Float32Array.BYTES_PER_ELEMENT, 1);

        projectionMatrix.set(projMat);
        viewMatrix.set(viewMat);
        cameraPosition.set(pos);
        timeArray.set([time]);

        this.device.queue.writeBuffer(this.cameraBuffer, 0, frameArrayBuffer);

        // Update compute shader buffer
        if(this.hasJoint)
        {
            let timeArrayBffer = new Float32Array([time]).buffer;
            this.device.queue.writeBuffer(this.timeBuffer, 0, timeArrayBffer);
        }
    }

    setInstanceBuffer()
    {
        let instanceArrayBuffer = new ArrayBuffer(16 * this.gltf_group.instanceCount * Float32Array.BYTES_PER_ELEMENT);
        for(let[index, mat] of this.gltf_group.transforms.entries())
        {
            let st = index * 16 * Float32Array.BYTES_PER_ELEMENT;
            let arr = new Float32Array(instanceArrayBuffer, st, 16);
            arr.set(mat);
        }

        this.device.queue.writeBuffer(this.instanceBuffer, 0, instanceArrayBuffer);
    }

    setVelocityBuffer() {
        var velocityArrayBuffer = new ArrayBuffer(3 * this.gltf_group.instanceCount * Float32Array.BYTES_PER_ELEMENT);
        for(let i = 0; i < this.gltf_group.instanceCount; i++) {
            let st = i * 3 * Float32Array.BYTES_PER_ELEMENT;
            let arr = new Float32Array(velocityArrayBuffer, st, 3);
            arr.set(this.gltf_group.velocity[i]);
        }
        this.device.queue.writeBuffer(this.velocityBuffer, 0, velocityArrayBuffer);
    }
}

class GLTFUtil
{
    // Schema ref:
    // https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/accessor.schema.json
    static readonly GL_BYTE             : number = 5120;
    static readonly GL_UNSIGNED_BYTE    : number = 5121;
    static readonly GL_SHORT            : number = 5122;
    static readonly GL_UNSIGNED_SHORT   : number = 5123;
    static readonly GL_UNSIGNED_INT     : number = 5125;
    static readonly GL_FLOAT            : number = 5126;

    // Schema ref:
    // https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/mesh.primitive.schema.json
    static readonly GL_POINTS           : number = 0;
    static readonly GL_LINES            : number = 1;
    static readonly GL_LINES_LOOP       : number = 2;
    static readonly GL_LINE_STRIP       : number = 3;
    static readonly GL_TRIANGLES        : number = 4;
    static readonly GL_TRIANGLE_STRIP   : number = 5;
    static readonly GL_TRIANGLE_FAN     : number = 6;
    

    static componentCountForType(type : string) 
    {
        switch (type) 
        {
            case 'SCALAR': return 1;
            case 'VEC2': return 2;
            case 'VEC3': return 3;
            case 'VEC4': return 4;
            default: return 0;
        }
    }
    
    static sizeForComponentType(componentType : number) 
    {
        // 5120 | 5121  | 5122  | 5123  | 5125 | 5126 | number
        // byte | ubyte | short | ushort| uint | float| ...
        switch (componentType) 
        {
            case GLTFUtil.GL_BYTE: return 1;
            case GLTFUtil.GL_UNSIGNED_BYTE: return 1;
            case GLTFUtil.GL_SHORT: return 2;
            case GLTFUtil.GL_UNSIGNED_SHORT: return 2;
            case GLTFUtil.GL_UNSIGNED_INT: return 4;
            case GLTFUtil.GL_FLOAT: return 4;
            default: return 0;
        }
    }

    static packedArrayStrideForAccessor(accessor : GLTFSpace.Accessor)
    {
        return GLTFUtil.sizeForComponentType(accessor.componentType) * GLTFUtil.componentCountForType(accessor.type);
    }

    static gpuFormatForAccessor(accessor : GLTFSpace.Accessor)
    {
        const norm = accessor.normalized ? 'norm' : 'int';
        const count = GLTFUtil.componentCountForType(accessor.type);
        const x = count > 1 ? `x${count}` : '';
        switch (accessor.componentType) 
        {
            case GLTFUtil.GL_BYTE: return `s${norm}8${x}`;
            case GLTFUtil.GL_UNSIGNED_BYTE: return `u${norm}8${x}`;
            case GLTFUtil.GL_SHORT: return `s${norm}16${x}`;
            case GLTFUtil.GL_UNSIGNED_SHORT: return `u${norm}16${x}`;
            case GLTFUtil.GL_UNSIGNED_INT: return `u${norm}32${x}`;
            case GLTFUtil.GL_FLOAT: return `float32${x}`;
        }
    }
    
    static gpuPrimitiveTopologyForMode(mode : number) 
    {
        switch (mode) 
        {
            case GLTFUtil.GL_TRIANGLES: return 'triangle-list';
            case GLTFUtil.GL_TRIANGLE_STRIP: return 'triangle-strip';
            case GLTFUtil.GL_LINES: return 'line-list';
            case GLTFUtil.GL_LINE_STRIP: return 'line-strip';
            case GLTFUtil.GL_POINTS: return 'point-list';
        }
    }

    static gpuIndexFormatForComponentType(componentType : number) 
    {
        switch (componentType) 
        {
            case GLTFUtil.GL_UNSIGNED_SHORT: return  "uint16";
            case GLTFUtil.GL_UNSIGNED_INT: return "uint32";
            default: return "uint32";
        }
    }
}
