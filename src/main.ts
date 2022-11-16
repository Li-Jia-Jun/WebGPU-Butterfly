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
    zFar : number = 10;


    constructor()
    {
        // HTML stuff
        this.canvas = document.getElementById('gfx') as HTMLCanvasElement;
        this.canvas.width = this.canvas.height = 800;

        // Camera
        this.camera = new OrbitCamera();
        this.camera.target = [0, 0, 0];
        this.camera.maxDistance = 10;
        this.camera.minDistance = 0.001;
        this.camera.distance = 3;

        this.canvas.addEventListener('click', ()=>{
            // console.log("click");
            this.camera.orbit(this.camera.orbitX + 0.01, this.camera.orbitY + 0.01);
            this.updateFrame();
            console.log("camera pos = " + this.camera.position);
        });

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
    }
}


const app = new Application();
app.start();