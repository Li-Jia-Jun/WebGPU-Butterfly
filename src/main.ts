import GLTFGroup from './gltf_group';
import GltfRenderer from './gltf_renderer';
const Stats = require('stats-js');


import butterflyVertShader from './shaders/gltf.vert.wgsl';
import butterflyFragShader from './shaders/gltf.frag.wgsl';

import sceneVertShader from './shaders/gltf_scene.vert.wgsl';
import sceneFragShader from './shaders/gltf_scene.frag.wgsl';

import OrbitCamera from './orbit_camera';
import FlyingCamera  from './flying_camera';
import { mat4 } from 'gl-matrix';
import * as DAT from 'dat.gui';
import { stripVTControlCharacters } from 'util';



export default class Application 
{
    renderer_butterfly : GltfRenderer;
    gltf_butterfly : GLTFGroup;
    willRefreshButterfly : boolean;

    renderer_scene: GltfRenderer;
    gltf_scene: GLTFGroup;

    renderer_figure : GltfRenderer;
    gltf_figure : GLTFGroup;

    canvas : HTMLCanvasElement;
    context : GPUCanvasContext;
    //camera : OrbitCamera;
    camera: FlyingCamera;

    fov : number = Math.PI * 0.5;
    zNear : number = 0.001;
    zFar : number = 1000000;

    #camPosDisplay : HTMLParagraphElement;

    // WebGPU stuff
    adapter : GPUAdapter;
    device : GPUDevice;
    queue: GPUQueue;

    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;

    time : number;      // the application running time in seconds

    canRun : boolean;

    stats = Stats();


    // GUI
    controls = {
        instance_num: 1,
        'Enable Procedural Color': this.enableProcedural,
        frequency: 1,
        amplitude: 1,
        air_density: 1,
        phase_angle: 0,
    };

    enableProcedural()
    {
        console.log(this);
        if (this.renderer_butterfly.procedural == 0)
        {
            this.renderer_butterfly.procedural = 1;
        }
        else 
        {
            this.renderer_butterfly.procedural = 0;
        }
        console.log(this.renderer_butterfly.procedural);
    }
    constructor(){}

    async start()
    {

        this.stats.setMode(0);
        this.stats.domElement.style.position = 'absolute';
        this.stats.domElement.style.left = '0px';
        this.stats.domElement.style.top = '0px';
        document.body.appendChild(this.stats.domElement);

        this.canRun = await this.initializeWebGPU();

        if(this.canRun)
        {
            // GUI
            const gui = new DAT.GUI();
            gui.width = 300;
            gui.add(this.controls, 'instance_num', 1, 500).step(1).name('Number of Butterflies')
            .onChange(() => {
                this.onInstanceChanged();
            });
            gui.add(this.controls,'Enable Procedural Color' );
            var forceGUI = gui.addFolder('Force');
            forceGUI.add(this.controls,'frequency', 0, 1).step(0.01);
            forceGUI.add(this.controls,'amplitude', 0, 4).step(1);
            forceGUI.add(this.controls,'air_density',0, 2 ).step(0.1);
            forceGUI.add(this.controls,'phase_angle',0, 360).step(1);

            // HTML stuff
            this.canvas = document.getElementById('gfx') as HTMLCanvasElement;
            this.canvas.width = 1920; 
            this.canvas.height = 1080;
            this.#camPosDisplay = document.getElementById("camera_pos") as HTMLParagraphElement;
            this.resizeBackings();

            // Camera
            this.camera = new FlyingCamera(this.canvas, () => {});

            // Butterfly
            await this.initButterfly();        
            await this.initScene();

            this.run(0);
        }
    }

    getButterflyPos(num: number, idx: number, scale: number)
    {
        let cubeVal = Math.ceil(Math.cbrt(num)) + 0.5;
        let invCubeVal = 1.0 / cubeVal;
        let x = idx % (cubeVal - 1);
        let y = (idx / (cubeVal - 1) )% (cubeVal - 1);
        let z = idx / ((cubeVal-1) * (cubeVal - 1));
        let newTrans = [x + Math.random() * invCubeVal * scale, y + Math.random() * invCubeVal * scale, z + Math.random() * invCubeVal * scale]; 
        return newTrans;
    }

    onInstanceChanged()
    {
        if(this.gltf_butterfly == undefined || this.renderer_butterfly == undefined)
        {
            return;
        }

        let s : number = 1.5;
        let instance_name = [];
        let instance_trans = [];
        for (let i=1; i<=this.controls.instance_num;++i)
        {
            let newName = ("b"+(i+1).toString());
            instance_name.push(newName);
            let even = (i % 2 == 0);
            let newTrans = this.getButterflyPos(this.controls.instance_num, i, s);
            let newMat =  [s,0,0,0,  0,s,0,0,  0,0,s,0, s * 5 * newTrans[0], s *  5  * newTrans[1],s * 5 * newTrans[2],1]
            instance_trans.push(newMat);
        }

        this.gltf_butterfly.refreshInstance(this.controls.instance_num, instance_name, instance_trans);
        this.renderer_butterfly.refreshInstance();
    }
    
    async initScene()
    {
        // const t = [0, -10, 0];
        // const s = 0.08;
        const t = [0, 0, 0];
        const s = 0.5;

        this.gltf_scene = new GLTFGroup();
        await this.gltf_scene.init(
            'https://raw.githubusercontent.com/Li-Jia-Jun/WebGPU-Butterfly/main/models/forest/scene.gltf',
            // 'https://raw.githubusercontent.com/Li-Jia-Jun/WebGPU-Butterfly/main/models/forest_diorama/scene3.gltf',
            // 'https://raw.githubusercontent.com/Li-Jia-Jun/WebGPU-Butterfly/main/models/trees_and_foliage/scene2.gltf',        
            1,
            ['Scene'],
            [mat4.fromValues(s,0,0,0, 0,s,0,0, 0,0,s,0, t[0],t[1],t[2],1)]);

        const vertShader = this.device.createShaderModule({
            label: 'Scene Vert Shader',
            code: sceneVertShader
        });
        const fragShader = this.device.createShaderModule({
            label: 'Scene Frag Shader',
            code: sceneFragShader
        });

        this.renderer_scene= new GltfRenderer();
        await this.renderer_scene.init(this.adapter, this.device, this.queue, this.canvas, this.context, this.gltf_scene, this.depthTexture, this.depthTextureView, 
            vertShader, fragShader, false);
    }

    async initButterfly()
    {
        this.willRefreshButterfly = false;

        // Rigged Buffterfly (first renderer)
        let s : number = 1;
        this.gltf_butterfly = new GLTFGroup();  

        // create instancing name list and transform list
        let instance_name = [];
        let instance_trans = [];
        for (let i=1; i<=this.controls.instance_num;++i)
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

        // shader module
        const vertShader = this.device.createShaderModule({
            label: 'Butterfly Vert Shader',
            code: butterflyVertShader
        });
        const fragShader = this.device.createShaderModule({
            label: 'Butterfly Frag Shader',
            code: butterflyFragShader
        });

        await this.gltf_butterfly.init(
            'https://raw.githubusercontent.com/Li-Jia-Jun/WebGPU-Butterfly/main/models/butterfly/butterfly-new-skel.gltf',
            this.controls.instance_num,
            instance_name,
            instance_trans);
        
        this.renderer_butterfly = new GltfRenderer();
        await this.renderer_butterfly.init(this.adapter, this.device, this.queue, this.canvas, this.context, this.gltf_butterfly, 
            this.depthTexture, this.depthTextureView, vertShader, fragShader,
            true);
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

    updateFrameData(timestamp : number)
    {
        // Update time
        this.time = timestamp * 0.001;

        // Update Camera
        this.camera.frameCallback(timestamp);

        // Update camere in renderer 
        let projMat = mat4.create();
        const aspect = this.canvas.width / this.canvas.height;
        mat4.perspective(projMat, this.fov, aspect, this.zNear, this.zFar);
        
        // Update camera buffer for each renderer
        this.renderer_butterfly.updateCameraBuffer(projMat, this.camera.viewMatrix, this.camera.position, this.time);    
        this.renderer_scene.updateCameraBuffer(projMat, this.camera.viewMatrix, this.camera.position, this.time);   
    
    }

    updateDisplay()
    {
        // Camera Pos
        let pos = this.camera.position;
        this.#camPosDisplay.innerHTML = "Camera Position: [" + pos[0].toFixed(2) + ", " + pos[1].toFixed(2) + ", " + pos[2].toFixed(2) + "]";
    }

    run = (timestamp : number) =>
    {
        this.stats.begin();

        // Update data in each frame
        this.updateFrameData(timestamp);

        // Render
        this.renderer_butterfly.renderGLTF();  
        this.renderer_scene.renderGLTF();

        // Update HTML display
        this.updateDisplay();

        // Loop
        requestAnimationFrame(this.run);
        this.stats.end();
    }
}


const app = new Application();
app.start();

