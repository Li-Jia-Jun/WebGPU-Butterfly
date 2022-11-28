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
//joint transformation matrix
@group(0) @binding(2) var<storage, read_write> jointTransforms: array<mat4x4<f32>>;

//skeleton information
@group(1) @binding(0) var<storage> rootIndices: array<f32>;
@group(1) @binding(1) var<storage> data: Joints;


@compute @workgroup_size(1)
fn simulate(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {

    //matrices are all column major !!!

    // the only butterfly model matrix
    var m = transform[0];

    //test joint data
    var a = data.joints[5].rotate.z;

    //use translation along x to test any value
    //m[3][0] = m[3][0] + 0.01; 
    
    var joint9 = jointTransforms[8];
    var joint19 = jointTransforms[19];

    //var rotZ = mat4x4<f32>(vec4<f32>(0.5253, 0.5253, 0, 0), vec4<f32>(-0.5253, 0.5253, 0, 0), vec4<f32>(0, 0, 1, 0), vec4<f32>(0, 0, 0, 1));

    var angle = -1.5 * cos(time.value / 1000000);
    var rotZ = mat4x4<f32>(vec4<f32>(cos(angle), sin(angle), 0, 0), vec4<f32>( -sin(angle), cos(angle), 0, 0), vec4<f32>(0, 0, 1, 0), vec4<f32>(0, 0, 0, 1));
    joint9 = rotZ * joint9;

    angle = 1.5 * cos(time.value / 1000000);
    rotZ = mat4x4<f32>(vec4<f32>(cos(angle), sin(angle), 0, 0), vec4<f32>( -sin(angle), cos(angle), 0, 0), vec4<f32>(0, 0, 1, 0), vec4<f32>(0, 0, 0, 1));
    joint19 = rotZ * joint19;

    //output joint transformation matrix
    jointTransforms[8] = joint9;
    jointTransforms[19] = joint19;


    //output model matrix of the butterfly
    transform[0] = m; 
    
  }
