import { mat4, vec3 } from 'gl-matrix';
import {
    cubeVertexArray,
    cubeVertexSize,
    cubeUVOffset,
    cubePositionOffset,
    cubeVertexCount,
  } from './meshes/cube';
import{ArcballCamera} from 'arcball_camera'
import {Controller} from "ez_canvas_controller";
import InputHandler from './input';
import instancedVertWGSL from './shaders/instanced.vert.wgsl';
import basicVertWGSL from './shaders/basic.vert.wgsl';
import vertexPositionColorWGSL from './shaders/vertexPositionColor.frag.wgsl';
import vertShaderCode from './shaders/triangle.vert.wgsl';
import fragShaderCode from './shaders/triangle.frag.wgsl';
import { Console } from 'console';
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
// 📈 Position Vertex Buffer Data
const positions = new Float32Array([
    1.0, -1.0, 0.0, -1.0, -1.0, 0.0, 0.0, 1.0, 0.0
]);
// 🎨 Color Vertex Buffer Data
const colors = new Float32Array([
    1.0,
    0.0,
    1.0, // 🔴
    0.0,
    1.0,
    0.0, // 🟢
    0.0,
    0.0,
    1.0 // 🔵
]);

//instanced cube Buffer Data
const xCount = 4;
const yCount = 4;
const numInstances = xCount * yCount;
const matrixFloatCount = 16; // 4x4 matrix
const matrixSize = 4 * matrixFloatCount;
const uniformBufferSize = numInstances * matrixSize;

const myCanvas = document.getElementById('gfx') as HTMLCanvasElement;

//width / height
//const aspect = myCanvas.width / myCanvas.height;
const projectionMatrix = mat4.create();
mat4.perspective(projectionMatrix, (2 * Math.PI) / 5, 1, 1, 100.0);


// 📇 Index Buffer Data
const indices = new Uint16Array([0, 1, 2]);


var _renderer = null;
export default class Renderer {
    canvas: HTMLCanvasElement;

    // ⚙️ API Data Structures
    adapter: GPUAdapter;
    device: GPUDevice;
    queue: GPUQueue;

    // 🎞️ Frame Backings
    context: GPUCanvasContext;
    colorTexture: GPUTexture;
    colorTextureView: GPUTextureView;
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    // 🔺 Resources
    positionBuffer: GPUBuffer;
    uniformBuffer: GPUBuffer;
    //colorBuffer: GPUBuffer;
    //indexBuffer: GPUBuffer;
    vertModule: GPUShaderModule;
    fragModule: GPUShaderModule;
    pipeline: GPURenderPipeline;

    commandEncoder: GPUCommandEncoder;
    passEncoder: GPURenderPassEncoder;

    uniformBindGroup: GPUBindGroup;
    //uniformBindGroup2: GPUBindGroup;
    camera: ArcballCamera;
    inputHandler: InputHandler;
    constructor(canvas, camera) {
        this.canvas = canvas;
        this.camera = camera;
        _renderer = this;
        //this.inputHandler = new InputHandler(canvas, camera);
    }

    // 🏎️ Start the rendering engine
    async start() {
      

        var frameId = 0;

        // Register mouse and touch listeners
        var controller = new Controller();
        this.setupController(controller);
        if (await this.initializeAPI()) {
            this.resizeBackings();
            await this.initializeResources();
            this.render();
        }
    }

    // 🌟 Initialize WebGPU
    async initializeAPI(): Promise<boolean> {
        try {
            // 🏭 Entry to WebGPU
            const entry: GPU = navigator.gpu;
            if (!entry) {
                return false;
            }

            // 🔌 Physical Device Adapter
            this.adapter = await entry.requestAdapter();

            // 💻 Logical Device
            this.device = await this.adapter.requestDevice();

            // 📦 Queue
            this.queue = this.device.queue;
        } catch (e) {
            console.error(e);
            return false;
        }

        return true;
    }

    // 🍱 Initialize resources to render triangle (buffers, shaders, pipeline)
    async initializeResources() {
        // 🔺 Buffers
        const createBuffer = (
            arr: Float32Array | Uint16Array,
            usage: number
        ) => {
            // 📏 Align to 4 bytes (thanks @chrimsonite)
            let desc = {
                size: (arr.byteLength + 3) & ~3,
                usage,
                mappedAtCreation: true
            };
            let buffer = this.device.createBuffer(desc);
            const writeArray =
                arr instanceof Uint16Array
                    ? new Uint16Array(buffer.getMappedRange())
                    : new Float32Array(buffer.getMappedRange());
            writeArray.set(arr);
            buffer.unmap();
            return buffer;
        };

        // Create a vertex buffer from the cube/mesh data.
        this.positionBuffer =  this.device.createBuffer({
            size: cubeVertexArray.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Float32Array(this.positionBuffer.getMappedRange()).set(cubeVertexArray);
        this.positionBuffer.unmap();


        //----------------------------------------------------------------------//
        //this.colorBuffer = createBuffer(colors, GPUBufferUsage.VERTEX);
        //this.indexBuffer = createBuffer(indices, GPUBufferUsage.INDEX);
        //----------------------------------------------------------------------//


        // 🖍️ Shaders
        const vsmDesc = {
            code: basicVertWGSL
        };
        this.vertModule = this.device.createShaderModule(vsmDesc);

        const fsmDesc = {
            code: vertexPositionColorWGSL
        };
        this.fragModule = this.device.createShaderModule(fsmDesc);

        // ⚗️ Graphics Pipeline

        // 🔣 Input Assembly

        //position asttribute
        const positionAttribDesc: GPUVertexAttribute = {
            shaderLocation: 0, // [[location(0)]]
            offset: cubePositionOffset,
            format: 'float32x4'
        };
        const UVAttribDesc: GPUVertexAttribute = {
            shaderLocation: 1, // [[location(1)]]
            offset: cubeUVOffset,
            format: 'float32x2'
        };
        const positionBufferDesc: GPUVertexBufferLayout = {
            attributes: [positionAttribDesc, UVAttribDesc],
            arrayStride: cubeVertexSize, // sizeof(float) * 10
            stepMode: 'vertex'
        };
        // const colorBufferDesc: GPUVertexBufferLayout = {
        //     attributes: [colorAttribDesc],
        //     arrayStride: 4 * 3, // sizeof(float) * 3
        //     stepMode: 'vertex'
        // };

        // 🌑 Depth
        const depthStencil: GPUDepthStencilState = {
            depthWriteEnabled: true,
            depthCompare: 'less',
            format: 'depth24plus-stencil8'
        };

        // 🦄 Uniform Data
        //const pipelineLayoutDesc = { bindGroupLayouts: [] };
        //const layout = this.device.createPipelineLayout(pipelineLayoutDesc);

        const layout = 'auto';
        // 🎭 Shader Stages
        const vertex: GPUVertexState = {
            module: this.vertModule,
            entryPoint: 'main',
            buffers: [positionBufferDesc]
        };

        // 🌀 Color/Blend State
        // const colorState: GPUColorTargetState = {
        //     format: 'bgra8unorm'
        // };

        const fragment: GPUFragmentState = {
            module: this.fragModule,
            entryPoint: 'main',
            targets: [
                {
                  format: presentationFormat,
                },
              ],
        };

        // 🟨 Rasterization
        const primitive: GPUPrimitiveState = {
            //frontFace: 'cw',
            cullMode: 'back',
            topology: 'triangle-list'
        };

        const pipelineDesc: GPURenderPipelineDescriptor = {
            layout,

            vertex,
            fragment,

            primitive,
            depthStencil
        };

        //finish pipeline creation
        this.pipeline = this.device.createRenderPipeline(pipelineDesc);

        const uniformBufferSize = 4 * 16; // 4x4 matrix
        this.uniformBuffer = this.device.createBuffer({
            size: uniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.uniformBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
              {
                binding: 0,
                resource: {
                  buffer: this.uniformBuffer,
                },
              },
            ],
          });

        //   this.uniformBindGroup2 = this.device.createBindGroup({
        //     layout: this.pipeline.getBindGroupLayout(0),
        //     entries: [
        //       {
        //         binding: 0,
        //         resource: {
        //           buffer: this.uniformBuffer,
        //         },
        //       },
        //     ],
        //   });
    }

    // ↙️ Resize swapchain, frame buffer attachments
    resizeBackings() {
        // ⛓️ Swapchain
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
           // dimension: '2d',
            format: 'depth24plus-stencil8',
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        };

        this.depthTexture = this.device.createTexture(depthTextureDesc);
        this.depthTextureView = this.depthTexture.createView();
    }

    // ✍️ Write commands to send to the GPU
    encodeCommands() {
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

        // 🖌️ Encode drawing commands
        this.passEncoder = this.commandEncoder.beginRenderPass(renderPassDesc);
        this.passEncoder.setPipeline(this.pipeline);
        // this.passEncoder.setViewport(
        //     0,
        //     0,
        //     this.canvas.width,
        //     this.canvas.height,
        //     0,
        //     1
        // );
        // this.passEncoder.setScissorRect(
        //     0,
        //     0,
        //     this.canvas.width,
        //     this.canvas.height
        // );
        this.passEncoder.setBindGroup(0, this.uniformBindGroup);
        this.passEncoder.setVertexBuffer(0, this.positionBuffer);
        //this.passEncoder.setVertexBuffer(1, this.colorBuffer);
        //this.passEncoder.setIndexBuffer(this.indexBuffer, 'uint16');
       // this.passEncoder.drawIndexed(3, 1);
        this.passEncoder.draw(cubeVertexCount, 1, 0, 0);
        this.passEncoder.end();

        this.queue.submit([this.commandEncoder.finish()]);
    }

    

    render = () => {

        
        const transformationMatrix = this.getTransformationMatrix();
        
        this.device.queue.writeBuffer(
            this.uniformBuffer,
            0,
            transformationMatrix.buffer,
            transformationMatrix.byteOffset,
            transformationMatrix.byteLength
          );
        
        // ⏭ Acquire next image from context
        this.colorTexture = this.context.getCurrentTexture();
        this.colorTextureView = this.colorTexture.createView();

        // 📦 Write and submit commands to queue
        this.encodeCommands();

        // ➿ Refresh canvas
        requestAnimationFrame(this.render);
    };

    getTransformationMatrix() {
        // const viewMatrix = mat4.create();
        // mat4.translate(viewMatrix, viewMatrix, vec3.fromValues(0, 0, -4));
        // const now = Date.now() / 1000;+
        // mat4.rotate(
        //   viewMatrix,
        //   viewMatrix,
        //   1,
        //   vec3.fromValues(Math.sin(now), Math.cos(now), 0)
        // );
    
        const modelViewProjectionMatrix = mat4.create();
        mat4.multiply(modelViewProjectionMatrix, projectionMatrix, this.camera.camera);
    
        return modelViewProjectionMatrix as Float32Array;
    }

    setupController(controller) {
        var frameId = 0;
        controller.mousemove = function(prev, cur, evt) {
            if (evt.buttons == 1) {
                frameId = 0;  
                console.log(this);                             
                _renderer.camera.rotate(prev, cur);
            } else if (evt.buttons == 2) {
                frameId = 0;
                _renderer.camera.pan([cur[0] - prev[0], prev[1] - cur[1]]);
            }
        };
        controller.wheel = function(amt) {
            frameId = 0;
            if(amt)
            _renderer.camera.zoom(amt);
        };
        controller.pinch = controller.wheel;
        controller.twoFingerDrag = function(drag) {
            frameId = 0;
            _renderer.camera.pan(drag);
        };
        controller.registerForCanvas(_renderer.canvas);
    }
}