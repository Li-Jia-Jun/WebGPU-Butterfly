//import Renderer from './renderer';
//import Renderer from './instancedrenderer';
import Renderer from './singlecuberenderer';
import { mat4, vec3 } from 'gl-matrix';
import{ArcballCamera} from 'arcball_camera';
import InputHandler from './input';

const canvas = document.getElementById('gfx') as HTMLCanvasElement;
canvas.width = canvas.height = 640;

//camera parameters
var eye = vec3.set(vec3.create(), 0, -1, 5);
var center = vec3.set(vec3.create(), 0, -1, -4);
var up = vec3.set(vec3.create(), 0, 1, 0);
var screenDim = vec3.set(vec3.create(), canvas.width, canvas.height, 0);
var speed = 0.5;


var camera = new ArcballCamera(eye, center, up, speed, screenDim);
const renderer = new Renderer(canvas, camera);

renderer.start();
