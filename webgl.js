import * as webglUtils from './webgl-utils.js';
import * as m3 from './m3.js';
import * as m4 from './m4.js';

var vertexShaderSource = `#version 300 es
in vec4 a_position;

uniform mat4 u_matrix;

void main() {
gl_Position = u_matrix * a_position;
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

    const canvas = document.querySelector("#webgl");
    const gl = canvas.getContext("webgl2");
    if (!gl) {
        return;
    }

    var program = webglUtils.createProgramFromSources(gl, [vertexShaderSource, fragmentShaderSource]);

    var positionAttributeLocation = gl.getAttribLocation(program, "a_position");
    var matrixLocation = gl.getUniformLocation(program, "u_matrix");
    var colorMultLocation = gl.getUniformLocation(program, "u_colorMult");

    const bufferLengths = new Map();

    var plotBuffer = gl.createBuffer();
    var plotVAO = gl.createVertexArray();
    gl.bindVertexArray(plotVAO);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, plotBuffer);

    var left = -gl.canvas.clientWidth / 2;
    var right = gl.canvas.clientWidth / 2;
    var zoomLevel = 1;
    var plotTranslation = [0, 0, 0];
    var resolution = 100;
    let bufferLength = updateGraph(gl, left, right, resolution, zoomLevel, plotTranslation);
    bufferLengths.set('plotBufferLength', bufferLength);
    console.log(`COUNT INITIAL: ${bufferLengths.get('plotBufferLength') * resolution}`);

    var size = 3;
    var type = gl.FLOAT;
    var normalize = false;
    var stride = 0;
    var offset = 0;
    gl.vertexAttribPointer(positionAttributeLocation, size, type, normalize, stride, offset);

    var plotUniforms = {
        u_colorMult: [0, 0, 1, 1],
        u_matrix: m4.identity(),
    }
    
    var scale = [1, 1, 1];

    var objectsToDraw = [
        {
            programInfo: program,
            vertexArray: plotVAO,
            uniforms: plotUniforms,
            primitiveType: gl.LINE_STRIP,
            count: bufferLengths.get('plotBufferLength'),
        },
    ];

    let cameraPosition = [0, 0, 1]; // 10 units back in z-axis
    let target = [0, 0, 0]; // Middle of the graph
    let up = [0, 1, 0]; // Up direction

    var cameraMatrix = m4.lookAt(cameraPosition, target, up);
    var viewMatrix = m4.inverse(cameraMatrix);

    
    var bottom = -gl.canvas.clientHeight / 2;
    var top = gl.canvas.clientHeight / 2;
    var near = 0;
    var far = 2;

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
        let dx = (event.clientX - startX) * zoomLevel; 
        let dy = (event.clientY - startY) * zoomLevel; 

        plotTranslation[0] += dx;
        plotTranslation[1] -= dy; 

        startX = event.clientX;
        startY = event.clientY;
        // console.log(`ZoomLevel: ${zoomLevel}`);
        let bufferLength = updateGraph(gl, left, right, resolution, zoomLevel, plotTranslation);
        bufferLengths.set('plotBufferLength', bufferLength);
        console.log(`COUNT PANNING: ${bufferLengths.get('plotBufferLength')}`);
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
    const ZOOM_FACTOR = 0.05;
    const zoomIncrement = 0.1;  
    let mouseX = 0, mouseY = 0;

    function zoomIn() {
        const [worldX, worldY] = screenToWorld(mouseX, mouseY, plotTranslation, zoomLevel);

        zoomExponent--;
        zoomLevel = Math.pow(BASE_ZOOM_FACTOR, zoomExponent);

        // zoomLevel *= (1 - ZOOM_FACTOR);

        plotTranslation[0] -= (worldX - screenToWorld(mouseX, mouseY, plotTranslation, zoomLevel)[0]);
        plotTranslation[1] -= (worldY - screenToWorld(mouseX, mouseY, plotTranslation, zoomLevel)[1]);
        console.log(`ZOOM LEVEL: ${zoomLevel}`);
        updateOrthographicDimensions();
    }

    function zoomOut() {
        const [worldX, worldY] = screenToWorld(mouseX, mouseY, plotTranslation, zoomLevel);

        zoomExponent++;
        zoomLevel = Math.pow(BASE_ZOOM_FACTOR, zoomExponent);
        // zoomLevel *= (1 + ZOOM_FACTOR);
        // zoomLevel += zoomIncrement;

        plotTranslation[0] -= (worldX - screenToWorld(mouseX, mouseY, plotTranslation, zoomLevel)[0]);
        plotTranslation[1] -= (worldY - screenToWorld(mouseX, mouseY, plotTranslation, zoomLevel)[1]);

        updateOrthographicDimensions();
    }

    function updateOrthographicDimensions() {
        const widthHalf = (gl.canvas.clientWidth / 2) * zoomLevel;
        const heightHalf = (gl.canvas.clientHeight / 2) * zoomLevel;

        left = -widthHalf;
        right = widthHalf;
        bottom = -heightHalf;
        top = heightHalf;
        console.log(`Zoom Level: ${zoomLevel}, Left: ${left}, Right: ${right}`);

        orthographicMatrix = m4.orthographic(left, right, bottom, top, near, far);
        viewProjectionMatrix = m4.multiply(orthographicMatrix, viewMatrix);
        
        let bufferLength = updateGraph(gl, left, right, 1, zoomLevel, plotTranslation);
        bufferLengths.set('plotBufferLength', bufferLength);
        console.log(`COUNT ZOOM: ${bufferLengths.get('plotBufferLength')}`);
        drawScene();
    }

    function screenToWorld(x, y, translation, zoom) {
        return [
            (x - gl.canvas.clientWidth / 2) * zoom + translation[0],
            (gl.canvas.clientHeight / 2 - y) * zoom + translation[1]
        ];
    }

    gl.canvas.addEventListener('mousemove', (event) => {
        mouseX = event.clientX;
        mouseY = event.clientY;
    });

    gl.canvas.addEventListener('wheel', (event) => {
        // Determine zoom direction
        if (event.deltaY > 0) {
            zoomOut();
        } else if (event.deltaY < 0 && zoomLevel > zoomIncrement) {
            zoomIn();
        }

        updateOrthographicDimensions();
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
            var program = object.programInfo;
            var vertexArray = object.vertexArray;
            gl.useProgram(program);
            gl.bindVertexArray(vertexArray);
            // Set the uniforms.
            gl.uniformMatrix4fv(matrixLocation, false, object.uniforms.u_matrix);
            gl.uniform4fv(colorMultLocation, object.uniforms.u_colorMult);

            let bufferSize = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
            console.log("Buffer Size:", (bufferSize / 4) / 3);
            // Draw
            var primitiveType = object.primitiveType;
            var offset = 0;
            var count = (bufferSize / 4) / 3//object.count;
            gl.drawArrays(primitiveType, offset, count);
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

// Returns a random integer from 0 to range - 1.
function randomInt(range) {
    return Math.floor(Math.random() * range);
}

function generateGraphData(start, end, resolution = 100) {
    var points = [];

    let startX = start * resolution;
    let endX = end * resolution;

    if (startX < endX) {
        for (let i = startX; i <= endX; i++) {
            let x = i / resolution;
            let y = x//Math.cos(x);
            points.push(x, y, 0);
        }
    } else {
        for (let i = startX; i >= endX; i--) {
            let x = i / resolution;
            let y = x//Math.cos(x);
            points.push(x, y, 0);
        }
    }

    return points
}

function uploadGraphData(gl, data) {
    data = new Float32Array(data);
    let bufferLength = data.length / 3 - 1;
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    
    return bufferLength;
}

function updateGraph(gl, left, right, resolution, zoom, translation) {
    var actualLeft = left / zoom - translation[0];
    var actualRight = right / zoom - translation[0];
    console.log(`actualLeft: ${actualLeft}, actualRight: ${actualRight}, left: ${left}, right: ${right}, zoomLevel: ${zoom}, translation: ${translation[0]}`);
    let data = generateGraphData(actualLeft, actualRight, resolution);
    return uploadGraphData(gl, data);    
}

main();