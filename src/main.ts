// import Renderer from './renderer';
// const canvas = document.getElementById('gfx') as HTMLCanvasElement;
// canvas.width = canvas.height = 640;
// const renderer = new Renderer(canvas);
// renderer.start();



import GltfRenderer from './gltf_renderer';
import OrbitCamera from './orbit_camera';
import { mat4 } from 'gl-matrix';

export default class Application 
{
    canvas : HTMLCanvasElement;
    camera : OrbitCamera;
    renderer : GltfRenderer;

    fov : number = Math.PI * 0.5;
    zNear : number = 0.001;
    zFar : number = 100;

    #camPosDisplay : HTMLParagraphElement;


    constructor()
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

        // Renderer
        this.renderer = new GltfRenderer("", this.canvas);
    }

    async start()
    {
        let canRun = true;
        if(await this.renderer.start() == false)
        {
            canRun = false;
        } 

        if(canRun)
        {
            this.run();
        }
    }

    run()
    {
        this.updateFrame();
        this.renderer.renderGLTF();
    }

    updateFrame()
    {
        // Update renderer
        let projMat = mat4.create();
        const aspect = this.canvas.width / this.canvas.height;
        mat4.perspective(projMat, this.fov, aspect, this.zNear, this.zFar);
        this.renderer.updateFrameBuffer(projMat, this.camera.viewMatrix, this.camera.position, 0);
        
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