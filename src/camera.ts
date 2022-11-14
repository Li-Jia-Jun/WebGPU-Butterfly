import { timingSafeEqual } from "crypto";
import { mat4, vec3,toRadian } from 'gl-matrix';

export default class Camera {
    constructor() {
        this.eye;
        this.ref;
        this.look;
        this.up;
        this.right;
        this.world_up;
        this.V;
        this.H;

        this.fovy;
        this.width;
        this.height;
        this.nearClip;
        this.farClip;
        this.aspect;

    }

    getViewProj() {

        return mat4.perspective();
    }

}