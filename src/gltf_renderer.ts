
import vertShaderCode from './shaders/gltf.vert.wgsl';
import fragShaderCode from './shaders/gltf.frag.wgsl';
import compShaderCode from './shaders/comp.wgsl';

import * as GLTFSpace from 'gltf-loader-ts/lib/gltf';
import {mat4, vec3} from 'gl-matrix';
import GLTFGroup from './gltf_group';

var frame = 0;
var tmp;
// Make sure the shaders follow this mapping
const ShaderLocations = 
{
    POSITION: 0,
    NORMAL: 1,
};

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

    // Associates a glTF node or primitive with its WebGPU resources.
    nodeGpuData : Map<GLTFSpace.Node, GPUBindGroup>;
    primitiveGpuData : Map<GLTFSpace.MeshPrimitive, GPUPrimitiveInfo>;
    gpuBuffers : GPUBuffer[];
   
    // GLTF stuff
    gltf_group : GLTFGroup;
 
    // WebGPU stuff
    adapter : GPUAdapter;
    device : GPUDevice;
    queue: GPUQueue;

    // Bind group
    static readonly FRAMEBUFFERSIZE : number = Float32Array.BYTES_PER_ELEMENT * 36; // 16+16+3+1
    frameUniformBuffer : GPUBuffer;
    frameBindGroupLayout : GPUBindGroupLayout;
    frameBindGroup : GPUBindGroup;

    nodeBindGroupLayout : GPUBindGroupLayout;

    instanceBuffer : GPUBuffer;
    instanceBindGroupLayout : GPUBindGroupLayout;
    instanceBindGroup : GPUBindGroup;

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
    


    // Web stuff
    canvas : HTMLCanvasElement;


    constructor(){}

    async init(adapter : GPUAdapter, device : GPUDevice, queue : GPUQueue, canvas : HTMLCanvasElement, gltf_group : GLTFGroup)
    {     
        this.adapter = adapter;
        this.device = device;
        this.queue = queue;

        this.gltf_group = gltf_group;

        this.canvas = canvas;

        this.nodeGpuData = new Map();
        this.primitiveGpuData = new Map();

        this.resizeBackings();
        await this.initializeWebGPUAndGLTF(); 
    }

    resizeBackings() 
    {
        // Swapchain
        if (!this.context) 
        {
            this.context = this.canvas.getContext('webgpu');
            const canvasConfig: GPUCanvasConfiguration = 
            {
                device: this.device,
                format: 'bgra8unorm',
                usage:
                    GPUTextureUsage.RENDER_ATTACHMENT |
                    GPUTextureUsage.COPY_SRC,
                    alphaMode: 'opaque'
            };
            this.context.configure(canvasConfig);
        }

        const depthTextureDesc: GPUTextureDescriptor = 
        {
            size: [this.canvas.width, this.canvas.height, 1],
            dimension: '2d',
            format: 'depth24plus-stencil8',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
        };

        this.depthTexture = this.device.createTexture(depthTextureDesc);
        this.depthTextureView = this.depthTexture.createView();
    }

    async initializeWebGPUAndGLTF()
    {
        // Load all gltf data into GPUBuffers 
        await this.loadGPUBuffers();

        // Bind Groups
        this.initFrameBindGroup();
        this.initNodeBindGroup();
        this.initInstanceBindGroup();
        this.initComputeBindGroup();
        
        //create compute pipeline here, maybe not
        this.computePipelineLayout = this.device.createPipelineLayout
        ({
            label: 'glTF Compute Pipeline Layout',
            bindGroupLayouts: [
               this.computeBindGroupLayout,
            ]

        });
        const computeModule = this.getComputeShaderModule();
        this.computePipeline = this.device.createComputePipeline({
            layout: this.computePipelineLayout,
            compute: {
              module: computeModule, 
              entryPoint: 'simulate',
            },
        });


        // Pipeline Layout
        this.gltfPipelineLayout = this.device.createPipelineLayout
        ({
            label: 'glTF Pipeline Layout',
            bindGroupLayouts: [
                this.frameBindGroupLayout,
                this.nodeBindGroupLayout,
                this.instanceBindGroupLayout,
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
        // Bind group layout for frame
        this.frameUniformBuffer = this.device.createBuffer
        ({
            size: GltfRenderer.FRAMEBUFFERSIZE * Float32Array.BYTES_PER_ELEMENT,   // proj mat, view mat, pos, time
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        this.frameBindGroupLayout = this.device.createBindGroupLayout
        ({
            label: `Frame BindGroupLayout`,
            entries: 
            [{
                binding: 0, // Camera/Frame uniforms
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: {},
            }],
        });
        this.frameBindGroup = this.device.createBindGroup
        ({
            label: `Frame BindGroup`,
            layout: this.frameBindGroupLayout,
            entries: 
            [{
                binding: 0, // Camera uniforms
                resource: { buffer: this.frameUniformBuffer },
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

    initInstanceBindGroup()
    {
        this.instanceBuffer = this.device.createBuffer
        ({
            size: 16 * this.gltf_group.instanceCount * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.instanceBindGroupLayout = this.device.createBindGroupLayout
        ({
            label: `glTF Instance BindGroupLayout`,
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: {type: 'read-only-storage'},
            }]
        });
        this.instanceBindGroup = this.device.createBindGroup
        ({
            label: `Instance BindGroup`,
            layout: this.instanceBindGroupLayout,
            entries: 
            [{
                binding: 0,
                resource: { buffer: this.instanceBuffer },
            }],
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
                binding: 0, // transformation matrix
                visibility: GPUShaderStage.COMPUTE,
                buffer: {type: 'storage'},
            }],
        });
        this.computeBindGroup = this.device.createBindGroup
        ({
            label: `Compute BindGroup`,
            layout: this.computeBindGroupLayout,
            entries: 
            [{
                binding: 0, // transformation matrix
                resource: { buffer: this.computeBuffer },
            }],
        });
    }
    async loadGPUBuffers()
    {
        // TODO:: Create instanced bind group
        
        // Mark GPUBufferUsage by accessor for each bufferview 
        // since in many cases bufferviews do not have 'target' property
        const bufferViewUsages = [];
        for (const mesh of this.gltf_group.gltf.meshes) 
        {
            for (const primitive of mesh.primitives) 
            {
                if (primitive.indices !== undefined) 
                {
                    const accessor = this.gltf_group.gltf.accessors[primitive.indices];
                    bufferViewUsages[accessor.bufferView] |= GPUBufferUsage.INDEX;
                }
                for (const attribute of Object.values(primitive.attributes))
                {
                    const accessor = this.gltf_group.gltf.accessors[attribute];
                    bufferViewUsages[accessor.bufferView] |= GPUBufferUsage.VERTEX;
                }
            }
        }

        // Create GPUBuffer for each bufferview    
        this.gpuBuffers = [];
        for(let i = 0; i < this.gltf_group.gltf.bufferViews.length; i++)
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
            //console.log("i = " + i + ", byteLength = " + bufferView.byteLength + ", byteOffset = " + bufferView.byteOffset + ", actual buffer = " + subArray);       
        }    
    }

    getVertexShaderModule()
    {
        if (!this.vertShaderModule)
        {
            this.vertShaderModule = this.device.createShaderModule({
                label: 'glTF vertex shader module',
                code : vertShaderCode
            });
        }
        return this.vertShaderModule;
    }

    getFragmentShaderModule()
    {
        if (!this.fragShaderModule)
        {
            this.fragShaderModule = this.device.createShaderModule({
                label: 'glTF fragment shader module',
                code : fragShaderCode
            });
        }
        return this.fragShaderModule;
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

        // Get GPUBuffer for each accessor inside the primitive
        for (const [attribName, accessorIndex] of Object.entries(primitive.attributes)) 
        {
            const accessor = this.gltf_group.gltf.accessors[accessorIndex];
            const bufferView = this.gltf_group.gltf.bufferViews[accessor.bufferView];

            // Get the shader location for this attribute. If it doesn't have one skip over the
            // attribute because we don't need it for rendering (yet).
            const shaderLocation = ShaderLocations[attribName];
            if (shaderLocation === undefined) { continue; }

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

        const vertModule = this.getVertexShaderModule();
        const fragModule = this.getFragmentShaderModule();
        const pipeline = this.device.createRenderPipeline({
            label: 'glTF renderer pipeline',
            layout: this.gltfPipelineLayout,
            vertex: {
              module: vertModule,
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
              module : fragModule,
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

    renderGLTF = () =>
    {
        // Acquire next image from context
        this.colorTexture = this.context.getCurrentTexture();
        this.colorTextureView = this.colorTexture.createView();

        // Command Encoder
        let colorAttachment: GPURenderPassColorAttachment = {
            view: this.colorTextureView,
            clearValue: { r: 135 / 255.0, g: 206 / 255.0, b: 250 / 255.0, a: 1 },   // Blue background
            loadOp: 'clear',
            storeOp: 'store'
        };
        const depthAttachment: GPURenderPassDepthStencilAttachment = {
            view: this.depthTextureView,
            depthClearValue: 1,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
            stencilClearValue: 0,
            stencilLoadOp: 'clear',
            stencilStoreOp: 'store'
        };
        const renderPassDesc: GPURenderPassDescriptor = {
            colorAttachments: [colorAttachment],
            depthStencilAttachment: depthAttachment
        };

        this.commandEncoder = this.device.createCommandEncoder();
        
        //let transformationMatrixData  =  new Float32Array (this.gltf_group.transforms[0]).buffer;

        //let gpuBufferArray = new Uint8Array(this.computeBuffer.getMappedRange());
        //const tablesArray = new Float32Array(this.computeBuffer.getMappedRange());
       // this.device.queue.writeBuffer(this.computeBuffer, 0, transformationMatrixData);
        
        // console.log("before: ");
        // let tmpBufferArray = new Uint8Array(this.computeBuffer.getMappedRange());
        // console.log(tmpBufferArray);
        // this.instanceBuffer

        //compute shader first
        this.computepassEncoder = this.commandEncoder.beginComputePass();
        this.computepassEncoder.setPipeline(this.computePipeline);
        this.computepassEncoder.setBindGroup(0, this.computeBindGroup);
        this.computepassEncoder.dispatchWorkgroups(1);

       
        this.computepassEncoder.end();
        
        if(tmp != this.computeBuffer) {
            
        }

        
        // Render pass
        this.passEncoder = this.commandEncoder.beginRenderPass(renderPassDesc);

        this.passEncoder.setBindGroup(0, this.frameBindGroup);
        this.passEncoder.setBindGroup(2, this.instanceBindGroup);

        //+5
        // Bind gltf data to render pass
        for (const [node, bindGroup] of this.nodeGpuData)
        {
            this.passEncoder.setBindGroup(1, bindGroup);

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
                    this.passEncoder.drawIndexed(gpuPrimitive.drawCount, this.gltf_group.instanceCount);
                }
                else
                {
                    this.passEncoder.draw(gpuPrimitive.drawCount, this.gltf_group.instanceCount);
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

        frame++;
        requestAnimationFrame(this.renderGLTF);   
          
    }

    updateFrameBuffer(projMat : mat4, viewMat : mat4, pos : vec3, time : number)
    {  
        // Update frame buffer
        let frameArrayBuffer = new ArrayBuffer(GltfRenderer.FRAMEBUFFERSIZE);
        let projectionMatrix = new Float32Array(frameArrayBuffer, 0, 16);
        let viewMatrix = new Float32Array(frameArrayBuffer, 16 * Float32Array.BYTES_PER_ELEMENT, 16);
        let cameraPosition = new Float32Array(frameArrayBuffer, 32 * Float32Array.BYTES_PER_ELEMENT, 3);
        let timeArray = new Float32Array(frameArrayBuffer, 35 * Float32Array.BYTES_PER_ELEMENT, 1);

        projectionMatrix.set(projMat);
        viewMatrix.set(viewMat);
        cameraPosition.set(pos);
        timeArray.set([time]);

        this.device.queue.writeBuffer(this.frameUniformBuffer, 0, frameArrayBuffer);
    }

    updateInstanceBuffer()
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
