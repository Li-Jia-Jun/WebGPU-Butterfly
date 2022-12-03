@group(0) @binding(2) var mySampler: sampler;  
@group(0) @binding(3) var myTexture:  texture_2d<f32>;  
@group(0) @binding(4) var myNormal:  texture_2d<f32>;  
@group(0) @binding(5) var myMetallicRoughness:  texture_2d<f32>;  


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
};

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
    // An extremely simple directional lighting model, just to give our model some shape.
    //let N = normalize(input.normal);
    let N = textureSample(myNormal, mySampler, input.texcoord);
    let L = normalize(lightDir);
    let NDotL = max(dot(N.xyz, L), 0.0);

    let baseColor = textureSample(myTexture, mySampler, input.texcoord);
    //let surfaceColor = (baseColor.rgb * ambientColor) + (baseColor.rgb * NDotL);
    let surfaceColor = (baseColor.rgb * NDotL);

    let metallicRoughness = textureSample(myMetallicRoughness, mySampler, input.texcoord);
    let roughness = metallicRoughness.g;
    let metallic = metallicRoughness.b;
    let finalColor = brdf(baseColor.rgb, metallic, roughness, lightDir, input.viewDir, N.xyz);
    return vec4(finalColor, baseColor.a);
    //return vec4(surfaceColor, baseColor.a);
}