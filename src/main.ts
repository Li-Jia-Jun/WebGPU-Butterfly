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
    zNear : number = 0.01;
    zFar : number = 500;


    constructor()
    {
        // HTML stuff
        this.canvas = document.getElementById('gfx') as HTMLCanvasElement;
        this.canvas.width = this.canvas.height = 800;

        // Camera
        this.camera = new OrbitCamera();
        this.camera.target = [0, 0, 0];
        this.camera.maxDistance = 500;
        this.camera.minDistance = 0.1;
        this.camera.distance = 150;

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
        console.log("camera pos = " + this.camera.position);

        // Update renderer
        let projMat = mat4.create();
        const aspect = this.canvas.width / this.canvas.height;
        mat4.perspective(projMat, this.fov, aspect, this.zNear, this.zFar);
        this.renderer.updateFrameBuffer(projMat, this.camera.viewMatrix, this.camera.position, 0);
    }
}


const app = new Application();
app.start();