 struct Joint 
 {
    translate : vec3<f32>,
    rotate : vec3<f32>,
    scale : vec3<f32>,

    children1 : vec4<f32>,
    children2 : vec4<f32>,
    // children : array<f32>
};

struct Joints {
  joints : array<Joint>,
}

struct Time {
    value : f32
}


//model transformation matrix
@group(0) @binding(0) var<storage, read_write> transform : array<mat4x4<f32>>;
@group(0) @binding(1) var<storage> time: Time;
//skeleton information
@group(1) @binding(0) var<storage> rootIndices: array<f32>;
@group(1) @binding(1) var<storage> data: Joints;


@compute @workgroup_size(1)
fn simulate(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
    var m = transform[0];
    //column major
    m[3][0] = m[3][0] + time.value;
    transform[0] = m; 
    
  }
