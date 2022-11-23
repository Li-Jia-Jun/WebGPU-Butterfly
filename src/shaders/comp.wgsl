// struct Transforms {
//   transformationMatrix : mat4x4<f32>,
// }


@binding(0) @group(0) var<storage, read_write> transform : mat4x4<f32>;


@compute @workgroup_size(1)
fn simulate(
  @builtin(global_invocation_id) GlobalInvocationID : vec3<u32>
) {
  transform[0][3] -= 100;
  // Store the new particle value
  //transform.transformationMatrix = ;
}