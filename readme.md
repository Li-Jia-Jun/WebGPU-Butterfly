# 565 Final Project

Haoquan Liang, Shineng Tang, Jiajun Li

## **Overview**

Our project aims to create a realistic simulation of butterfly flights and behaviors using WebGPU. The method we are using relies on the aerodynamic-based CFD solver, which guarantees realistic results, while using a hierarchical rigged skeleton to increase the performance so that it can run in realtime. 

## **Features**
- WebGPU Compute and Rendering Pipeline with instancing rendering
  - Compute shaders compute the new joint transformations
  - Instancing rendering ensures minimum memory consumption and maximum rendering performance
- glTF loader with texture, material loading and PBR shading
  - Loading glTF files with skeleton information and PBR-based materials
  - Support loading multiple glTF meshes.
- Hierachy skeleton loader and mesh deformer by using the skeleton
  - We rigged the butterfly mesh with Blender and successfully use our pipeline and the skeleton to deform the mesh.
  - Joint hierachy is correctly maintained and used in computation
- Butterfly simulations
  - Currently we have simple procedurally generated path and simple forces like gravity and wind for the butterfly
  - We will add realistic flight simulation to the butterflies based on the paper: http://www.cad.zju.edu.cn/home/jin/tog2022/tog2022.pdf 
- Simulation and bahavior control GUI
  - Allow the users to change key parameters in the simulation, such as the number of butterflies, the magnitude of different forces, and the current behaviors being simulated. 

## Update History
### **Milestone 3 - 12/05/22**
Slides: https://docs.google.com/presentation/d/1AHIefwlu55ZyYZG1VEadliJOUGMHE7-N/edit#slide=id.g19cb66c9ca1_0_15

Progress:
- glTF Texture/Material loading with PBR shading
- Skeleton hierarchy update in the Compute Shader
- Simple forces and movement simulation
- Instanced butterfly with various movement cycle.

Next Step:
- Add more forces simulations
- Add group behaviors
- Improve UI/UX
- Add more scene presets
- Add more features to the glTF loader (multiple materials support)

### **Milestone 2 - 11/28/22**
Slides: https://docs.google.com/presentation/d/1AHIefwlu55ZyYZG1VEadliJOUGMHE7-N/edit?rtpof=true

Progress:
- Approached the paper authors and got response
- Added a flying free famera
- Built the GUI framework
- Combined the milestone 1 components (instancing rendering with a GLTF loader that supports loading multiple meshes)
- Built the framework for Compute Shader Pipeline, which will be used to compute the new joint transformations at each tick
- Attached the skeleton to the mesh and successfully deformed the mesh using the skeleton

Next step:
- Add simple force simulations to the butterfly
- Add texture/material support for the glTF loader and use PBR shading
- Add a skybox renderer
- Add group behaviors
- Add a scene renderer


### **Milestone 1 - 11/16/22**

Slide: https://docs.google.com/presentation/d/1D0KU-Wp5UGeHj1HUCtebzcEjDT0gydEKm9OTPFgEmzs/edit#slide=id.g18fde25b9ae_9_0

Progress:
- Rigged butterfly mesh and example animation
- WebGPU cube instance rendering
- Basic GLTF render pipeline and orbit camera
- Basic HTML UI

Next step:
- Approach the author
- Combine features in milestone 1
- GLTF texture and animation support
- Implement full content from the reference paper including force simulation and maneuvering control
- More robust UI
