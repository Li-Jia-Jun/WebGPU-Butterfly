 struct Joint 
 {
    translate : vec4<f32>,  
    rotate : vec4<f32>, // Euler angle in degree, the last element is not in used
    scale : vec4<f32>,

    children1 : vec4<f32>,
    children2 : vec4<f32>,
};

struct Joints {
  joints : array<Joint>,
}

// struct Velocity {
//   velocity: vec3<f32>
// }

struct Velocities {
  velocities:  array<vec3<f32>>
}

struct Time {
    value : f32,
}

struct SkeletonInfo
{
  jointNum     : f32,
  rootJointNum : f32,
  layerArrSize : f32,
  pedding      : f32, // Not in use for now

  armatrureTransform : mat4x4<f32>, 

  // The original joint position
  defaultPose : array<Joint>,
}

//model transformation matrix (The world position output)
@group(0) @binding(0) var<storage, read_write> transform : array<mat4x4<f32>>;
@group(0) @binding(1) var<uniform> time: Time;
//joint transformation matrix (The joint pose output)
@group(0) @binding(2) var<storage, read_write> jointTransforms: array<mat4x4<f32>>;
@group(0) @binding(3) var<storage, read_write> velocitiesData: array<vec3<f32>>;

//skeleton information
@group(1) @binding(0) var<storage> skeletonInfo: SkeletonInfo;
@group(1) @binding(1) var<storage> skRootIndices: array<i32>;  // Size == SkeletonInfo.rootJointNum
@group(1) @binding(2) var<storage> jtParentIndices: array<i32>;// Size == SkeletonInfo.jointNum
@group(1) @binding(3) var<storage> skLayerArray: array<i32>;   // Size == SkeletonInfo.layerArrSize
@group(1) @binding(4) var<storage, read_write> jointsData: Joints;



fn eulerToRotationMatrix(rot : vec4<f32>) -> mat4x4<f32>
{
  // The reconstruct order is Z-Y-X

  var theta = radians(rot.x);
  var cosTheta = cos(theta);
  var sinTheta = sin(theta);
  var xMat = mat4x4<f32>(
    vec4(1, 0, 0, 0),
    vec4(0, cosTheta, sinTheta, 0),
    vec4(0, -sinTheta, cosTheta, 0),
    vec4(0, 0, 0, 1)
  );

  theta = radians(rot.y);
  cosTheta = cos(theta);
  sinTheta = sin(theta);
  var yMat = mat4x4<f32>(
    vec4(cosTheta, 0 , -sinTheta, 0),
    vec4(0, 1, 0, 0),
    vec4(sinTheta, 0, cosTheta, 0),
    vec4(0, 0, 0, 1)
  );

  theta = radians(rot.z);
  cosTheta = cos(theta);
  sinTheta = sin(theta);
  var zMat = mat4x4<f32>(
    vec4(cosTheta, sinTheta, 0, 0),
    vec4(-sinTheta, cosTheta, 0, 0),
    vec4(0, 0, 1, 0),
    vec4(0, 0, 0, 1)
  );

  return zMat * yMat * xMat;
}

fn getJointMatrix(joint : Joint) -> mat4x4<f32> 
{
    var translate = joint.translate;
    var rotate = joint.rotate;
    var scale = joint.scale;

    var t = mat4x4<f32>(vec4<f32>(1, 0, 0, 0), vec4<f32>( 0, 1, 0, 0), vec4<f32>(0, 0, 1, 0), vec4<f32>(translate.x, translate.y, translate.z, 1));
    var r = eulerToRotationMatrix(joint.rotate);
    var s = mat4x4<f32>(vec4<f32>(joint.scale.x, 0, 0, 0), vec4<f32>( 0, joint.scale.y, 0, 0), vec4<f32>(0, 0, joint.scale.z, 0), vec4<f32>(0, 0, 0, 1));
    return t * r * s;
}

fn getTranslationMatrix(trans: mat4x4<f32>) -> mat4x4<f32>
{
    return mat4x4<f32>(vec4<f32>(1, 0, 0, 0), vec4<f32>( 0, 1, 0, 0), vec4<f32>(0, 0, 1, 0), vec4<f32>(trans[3][0], trans[3][1], trans[3][2], 1)); 
}

fn getScaleAndRotationMatrix(t: mat4x4<f32>) -> mat4x4<f32>
{
    var sx = sqrt(t[0][0] * t[0][0] + t[0][1] * t[0][1] + t[0][2] * t[0][2]);
    var sy = sqrt(t[1][0] * t[1][0] + t[1][1] * t[1][1] + t[1][2] * t[1][2]);
    var sz = sqrt(t[2][0] * t[2][0] + t[2][1] * t[2][1] + t[2][2] * t[2][2]);
    var scale = mat4x4<f32>(vec4<f32>(sx, 0, 0, 0), 
                            vec4<f32>(0, sy, 0, 0), 
                            vec4<f32>(0, 0, sz, 0), 
                            vec4<f32>(0, 0, 0, 1)); 

    var res = mat4x4<f32>( vec4<f32>(t[0][0]/sx,t[0][1]/sx,t[0][2]/sx,0),
                                vec4<f32>(t[1][0]/sy,t[1][1]/sy,t[1][2]/sy,0),
                                vec4<f32>(t[2][0]/sz,t[2][1]/sz,t[2][2]/sz,0),
                                vec4<f32>(sx,  sy,  sz,  1));

    //jointTransforms: array<mat4x4<f32>> =[scale, rotation] 
    return res;
}

fn translate(t: mat4x4<f32>, x: f32, y: f32, z: f32) -> mat4x4<f32>{
    var res = t;
    res[3][0] = res[3][0] + x;
    res[3][1] = res[3][1] + y;
    res[3][2] = res[3][2] + z;
    return res;
}

fn flapWings(idx: u32)
{
  var speed = 6.0;
  var jointIndex = 8; // Bone.009
  var defaultRot = skeletonInfo.defaultPose[jointIndex].rotate;
  jointsData.joints[i32(idx) * i32(skeletonInfo.jointNum) + i32(jointIndex)].rotate = defaultRot + vec4(0, 30 * sin(time.value * speed), 0, 0);

  jointIndex = 15; // Bone.004
  defaultRot = skeletonInfo.defaultPose[jointIndex].rotate;
  jointsData.joints[i32(idx) * i32(skeletonInfo.jointNum) + i32(jointIndex)].rotate = defaultRot - vec4(0, 25 * sin(time.value * speed), 0, 0);

  jointIndex = 19; // Bone.019
  defaultRot = skeletonInfo.defaultPose[jointIndex].rotate;
  jointsData.joints[i32(idx) * i32(skeletonInfo.jointNum) + i32(jointIndex)].rotate = defaultRot - vec4(0, 30 * sin(time.value * speed), 0, 0);

  jointIndex = 26; // Bone.026
  defaultRot = skeletonInfo.defaultPose[jointIndex].rotate;
  jointsData.joints[i32(idx) * i32(skeletonInfo.jointNum) + i32(jointIndex)].rotate = defaultRot + vec4(0, 30 * sin(time.value * speed), 0, 0);
}

fn updateVelocity(v: vec3<f32>, force: vec3<f32>, dt: f32) -> vec3<f32>
{
    var res = v;
    res = force* time.value * dt;
    return res;
}

fn noise_gen1(p: vec3<f32>) -> f32 
 { 
    return fract(sin((dot(p, vec3(127.1, 311.7, 191.999)))) * 43758.5453) - 0.5; 
 } 

@compute @workgroup_size(64)
fn simulate(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) 
{
  const deltaTime = 0.01;
  var idx = GlobalInvocationID.x;
  //model matrix transformation
  var m = transform[idx];

  var m_translate = getTranslationMatrix(m);
  var m_rotation = getScaleAndRotationMatrix(m);
  
  var sx = m_rotation[3][0];
  var sy = m_rotation[3][1]; 
  var sz = m_rotation[3][2];

  var m_scale = mat4x4<f32>(vec4<f32>(sx, 0, 0, 0), 
                            vec4<f32>(0, sy, 0, 0), 
                            vec4<f32>(0, 0, sz, 0), 
                            vec4<f32>(0, 0, 0, 1)); 
  m_rotation[3][0] = 0;
  m_rotation[3][1] = 0; 
  m_rotation[3][2] = 0;

  var translateVec = vec3<f32>(m_translate[3][0], m_translate[3][1], m_translate[3][2]);
  var force = vec3<f32>(cos(time.value)+noise_gen1(translateVec),-(0.05 * (noise_gen1(translateVec)+ 0.5)) , sin(time.value)+noise_gen1(translateVec));

  var velocity = velocitiesData[0];
  velocity = updateVelocity(velocity, force, deltaTime);
  velocitiesData[0] = velocity;

  
 // m_translate = translate(m_translate,velocity.x, velocity.y, velocity.z);
  m_translate = translate(m_translate,0, 0.0, 0);
  //x, y, z rotation
  var rot = vec4<f32>(0, 0, 0, 0);
  var localRotationMatrix = eulerToRotationMatrix(rot);
  m_rotation = localRotationMatrix * m_rotation;

  m = m_translate * m_rotation * m_scale;
  transform[idx] = m;
//======================================================================================//

  //Joint animation here
  flapWings(idx);
  
  // Update joints layer by layer
  var currLayer = 0;
  var layerSize = i32(skeletonInfo.layerArrSize);
  for(var i = 0; i < layerSize; i++)
  {
    var jointIndex = skLayerArray[i];
    if(jointIndex < 0)
    {
      currLayer = currLayer + 1;
      continue;
    }

    // For first layer (root joints), its transform matrix comes from its TRS directly
    if(currLayer == 0)
    {
      jointTransforms[i32(idx) * i32(skeletonInfo.jointNum) + i32(jointIndex)] = skeletonInfo.armatrureTransform * getJointMatrix(jointsData.joints[i32(idx) * i32(skeletonInfo.jointNum) + i32(jointIndex)]);
      continue;
    }

    // Get parent transform
    // (layer traverse guarantees that parent transformation is updated)
    var parentIndex = jtParentIndices[jointIndex];
    var parentTransform = jointTransforms[i32(idx) * i32(skeletonInfo.jointNum) + i32(parentIndex)];
    
    var thisTransform = getJointMatrix(jointsData.joints[i32(idx) * i32(skeletonInfo.jointNum) + i32(jointIndex)]);
    
    jointTransforms[i32(idx) * i32(skeletonInfo.jointNum) + i32(jointIndex)] = parentTransform * thisTransform;
  } 
}


