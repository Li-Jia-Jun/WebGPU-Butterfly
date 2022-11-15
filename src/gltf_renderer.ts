import {GltfLoader}  from 'gltf-loader-ts';
import {GltfAsset}  from 'gltf-loader-ts';
import * as GLTFSpace from 'gltf-loader-ts/lib/gltf'
import {mat4, vec3} from 'gl-matrix'


// Make sure gltf file follows this mapping
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
    uri : string;
    gltf : GLTFSpace.GlTf;
    asset : GltfAsset;
 
    // WebGPU stuff
    canRun : boolean;
    adapter : GPUAdapter;
    device : GPUDevice;
    queue: GPUQueue;

    // Frame buffer stuff
    static readonly FRAMEBUFFERSIZE : number = Float32Array.BYTES_PER_ELEMENT * 36; // 16+16+3+1
    frameUniformBuffer : GPUBuffer;
    frameBindGroup : GPUBindGroup;
    frameBindGroupLayout : GPUBindGroupLayout;

    nodeBindGroupLayout : GPUBindGroupLayout;
    gltfPipelineLayout : GPUPipelineLayout;
    shaderModule : GPUShaderModule;

    context: GPUCanvasContext;
    colorTexture: GPUTexture;
    colorTextureView: GPUTextureView;
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;
 
    commandEncoder: GPUCommandEncoder;
    passEncoder: GPURenderPassEncoder;

    // Web stuff
    canvas : HTMLCanvasElement;



    constructor(gltf_uri : string, canvas : HTMLCanvasElement)
    {
        // Example source:
        // 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/BoxTextured/glTF/BoxTextured.gltf';
        // this.uri = gltf_uri;
        this.uri = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/BoxTextured/glTF/BoxTextured.gltf';

        this.canvas = canvas;

        this.nodeGpuData = new Map();
        this.primitiveGpuData = new Map();
    }

    async start()
    {
        if(await this.initializeWebGPU())
        {
            this.resizeBackings();
            await this.initializeGLTF(); 
            return true;
        }

        return false;
    }

    async initializeWebGPU(): Promise<boolean> 
    {
        try 
        {
            const entry: GPU = navigator.gpu;
            if (!entry) 
            {
                return false;
            }

            this.adapter = await entry.requestAdapter();
            this.device = await this.adapter.requestDevice();
            this.queue = this.device.queue;
        } 
        catch (e) 
        {
            console.error(e);
            return false;
        }

        return true;
    }

    resizeBackings() 
    {
        // Swapchain
        if (!this.context) {
            this.context = this.canvas.getContext('webgpu');
            const canvasConfig: GPUCanvasConfiguration = {
                device: this.device,
                format: 'bgra8unorm',
                usage:
                    GPUTextureUsage.RENDER_ATTACHMENT |
                    GPUTextureUsage.COPY_SRC,
                    alphaMode: 'opaque'
            };
            this.context.configure(canvasConfig);
        }

        const depthTextureDesc: GPUTextureDescriptor = {
            size: [this.canvas.width, this.canvas.height, 1],
            dimension: '2d',
            format: 'depth24plus-stencil8',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
        };

        this.depthTexture = this.device.createTexture(depthTextureDesc);
        this.depthTextureView = this.depthTexture.createView();
    }

    async initializeGLTF()
    {
        // First load GITF
        await this.loadGITF();

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

        // Bind group layout for the transform uniforms of each node.
        this.nodeBindGroupLayout = this.device.createBindGroupLayout({
        label: `glTF Node BindGroupLayout`,
        entries: [{
            binding: 0, // Node uniforms
            visibility: GPUShaderStage.VERTEX,
            buffer: {},
        }],
        });

        // Everything we'll render with these pages can share a single pipeline layout.
        // A more advanced renderer supporting things like skinning or multiple material types
        // may need more.
        this.gltfPipelineLayout = this.device.createPipelineLayout({
        label: 'glTF Pipeline Layout',
        bindGroupLayouts: [
            this.frameBindGroupLayout,
            this.nodeBindGroupLayout,
        ]
        });

        // Find every node with a mesh and create a bind group containing the node's transform.
        for (const node of this.gltf.nodes)
        {
            if ('mesh' in node) 
            {
                this.setupMeshNode(node);
            }
        }

        // Loop through each primitive of each mesh and create a compatible WebGPU pipeline.
        for (const mesh of this.gltf.meshes) 
        {
            for (const primitive of mesh.primitives) 
            {
                this.setupPrimitive(primitive);
            }
        }
    }

    async loadGITF()
    {
        // Load gltf using gltf-loader-ts
        let loader: GltfLoader = new GltfLoader();
        this.asset = await loader.load(this.uri);
        this.gltf = this.asset.gltf;
        this.asset.preFetchAll();

        console.log(this.gltf);
        console.log(this.asset);
        
        // Mark GPUBufferUsage by accessor for each bufferview 
        // since in many cases bufferviews do not have 'target' property
        const bufferViewUsages = [];
        for (const mesh of this.gltf.meshes) 
        {
            for (const primitive of mesh.primitives) 
            {
                if (primitive.indices !== undefined) 
                {
                    const accessor = this.gltf.accessors[primitive.indices];
                    bufferViewUsages[accessor.bufferView] |= GPUBufferUsage.INDEX;
                }
                for (const attribute of Object.values(primitive.attributes))
                {
                    const accessor = this.gltf.accessors[attribute];
                    bufferViewUsages[accessor.bufferView] |= GPUBufferUsage.VERTEX;
                }
            }
        }

        // Create GPUBuffer for each bufferview
        this.gpuBuffers = [];
        for(let i = 0; i < this.gltf.bufferViews.length; i++)
        {
            const bufferView = this.gltf.bufferViews[i];

            const gpuBuffer = this.device.createBuffer
            ({
                label: bufferView.name,
                size: Math.ceil(bufferView.byteLength / 4) * 4, // Round up to multiple of 4
                usage: bufferViewUsages[i],
                mappedAtCreation: true,
            });

            const gpuBufferArray = new Uint8Array(gpuBuffer.getMappedRange());
            gpuBufferArray.set((await this.asset.accessorData(bufferView.buffer)).subarray(bufferView.byteOffset, bufferView.byteLength));
            gpuBuffer.unmap();

            this.gpuBuffers.push(gpuBuffer);
        }    
    }

    getShaderModule()
    {
        // Cache the shader module, since all the pipelines use the same one.
        if (!this.shaderModule) {
        // The shader source used here is intentionally minimal. It just displays the geometry
        // as white with a very simplistic directional lighting based only on vertex normals
        // (just to show the shape of the mesh a bit better.)
        const code = `
            struct Camera {
            projection : mat4x4<f32>,
            view : mat4x4<f32>,
            position : vec3<f32>,
            time : f32,
            };
            @group(0) @binding(0) var<uniform> camera : Camera;
            @group(1) @binding(0) var<uniform> model : mat4x4<f32>;
            struct VertexInput {
            @location(${ShaderLocations.POSITION}) position : vec3<f32>,
            @location(${ShaderLocations.NORMAL}) normal : vec3<f32>,
            };
            struct VertexOutput {
            @builtin(position) position : vec4<f32>,
            @location(0) normal : vec3<f32>,
            };
            @vertex
            fn vertexMain(input : VertexInput) -> VertexOutput {
            var output : VertexOutput;
            output.position = camera.projection * camera.view * model * vec4(input.position, 1.0);
            output.normal = normalize((camera.view * model * vec4(input.normal, 0.0)).xyz);
            return output;
            }
            // Some hardcoded lighting
            const lightDir = vec3(0.25, 0.5, 1.0);
            const lightColor = vec3(1.0, 1.0, 1.0);
            const ambientColor = vec3(0.1, 0.1, 0.1);
            @fragment
            fn fragmentMain(input : VertexOutput) -> @location(0) vec4<f32> {
            // An extremely simple directional lighting model, just to give our model some shape.
            let N = normalize(input.normal);
            let L = normalize(lightDir);
            let NDotL = max(dot(N, L), 0.0);
            let surfaceColor = ambientColor + NDotL;
            return vec4(surfaceColor, 1.0);
            }
        `;

        this.shaderModule = this.device.createShaderModule({
            label: 'Simple glTF rendering shader module',
            code,
        });
        }

        return this.shaderModule;
    }

    setupMeshNode(node : GLTFSpace.Node)
    {
        // Create a uniform buffer for this node and populate it with the node's world transform.
        const nodeUniformBuffer = this.device.createBuffer
        ({
            size: 16 * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        let bufferData = new Float32Array(node.matrix).buffer;
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
        const bufferLayout = [];
        const primitiveGpuBuffers : GPUPrimitiveBufferInfo[] = [];
        let drawCount = 0;

        for (const [attribName, accessorIndex] of Object.entries(primitive.attributes)) 
        {
            const accessor = this.gltf.accessors[accessorIndex];
            const bufferView = this.gltf.bufferViews[accessor.bufferView];

            // Get the shader location for this attribute. If it doesn't have one skip over the
            // attribute because we don't need it for rendering (yet).
            const shaderLocation = ShaderLocations[attribName];
            if (shaderLocation === undefined) { continue; }

            // Create a new vertex buffer entry for the render pipeline that describes this
            // attribute. Implicitly assumes that one buffer will be bound per attribute, even if
            // the attribute data is interleaved.
            bufferLayout.push({
                arrayStride: bufferView.byteStride || GLTFUtil.packedArrayStrideForAccessor(accessor),
                attributes: [{
                  shaderLocation,
                  format: GLTFUtil.gpuFormatForAccessor(accessor),
                  offset: 0,  // Explicitly set to zero now.
                }]
              });

            // Since we're skipping some attributes, we need to track the WebGPU buffers that are
            // used here so that we can bind them in the correct order at draw time.
            primitiveGpuBuffers.push({
                buffer: this.gpuBuffers[accessor.bufferView],
                offset: accessor.byteOffset});  // Save the attribute offset as a buffer offset instead.

            drawCount = accessor.count;
        }

        const module = this.getShaderModule();
        const pipeline = this.device.createRenderPipeline({
            label: 'glTF renderer pipeline',
            layout: this.gltfPipelineLayout,
            vertex: {
              module,
              entryPoint: 'vertexMain',
              buffers: bufferLayout,
            },
            primitive: {
              topology: GLTFUtil.gpuPrimitiveTopologyForMode(primitive.mode),
              cullMode: 'back',
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
              module,
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
            const accessor = this.gltf.accessors[primitive.indices];
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
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
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

        // Render pass
        this.passEncoder = this.commandEncoder.beginRenderPass(renderPassDesc);

        this.passEncoder.setBindGroup(0, this.frameBindGroup);

        // Bind gltf data to render pass
        for (const [node, bindGroup] of this.nodeGpuData)
        {
            this.passEncoder.setBindGroup(1, bindGroup);

            const mesh = this.gltf.meshes[node.mesh];
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
                    this.passEncoder.drawIndexed(gpuPrimitive.drawCount);
                }
                else
                {
                    this.passEncoder.draw(gpuPrimitive.drawCount);
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

        requestAnimationFrame(this.renderGLTF);

        console.log("render!");
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
