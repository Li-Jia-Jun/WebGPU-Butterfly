// import * as fs from 'fs';

// type SceneNodeType = 'GLTF' | 'SKYBOX' | 'LIGHTSETTING'

// export class SceneNode
// {
//     name : string;
//     type : SceneNodeType;

//     translate : number[];
//     rotate : number[];      // Euler angles in degrees 
//     scale : number[];

//     uri : string;
// }

// export class SecneLoader
// {
//     static loadScene(uri : string) : SceneNode[]
//     {
//         let nodes : SceneNode[] = new Array();

//         let data = fs.readFileSync(uri).toString('utf-8');
//         const lines = data.split('\n');       
//         for(let i = 0; i < lines.length; i++)
//         {
//             if(lines[i].length < 1)
//             {
//                 continue;
//             }
            
//             if(lines[i] == 'GLTF')
//             {
//                 let node = new SceneNode();

//                 node.type = 'GLTF';

//                 node.name = lines[++i].split(' ')[1];
//                 node.uri = lines[++i].split(' ')[1];
                
//                 let words = lines[++i].split(' ');
//                 node.translate = [parseFloat(words[1]), parseFloat(words[2]), parseFloat(words[3])];

//                 words = lines[++i].split(' ');
//                 node.rotate = [parseFloat(words[1]), parseFloat(words[2]), parseFloat(words[3])];
   
//                 words = lines[++i].split(' ');
//                 node.scale = [parseFloat(words[1]), parseFloat(words[2]), parseFloat(words[3])];

//                 nodes.push(node);
//             }

//             // TODO:: parse other data type
//         }

//         return nodes;
//     }    
// }

