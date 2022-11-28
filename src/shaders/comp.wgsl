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
    m[3][0] = m[3][0] + 0.01; 
    
    var testJoint = jointTransforms[5];
    testJoint[2][1] = testJoint[2][1] + 0.5;
    //testJoint[1][0] = testJoint[1][0] + 0.05;


    //output joint transformation matrix
    jointTransforms[0] = testJoint;


    //output model matrix of the butterfly
    transform[0] = m; 
    
  }
