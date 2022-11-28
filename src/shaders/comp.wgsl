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

fn updateJointTransform(jointIndex : u32, parentTransform : mat4x4<f32>)
{
 
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

    var j_9 = data.joints[8];
    j_9.rotate = j_9.rotate + vec3(0, 0, 45 * 0.001);

    // Update skeleton
    for(var i = 0; i < 5; i++) 
    {
      var rootIndex = rootIndices[i];

      if(rootIndex < 0)
      break;

   var joint = data.joints[rootIndex];
    var jointTransform = trsToMatrix(joint.translate, joint.rotate, joint.scale);

    jointTransform = parentTransform * jointTransform;

    // Update current transform
    jointTransforms[jointIndex] = jointTransform;

    // Update children
    for(var i = 0; i < 8; i++)
    {
      if(i < 4)
      {
        if(joint.children1[i] >= 0)
        {
          updateJointTransform(joint.children1[i], jointTransform);
        }
        else
        {
          break;
        }
      }
      else
      {
        if(joint.children2[i-4] >= 0)
        {
          updateJointTransform(joint.children2[i-4], jointTransform);
        }
        else
        {
          break;
        }
      } 
    }
    }

    //m[3][1] = m[3][1] + 0.01;

    //output model matrix of the butterfly
    transform[0] = m; 
    
  }


