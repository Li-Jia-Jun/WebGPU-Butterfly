 struct Camera 
 {
    projection : mat4x4<f32>,
    view : mat4x4<f32>,
    position : vec3<f32>,
    time : f32,
};


// Constant BindGroup
@group(0) @binding(0) var<uniform> jointInfo: vec4<f32>;                    // [0] = hasJoint, [1] = jointNum
@group(0) @binding(1) var<storage> inverseBindMatrics: array<mat4x4<f32>>;  // size = jointNum

// Frame BindGroup
@group(1) @binding(0) var<uniform> camera : Camera;
@group(1) @binding(1) var<storage> instanceMatrics : array<mat4x4<f32>>;
@group(1) @binding(2) var<storage> jointTransforms: array<mat4x4<f32>>;     // size = jointNum * instanceNum

// Node BindGroup
@group(2) @binding(0) var<uniform> modelMatrix : mat4x4<f32>; // Node matrix in GLTF (local position)



struct VertexInput 
{
    @location(0) position : vec3<f32>,
    @location(1) normal : vec3<f32>,


    // Joints
    @location(2) joints: vec4<u32>,
    @location(3) jointweights: vec4<f32>,

    @location(4) texcoord : vec2<f32>,
};

struct VertexOutput 
{
    @builtin(position) position : vec4<f32>,
    @location(0) normal : vec3<f32>,
    @location(1) texcoord: vec2<f32>,
    @location(2) viewDir: vec3<f32>,
    @location(3) instance: f32,
};


@vertex
fn vertexMain(input : VertexInput, @builtin(instance_index) instance : u32) -> VertexOutput
{
    var output : VertexOutput;

    var modelPos = modelMatrix * vec4(input.position, 1.0);

    var hasJoint = bool(jointInfo[0]);
    if(hasJoint)
    {
        var jointNum = u32(jointInfo[1]);
        var jointMatrix = input.jointweights[0] * jointTransforms[jointNum * instance + input.joints[0]] * inverseBindMatrics[input.joints[0]];
        jointMatrix += input.jointweights[1] * jointTransforms[jointNum * instance + input.joints[1]] * inverseBindMatrics[input.joints[1]];
        jointMatrix += input.jointweights[2] * jointTransforms[jointNum * instance + input.joints[2]] * inverseBindMatrics[input.joints[2]];
        jointMatrix += input.jointweights[3] * jointTransforms[jointNum * instance + input.joints[3]] * inverseBindMatrics[input.joints[3]];

        // Skinned mesh vertex will only affected by joints so 'modelMatrix' is removed here
        modelPos = jointMatrix * vec4(input.position, 1.0);
        output.normal = normalize((camera.view * instanceMatrics[instance] * jointMatrix * vec4(input.normal, 0.0)).xyz);


    }
    else 
    {
        output.normal = normalize((camera.view * instanceMatrics[instance] * modelMatrix  * vec4(input.normal, 0.0)).xyz);
    }
        var worldPos = instanceMatrics[instance] * modelPos;
        output.position = camera.projection * camera.view * worldPos;
        output.texcoord = input.texcoord;

        output.viewDir = normalize(camera.position.xyz - worldPos.xyz);
        output.instance = f32(instance);
        return output;
}

