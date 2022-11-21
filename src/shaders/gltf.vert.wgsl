 struct Camera 
 {
    projection : mat4x4<f32>,
    view : mat4x4<f32>,
    position : vec3<f32>,
    time : f32,
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(1) @binding(0) var<uniform> modelMatrix : mat4x4<f32>;
@group(2) @binding(0) var<storage> instanceMatrics : array<mat4x4<f32>>;

struct VertexInput 
{
    @location(0) position : vec3<f32>,
    @location(1) normal : vec3<f32>,
};

struct VertexOutput 
{
    @builtin(position) position : vec4<f32>,
    @location(0) normal : vec3<f32>,
};

@vertex
fn vertexMain(input : VertexInput, @builtin(instance_index) instance : u32) -> VertexOutput
{
    var output : VertexOutput;
    var model = instanceMatrics[instance] * modelMatrix;
    output.position = camera.projection * camera.view * model * vec4(input.position, 1.0);
    output.normal = normalize((camera.view * model * vec4(input.normal, 0.0)).xyz);
    return output;
}

// @vertex
// fn vertexMain(input : VertexInput, @buildin(instance_index)) -> VertexOutput
// {
//     var output : VertexOutput;
//     output.position = camera.projection * camera.view * modelMatrices[instance_index] * vec4(input.position, 1.0);
//     output.normal = normalize((camera.view * modelMatrices[instance_index] * vec4(input.normal, 0.0)).xyz);
//     return output;
// }

