var _inputHandler = null;

import{ArcballCamera} from 'arcball_camera'
export default class InputHandler {
    /**
     * Initializes the event handeling functions within the program.
     */
    canvas: HTMLCanvasElement;
    camera: ArcballCamera;
    constructor(canvas, camera) {
      this.canvas = canvas;
      //this.scene  = scene;
      this.camera = camera;

      _inputHandler = this;

      // Mouse Events
      this.canvas.onmousedown = function(ev) { _inputHandler.mouseClick(ev); };
    //  this.canvas.onmouseup = function(ev) { _inputHandler.mouseUp(); };
     // this.canvas.onmousemove = function(ev) { _inputHandler.mouseMove(ev) };

      // Keyboard Events
      document.addEventListener('keydown', function(ev) { _inputHandler.keyDown(ev); }, false);
      document.addEventListener('keyup',   function(ev) { _inputHandler.keyUp(ev);   }, false);
      document.addEventListener("wheel", function(ev) {_inputHandler.mouseWheel(ev)});
    
    }

    /**
     * Function called upon mouse click.
     */
    mouseClick(ev) {
        // Print x,y coordinates.
        console.log(ev.clientX, ev.clientY);
      
    }
    mouseMove(ev) {
        var movementX = ev.movementX;
        var movementY = ev.movementY;
      //  console.log("movementX", movementX);
          this.camera.pan(-movementX);
         // this.camera.tilt(-movementY);
        //console.log("movementY", movementY);
    }
    mouseWheel(ev){
      var dir = Math.sign(ev.deltaY);
      this.camera.zoom(dir);
    }

    keyUp(ev) {
        var keyName = ev.keyCode;
        console.log("key up", keyName);
    }

    keyDown(ev) {
        var keyName = ev.keyCode;
        console.log("key down", keyName);
      //  console.log("eye: ",_inputHandler.camera.eye.elements[0],_inputHandler.camera.eye.elements[1],_inputHandler.camera.eye.elements[2])

        switch(keyName){
            // case "a" :
            //     this.camera.truck(-1);
            //     break;
            // case "d" :
            //     this.camera.truck(1);
            //     break;
            case "w" :
              this.camera.zoom(-10);
              break;
            case "s" :
              this.camera.zoom(10);
              break;

        }
        
    }
}


