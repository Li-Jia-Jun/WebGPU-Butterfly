// Some hardcoded lighting
const lightDir = vec3(0.25, 0.5, 1.0);
const lightColor = vec3(1.0, 1.0, 1.0);
const ambientColor = vec3(0.1, 0.1, 0.1);

struct VertexOutput 
{
    @builtin(position) position : vec4<f32>,
    @location(0) normal : vec3<f32>,
};

@fragment
fn fragmentMain(input : VertexOutput) -> @location(0) vec4<f32> 
{
    // An extremely simple directional lighting model, just to give our model some shape.
    let N = normalize(input.normal);
    let L = normalize(lightDir);
    let NDotL = max(dot(N, L), 0.0);
    let surfaceColor = ambientColor + NDotL;
    return vec4(surfaceColor, 1.0);
}