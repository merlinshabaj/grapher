import * as webglUtils from './webgl-utils.js';
import * as m3 from './m3.js';
import * as m4 from './m4.js';

var lineVertexShaderSource = `#version 300 es
in vec2 a_position;
in vec4 a_points;

uniform mat4 u_matrix;
uniform float u_lineWidth;


void main() {
    vec2 position = a_position;
    vec4 points = a_points;
    float lineWidth = u_lineWidth;

    vec2 a = points.xy;
    vec2 b = points.zw;

    vec2 xBasis = b - a;
    vec2 yBasis = normalize(vec2(-xBasis.y, xBasis.x));

    vec2 point = a + xBasis * position.x + yBasis * lineWidth * position.y;

    gl_Position = u_matrix * vec4(point, 0, 1);
}
`;

var roundJoinShaderSource = `#version 300 es
in vec2 a_pposition;
in vec4 a_points;

uniform mat4 u_matrix;
uniform float u_lineWidth;

void main() {
    vec2 position = a_pposition;
    vec2 points = a_points.zw;
    float lineWidth = u_lineWidth;
    vec2 point = lineWidth * position + points;
    
    gl_Position = u_matrix * vec4(point, 0, 1);

}
`;

// gl_Position = u_matrix * vec4(lineWidth * position + points, 0, 1);

// float4 position = in.position;
// float2 point = points[instanceId + 1];
// float width = uniforms.lineWidth;

// VertexOut out {
//     .position = uniforms.mvp * float4(width * position.xy + point, 0, 1),
//     .pointSize = 10


var fragmentShaderSource = `#version 300 es

// fragment shaders don't have a default precision so we need
// to pick one. highp is a good default. It means "high precision"
precision highp float;

uniform vec4 u_colorMult;

out vec4 outColor;

void main() {
outColor = u_colorMult;
}
`;

function main() {
    /** @type {HTMLCanvasElement} */
    const canvas = document.querySelector("#webgl");
    const gl = canvas.getContext("webgl2", { antialias: true });
    if (!gl) {
        return;
    }

    var lineProgram = webglUtils.createProgramFromSources(gl, [lineVertexShaderSource, fragmentShaderSource]);
    var roundJoinProgram = webglUtils.createProgramFromSources(gl, [roundJoinShaderSource, fragmentShaderSource]);

    var linePositionAttributeLocation = gl.getAttribLocation(lineProgram, "a_position");
    var pointsAttributeLocation = gl.getAttribLocation(lineProgram, "a_points");
    var lineMatrixLocation = gl.getUniformLocation(lineProgram, "u_matrix");
    var lineColorMultLocation = gl.getUniformLocation(lineProgram, "u_colorMult");
    var lineWidthLocation = gl.getUniformLocation(lineProgram, "u_lineWidth");

    // Round join locations
    var roundJoinPositionAttributeLocation = gl.getAttribLocation(roundJoinProgram, "a_pposition");
    var roundJoinPointsAttributeLocation = gl.getAttribLocation(roundJoinProgram, "a_points");
    var roundJoinMatrixLocation = gl.getUniformLocation(roundJoinProgram, "u_matrix");
    var roundJoinColorMultLocation = gl.getUniformLocation(roundJoinProgram, "u_colorMult");
    var roundJoinLineWidthLocation = gl.getUniformLocation(roundJoinProgram, "u_lineWidth");

    // Line - static geometry
    var lineBuffer = gl.createBuffer();
    var lineVAO = gl.createVertexArray();
    gl.bindVertexArray(lineVAO);
    gl.enableVertexAttribArray(linePositionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, lineBuffer);

    var lineSegmentInstanceGeometry = new Float32Array([
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
    var pointsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuffer);

    var left = -10
    var right = 10
    var bottom = -10
    var top = 10
    var near = 0;
    var far = 2;

    var zoomLevel = 1;
    var lineTranslation = [0, 0, 0];
    var scale = [1, 1, 1];
    var resolution = 250;

    var graphData = updateGraph(left, right, resolution, lineTranslation);
    gl.bufferData(gl.ARRAY_BUFFER, graphData, gl.DYNAMIC_DRAW);
    var bufferLength = getGraphBufferLength(graphData);
    
    gl.vertexAttribPointer(pointsAttributeLocation, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(pointsAttributeLocation);
    gl.vertexAttribDivisor(pointsAttributeLocation, 1);


    // Round join points
    var roundJoinBuffer = gl.createBuffer();
    var roundJoinVAO = gl.createVertexArray();
    gl.bindVertexArray(roundJoinVAO);
    gl.enableVertexAttribArray(roundJoinPositionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, roundJoinBuffer);
    var roundJoinData = generateRoundJoinData(resolution);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(roundJoinData), gl.STATIC_DRAW);
    gl.vertexAttribPointer(roundJoinPositionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(roundJoinPositionAttributeLocation);
    gl.vertexAttribDivisor(roundJoinPointsAttributeLocation, 0); 
    // Points for per-instance data (graphData)
    gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuffer);
    gl.vertexAttribPointer(roundJoinPointsAttributeLocation, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(roundJoinPointsAttributeLocation);
    gl.vertexAttribDivisor(roundJoinPointsAttributeLocation, 1);
    

    var lineProgramInfo = {
        program: lineProgram,
        positionLoc: linePositionAttributeLocation,
        colorLoc: lineColorMultLocation,
        matrixLoc: lineMatrixLocation,
        lineWidthLoc: lineWidthLocation,
    };

    var roundJoinProgramInfo = {
        program: roundJoinProgram,
        positionLoc: roundJoinPointsAttributeLocation,
        colorLoc: roundJoinColorMultLocation,
        matrixLoc: roundJoinMatrixLocation,
        lineWidthLoc: roundJoinLineWidthLocation,
    };

    var lineWidth = 0.1

    var lineUniforms = {
        u_colorMult: [0, 0, 1, 1],
        u_matrix: m4.identity(),
        u_lineWidth: lineWidth,
    };
    var roundJoinUniforms = {
        u_colorMult: [0, 0, 1, 1],
        u_matrix: m4.identity(),
        u_lineWidth: lineWidth,
    }

    var objectsToDraw = [
        {
            programInfo: lineProgramInfo,
            vertexArray: lineVAO,
            uniforms: lineUniforms,
            primitiveType: gl.TRIANGLE_STRIP,
            getCount: function() { return 6 },
            getInstanceCount: function() { return bufferLength / 2 },
        },
        {
            programInfo: roundJoinProgramInfo,
            vertexArray: roundJoinVAO,
            uniforms: roundJoinUniforms,
            primitiveType: gl.TRIANGLE_STRIP,
            getCount: function() { return roundJoinData.length / 2 },
            getInstanceCount: function() { return bufferLength / 2},
        }
    ];

    let cameraPosition = [0, 0, 1]; // 10 units back in z-axis
    let target = [0, 0, 0]; // Middle of the graph
    let up = [0, 1, 0]; // Up direction

    var cameraMatrix = m4.lookAt(cameraPosition, target, up);
    var viewMatrix = m4.inverse(cameraMatrix);

    var orthographicMatrix = m4.orthographic(left, right, bottom, top, near, far);
    var viewProjectionMatrix = m4.multiply(orthographicMatrix, viewMatrix);


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

        let dx = event.clientX - startX;
        let dy = event.clientY - startY;
        let dxWorld = dx * (right - left) / gl.canvas.clientWidth;
        let dyWorld = dy * (top - bottom) / gl.canvas.clientHeight;

        lineTranslation[0] += dxWorld;
        lineTranslation[1] -= dyWorld;

        startX = event.clientX;
        startY = event.clientY;
        let graphData = updateGraph(left, right, resolution, lineTranslation);
        gl.bufferData(gl.ARRAY_BUFFER, graphData, gl.DYNAMIC_DRAW);
        bufferLength = getGraphBufferLength(graphData);
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

        // Convert mouse from screen space to clip space
        let clipX = (mouseX / gl.canvas.clientWidth) * 2 - 1;
        let clipY = -((mouseY / gl.canvas.clientHeight) * 2 - 1);
        console.log("Mouse Clip Space: ", clipX, clipY);

        // Calculate mouse position in current orthographic dimensions
        let mouseWorldX = left + (clipX + 1) * 0.5 * width;
        let mouseWorldY = bottom + (clipY + 1) * 0.5 * height;
        console.log("Mouse World Space: ", mouseWorldX, mouseWorldY);

        const widthScalingFactor = newWidth / width;
        const heightScalingFactor = newHeight / height;
        const lineWidthScalingFactor = newLineWidth / lineWidth;
        const resolutionScalingFactor = newResolution / resolution;

        let leftNew = mouseWorldX - (mouseWorldX - left) * widthScalingFactor;
        let rightNew = mouseWorldX + (right - mouseWorldX) * widthScalingFactor;
        let bottomNew = mouseWorldY - (mouseWorldY - bottom) * heightScalingFactor;
        let topNew = mouseWorldY + (top - mouseWorldY) * heightScalingFactor;

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

        let graphData = updateGraph(left, right, resolution, lineTranslation);
        gl.bufferData(gl.ARRAY_BUFFER, graphData, gl.DYNAMIC_DRAW);
        bufferLength = getGraphBufferLength(graphData);
        drawScene();
    }

    gl.canvas.addEventListener('mousemove', (event) => {
        var rect = gl.canvas.getBoundingClientRect();
        mouseX = event.clientX - rect.left;
        mouseY = event.clientY - rect.top;
    });

    gl.canvas.addEventListener('wheel', (event) => {
        // Determine zoom direction
        if (event.deltaY > 0) {
            zoom(false, mouseX, mouseY);
        } else if (event.deltaY < 0) { //&& zoomLevel > zoomIncrement) {
            zoom(true, mouseX, mouseY);
        }
    });

    // Prevent the page from scrolling when using the mouse wheel on the canvas
    gl.canvas.addEventListener('wheel', (event) => {
        event.preventDefault();
    }, { passive: false });

    drawScene();

    function drawScene() {
        webglUtils.resizeCanvasToDisplaySize(canvas);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);

        lineUniforms.u_matrix = computeMatrix(viewProjectionMatrix, lineTranslation, 0, 0, scale);
        roundJoinUniforms.u_matrix = computeMatrix(viewProjectionMatrix, lineTranslation, 0, 0, scale);

        objectsToDraw.forEach(function (object) {
            var program = object.programInfo.program;
            console.log("Current Program:", program);
            var vertexArray = object.vertexArray;
            gl.useProgram(program);
            gl.bindVertexArray(vertexArray);

            // Set the uniforms.
            gl.uniformMatrix4fv(object.programInfo.matrixLoc, false, object.uniforms.u_matrix);
            gl.uniform4fv(object.programInfo.colorLoc, object.uniforms.u_colorMult);
            console.log("zoomLevel:", zoomLevel);
            object.programInfo.lineWidthLoc ? gl.uniform1f(object.programInfo.lineWidthLoc, object.uniforms.u_lineWidth / zoomLevel) : {};

            gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuffer);
            let bufferSize = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
            console.log("Buffer Size:", (bufferSize / 4) / 2); 
            // Draw
            var primitiveType = object.primitiveType;
            var offset = 0;
            var count = object.getCount();
            var instanceCount = object.getInstanceCount();
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
    var matrix = m4.translate(viewProjectionMatrix,
        translation[0],
        translation[1],
        translation[2]);
    matrix = m4.xRotate(matrix, xRotation);
    matrix = m4.yRotate(matrix, yRotation);
    matrix = m4.scale(matrix, scale[0], scale[1], scale[2]);
    return matrix;
}

function generateGraphData(start, end, resolution) {
    var points = [];

    let startX = start * resolution;
    let endX = end * resolution;

    function f(x) {
        let y = Math.cos(x);
        return y;
    }
 
    if (startX < endX) {
        for (let i = startX; i <= endX; i++) {
            let x = i / resolution;
            let y = f(x);
            points.push(x, y, x, y);
        }
    } else {
        for (let i = startX; i >= endX; i--) {
            let x = i / resolution;
            let y = f(x);
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
    var points = [];
        for (let i = 0; i < resolution; i++) {
            let theta0 = (2.0 * Math.PI * i) / resolution;
            let theta1 = (2.0 * Math.PI * i + 1.0) / resolution;
            
            points.push(0.5 * Math.cos(theta0), 0.5 * Math.sin(theta0));
            points.push(0, 0);
            points.push(0.5 * Math.cos(theta1), 0.5 * Math.sin(theta1));
        }

        console.log("Round Join points:", points)                
        return points
}

function getGraphBufferLength(data) {
    let bufferLength = data.length / 2;
    return bufferLength;
}


function updateGraph(left, right, resolution, translation) {
    var actualLeft = left - translation[0];
    var actualRight = right - translation[0];
    console.log(`actualLeft: ${actualLeft}, actualRight: ${actualRight}, left: ${left}, right: ${right}, translation: ${translation[0]}`);
    let data = new Float32Array(generateGraphData(actualLeft, actualRight, resolution));
    return data;
}


main();