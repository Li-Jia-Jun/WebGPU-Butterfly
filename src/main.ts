// import Renderer from './renderer';
// const canvas = document.getElementById('gfx') as HTMLCanvasElement;
// canvas.width = canvas.height = 640;
// const renderer = new Renderer(canvas);
// renderer.start();


import GLTFGroup from './gltf_group';
import GltfRenderer from './gltf_renderer';

import OrbitCamera from './orbit_camera';
import FlyingCamera  from './flying_camera';
import { mat4 } from 'gl-matrix';
import * as DAT from 'dat.gui';

const controls = {
    instance_num: 10,
    frequency: 1,
    amplitude: 1,
    air_density: 1,
    phase_angle: 0,
};

export default class Application 
{
    renderer_butterfly : GltfRenderer;
    gltf_butterfly : GLTFGroup;

    renderer_figure : GltfRenderer;
    gltf_figure : GLTFGroup;

    canvas : HTMLCanvasElement;
    context : GPUCanvasContext;
    //camera : OrbitCamera;
    camera: FlyingCamera;

    fov : number = Math.PI * 0.5;
    zNear : number = 0.001;
    zFar : number = 100;

    #camPosDisplay : HTMLParagraphElement;

    // WebGPU stuff
    adapter : GPUAdapter;
    device : GPUDevice;
    queue: GPUQueue;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    canRun : boolean;

    constructor(){}

    async start()
    {
        this.canRun = await this.initializeWebGPU();

        if(this.canRun)
        {
            // GUI
            const gui = new DAT.GUI();
            gui.width = 300;
            gui.add(controls, 'instance_num', 1, 100).step(1).name('Number of Butterflies')
            .onChange(function(){
                // TODO: update buffer
            });
            var forceGUI = gui.addFolder('Force');
            forceGUI.add(controls,'frequency', 0, 1).step(0.01);
            forceGUI.add(controls,'amplitude', 0, 4).step(1);
            forceGUI.add(controls,'air_density',0, 2 ).step(0.1);
            forceGUI.add(controls,'phase_angle',0, 360).step(1);

            // HTML stuff
            this.canvas = document.getElementById('gfx') as HTMLCanvasElement;
            this.canvas.width = this.canvas.height = 800;
            this.#camPosDisplay = document.getElementById("camera_pos") as HTMLParagraphElement;
            this.resizeBackings();

            // Camera
            //this.camera = new OrbitCamera(this.canvas, () => {this.updateFrame();});
            this.camera = new FlyingCamera(this.canvas, () => {this.updateFrame();});
            // this.camera.target = [0, 0, 0];
            // this.camera.maxDistance = 100;
            // this.camera.minDistance = 0.001;
            // this.camera.distance = 10;

            // Rigged Buffterfly (first renderer)
            let s : number = 1.5;
            this.gltf_butterfly = new GLTFGroup();

            // create instancing name list and transform list
            let instance_name = [];
            let instance_trans = [];
            for (let i=1; i<=controls.instance_num;++i)
            {
                let newName = ("b"+(i+1).toString());
                instance_name.push(newName);
                let even = (i % 2 == 0);
                let newTrans = [];
                if (even)
                {
                    newTrans = [s,0,0,0,  0,s,0,0,  0,0,s,0,  0 - 4 * i,0,0,1];
                }
                else
                {
                    newTrans = [s,0,0,0,  0,s,0,0,  0,0,s,0,  4 * i,0,0,1];
                }
                instance_trans.push(newTrans);
            }

            await this.gltf_butterfly.init(
                'https://raw.githubusercontent.com/Li-Jia-Jun/WebGPU-Butterfly/main/models/butterfly/butterfly-done.gltf',
                controls.instance_num,
                instance_name,
                instance_trans);
            this.renderer_butterfly = new GltfRenderer();
            await this.renderer_butterfly.init(this.adapter, this.device, this.queue, this.canvas, this.context, this.gltf_butterfly, this.depthTexture, this.depthTextureView, true);

            // Rigged Figure
            let s2 : number = 3.0;
            this.gltf_figure = new GLTFGroup();
            await this.gltf_figure.init(
                'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/RiggedFigure/glTF/RiggedFigure.gltf',
                1,
                ["f1"],
                [[s2,0,0,0,  0,s2,0,0,  0,0,s2,0,  0,0,0,1]]);   
            this.renderer_figure = new GltfRenderer();
            await this.renderer_figure.init(this.adapter, this.device, this.queue, this.canvas, this.context, this.gltf_figure, this.depthTexture, this.depthTextureView);

            this.run();
        }
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

    run()
    {
        this.camera.canRefresh = true;

        this.updateFrame();
        
        this.renderer_butterfly.updateInstanceBuffer();
        this.renderer_butterfly.renderGLTF();  

        this.renderer_figure.updateInstanceBuffer();
        this.renderer_figure.renderGLTF();  

        
    }

    updateFrame()
    {
        //if(this.renderer_butterfly == undefined) return;

        // Update Camera
        let projMat = mat4.create();
        const aspect = this.canvas.width / this.canvas.height;
        mat4.perspective(projMat, this.fov, aspect, this.zNear, this.zFar);
        
        // Update camera buffer for each renderer
        this.renderer_butterfly.updateCameraBuffer(projMat, this.camera.viewMatrix, this.camera.position, 0);    
        this.renderer_figure.updateCameraBuffer(projMat, this.camera.viewMatrix, this.camera.position, 0);

        this.updateDisplay();
    }

    updateDisplay()
    {
        // Camera Pos
        let pos = this.camera.position;
        this.#camPosDisplay.innerHTML = "Camera Position: [" + pos[0].toFixed(2) + ", " + pos[1].toFixed(2) + ", " + pos[2].toFixed(2) + "]";
    }
}


const app = new Application();
app.start();