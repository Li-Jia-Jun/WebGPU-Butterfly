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
@group(0) @binding(1) var<storage> time: Time;
//joint transformation matrix (The joint pose output)
@group(0) @binding(2) var<storage, read_write> jointTransforms: array<mat4x4<f32>>;

//skeleton information
@group(1) @binding(0) var<storage> skeletonInfo: SkeletonInfo;
@group(1) @binding(1) var<storage> skRootIndices: array<i32>;  // Size == SkeletonInfo.rootJointNum
@group(1) @binding(2) var<storage> jtParentIndices: array<i32>;// Size == SkeletonInfo.jointNum
@group(1) @binding(3) var<storage> skLayerArray: array<i32>;   // Size == SkeletonInfo.layerArrSize
@group(1) @binding(4) var<storage, read_write> data: Joints;



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

fn flapWings()
{
  var speed = 3.0;

  var jointIndex = 8; // Bone.009
  var defaultRot = skeletonInfo.defaultPose[jointIndex].rotate;
  data.joints[jointIndex].rotate = defaultRot + vec4(0, 30 * sin(time.value * speed), 0, 0);

  jointIndex = 15; // Bone.004
  defaultRot = skeletonInfo.defaultPose[jointIndex].rotate;
  data.joints[jointIndex].rotate = defaultRot - vec4(0, 25 * sin(time.value * speed), 0, 0);

  jointIndex = 19; // Bone.019
  defaultRot = skeletonInfo.defaultPose[jointIndex].rotate;
  data.joints[jointIndex].rotate = defaultRot - vec4(0, 30 * sin(time.value * speed), 0, 0);

  jointIndex = 26; // Bone.026
  defaultRot = skeletonInfo.defaultPose[jointIndex].rotate;
  data.joints[jointIndex].rotate = defaultRot + vec4(0, 30 * sin(time.value * speed), 0, 0);
}

@compute @workgroup_size(1)
fn simulate(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) 
{
  //matrices are all column major !!!

  //Joint animation here
  flapWings();

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
      jointTransforms[jointIndex] = skeletonInfo.armatrureTransform * getJointMatrix(data.joints[jointIndex]);
      continue;
    }

    // Get parent transform
    // (layer traverse guarantees that parent transformation is updated)
    var parentIndex = jtParentIndices[jointIndex];
    var parentTransform = jointTransforms[parentIndex];
    
    var thisTransform = getJointMatrix(data.joints[jointIndex]);
    
    jointTransforms[jointIndex] = parentTransform * thisTransform;
  } 
}


