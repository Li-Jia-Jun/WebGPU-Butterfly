 struct Camera 
 {
    projection : mat4x4<f32>,
    view : mat4x4<f32>,
    position : vec3<f32>,
    time : f32,
};


// Constant BindGroup
// @group(0) @binding(0) var<uniform> jointInfo: vec4<f32>;                    // [0] = hasJoint, [1] = jointNum
// @group(0) @binding(1) var<storage> inverseBindMatrics: array<mat4x4<f32>>;  // size = jointNum

// // Frame BindGroup
@group(1) @binding(0) var<uniform> camera : Camera;
@group(1) @binding(1) var<storage> instanceMatrics : array<mat4x4<f32>>;

// Node BindGroup
@group(2) @binding(0) var<uniform> modelMatrix : mat4x4<f32>; // Node matrix in GLTF (local position)



struct VertexInput 
{
    @location(0) position : vec3<f32>,
    @location(1) normal : vec3<f32>,

   @location(4) texcoord : vec2<f32>,
};

struct VertexOutput 
{
    @builtin(position) position : vec4<f32>,
    @location(0) normal : vec3<f32>,
   @location(1) texcoord: vec2<f32>,
    @location(2) viewDir: vec3<f32>,
    @location(3) worldPos: vec3<f32>,
};


@vertex
fn vertexMain(input : VertexInput, @builtin(instance_index) instance : u32) -> VertexOutput
{
    var output : VertexOutput;

    var modelPos = modelMatrix * vec4(input.position, 1.0);
    var worldPos = instanceMatrics[instance] * modelPos;
    output.worldPos = vec3<f32>(worldPos[0],worldPos[1],worldPos[2]);
    output.position = camera.projection * camera.view * worldPos;
    output.normal = normalize((camera.view * instanceMatrics[instance] * modelMatrix * vec4(input.normal, 0.0)).xyz);
    output.texcoord = input.texcoord;
    output.viewDir = normalize(camera.position.xyz - worldPos.xyz);
    
    return output;
}

