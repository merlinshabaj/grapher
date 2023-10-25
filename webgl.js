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
    /** @type {HTMLCanvasElement} */
    const canvas = document.querySelector("#webgl");
    const gl = canvas.getContext("webgl2", { antialias: true});
    if (!gl) {
        return;
    }

    var program = webglUtils.createProgramFromSources(gl, [vertexShaderSource, fragmentShaderSource]);

    var positionAttributeLocation = gl.getAttribLocation(program, "a_position");
    var matrixLocation = gl.getUniformLocation(program, "u_matrix");
    var colorMultLocation = gl.getUniformLocation(program, "u_colorMult");

    var rectangleBuffer = gl.createBuffer();
    var rectangleVAO = gl.createVertexArray();
    gl.bindVertexArray(rectangleVAO);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, rectangleBuffer);
    let rectanglePoints = new Float32Array([
        -5, 0, 0,
        -5, -5, 0,
        0, 0, 0,
        0, 5, 0,
        -5, -5, 0,
        0, 0, 0,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, rectanglePoints, gl.DYNAMIC_DRAW);


    var size = 3;
    var type = gl.FLOAT;
    var normalize = false;
    var stride = 0;
    var offset = 0;
    gl.vertexAttribPointer(positionAttributeLocation, size, type, normalize, stride, offset);

    var plotBuffer = gl.createBuffer();
    var plotVAO = gl.createVertexArray();
    gl.bindVertexArray(plotVAO);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, plotBuffer);

    var left = -10//-gl.canvas.clientWidth / 2;
    var right = 10//gl.canvas.clientWidth / 2;
    var zoomLevel = 1;
    var plotTranslation = [0, 0, 0];
    var resolution = 100;
    var bufferLength = updateGraph(gl, left, right, resolution, zoomLevel, plotTranslation);

    var size = 3;
    var type = gl.FLOAT;
    var normalize = false;
    var stride = 0;
    var offset = 0;
    gl.vertexAttribPointer(positionAttributeLocation, size, type, normalize, stride, offset);

    var rectangleUniforms = {
        u_colorMult: [1, 0, 0, 1],
        u_matrix: m4.identity(),
    }
    var plotUniforms = {
        u_colorMult: [0, 0, 1, 1],
        u_matrix: m4.identity(),
    }
    
    var scale = [1, 1, 1];

    var objectsToDraw = [
        {
            programInfo: program,
            vertexArray: rectangleVAO,
            uniforms: rectangleUniforms,
            primitiveType: gl.TRIANGLES,
            getCount: function() { return 6 },
        },
        {
            programInfo: program,
            vertexArray: plotVAO,
            uniforms: plotUniforms,
            primitiveType: gl.LINE_STRIP,
            getCount: function() { return bufferLength; },
        },
    ];

    let cameraPosition = [0, 0, 1]; // 10 units back in z-axis
    let target = [0, 0, 0]; // Middle of the graph
    let up = [0, 1, 0]; // Up direction

    var cameraMatrix = m4.lookAt(cameraPosition, target, up);
    var viewMatrix = m4.inverse(cameraMatrix);

    
    var bottom = -10//-gl.canvas.clientHeight / 2;
    var top = 10//gl.canvas.clientHeight / 2;
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

        let dx = event.clientX - startX;
        let dy = event.clientY - startY;
        let dxWorld = dx * (right - left) / gl.canvas.clientWidth;
        let dyWorld = dy * (top - bottom) / gl.canvas.clientHeight;

        plotTranslation[0] += dxWorld;
        plotTranslation[1] -= dyWorld; 

        startX = event.clientX;
        startY = event.clientY;
        bufferLength = updateGraph(gl, left, right, resolution, zoomLevel, plotTranslation);
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
        
        bufferLength = updateGraph(gl, left, right, resolution, zoomLevel, plotTranslation);
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

        rectangleUniforms.u_matrix = computeMatrix(viewProjectionMatrix, [0, 0, 0], 0, 0, scale);
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
            var count = object.getCount();//(bufferSize / 4) / 3//object.count;
            console.log('FINAL COUNT:', count);
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
            let y = Math.cos(x);
            points.push(x, y, 0);
        }
    } else {
        for (let i = startX; i >= endX; i--) {
            let x = i / resolution;
            let y = Math.cos(x);
            points.push(x, y, 0);
        }
    }

    console.log("POINTS", points)
    return points
}

function uploadGraphData(gl, data) {
    data = new Float32Array(data);
    let bufferLength = data.length / 3;
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    
    return bufferLength;
}

function updateGraph(gl, left, right, resolution, zoom, translation) {
    var actualLeft = left - translation[0];
    var actualRight = right - translation[0];
    console.log(`actualLeft: ${actualLeft}, actualRight: ${actualRight}, left: ${left}, right: ${right}, zoomLevel: ${zoom}, translation: ${translation[0]}`);
    let data = generateGraphData(actualLeft, actualRight, resolution);
    return uploadGraphData(gl, data);    
}

main();