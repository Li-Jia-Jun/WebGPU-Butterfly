struct MaterialInfo
{
    baseColorFactor : vec4<f32>,
    propertyInfo : vec4<f32>, // [0] = metallic fatcor, [1] = roughness factor, the rest is unused yet
    textureInfo : vec4<f32>,  // [0] = hasBaseColor, [1] = hasNormalMap, [2] = hasMetallicRoughnessTexture, the rest is unused yet
};

 struct Camera 
 {
    projection : mat4x4<f32>,
    view : mat4x4<f32>,
    position : vec3<f32>,
    time : f32,
};

@group(1) @binding(0) var<uniform> camera : Camera;

// Material Bind Group (Refresh binding for each primitive)
@group(3) @binding(0) var<uniform> materialInfo : MaterialInfo;
@group(3) @binding(1) var mySampler: sampler;  // Assume all textures here uses the same sampler for simplicity
@group(3) @binding(2) var baseColorTexture: texture_2d<f32>;
@group(3) @binding(3) var normalMapTexture: texture_2d<f32>;
@group(3) @binding(4) var metallicRoughnessTexture: texture_2d<f32>;


// Some hardcoded lighting
const lightDir = vec3(0.25, 0.5, 1.0);
const lightColor = vec3(1.0, 1.0, 1.0);
const ambientColor = vec3(0.1, 0.1, 0.1);

struct VertexOutput 
{
    @builtin(position) position : vec4<f32>,
    @location(0) normal : vec3<f32>,
    @location(1) texcoord: vec2<f32>,
    @location(2) viewDir: vec3<f32>,
    @location(3) worldPos: vec3<f32>,
};

const pi: f32 = 3.141592653589793;

fn distanceFog(worldPosition : vec3<f32>, color : vec4<f32>) -> vec4<f32>
{
    let fogColor = vec4<f32>(0.8, 0.8, 0.8, 1);
    let minDistance = 120.0;
    let maxDistance = 500.0;

    let dist = distance(camera.position, worldPosition);     

    if(dist <= minDistance)
    {
        return color;
    }
    else if(dist >= maxDistance)
    {
        return fogColor;
    }
    else
    {
        let factor = (dist - minDistance) / (maxDistance - minDistance);
        return fogColor * factor + (1 - factor) * color;
    }
}

fn brdf(color: vec3<f32>,
          metallic: f32,
          roughness: f32,
          l: vec3<f32>,
          v: vec3<f32>,
          n: vec3<f32>) -> vec3<f32>
  {
      let h = normalize(l + v);
      let ndotl = clamp(dot(n, l), 0.0, 1.0);
      let ndotv = abs(dot(n, v));
      let ndoth = clamp(dot(n, h), 0.0, 1.0);
      let vdoth = clamp(dot(v, h), 0.0, 1.0);
      let f0 = vec3<f32>(0.04);
      let diffuseColor = color * (1.0 - f0) * (1.0 - metallic);
      let specularColor = mix(f0, color, metallic);
      let reflectance = max(max(specularColor.r, specularColor.g), specularColor.b);
      let reflectance0 = specularColor;
      let reflectance9 = vec3<f32>(clamp(reflectance * 25.0, 0.0, 1.0));
      let f = reflectance0 + (reflectance9 - reflectance0) * pow(1.0 - vdoth, 5.0);
      let r2 = roughness * roughness;
      let r4 = r2 * r2;
      let attenuationL = 2.0 * ndotl / (ndotl + sqrt(r4 + (1.0 - r4) * ndotl * ndotl));
      let attenuationV = 2.0 * ndotv / (ndotv + sqrt(r4 + (1.0 - r4) * ndotv * ndotv));
      let g = attenuationL * attenuationV;
      let temp = ndoth * ndoth * (r2 - 1.0) + 1.0;
      let d = r2 / (pi * temp * temp);
      let diffuse = (1.0 - f) / pi * diffuseColor;
      let specular = max(f * g * d / (4.0 * ndotl * ndotv), vec3<f32>(0.0));
      return ndotl * (diffuse + specular) * 2.0 + color * 0.1;
  }

@fragment
fn fragmentMain(input : VertexOutput) -> @location(0) vec4<f32> 
{   
    // Base Color 
    var baseColor = materialInfo.baseColorFactor;
    if(materialInfo.textureInfo[0] >= 0)
    {
        baseColor = textureSample(baseColorTexture, mySampler, input.texcoord);
    }

    // Normal
    var N: vec3<f32>;
    if (materialInfo.textureInfo[1] < 0)
    {
        N = normalize(input.normal); 
    }
    else
    {
        N = textureSample(normalMapTexture, mySampler, input.texcoord).rgb;
    }
    let L = normalize(lightDir);
    let NDotL = max(dot(N.xyz, L), 0.0);

    
    let surfaceColor = (baseColor.rgb * NDotL);

    // Metallic and Roughness
    var roughness: f32 = 0.6;
    var metallic: f32 = 0.0;
    if(materialInfo.textureInfo[2] < 0)
    {
        metallic = materialInfo.propertyInfo[0];
        roughness = materialInfo.propertyInfo[1];
    }
    else
    {
        let metallicRoughness = textureSample(metallicRoughnessTexture, mySampler, input.texcoord);
        roughness = metallicRoughness.g;
        metallic = metallicRoughness.b;
    }

    let amibient = vec3(0.1, 0.1, 0.1);
    let finalColor = brdf(baseColor.rgb, metallic, roughness, lightDir, input.viewDir, N.xyz) + amibient;

    // Alpha test
    if(baseColor.a < 0.01)
    {
        discard;
    }   

    // Distance fog
    let color = distanceFog(input.worldPos, vec4<f32>(surfaceColor[0], surfaceColor[1], surfaceColor[2], baseColor[3]));

    return vec4(color);
}