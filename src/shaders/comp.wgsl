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

// struct Velocities {
//   velocities:  array<vec3<f32>>
// }

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
@group(0) @binding(3) var<storage, read_write> velocitiesData: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> forwardData: array<vec4<f32>>;
@group(0) @binding(5) var<uniform> targetPos_4: vec4<f32>;



//skeleton information
@group(1) @binding(0) var<storage> skeletonInfo: SkeletonInfo;
//@group(1) @binding(1) var<storage> skRootIndices: array<i32>;  // Size == SkeletonInfo.rootJointNum
@group(1) @binding(1) var<storage> jtParentIndices: array<i32>;// Size == SkeletonInfo.jointNum
@group(1) @binding(2) var<storage> skLayerArray: array<i32>;   // Size == SkeletonInfo.layerArrSize
@group(1) @binding(3) var<storage, read_write> jointsData: Joints;



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
  var speed = 5.0 + noise_gen1(f32(idx));
  var cycle = (sin(time.value * speed + f32(idx)) + 0.6) / 1.6 / (noise_gen1(f32(idx)) * 0.2 + 0.8);  

  var jointIndex = 4; // RF
  var defaultRot = skeletonInfo.defaultPose[jointIndex].rotate;
  jointsData.joints[i32(idx) * i32(skeletonInfo.jointNum) + i32(jointIndex)].rotate = defaultRot + vec4(0 * cycle, 0 * cycle,  70 * cycle, 0);

  jointIndex = 2; // RR
  defaultRot = skeletonInfo.defaultPose[jointIndex].rotate;
  jointsData.joints[i32(idx) * i32(skeletonInfo.jointNum) + i32(jointIndex)].rotate = defaultRot + vec4(0 * cycle, 0 * cycle,  60 * cycle, 0);

  jointIndex = 6; // RM
  defaultRot = skeletonInfo.defaultPose[jointIndex].rotate;
  jointsData.joints[i32(idx) * i32(skeletonInfo.jointNum) + i32(jointIndex)].rotate = defaultRot + vec4(0 * cycle, 0 * cycle,  45 * cycle, 0);


  jointIndex = 5; // LF
  defaultRot = skeletonInfo.defaultPose[jointIndex].rotate;
  jointsData.joints[i32(idx) * i32(skeletonInfo.jointNum) + i32(jointIndex)].rotate = defaultRot + vec4(0 * cycle, 0 * cycle,  -70 * cycle, 0);

  jointIndex = 3; // LR
  defaultRot = skeletonInfo.defaultPose[jointIndex].rotate;
  jointsData.joints[i32(idx) * i32(skeletonInfo.jointNum) + i32(jointIndex)].rotate = defaultRot + vec4(0 * cycle, 0 * cycle,  -60 * cycle, 0);
  
  jointIndex = 7; // LM
  defaultRot = skeletonInfo.defaultPose[jointIndex].rotate;
  jointsData.joints[i32(idx) * i32(skeletonInfo.jointNum) + i32(jointIndex)].rotate = defaultRot + vec4(0 * cycle, 0 * cycle,  -45 * cycle, 0);
}

fn bump(idx: u32, translation : mat4x4<f32>) -> mat4x4<f32>
{
    var speed = 5.0 + noise_gen1(f32(idx));
    var cycle = (cos(time.value * speed + f32(idx)) + 0.6) / 1.6 / (noise_gen1(f32(idx)) * 0.2 + 0.8);  

    var t = translation;
    t[3][1] = t[3][1] + 0.1 * sin(cycle);

    return t;
}


fn updateVelocity(v: vec4<f32>, force: vec4<f32>, dt: f32) -> vec4<f32>
{
    var res = v;
    res = force* time.value * dt;
    return res;
}

fn noise_gen1v(p: vec3<f32>) -> f32 
 { 
    return fract(sin((dot(p, vec3(127.1, 311.7, 191.999)))) * 43758.5453) -0.5; 
 } 

fn noise_gen1(x: f32) -> f32 
 { 
    return fract(sin(x * 127.1) * 43758.5453);
 } 


 fn update_skeleton(idx : i32)
{
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
      jointTransforms[idx * i32(skeletonInfo.jointNum) + i32(jointIndex)] = skeletonInfo.armatrureTransform * getJointMatrix(jointsData.joints[idx * i32(skeletonInfo.jointNum) + i32(jointIndex)]);
      continue;
    }

    // Get parent transform
    // (layer traverse guarantees that parent transformation is updated)
    var parentIndex = jtParentIndices[jointIndex];
    var parentTransform = jointTransforms[idx * i32(skeletonInfo.jointNum) + i32(parentIndex)];
    
    var thisTransform = getJointMatrix(jointsData.joints[idx * i32(skeletonInfo.jointNum) + i32(jointIndex)]);
    
    jointTransforms[idx * i32(skeletonInfo.jointNum) + i32(jointIndex)] = parentTransform * thisTransform;
  } 
}

@compute @workgroup_size(64)
fn simulate(@builtin(global_invocation_id) GlobalInvocationID : vec3<u32>) 
{
  var deltaTime = 0.01;
  var kDeparture = 600.0;
  var ROTATIONTHRESHOLD = 0.1;
  var OFFSET = 10.0;
  var kSeek = 10.0;
  var idx = GlobalInvocationID.x;
  var seed = vec3<f32>(f32(idx), f32(idx), f32(idx));


  if(u32(idx) >= arrayLength(&transform))
  {
      return;
  }

  
  //model matrix transformation
  var m = transform[idx];

  var m_translate = getTranslationMatrix(m);
  var m_rotation = getScaleAndRotationMatrix(m);
  
  var scaleVar = (noise_gen1(f32(idx)) * 0.4) - 0.2 + 1;
  var sx =  scaleVar;
  var sy =  scaleVar; 
  var sz =  scaleVar;

  var m_scale = mat4x4<f32>(vec4<f32>(sx, 0, 0, 0), 
                            vec4<f32>(0, sy, 0, 0), 
                            vec4<f32>(0, 0, sz, 0), 
                            vec4<f32>(0, 0, 0, 1)); 
        
  m_rotation[3][0] = 0;
  m_rotation[3][1] = 0; 
  m_rotation[3][2] = 0;

  var translateVec = vec3<f32>(m_translate[3][0], m_translate[3][1], m_translate[3][2]);
  var force = vec4<f32>(cos(time.value)+noise_gen1v(translateVec),(0.05 * (noise_gen1v(translateVec)+ 0.5)) , sin(time.value)+noise_gen1v(translateVec), 0);

  var velocity = velocitiesData[idx];
  velocity = updateVelocity(velocity, force, deltaTime);
  velocitiesData[idx] = velocity;
  //=============================================================================//  

  //Seek
  var vDesired = vec3<f32>(0.0, 0.0, 0.0);
<<<<<<< Updated upstream
	//var targetPos = vec3<f32>(100, 100 , -10);
=======
	var targetPos = vec3<f32>(targetPos_4.x,targetPos_4.y,targetPos_4.z);
>>>>>>> Stashed changes
  var leaderTranslationMatrix = getTranslationMatrix(transform[0]);
  var leaderPos = vec3<f32>(leaderTranslationMatrix[3][0], leaderTranslationMatrix[3][1], leaderTranslationMatrix[3][2]);

  // Wander
  var targetPos = vec3<f32>(1000 * (noise_gen1(f32(idx)) - 0.5) , 100 * noise_gen1(f32(idx)+3.14), 1000 *(noise_gen1(f32(idx) + 6.28) - 0.5));
  var dist2Tar = distance(targetPos, translateVec);
  if (dist2Tar < 10)
  {
      targetPos = vec3<f32>(1000 * noise_gen1(f32(idx) + dist2Tar),1000 * noise_gen1(f32(idx) + dist2Tar +3.14), 1000 * noise_gen1(f32(idx) + dist2Tar + 6.28));
  }


  
  var direction = normalize(targetPos - leaderPos);
  
	// TODO: add your code here to compute Vdesired
	vDesired = kSeek * direction;

  if(length(targetPos - leaderPos) < 1) {
    vDesired = vec3<f32>(0.0,0.0,0.0);
  }

  // //Departure
  // var vDesired = vec3<f32>(0.0, 0.0, 0.0);
	// var targetPos = vec3<f32>(10.0, -10.0, 0.0);
	// var instancePos = translateVec;





  //position of each butterfly
	var instancePos = translateVec;
	// // // TODO: add your code here to compute Vdesired
	// var e = targetPos - instancePos;
  // var seed = vec3<f32>(f32(idx), f32(idx), f32(idx));
	// vDesired = kDeparture * noise_gen1v(seed) * (- e / (length(e) * length(e)));


  m_translate = translate(m_translate,vDesired.x * deltaTime, vDesired.y * deltaTime, vDesired.z * deltaTime);
  //m_translate = translate(m_translate,velocity.x, velocity.y, velocity.z);
  //m_translate = translate(m_translate,0, 0.0, 0);

  m_translate = bump(u32(idx), m_translate);

  //x, y, z rotation
  var f = vec2<f32>(forwardData[idx].x, forwardData[idx].z);
  var v_n = vec2<f32>(vDesired.x, vDesired.z);
  var theta = 0.0;
  if(length(v_n) != 0) {
      theta = acos(dot(v_n,f) / (length(v_n) * length(f)));
  }
  
  var rot = vec4<f32>(0, -theta, 0, 0);
  if(abs(theta) < ROTATIONTHRESHOLD) {
      rot = vec4<f32>(0, 0, 0, 0);
  }
  // if(cos(time.value) > 0) {
  //    rot = vec4<f32>(0, 0, 30 * 0.01, 0);
  // } else {
  //   rot = vec4<f32>(0, 0, -30 * 0.01, 0);
  // }
  
  var localRotationMatrix = eulerToRotationMatrix(rot);

  forwardData[idx] = localRotationMatrix * forwardData[idx];
  m_rotation = localRotationMatrix * m_rotation;

  m = m_translate * m_rotation * m_scale;
  //transform[idx] = m;
  velocitiesData[idx] = vec4<f32>(vDesired.x, vDesired.y,vDesired.z, 0); 
//======================================================================================//

    // Animation here
    flapWings(idx);
    update_skeleton(i32(idx));
}


