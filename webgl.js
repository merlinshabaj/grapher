import * as webglUtils from './webgl-utils.js';
import * as m3 from './m3.js';
import * as m4 from './m4.js';

const lineVertexShaderSource = `#version 300 es
precision highp float;

in vec2 a_instanceVertexPosition;
in vec4 a_startAndEndPoints;

uniform mat4 u_mvp;
uniform float u_lineWidth;

void main() {
    vec2 start = a_startAndEndPoints.xy; // start points
    vec2 end = a_startAndEndPoints.zw; // end points

    vec2 direction = end - start;
    vec2 unitNormal = normalize(vec2(-direction.y, direction.x));
    vec2 worldSpacePosition = start + direction * a_instanceVertexPosition.x + unitNormal * u_lineWidth * a_instanceVertexPosition.y;
    // vec2 p = start + segmentLength * a_instanceVertexPosition + vec2(unitNormal * u_lineWidth/2.0);

    gl_Position = u_mvp * vec4(worldSpacePosition, 0, 1);
}
`;


  // vec2 up = vec2(0, 1);
    // float crossProduct = up.x * dir.y - up.y * dir.x;
    // float side = sign(crossProduct);
    // vec2 normal = vec2(0, 0);
    // if (side > 0.0) {
    //     normal = normalize(vec2(-dir.y, dir.x));
    // } else {
    //     normal = normalize(vec2(dir.y, -dir.x));
    // }
    // dir = normalize(dir);
    // float segmentLength = length(end - start);


        // 0, -0.5,
        // 1, -0.5,
        // 1,  0.5,
        // 0, -0.5,
        // 1,  0.5,
        // 0,  0.5

const roundJoinShaderSource = `#version 300 es
in vec2 a_instanceVertexPosition;
in vec4 a_startAndEndPoints;

uniform mat4 u_mvp;
uniform float u_lineWidth;

void main() {
    vec2 startPoint = a_startAndEndPoints.xy;

    vec2 point = u_lineWidth * a_instanceVertexPosition + startPoint;
    
    gl_Position = u_mvp * vec4(point, 0, 1);

}
`;

// gl_Position = u_matrix * vec4(lineWidth * position + points, 0, 1);

// float4 position = in.position;
// float2 point = points[instanceId + 1];
// float width = uniforms.lineWidth;

// VertexOut out {
//     .position = uniforms.mvp * float4(width * position.xy + point, 0, 1),
//     .pointSize = 10


const fragmentShaderSource = `#version 300 es

// fragment shaders don't have a default precision so we need
// to pick one. highp is a good default. It means "high precision"
precision highp float;

uniform vec4 u_colorMult;

out vec4 outColor;

void main() {
outColor = u_colorMult;
}
`;

const functionArray = [
    x => Math.cos(x),
    x => Math.sin(x),
    x => x,
    x => x * x,
    x => Math.log1p(x),
];

function main() {
    /** @type {HTMLCanvasElement} */
    const canvas = document.querySelector("#webgl");
    const gl = canvas.getContext("webgl2", { antialias: true });
    if (!gl) return

    const lineProgram = webglUtils.createProgramFromSources(gl, [lineVertexShaderSource, fragmentShaderSource]);
    const roundJoinProgram = webglUtils.createProgramFromSources(gl, [roundJoinShaderSource, fragmentShaderSource]);

    const linePositionAttributeLocation = gl.getAttribLocation(lineProgram, "a_instanceVertexPosition");
    const pointsAttributeLocation = gl.getAttribLocation(lineProgram, "a_startAndEndPoints");
    const lineMatrixLocation = gl.getUniformLocation(lineProgram, "u_mvp");
    const lineColorMultLocation = gl.getUniformLocation(lineProgram, "u_colorMult");
    const lineWidthLocation = gl.getUniformLocation(lineProgram, "u_lineWidth");

    // Round join locations
    const roundJoinPositionAttributeLocation = gl.getAttribLocation(roundJoinProgram, "a_instanceVertexPosition");
    const roundJoinPointsAttributeLocation = gl.getAttribLocation(roundJoinProgram, "a_startAndEndPoints");
    const roundJoinMatrixLocation = gl.getUniformLocation(roundJoinProgram, "u_mvp");
    const roundJoinColorMultLocation = gl.getUniformLocation(roundJoinProgram, "u_colorMult");
    const roundJoinLineWidthLocation = gl.getUniformLocation(roundJoinProgram, "u_lineWidth");

    // Line - static geometry
    const lineBuffer = gl.createBuffer();
    const lineVAO = gl.createVertexArray();
    gl.bindVertexArray(lineVAO);
    gl.enableVertexAttribArray(linePositionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);

    const lineSegmentInstanceGeometry = new Float32Array([
        0, -0.5,
        1, -0.5,
        1,  0.5,
        0, -0.5,
        1,  0.5,
        0,  0.5
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, lineSegmentInstanceGeometry, gl.DYNAMIC_DRAW);
    console.log("Buffersize instance geo:", gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) / 4 / 2);

    gl.vertexAttribPointer(linePositionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(linePositionAttributeLocation, 0);

    // Points for per-instance data
    const pointsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuffer);

    let aspectRatio = gl.canvas.clientWidth / gl.canvas.clientHeight;
    let left = -10 * aspectRatio
    let right = 10 * aspectRatio
    let bottom = -10
    let top = 10
    const near = 0;
    const far = 2;

    let lineTranslation = [0, 0, 0];
    const scale = [1, 1, 1];
    // let resolution = 250;
    let resolution = 100;

    const f = functionArray[3];

    const graphData = updateGraph(left, right, resolution, lineTranslation, f);
    gl.bufferData(gl.ARRAY_BUFFER, graphData, gl.DYNAMIC_DRAW);
    let graphDataBufferLength = getGraphBufferLength(graphData);
    
    gl.vertexAttribPointer(pointsAttributeLocation, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(pointsAttributeLocation);
    gl.vertexAttribDivisor(pointsAttributeLocation, 1);
    // Round join points
    const roundJoinBuffer = gl.createBuffer();
    const roundJoinVAO = gl.createVertexArray();
    gl.bindVertexArray(roundJoinVAO);
    gl.enableVertexAttribArray(roundJoinPositionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, roundJoinBuffer);
    const roundJoinData = generateRoundJoinData(resolution);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(roundJoinData), gl.STATIC_DRAW);
    gl.vertexAttribPointer(roundJoinPositionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(roundJoinPositionAttributeLocation);
    gl.vertexAttribDivisor(roundJoinPointsAttributeLocation, 0); 
    // Points for per-instance data (graphData)
    gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuffer);
    gl.vertexAttribPointer(roundJoinPointsAttributeLocation, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(roundJoinPointsAttributeLocation);
    gl.vertexAttribDivisor(roundJoinPointsAttributeLocation, 1);
    

    const lineProgramInfo = {
        program: lineProgram,
        positionLoc: linePositionAttributeLocation,
        colorLoc: lineColorMultLocation,
        matrixLoc: lineMatrixLocation,
        lineWidthLoc: lineWidthLocation,
    };

    const roundJoinProgramInfo = {
        program: roundJoinProgram,
        positionLoc: roundJoinPointsAttributeLocation,
        colorLoc: roundJoinColorMultLocation,
        matrixLoc: roundJoinMatrixLocation,
        lineWidthLoc: roundJoinLineWidthLocation,
    };

    let lineWidth = 0.2;

    const lineUniforms = {
        u_colorMult: [0, 0, 1, 1],
        u_matrix: m4.identity(),
        u_lineWidth: lineWidth,
    };
    const roundJoinUniforms = {
        u_colorMult: [0, 0, 1, 1],
        u_matrix: m4.identity(),
        u_lineWidth: lineWidth,
    }

    const objectsToDraw = [
        {
            programInfo: lineProgramInfo,
            vertexArray: lineVAO,
            uniforms: lineUniforms,
            primitiveType: gl.TRIANGLE_STRIP,
            getCount: function() { return 6 },
            getInstanceCount: function() { return graphDataBufferLength / 2 },
        },
        {
            programInfo: roundJoinProgramInfo,
            vertexArray: roundJoinVAO,
            uniforms: roundJoinUniforms,
            primitiveType: gl.TRIANGLE_STRIP,
            getCount: function() { return roundJoinData.length / 2 },
            getInstanceCount: function() { return graphDataBufferLength / 2},
        }
    ];

    const cameraPosition = [0, 0, 1];
    const target = [0, 0, 0]; 
    const up = [0, 1, 0]; 

    const cameraMatrix = m4.lookAt(cameraPosition, target, up);
    const viewMatrix = m4.inverse(cameraMatrix);

    let orthographicMatrix = m4.orthographic(left, right, bottom, top, near, far);
    let viewProjectionMatrix = m4.multiply(orthographicMatrix, viewMatrix);
    console.log("viewProjectionMatrix", viewProjectionMatrix);

    // PANNING
    let isPanning = false;
    let startX = 0;
    let startY = 0;

    gl.canvas.addEventListener('mousedown', (event) => {
        isPanning = true;
        startX = event.clientX;
        startY = event.clientY;
        gl.canvas.style.cursor = 'grabbing';
    });

    gl.canvas.addEventListener('mousemove', (event) => {
        if (!isPanning) return;

        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        const dxWorld = dx * (right - left) / gl.canvas.clientWidth;
        const dyWorld = dy * (top - bottom) / gl.canvas.clientHeight;

        lineTranslation[0] += dxWorld;
        lineTranslation[1] -= dyWorld;

        startX = event.clientX;
        startY = event.clientY;
        const graphData = updateGraph(left, right, resolution, lineTranslation, f);  
        gl.bufferData(gl.ARRAY_BUFFER, graphData, gl.DYNAMIC_DRAW);
        graphDataBufferLength = getGraphBufferLength(graphData);
        drawScene();
    });

    gl.canvas.addEventListener('mouseup', () => {
        isPanning = false;
        gl.canvas.style.cursor = 'grab';
    });

    gl.canvas.addEventListener('mouseleave', () => {
        isPanning = false;
        gl.canvas.style.cursor = 'default';
    });


    // ZOOMING
    const ZOOM_FACTOR = 1.05;
    let mouseX = 0, mouseY = 0;

    function zoom(isZoomingIn, mouseX, mouseY) {
        const width = right - left;
        const height = top - bottom;

        let newWidth, newHeight, newLineWidth, newResolution;
        if (isZoomingIn) {
            newWidth = width / ZOOM_FACTOR;
            newHeight = height / ZOOM_FACTOR;
            newLineWidth = lineWidth / ZOOM_FACTOR;
            newResolution = resolution * ZOOM_FACTOR;
        } else {
            newWidth = width * ZOOM_FACTOR;
            newHeight = height * ZOOM_FACTOR;
            newLineWidth = lineWidth * ZOOM_FACTOR;
            newResolution = resolution / ZOOM_FACTOR;
        }

        // Convert mouse position from screen space to clip space
        const clipX = (mouseX / gl.canvas.clientWidth) * 2 - 1;
        const clipY = -((mouseY / gl.canvas.clientHeight) * 2 - 1);
        console.log("Mouse Clip Space: ", clipX, clipY);

        // Calculate mouse position in world space
        const mouseWorldX = left + (clipX + 1) * 0.5 * width;
        const mouseWorldY = bottom + (clipY + 1) * 0.5 * height;
        console.log("Mouse World Space: ", mouseWorldX, mouseWorldY);

        const widthScalingFactor = newWidth / width;
        const heightScalingFactor = newHeight / height;
        const lineWidthScalingFactor = newLineWidth / lineWidth;
        const resolutionScalingFactor = newResolution / resolution;

        const leftNew = mouseWorldX - (mouseWorldX - left) * widthScalingFactor;
        const rightNew = mouseWorldX + (right - mouseWorldX) * widthScalingFactor;
        const bottomNew = mouseWorldY - (mouseWorldY - bottom) * heightScalingFactor;
        const topNew = mouseWorldY + (top - mouseWorldY) * heightScalingFactor;

        lineWidth = lineWidth * lineWidthScalingFactor;
        lineUniforms.u_lineWidth = lineWidth;
        roundJoinUniforms.u_lineWidth = lineWidth;

        resolution = resolution * resolutionScalingFactor;
        console.log("resolution:", resolution);

        left = leftNew;
        right = rightNew;
        bottom = bottomNew;
        top = topNew;

        updateOrthographicDimensions();
    }


    function updateOrthographicDimensions() {
        orthographicMatrix = m4.orthographic(left, right, bottom, top, near, far);
        viewProjectionMatrix = m4.multiply(orthographicMatrix, viewMatrix);

        let graphData = updateGraph(left, right, resolution, lineTranslation, f);
        gl.bufferData(gl.ARRAY_BUFFER, graphData, gl.DYNAMIC_DRAW);
        graphDataBufferLength = getGraphBufferLength(graphData);
        drawScene();
    }

    gl.canvas.addEventListener('mousemove', (event) => {
        const rect = gl.canvas.getBoundingClientRect();
        mouseX = event.clientX - rect.left;
        mouseY = event.clientY - rect.top;
    });

    gl.canvas.addEventListener('wheel', (event) => {
        // Determine zoom direction
        if (event.deltaY > 0) {
            zoom(false, mouseX, mouseY);
        } else if (event.deltaY < 0) {
            zoom(true, mouseX, mouseY);
        }
    });

    // Prevent the page from scrolling when using the mouse wheel on the canvas
    gl.canvas.addEventListener('wheel', (event) => {
        event.preventDefault();
    }, { passive: false });

    drawScene();

    function drawScene() {
        webglUtils.resizeCanvasToDisplaySize(canvas, devicePixelRatio);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);

        lineUniforms.u_matrix = computeMatrix(viewProjectionMatrix, lineTranslation, 0, 0, scale);
        roundJoinUniforms.u_matrix = computeMatrix(viewProjectionMatrix, lineTranslation, 0, 0, scale);

        objectsToDraw.forEach(function (object) {
            const program = object.programInfo.program;
            console.log("Current Program:", program);
            const vertexArray = object.vertexArray;
            gl.useProgram(program);
            gl.bindVertexArray(vertexArray);

            // Set the uniforms.
            gl.uniformMatrix4fv(object.programInfo.matrixLoc, false, object.uniforms.u_matrix);
            gl.uniform4fv(object.programInfo.colorLoc, object.uniforms.u_colorMult);
            object.programInfo.lineWidthLoc ? gl.uniform1f(object.programInfo.lineWidthLoc, object.uniforms.u_lineWidth) : {};

            gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuffer);
            const bufferSize = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
            console.log("Buffer Size:", (bufferSize / 4) / 2); 
            // Draw
            const primitiveType = object.primitiveType;
            const offset = 0;
            const count = object.getCount();
            const instanceCount = object.getInstanceCount();
            console.log('FINAL COUNT:', count); 

            if (object.getInstanceCount) {
                gl.drawArraysInstanced(
                    primitiveType,
                    offset,             // offset
                    count,   // num vertices per instance
                    instanceCount,  // num instances
                );
            } else {
                gl.drawArrays(primitiveType, offset, count);
            }
        });
    }
}

function computeMatrix(viewProjectionMatrix, translation, xRotation, yRotation, scale) {
    let matrix = m4.translate(viewProjectionMatrix,
        translation[0],
        translation[1],
        translation[2]);
    matrix = m4.xRotate(matrix, xRotation);
    matrix = m4.yRotate(matrix, yRotation);
    matrix = m4.scale(matrix, scale[0], scale[1], scale[2]);
    return matrix;
}

function generateGraphData(start, end, resolution, f) {
    const points = [];

    const startX = start * resolution;
    const endX = end * resolution;
 
    if (startX < endX) {
        for (let i = startX; i <= endX; i++) {
            const x = i / resolution;
            const y = f(x);
            points.push(x, y, x, y);
        }
    } else {
        for (let i = startX; i >= endX; i--) {
            const x = i / resolution;
            const y = f(x);
            points.push(x, y, x, y);
        }
    }
    points.shift();
    points.shift();
    points.pop();
    points.pop();
    console.log("POINTS:", points)
    return points
}

function generateRoundJoinData(resolution) {
    resolution = 100
    const points = [];
        for (let i = 0; i < resolution; i++) {
            const theta0 = (2.0 * Math.PI * i) / resolution;
            const theta1 = (2.0 * Math.PI * i + 1.0) / resolution;
            
            points.push(0.5 * Math.cos(theta0), 0.5 * Math.sin(theta0));
            points.push(0, 0);
            points.push(0.5 * Math.cos(theta1), 0.5 * Math.sin(theta1));
        }

        console.log("Round Join points:", points)                
        return points
}

function getGraphBufferLength(data) {
    const graphDataBufferLength = data.length / 2;
    return graphDataBufferLength;
}

function updateGraph(left, right, resolution, translation, f) {
    const actualLeft = left - translation[0];
    const actualRight = right - translation[0];
    console.log(`actualLeft: ${actualLeft}, actualRight: ${actualRight}, left: ${left}, right: ${right}, translation: ${translation[0]}`);
    // let data = [];
    // for (let i = 0; i < functionArray.length; i++) {
    //     const f = functionArray[i];
        const data = (new Float32Array(generateGraphData(actualLeft, actualRight, resolution, f)));
    // }
    return data;
}


main();