
@binding(0) @group(0) var<storage, read_write> transform : array<mat4x4<f32>>;


@compute @workgroup_size(1)
fn simulate(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
     var m = transform[0];

     //column major
     
     
     
     

     m[3][0] = m[3][0] + 0.001;
     transform[0] = m;   
  }


  
  // Store the new particle value
  //transform.transformationMatrix = ;
