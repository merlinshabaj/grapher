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

    var rectangleBuffer = gl.createBuffer();
    var rectangleVAO = gl.createVertexArray();
    gl.bindVertexArray(rectangleVAO);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, rectangleBuffer);
    setRectangle(gl, 0, 0, 50, 50);

    var size = 3;          // 3 components per iteration
    var type = gl.FLOAT;
    var normalize = true;  // convert from 0-255 to 0.0-1.0
    var stride = 0;        // 0 = move forward size * sizeof(type) each
    var offset = 0;        // start at the beginning of the buffer
    gl.vertexAttribPointer(positionAttributeLocation, size, type, normalize, stride, offset);

    var plotBuffer = gl.createBuffer();
    var plotVAO = gl.createVertexArray();
    gl.bindVertexArray(plotVAO);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, plotBuffer);
    plotGraph(gl);

    var size = 3;
    var type = gl.FLOAT;
    var normalize = false;
    var stride = 0;
    var offset = 0;
    gl.vertexAttribPointer(positionAttributeLocation, size, type, normalize, stride, offset);

    var rectangleUniforms = {
        u_colorMult: [1, 0, 0, 1],
        u_matrix: m4.identity(),
    };
    var plotUniforms = {
        u_colorMult: [0, 0, 1, 1],
        u_matrix: m4.identity(),
    }

    var rectangleTranslation = [-25, -25, 0];
    var plotTranslation = [0, 0, 0];

    var objectsToDraw = [
        {
            programInfo: program,
            vertexArray: rectangleVAO,
            uniforms: rectangleUniforms,
            primitiveType: gl.TRIANGLES,
            count: 6,
        },
        {
            programInfo: program,
            vertexArray: plotVAO,
            uniforms: plotUniforms,
            primitiveType: gl.LINE_STRIP,
            count: 144001,
        },
    ];

    window.addEventListener('keypress', function () {
        plotTranslation[0] += 100;
        console.log(`keydown ${rectangleTranslation}`);
        drawScene();
    });


    var rotationInRadians = -0.5;
    var rotation = [m3.degToRad(0), m3.degToRad(0), m3.degToRad(0)];
    var scale = [1, 1, 1];

    var left = -gl.canvas.clientWidth / 2;
    var right = gl.canvas.clientWidth / 2;
    var bottom = -gl.canvas.clientHeight / 2;
    var top = gl.canvas.clientHeight / 2;
    var near = 0;
    var far = 1;


    drawScene();

    function drawScene() {
        webglUtils.resizeCanvasToDisplaySize(canvas);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // gl.enable(gl.CULL_FACE);
        // gl.enable(gl.DEPTH_TEST);

        var rectangleXRotation = 0;
        var rectangleYRotation = 0;
        
        let cameraPosition = [(0 + 1000) / 2, 0, 10]; // 10 units back in z-axis
        let target = [(0 + 1000) / 2, 0, 0]; // Middle of the graph
        let up = [0, 1, 0]; // Up direction
        
        var cameraMatrix = m4.lookAt(cameraPosition, target, up);
        var viewMatrix = m4.inverse(cameraMatrix);
        var orthographicMatrix = m4.orthographic(left, right, bottom, top, near, far);
        var viewProjectionMatrix = m4.multiply(orthographicMatrix, viewMatrix);

        rectangleUniforms.u_matrix = computeMatrix(orthographicMatrix, rectangleTranslation, rectangleXRotation, rectangleYRotation, scale);
        plotUniforms.u_matrix = computeMatrix(orthographicMatrix, plotTranslation, 0, 0, scale);
        console.log(`Final Matrix: ${plotUniforms.u_matrix}`);

        objectsToDraw.forEach(function (object) {
            var program = object.programInfo;
            var vertexArray = object.vertexArray;
            gl.useProgram(program);
            gl.bindVertexArray(vertexArray);
            // Set the uniforms.
            gl.uniformMatrix4fv(matrixLocation, false, object.uniforms.u_matrix);
            gl.uniform4fv(colorMultLocation, object.uniforms.u_colorMult);

            // Draw
            var primitiveType = object.primitiveType;
            var offset = 0;
            // var count = object.vertexArray.count() * 3;
            var count = object.count;
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

// Fills the buffer with the values that define a rectangle.

function setRectangle(gl, x, y, width, height) {
    var x1 = x;
    var x2 = x + width;
    var y1 = y;
    var y2 = y + height;

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        x1, y1, 0,
        x2, y1, 0,
        x1, y2, 0,
        x1, y2, 0,
        x2, y1, 0,
        x2, y2, 0]), gl.STATIC_DRAW);

        let points = [
            x1, y1, 0,
            x2, y1, 0,
            x1, y2, 0,
            x1, y2, 0,
            x2, y1, 0,
            x2, y2, 0
        ];
        console.log(`POINTS: ${points}`);
}

function plotGraph(gl, start = 0, end = 1440 * 100, resolution = 100) {
    var tempPoints = [];

    let increment = start < end ? 1 : -1;

    for (let i = start; i !== end + increment; i += increment) {
        let x = (i - (end / 2)) / resolution;
        let y = Math.cos(x); // Math.sin(x * x) - Math.cos(x);

        tempPoints.push(x, y, 0);
    }

    console.log(`Count: ${tempPoints.length / 3}`);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tempPoints), gl.STATIC_DRAW);
}

function setGeometry(gl) {
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
            // left column front
            0, 0, 0,
            0, 150, 0,
            30, 0, 0,
            0, 150, 0,
            30, 150, 0,
            30, 0, 0,

            // top rung front
            30, 0, 0,
            30, 30, 0,
            100, 0, 0,
            30, 30, 0,
            100, 30, 0,
            100, 0, 0,

            // middle rung front
            30, 60, 0,
            30, 90, 0,
            67, 60, 0,
            30, 90, 0,
            67, 90, 0,
            67, 60, 0,

            // left column back
            0, 0, 30,
            30, 0, 30,
            0, 150, 30,
            0, 150, 30,
            30, 0, 30,
            30, 150, 30,

            // top rung back
            30, 0, 30,
            100, 0, 30,
            30, 30, 30,
            30, 30, 30,
            100, 0, 30,
            100, 30, 30,

            // middle rung back
            30, 60, 30,
            67, 60, 30,
            30, 90, 30,
            30, 90, 30,
            67, 60, 30,
            67, 90, 30,

            // top
            0, 0, 0,
            100, 0, 0,
            100, 0, 30,
            0, 0, 0,
            100, 0, 30,
            0, 0, 30,

            // top rung right
            100, 0, 0,
            100, 30, 0,
            100, 30, 30,
            100, 0, 0,
            100, 30, 30,
            100, 0, 30,

            // under top rung
            30, 30, 0,
            30, 30, 30,
            100, 30, 30,
            30, 30, 0,
            100, 30, 30,
            100, 30, 0,

            // between top rung and middle
            30, 30, 0,
            30, 60, 30,
            30, 30, 30,
            30, 30, 0,
            30, 60, 0,
            30, 60, 30,

            // top of middle rung
            30, 60, 0,
            67, 60, 30,
            30, 60, 30,
            30, 60, 0,
            67, 60, 0,
            67, 60, 30,

            // right of middle rung
            67, 60, 0,
            67, 90, 30,
            67, 60, 30,
            67, 60, 0,
            67, 90, 0,
            67, 90, 30,

            // bottom of middle rung.
            30, 90, 0,
            30, 90, 30,
            67, 90, 30,
            30, 90, 0,
            67, 90, 30,
            67, 90, 0,

            // right of bottom
            30, 90, 0,
            30, 150, 30,
            30, 90, 30,
            30, 90, 0,
            30, 150, 0,
            30, 150, 30,

            // bottom
            0, 150, 0,
            0, 150, 30,
            30, 150, 30,
            0, 150, 0,
            30, 150, 30,
            30, 150, 0,

            // left side
            0, 0, 0,
            0, 0, 30,
            0, 150, 30,
            0, 0, 0,
            0, 150, 30,
            0, 150, 0,
        ]),
        gl.STATIC_DRAW);
}

function setColors(gl) {
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Uint8Array([
            // left column front
            200, 70, 120,
            200, 70, 120,
            200, 70, 120,
            200, 70, 120,
            200, 70, 120,
            200, 70, 120,

            // top rung front
            200, 70, 120,
            200, 70, 120,
            200, 70, 120,
            200, 70, 120,
            200, 70, 120,
            200, 70, 120,

            // middle rung front
            200, 70, 120,
            200, 70, 120,
            200, 70, 120,
            200, 70, 120,
            200, 70, 120,
            200, 70, 120,

            // left column back
            80, 70, 200,
            80, 70, 200,
            80, 70, 200,
            80, 70, 200,
            80, 70, 200,
            80, 70, 200,

            // top rung back
            80, 70, 200,
            80, 70, 200,
            80, 70, 200,
            80, 70, 200,
            80, 70, 200,
            80, 70, 200,

            // middle rung back
            80, 70, 200,
            80, 70, 200,
            80, 70, 200,
            80, 70, 200,
            80, 70, 200,
            80, 70, 200,

            // top
            70, 200, 210,
            70, 200, 210,
            70, 200, 210,
            70, 200, 210,
            70, 200, 210,
            70, 200, 210,

            // top rung right
            200, 200, 70,
            200, 200, 70,
            200, 200, 70,
            200, 200, 70,
            200, 200, 70,
            200, 200, 70,

            // under top rung
            210, 100, 70,
            210, 100, 70,
            210, 100, 70,
            210, 100, 70,
            210, 100, 70,
            210, 100, 70,

            // between top rung and middle
            210, 160, 70,
            210, 160, 70,
            210, 160, 70,
            210, 160, 70,
            210, 160, 70,
            210, 160, 70,

            // top of middle rung
            70, 180, 210,
            70, 180, 210,
            70, 180, 210,
            70, 180, 210,
            70, 180, 210,
            70, 180, 210,

            // right of middle rung
            100, 70, 210,
            100, 70, 210,
            100, 70, 210,
            100, 70, 210,
            100, 70, 210,
            100, 70, 210,

            // bottom of middle rung.
            76, 210, 100,
            76, 210, 100,
            76, 210, 100,
            76, 210, 100,
            76, 210, 100,
            76, 210, 100,

            // right of bottom
            140, 210, 80,
            140, 210, 80,
            140, 210, 80,
            140, 210, 80,
            140, 210, 80,
            140, 210, 80,

            // bottom
            90, 130, 110,
            90, 130, 110,
            90, 130, 110,
            90, 130, 110,
            90, 130, 110,
            90, 130, 110,

            // left side
            160, 160, 220,
            160, 160, 220,
            160, 160, 220,
            160, 160, 220,
            160, 160, 220,
            160, 160, 220,
        ]),
        gl.STATIC_DRAW);
}

main();