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






fn Rotation4D(axis : vec3<f32>, angleRad : f32) -> mat4x4<f32> {
    var c = cos(angleRad);
    var s = sin(angleRad);
    var t = 1.0 - c;

    

    var _axis = normalize(axis);
    // row major to column major
    return transpose(mat4x4<f32>(vec4<f32>(t * _axis.x * _axis.x + c, t * _axis.x * _axis.y - s * _axis.z,  t * _axis.x * _axis.z + s * _axis.y, 0), 
                                 vec4<f32>(t * _axis.x * _axis.y + s * _axis.z , t * _axis.y * _axis.y + c,  t * _axis.y * _axis.z - s * _axis.x, 0),
                                 vec4<f32>(t * _axis.x * _axis.z - s * _axis.y , t * _axis.y * _axis.z + s * _axis.x,  t * _axis.z * _axis.z + c, 0),
                                 vec4<f32>(0 ,0 ,0 ,1)
                                 ));
    
}

// {
// 	double c = cos(angleRad), s = sin(angleRad), t = 1.0f - c;
// 	vec3 Axis = axis;
// 	Axis.Normalize();
// 	return mat3(vec3(t * Axis[VX] * Axis[VX] + c,
// 		t * Axis[VX] * Axis[VY] - s * Axis[VZ],
// 		t * Axis[VX] * Axis[VZ] + s * Axis[VY]),
// 		vec3(t * Axis[VX] * Axis[VY] + s * Axis[VZ],
// 		t * Axis[VY] * Axis[VY] + c,
// 		t * Axis[VY] * Axis[VZ] - s * Axis[VX]),
// 		vec3(t * Axis[VX] * Axis[VZ] - s * Axis[VY],
// 		t * Axis[VY] * Axis[VZ] + s * Axis[VX],
// 		t * Axis[VZ] * Axis[VZ] + c)
// 		);
// }

fn trsToMatrix(translate : vec3<f32> , rotate : vec3<f32>, scale : vec3<f32>) -> mat4x4<f32> {
    var axisX = vec3<f32>(1.0, 0.0, 0.0);
    var axisY = vec3<f32>(0.0, 1.0, 0.0);
    var axisZ = vec3<f32>(0.0, 0.0, 1.0);
    var t = mat4x4<f32>(vec4<f32>(1, 0, 0, 0), vec4<f32>( 0, 1, 0, 0), vec4<f32>(0, 0, 1, 0), vec4<f32>(translate.x, translate.y, translate.z, 1));
    var r = Rotation4D(axisZ, radians(rotate.z)) * Rotation4D(axisY, radians(rotate.y)) * Rotation4D(axisX, radians(rotate.x));
    var s = mat4x4<f32>(vec4<f32>(scale.x, 0, 0, 0), vec4<f32>( 0, scale.y, 0, 0), vec4<f32>(0, 0, scale.z, 0), vec4<f32>(0, 0, 0, 1));
    return t * r * s;
}

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

    // for(var i = 0; i < 30; i++) {

    // }

    //output joint transformation matrix
    jointTransforms[8] = joint9;
    jointTransforms[19] = joint19;

    //m[3][1] = m[3][1] + 0.01;

    //output model matrix of the butterfly
    transform[0] = m; 
    
  }


