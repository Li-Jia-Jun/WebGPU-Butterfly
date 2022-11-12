//import Renderer from './renderer';
import Renderer from './instancedrenderer';
const canvas = document.getElementById('gfx') as HTMLCanvasElement;
canvas.width = canvas.height = 640;
const renderer = new Renderer(canvas);
renderer.start();
