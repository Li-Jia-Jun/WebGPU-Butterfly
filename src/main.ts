// import Renderer from './renderer';
// const canvas = document.getElementById('gfx') as HTMLCanvasElement;
// canvas.width = canvas.height = 640;
// const renderer = new Renderer(canvas);
// renderer.start();


import GLTFGroup from './gltf_group';
import GltfRenderer from './gltf_renderer';
import OrbitCamera from './orbit_camera';
import { mat4 } from 'gl-matrix';

export default class Application 
{
    renderer_butterfly : GltfRenderer;
    gltf_butterfly : GLTFGroup;

    canvas : HTMLCanvasElement;
    camera : OrbitCamera;

    fov : number = Math.PI * 0.5;
    zNear : number = 0.001;
    zFar : number = 100;

    #camPosDisplay : HTMLParagraphElement;

    // WebGPU stuff
    adapter : GPUAdapter;
    device : GPUDevice;
    queue: GPUQueue;

    canRun : boolean;

    constructor(){}

    async start()
    {
        this.canRun = await this.initializeWebGPU();
        if(this.canRun)
        {
            // HTML stuff
            this.canvas = document.getElementById('gfx') as HTMLCanvasElement;
            this.canvas.width = this.canvas.height = 800;
            this.#camPosDisplay = document.getElementById("camera_pos") as HTMLParagraphElement;

            // Camera
            this.camera = new OrbitCamera(this.canvas, () => {this.updateFrame();});
            this.camera.target = [0, 0, 0];
            this.camera.maxDistance = 100;
            this.camera.minDistance = 0.001;
            this.camera.distance = 10;

            // Butterfly
            let s : number = 0.01;
            this.gltf_butterfly = new GLTFGroup();
            // await this.gltf_butterfly.init(
            //     'https://raw.githubusercontent.com/Li-Jia-Jun/WebGPU-Butterfly/gltf/models/butterfly/butterfly.gltf',
            //     3,
            //     ["b1", "b2", "b3"],
            //     [[s,0,0,0,  0,s,0,0,  0,0,s,0,  3,0,0,1], [s,0,0,0,  0,s,0,0,  0,0,s,0,  -3,0,0,1], [s,0,0,0,  0,s,0,0,  0,0,s,0,  0,4.5,0,1]]);
            await this.gltf_butterfly.init('https://raw.githubusercontent.com/Li-Jia-Jun/WebGPU-Butterfly/gltf/models/butterfly/butterfly.gltf',1, ["b1"],[[s,0,0,0,  0,s,0,0,  0,0,s,0,  0,4.5,0,1] ]);
            this.renderer_butterfly = new GltfRenderer();
            await this.renderer_butterfly.init(this.adapter, this.device, this.queue, this.canvas, this.gltf_butterfly);

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

    run()
    {
        this.updateFrame();
        this.renderer_butterfly.updateInstanceBuffer();
        this.renderer_butterfly.renderGLTF();  
    }

    updateFrame()
    {
        // Update renderer
        let projMat = mat4.create();
        const aspect = this.canvas.width / this.canvas.height;
        mat4.perspective(projMat, this.fov, aspect, this.zNear, this.zFar);
        this.renderer_butterfly.updateFrameBuffer(projMat, this.camera.viewMatrix, this.camera.position, 0);    

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