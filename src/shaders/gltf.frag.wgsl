@group(0) @binding(2) var mySampler: sampler;  
@group(0) @binding(3) var myTexture:  texture_2d<f32>;  

// Some hardcoded lighting
const lightDir = vec3(0.25, 0.5, 1.0);
const lightColor = vec3(1.0, 1.0, 1.0);
const ambientColor = vec4(0.1, 0.1, 0.1, 1.0);

struct VertexOutput 
{
    @builtin(position) position : vec4<f32>,
    @location(0) normal : vec3<f32>,
    @location(1) texcoord: vec2<f32>,
};


@fragment
fn fragmentMain(input : VertexOutput) -> @location(0) vec4<f32> 
{
    // An extremely simple directional lighting model, just to give our model some shape.
    let N = normalize(input.normal);
    let L = normalize(lightDir);
    let NDotL = max(dot(N, L), 0.0);
    // return vec4(surfaceColor, 1.0);
    let texColor = textureSample(myTexture, mySampler, input.texcoord);
    let surfaceColor = ambientColor + NDotL * texColor;
    let testColor = vec4(0.2, 0.2, 0.8, 1.0);
    return texColor;
}