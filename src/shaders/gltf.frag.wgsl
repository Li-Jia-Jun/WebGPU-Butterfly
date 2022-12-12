struct MaterialInfo
{
    baseColorFactor : vec4<f32>,
    propertyInfo : vec4<f32>, // [0] = metallic fatcor, [1] = roughness factor, the rest is unused yet
    textureInfo : vec4<f32>,  // [0] = hasBaseColor, [1] = hasNormalMap, [2] = hasMetallicRoughnessTexture, [3] = enableProcedural
};

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
    @location(3) instance: f32,
};

fn noise_gen1(x: f32) -> f32 
 { 
    return fract(sin(x * 127.1) * 43758.5453);
 } 

const pi: f32 = 3.141592653589793;

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

    if (materialInfo.textureInfo[3] == 1.0)
    {
        let idx = u32(input.instance);
        // let col = noise_gen1(input.instance);
        // if (col < 0.25)
        // {
        //     return vec4(baseColor.r, baseColor.g, baseColor.b, 0.0);
        // }
        // else if(col < 0.5)
        // {
        //     return vec4(baseColor.g, baseColor.b, baseColor.r, 0.0);
        // }
        // else if (col < 0.75)
        // {
        //     return vec4(baseColor.b, baseColor.g, baseColor.r, 0.0);
        // }
        // else
        // {
        //     return vec4(baseColor.b, baseColor.g, baseColor.b, 0.0);
        // }
        if(idx % 4 == 0)
        {
            return vec4(baseColor.r, baseColor.g, baseColor.b, 0.0);
        }
        else if(idx % 4 == 1)
        {
            return vec4(baseColor.g, baseColor.b, baseColor.r, 0.0);
        }
        else if(idx % 4 == 2)
        {
            return vec4(baseColor.b, baseColor.g, baseColor.r, 0.0);
        }
        else 
        {
            return vec4(baseColor.b, baseColor.g, baseColor.b, 0.0);
        }
    }
    else
    {
        return vec4(baseColor);
    }
    //return vec4(vec3(1  / (materialID.x + 1)), 1.0);
    //return vec4(0.0);
    // return vec4(surfaceColor, baseColor.a);
    // return vec4(finalColor, baseColor.a);
}