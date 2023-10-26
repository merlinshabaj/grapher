import * as webglUtils from './webgl-utils.js';
import * as m3 from './m3.js';
import * as m4 from './m4.js';

var vertexShaderSource = `#version 300 es
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

    var program = webglUtils.createProgramFromSources(gl, [vertexShaderSource, fragmentShaderSource]);

    var positionAttributeLocation = gl.getAttribLocation(program, "a_position");
    var pointsAttributeLocation = gl.getAttribLocation(program, "a_points");
    var matrixLocation = gl.getUniformLocation(program, "u_matrix");
    var colorMultLocation = gl.getUniformLocation(program, "u_colorMult");
    var lineWidthLocation = gl.getUniformLocation(program, "u_lineWidth");

    //PLOT - static line geometry
    var plotBuffer = gl.createBuffer();
    var plotVAO = gl.createVertexArray();
    gl.bindVertexArray(plotVAO);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, plotBuffer);

    var lineSegmentInstanceGeometry = new Float32Array([
        -0.5, 0,  // Start point of first triangle
        0.5, 0,
        -0.5, 1,
        -0.5, 1,  // Start point of second triangle
        0.5, 0,
        0.5, 1
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, lineSegmentInstanceGeometry, gl.DYNAMIC_DRAW);
    console.log("Buffersize instance geo:", gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) / 4 / 2);

    var left = -10
    var right = 10
    var bottom = -10
    var top = 10
    var near = 0;
    var far = 2;

    var zoomLevel = 1;
    var plotTranslation = [0, 0, 0];
    var scale = [1, 1, 1];
    var resolution = 100;

    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(positionAttributeLocation, 0);

    // points for per-instance data
    var pointsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuffer);
    var graphData = updateGraph(gl, left, right, resolution, zoomLevel, plotTranslation);
    var bufferLength = uploadGraphData(gl, graphData);
    // var data = new Float32Array(graphData);
    // gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.vertexAttribPointer(pointsAttributeLocation, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(pointsAttributeLocation);
    gl.vertexAttribDivisor(pointsAttributeLocation, 1);

    var plotProgramInfo = {
        program: program,
        positionLoc: positionAttributeLocation,
        colorLoc: colorMultLocation,
        matrixLoc: matrixLocation,
        lineWidthLoc: lineWidthLocation,
    };

    var plotUniforms = {
        u_colorMult: [0, 0, 1, 1],
        u_matrix: m4.identity(),
        u_lineWidth: 0.3,
    }

    var objectsToDraw = [
        {
            programInfo: plotProgramInfo,
            vertexArray: plotVAO,
            uniforms: plotUniforms,
            primitiveType: gl.TRIANGLE_STRIP,
            getCount: function () { return 6 },
            getInstanceCount: function () { return bufferLength; },
        },
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

        plotTranslation[0] += dxWorld;
        plotTranslation[1] -= dyWorld;

        startX = event.clientX;
        startY = event.clientY;
        graphData = updateGraph(gl, left, right, resolution, zoomLevel, plotTranslation);
        bufferLength = uploadGraphData(gl, graphData);
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
    const MIN_ZOOM_LEVEL = 0.0000000000000000000000000000000001;
    const BASE_ZOOM_FACTOR = 1.05;
    var zoomExponent = 1;
    const ZOOM_FACTOR = 1.05;
    let mouseX = 0, mouseY = 0;
    let zoomIncrement = 0.05;

    function zoom(isZoomingIn, mouseX, mouseY) {
        const width = right - left;
        const height = top - bottom;

        let newWidth, newHeight;
        if (isZoomingIn) {
            newWidth = width / ZOOM_FACTOR;
            newHeight = height / ZOOM_FACTOR;
        } else {
            newWidth = width * ZOOM_FACTOR;
            newHeight = height * ZOOM_FACTOR;
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

        let leftNew = mouseWorldX - (mouseWorldX - left) * widthScalingFactor;
        let rightNew = mouseWorldX + (right - mouseWorldX) * widthScalingFactor;
        let bottomNew = mouseWorldY - (mouseWorldY - bottom) * heightScalingFactor;
        let topNew = mouseWorldY + (top - mouseWorldY) * heightScalingFactor;

        left = leftNew;
        right = rightNew;
        bottom = bottomNew;
        top = topNew;

        updateOrthographicDimensions();
    }


    function updateOrthographicDimensions() {
        orthographicMatrix = m4.orthographic(left, right, bottom, top, near, far);
        viewProjectionMatrix = m4.multiply(orthographicMatrix, viewMatrix);

        graphData = updateGraph(gl, left, right, resolution, zoomLevel, plotTranslation);
        bufferLength = uploadGraphData(gl, graphData);
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
        } else if (event.deltaY < 0 && zoomLevel > zoomIncrement) {
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

        plotUniforms.u_matrix = computeMatrix(viewProjectionMatrix, plotTranslation, 0, 0, scale);

        objectsToDraw.forEach(function (object) {
            var program = object.programInfo.program;
            var vertexArray = object.vertexArray;
            gl.useProgram(program);
            gl.bindVertexArray(vertexArray);
            // Set the uniforms.


            gl.uniformMatrix4fv(object.programInfo.matrixLoc, false, object.uniforms.u_matrix);
            gl.uniform4fv(object.programInfo.colorLoc, object.uniforms.u_colorMult);
            gl.uniform1f(object.programInfo.lineWidthLoc, object.uniforms.u_lineWidth);

            gl.bindBuffer(gl.ARRAY_BUFFER, plotBuffer);
            let bufferSize = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
            console.log("Buffer Size:", (bufferSize / 4) / 2); // 2001
            // Draw
            var primitiveType = object.primitiveType;
            var offset = 0;
            var count = object.getCount();
            console.log('FINAL COUNT:', count); //6

            if (object.getInstanceCount) {
                gl.drawArraysInstanced(
                    primitiveType,
                    offset,             // offset
                    6,   // num vertices per instance
                    1000,  // num instances
                );
            } else {
                gl.drawArrays(primitiveType, offset, count);
            }

        });
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
}

function generateGraphData(start, end, resolution = 100) {
    var points = [];

    let startX = start * resolution;
    let endX = end * resolution;

    if (startX < endX) {
        for (let i = startX; i <= endX; i++) {
            let x = i / resolution;
            let y = Math.cos(x);
            points.push(x, y);
        }
    } else {
        for (let i = startX; i >= endX; i--) {
            let x = i / resolution;
            let y = Math.cos(x);
            points.push(x, y);
        }
    }

    console.log("POINTS", points)
    return points
}

function uploadGraphData(gl, data) {
    data = new Float32Array(data);
    let bufferLength = data.length / 2;
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);

    return bufferLength;
}

function updateGraph(gl, left, right, resolution, zoom, translation) {
    var actualLeft = left - translation[0];
    var actualRight = right - translation[0];
    console.log(`actualLeft: ${actualLeft}, actualRight: ${actualRight}, left: ${left}, right: ${right}, zoomLevel: ${zoom}, translation: ${translation[0]}`);
    let data = generateGraphData(actualLeft, actualRight, resolution);
    return data;
}

main();