import * as webglUtils from './webgl-utils.js';
import { sub } from "./utils.js";
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

    gl_Position = u_mvp * vec4(worldSpacePosition, 0, 1);
}
`;

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

const main = () => {
    if (!gl) return

    const lineProgram = webglUtils.createProgramFromSources(gl, [lineVertexShaderSource, fragmentShaderSource]);
    const roundJoinProgram = webglUtils.createProgramFromSources(gl, [roundJoinShaderSource, fragmentShaderSource]);
    const majorGridProgram = webglUtils.createProgramFromSources(gl, [lineVertexShaderSource, fragmentShaderSource]);
    const minorGridPogram = webglUtils.createProgramFromSources(gl, [lineVertexShaderSource, fragmentShaderSource]);
    const axesProgram = webglUtils.createProgramFromSources(gl, [lineVertexShaderSource, fragmentShaderSource]);

    const getLocations = program => {
        const getAttribLocation = name => gl.getAttribLocation(program, name)
        const getUniformLocation = name => gl.getUniformLocation(program, name)
        const instanceVertexPosition = getAttribLocation("a_instanceVertexPosition");
        const startAndEndPoints = getAttribLocation("a_startAndEndPoints");;
        const mvp = getUniformLocation("u_mvp");
        const colorMult = getUniformLocation("u_colorMult");
        const lineWidth = getUniformLocation("u_lineWidth");    
        return {
            instanceVertexPosition,
            startAndEndPoints,
            mvp,
            colorMult,
            lineWidth
        }
    }

    // Line locations
    const {
        instanceVertexPosition: linePositionAttributeLocation,
        startAndEndPoints: pointsAttributeLocation,
        mvp: lineMVPLocation,
        colorMult: lineColorMultLocation,
        lineWidth: lineWidthLocation
    } = getLocations(lineProgram)

    // Round join locations
    const {
        instanceVertexPosition: roundJoinPositionAttributeLocation,
        startAndEndPoints: roundJoinPointsAttributeLocation,
        mvp: roundJoinMVPLocation,
        colorMult: roundJoinColorMultLocation,
        lineWidth: roundJoinLineWidthLocation
    } = getLocations(roundJoinProgram)

    // Major grid locations
    const {
        instanceVertexPosition: majorGridVertexPositionAttributeLocation,
        startAndEndPoints: majorGridStartAndEndPointsAttributeLocation,
        mvp: majorGridMVPLocation,
        colorMult: majorGridColorMultLocation,
        lineWidth: majorGridLineWidthLocation
    } = getLocations(majorGridProgram)

    // Minor grid locations
    const {
        instanceVertexPosition: minorGridVertexPositionAttributeLocation,
        startAndEndPoints: minorGridStartAndEndPointsAttributeLocation,
        mvp: minorGridMVPLocation,
        colorMult: minorGridColorMultLocation,
        lineWidth: minorGridLineWidthLocation
    } = getLocations(minorGridPogram)

    // Axes locations
    const {
        instanceVertexPosition: axesVertexPositionAttributeLocation,
        startAndEndPoints: axesStartAndEndPointsAttributeLocation,
        mvp: axesMVPLocation,
        colorMult: axesColorMultLocation,
        lineWidth: axesLineWidthLocation
    } = getLocations(axesProgram)

    const lineSegmentInstanceGeometry = new Float32Array([
        0, -0.5,
        1, -0.5,
        1, 0.5,
        0, -0.5,
        1, 0.5,
        0, 0.5
    ]);

    // Line - static geometry
    const lineBuffer = (() => {
        const buffer = gl.createBuffer();
        uploadAttributeData(buffer, lineSegmentInstanceGeometry)
        return buffer
    })()

    const lineVAO = gl.createVertexArray();
    gl.bindVertexArray(lineVAO);
    gl.enableVertexAttribArray(linePositionAttributeLocation);

    console.log("Buffersize instance geo:", gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) / 4 / 2);

    gl.vertexAttribPointer(linePositionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(linePositionAttributeLocation, 0);

    // Points for per-instance data
    const pointsBuffer = gl.createBuffer();

    const near = 0;
    const far = 2;
    let aspectRatio = canvas.clientWidth / canvas.clientHeight;
    let left = -10 * aspectRatio;
    let right = 10 * aspectRatio;
    let bottom = -10;
    let top = 10;

    const translation = [0, 0, 0];
    const scale = [1, 1, 1];
    let resolution = 100 /* 250 */;

    const f = functionArray[3];

    const graphPoints = updateGraph(left, right, resolution, translation, f);
    uploadAttributeData(pointsBuffer, graphPoints);
    let graphPointsBufferLength = getBufferLength(graphPoints);

    gl.vertexAttribPointer(pointsAttributeLocation, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(pointsAttributeLocation);
    gl.vertexAttribDivisor(pointsAttributeLocation, 1);
    // Round join points
    const roundJoinBuffer = gl.createBuffer();
    const roundJoinVAO = gl.createVertexArray();
    gl.bindVertexArray(roundJoinVAO);
    gl.enableVertexAttribArray(roundJoinPositionAttributeLocation);
    const roundJoinGeometry = computeRoundJoinGeometry(resolution);
    uploadAttributeData(roundJoinBuffer, new Float32Array(roundJoinGeometry));
    gl.vertexAttribPointer(roundJoinPositionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(roundJoinPositionAttributeLocation);
    gl.vertexAttribDivisor(roundJoinPointsAttributeLocation, 0);
    // Start and End points for per-instance data (graphPoints)
    gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuffer);
    gl.vertexAttribPointer(roundJoinPointsAttributeLocation, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(roundJoinPointsAttributeLocation);
    gl.vertexAttribDivisor(roundJoinPointsAttributeLocation, 1);

    // Major grid - static geometry
    const majorGridGeometryBuffer = gl.createBuffer();
    const majorGridVAO = gl.createVertexArray();
    gl.bindVertexArray(majorGridVAO);
    gl.enableVertexAttribArray(majorGridVertexPositionAttributeLocation);
    const gridInstanceGeometry = new Float32Array([
        0, -0.5,
        1, -0.5,
        1, 0.5,
        0, -0.5,
        1, 0.5,
        0, 0.5
    ]);
    uploadAttributeData(majorGridGeometryBuffer, gridInstanceGeometry);
    gl.vertexAttribPointer(majorGridVertexPositionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(majorGridVertexPositionAttributeLocation, 0);

    // Start and end points for per-instace data majorgrid
    const majorGridDataBuffer = gl.createBuffer();
    const majorGridData = new Float32Array(computeMajorGridPoints(left, right, top, bottom));
    let majorGridDataBufferLength = getBufferLength(majorGridData);
    console.log("majorGridDataBufferLength", majorGridDataBufferLength);
    uploadAttributeData(majorGridDataBuffer, majorGridData);
    gl.vertexAttribPointer(majorGridStartAndEndPointsAttributeLocation, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(majorGridStartAndEndPointsAttributeLocation);
    gl.vertexAttribDivisor(majorGridStartAndEndPointsAttributeLocation, 1);

    // Minor grid - static geometry
    const minorGridGeometryBuffer = gl.createBuffer();
    const minorGridVAO = gl.createVertexArray();
    gl.bindVertexArray(minorGridVAO);
    gl.enableVertexAttribArray(minorGridVertexPositionAttributeLocation);
    uploadAttributeData(minorGridGeometryBuffer, gridInstanceGeometry);
    gl.vertexAttribPointer(minorGridVertexPositionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(minorGridVertexPositionAttributeLocation, 0);

    // Start and end points for per-instance data minor grid
    const minorGridDataBuffer = gl.createBuffer();
    const minorGridData = new Float32Array(computeMinorGridPoints(left, right, top, bottom));
    let minorGridDataBufferLength = getBufferLength(minorGridData);
    console.log("majorGridDataBufferLength", minorGridDataBufferLength);
    uploadAttributeData(minorGridDataBuffer, minorGridData);
    gl.vertexAttribPointer(minorGridStartAndEndPointsAttributeLocation, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(minorGridStartAndEndPointsAttributeLocation);
    gl.vertexAttribDivisor(minorGridStartAndEndPointsAttributeLocation, 1);

    // Axes - static geometry
    const axesGeometryBuffer = gl.createBuffer();
    const axesVAO = gl.createVertexArray();
    gl.bindVertexArray(axesVAO);
    gl.enableVertexAttribArray(axesVertexPositionAttributeLocation);
    uploadAttributeData(axesGeometryBuffer, lineSegmentInstanceGeometry);
    gl.vertexAttribPointer(axesVertexPositionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(axesVertexPositionAttributeLocation, 0);

    // Start and end points for per-instance data minor grid
    const axesDataBuffer = gl.createBuffer();
    const axesPoints = new Float32Array(computeAxesPoints(left, right, top, bottom));
    let axesPointsBufferLength = getBufferLength(axesPoints);
    console.log("axesPointsBufferLength", axesPointsBufferLength);
    uploadAttributeData(axesDataBuffer, axesPoints);
    gl.vertexAttribPointer(axesStartAndEndPointsAttributeLocation, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(axesStartAndEndPointsAttributeLocation);
    gl.vertexAttribDivisor(axesStartAndEndPointsAttributeLocation, 1);

    const lineProgramInfo = {
        program: lineProgram,
        positionLoc: linePositionAttributeLocation,
        colorLoc: lineColorMultLocation,
        matrixLoc: lineMVPLocation,
        lineWidthLoc: lineWidthLocation,
    };
    const roundJoinProgramInfo = {
        program: roundJoinProgram,
        positionLoc: roundJoinPositionAttributeLocation,
        colorLoc: roundJoinColorMultLocation,
        matrixLoc: roundJoinMVPLocation,
        lineWidthLoc: roundJoinLineWidthLocation,
    };
    const majorGridProgramInfo = {
        program: majorGridProgram,
        positionLoc: majorGridVertexPositionAttributeLocation,
        colorLoc: majorGridColorMultLocation,
        matrixLoc: majorGridMVPLocation,
        lineWidthLoc: majorGridLineWidthLocation,
    };
    const minorGridProgramInfo = {
        program: minorGridPogram,
        positionLoc: minorGridVertexPositionAttributeLocation,
        colorLoc: minorGridColorMultLocation,
        matrixLoc: minorGridMVPLocation,
        lineWidthLoc: minorGridLineWidthLocation,
    };
    const axesProgramInfo = {
        program: axesProgram,
        positionLoc: axesVertexPositionAttributeLocation,
        colorLoc: axesColorMultLocation,
        matrixLoc: axesMVPLocation,
        lineWidthLoc: axesLineWidthLocation,
    };

    const graphColor = [0, 0, 0, 1];
    const majorGridColor = [0, 0, 0, 0.2];
    const minorGridColor = [0, 0, 0, 0.1];
    const axesColor = [0, 0, 0, 1];

    let plotLineWidth = 0.1;
    let majorGridLineWidth = 0.05;
    let minorGridLineWidth = 0.025;
    let axesLineWidth = 0.15;

    const lineUniforms = {
        u_colorMult: graphColor,
        u_matrix: m4.identity(),
        u_lineWidth: plotLineWidth,
    };
    const roundJoinUniforms = {
        u_colorMult: graphColor,
        u_matrix: m4.identity(),
        u_lineWidth: plotLineWidth,
    };
    const majorGridUniforms = {
        u_colorMult: majorGridColor,
        u_matrix: m4.identity(),
        u_lineWidth: majorGridLineWidth,
    };
    const minorGridUniforms = {
        u_colorMult: minorGridColor,
        u_matrix: m4.identity(),
        u_lineWidth: minorGridLineWidth,
    };
    const axesUniforms = {
        u_colorMult: axesColor,
        u_matrix: m4.identity(),
        u_lineWidth: axesLineWidth,
    };

    const objectsToDraw = [
        {
            programInfo: lineProgramInfo,
            vertexArray: lineVAO,
            uniforms: lineUniforms,
            primitiveType: gl.TRIANGLE_STRIP,
            dataBuffer: pointsBuffer,
            getCount: 6 ,
            getInstanceCount: () => graphPointsBufferLength / 2,
        },
        {
            programInfo: roundJoinProgramInfo,
            vertexArray: roundJoinVAO,
            uniforms: roundJoinUniforms,
            primitiveType: gl.TRIANGLE_STRIP,
            dataBuffer: pointsBuffer,
            getCount: roundJoinGeometry.length / 2,
            getInstanceCount: () => graphPointsBufferLength / 2,
        },
        {
            programInfo: majorGridProgramInfo,
            vertexArray: majorGridVAO,
            uniforms: majorGridUniforms,
            primitiveType: gl.TRIANGLES,
            dataBuffer: majorGridDataBuffer,
            getCount: 6,
            getInstanceCount: () => majorGridDataBufferLength / 2,
        },
        {
            programInfo: minorGridProgramInfo,
            vertexArray: minorGridVAO,
            uniforms: minorGridUniforms,
            primitiveType: gl.TRIANGLES,
            dataBuffer: minorGridDataBuffer,
            getCount: 6,
            getInstanceCount: () => minorGridDataBufferLength / 2,
        },
        {
            programInfo: axesProgramInfo,
            vertexArray: axesVAO,
            uniforms: axesUniforms,
            primitiveType: gl.TRIANGLES,
            dataBuffer: axesDataBuffer,
            getCount: 6,
            getInstanceCount: () => axesPointsBufferLength / 2,
        }
    ];

    const cameraPosition = [0, 0, 1];
    const target = [0, 0, 0];
    const up = [0, 1, 0];

    const cameraMatrix = m4.lookAt(cameraPosition, target, up);
    const viewMatrix = m4.inverse(cameraMatrix);

    let orthographicMatrix = m4.orthographic(left, right, bottom, top, near, far);
    let viewProjectionMatrix = m4.multiply(orthographicMatrix, viewMatrix);

    // PANNING
    let isPanning = false;
    let panningStartPosition = [0, 0]

    canvas.addEventListener('mousedown', event => {
        isPanning = true;
        const mousePosition = [event.clientX, event.clientY]
        panningStartPosition = mousePosition
        canvas.style.cursor = 'grabbing';
    });

    canvas.addEventListener('mousemove', event => {
        if (!isPanning) return;

        const mousePosition = [event.clientX, event.clientY]
        const delta = sub(mousePosition, panningStartPosition)
        const deltaWorld = [
            delta[0] * (right - left) / canvas.clientWidth,
            delta[1] * (top - bottom) / canvas.clientHeight
        ]

        translation[0] += deltaWorld[0];
        translation[1] -= deltaWorld[1];

        panningStartPosition = mousePosition

        const graphPoints = updateGraph(left, right, resolution, translation, f);
        uploadAttributeData(pointsBuffer, graphPoints);
        graphPointsBufferLength = getBufferLength(graphPoints);

        const majorGridData = updateMajorGrid(left, right, top, bottom, translation);
        uploadAttributeData(majorGridDataBuffer, majorGridData);
        majorGridDataBufferLength = getBufferLength(majorGridData);

        const minorGridData = updateMinorGrid(left, right, top, bottom, translation);
        uploadAttributeData(minorGridDataBuffer, minorGridData);
        minorGridDataBufferLength = getBufferLength(minorGridData);
        
        const axesPoints = updateAxes(left, right, top, bottom, translation);
        uploadAttributeData(axesDataBuffer, axesPoints);
        axesPointsBufferLength = getBufferLength(axesPoints);

        drawScene();
    });

    canvas.addEventListener('mouseup', () => {
        isPanning = false;
        canvas.style.cursor = 'grab';
    });

    canvas.addEventListener('mouseleave', () => {
        isPanning = false;
        canvas.style.cursor = 'default';
    });

    // ZOOMING
    const ZOOM_FACTOR = 1.05;
    let mouseX = 0, mouseY = 0;

    const zoom = (isZoomingIn, mouseX, mouseY) => {
        const width = right - left;
        const height = top - bottom;

        let newWidth, newHeight, newPlotLineWidth, newMajorGridLineWidth, newMinorGridLineWidth, newAxesLineWidth, newResolution;
        if (isZoomingIn) {
            newWidth = width / ZOOM_FACTOR;
            newHeight = height / ZOOM_FACTOR;
            newPlotLineWidth = plotLineWidth / ZOOM_FACTOR;
            newMajorGridLineWidth = majorGridLineWidth / ZOOM_FACTOR;
            newMinorGridLineWidth = minorGridLineWidth / ZOOM_FACTOR;
            newAxesLineWidth = axesLineWidth / ZOOM_FACTOR;
            newResolution = resolution * ZOOM_FACTOR;
        } else {
            newWidth = width * ZOOM_FACTOR;
            newHeight = height * ZOOM_FACTOR;
            newPlotLineWidth = plotLineWidth * ZOOM_FACTOR;
            newMajorGridLineWidth = majorGridLineWidth * ZOOM_FACTOR;
            newMinorGridLineWidth = minorGridLineWidth * ZOOM_FACTOR;
            newAxesLineWidth = axesLineWidth / ZOOM_FACTOR;
            newResolution = resolution / ZOOM_FACTOR;
        }

        // Convert mouse position from screen space to clip space
        const clipX = (mouseX / canvas.clientWidth) * 2 - 1;
        const clipY = -((mouseY / canvas.clientHeight) * 2 - 1);
        console.log("Mouse Clip Space: ", clipX, clipY);

        // Calculate mouse position in world space
        const mouseWorldX = left + (clipX + 1) * 0.5 * width;
        const mouseWorldY = bottom + (clipY + 1) * 0.5 * height;
        console.log("Mouse World Space: ", mouseWorldX, mouseWorldY);

        const widthScalingFactor = newWidth / width;
        const heightScalingFactor = newHeight / height;
        const plotLineWidthScalingFactor = newPlotLineWidth / plotLineWidth;
        const majorGridLineWidthScalingFactor = newMajorGridLineWidth / majorGridLineWidth;
        const minorGridLineWidthScalingFactor = newMinorGridLineWidth / minorGridLineWidth;
        const axesLineWidthScalingFactor = newAxesLineWidth / axesLineWidth;
        const resolutionScalingFactor = newResolution / resolution;

        const leftNew = mouseWorldX - (mouseWorldX - left) * widthScalingFactor;
        const rightNew = mouseWorldX + (right - mouseWorldX) * widthScalingFactor;
        const bottomNew = mouseWorldY - (mouseWorldY - bottom) * heightScalingFactor;
        const topNew = mouseWorldY + (top - mouseWorldY) * heightScalingFactor;

        plotLineWidth = plotLineWidth * plotLineWidthScalingFactor;
        lineUniforms.u_lineWidth = plotLineWidth;
        roundJoinUniforms.u_lineWidth = plotLineWidth;

        majorGridLineWidth = majorGridLineWidth * majorGridLineWidthScalingFactor;
        majorGridUniforms.u_lineWidth = majorGridLineWidth;

        minorGridLineWidth = minorGridLineWidth * minorGridLineWidthScalingFactor;
        minorGridUniforms.u_lineWidth = minorGridLineWidth;

        axesLineWidth = axesLineWidth * axesLineWidthScalingFactor;
        axesUniforms.u_lineWidth = axesLineWidth;

        resolution = resolution * resolutionScalingFactor;
        console.log("resolution:", resolution);

        left = leftNew;
        right = rightNew;
        bottom = bottomNew;
        top = topNew;

        updateOrthographicDimensions();
    }

    const updateOrthographicDimensions = () => {
        orthographicMatrix = m4.orthographic(left, right, bottom, top, near, far);
        viewProjectionMatrix = m4.multiply(orthographicMatrix, viewMatrix);

        let graphPoints = updateGraph(left, right, resolution, translation, f);
        uploadAttributeData(pointsBuffer, graphPoints);
        graphPointsBufferLength = getBufferLength(graphPoints);

        let majorGridData = updateMajorGrid(left, right, top, bottom, translation);
        uploadAttributeData(majorGridDataBuffer, majorGridData);
        majorGridDataBufferLength = getBufferLength(majorGridData);

        let minorGridData = updateMinorGrid(left, right, top, bottom, translation);
        uploadAttributeData(minorGridDataBuffer, minorGridData);
        minorGridDataBufferLength = getBufferLength(minorGridData);

        let axesPoints = updateAxes(left, right, top, bottom, translation);
        uploadAttributeData(axesDataBuffer, axesPoints);
        minorGridDataBufferLength = getBufferLength(axesPoints);

        drawScene();
    }

    canvas.addEventListener('mousemove', event => {
        const rect = canvas.getBoundingClientRect();
        mouseX = event.clientX - rect.left;
        mouseY = event.clientY - rect.top;
    });

    canvas.addEventListener('wheel', event => {
        // Determine zoom direction
        if (event.deltaY > 0) {
            zoom(false, mouseX, mouseY);
        } else if (event.deltaY < 0) {
            zoom(true, mouseX, mouseY);
        }
    });

    // Prevent the page from scrolling when using the mouse wheel on the canvas
    canvas.addEventListener('wheel', event => {
        event.preventDefault();
    }, { passive: false });

    const drawScene = () => {
        webglUtils.resizeCanvasToDisplaySize(canvas, devicePixelRatio);
        gl.viewport(0, 0, canvas.width, canvas.height);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);

        lineUniforms.u_matrix = computeMatrix(viewProjectionMatrix, translation, 0, 0, scale);
        roundJoinUniforms.u_matrix = computeMatrix(viewProjectionMatrix, translation, 0, 0, scale);
        majorGridUniforms.u_matrix = computeMatrix(viewProjectionMatrix, translation, 0, 0, scale);
        minorGridUniforms.u_matrix = computeMatrix(viewProjectionMatrix, translation, 0, 0, scale);
        axesUniforms.u_matrix = computeMatrix(viewProjectionMatrix, translation, 0, 0, scale);

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

            gl.bindBuffer(gl.ARRAY_BUFFER, object.dataBuffer); // Watch this 
            // Draw
            const primitiveType = object.primitiveType;
            const offset = 0;
            const count = object.getCount;
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

    drawScene();
}

const computeMatrix = (viewProjectionMatrix, translation, xRotation, yRotation, scale) => {
    let matrix = m4.translate(viewProjectionMatrix,
        translation[0],
        translation[1],
        translation[2]);
    matrix = m4.xRotate(matrix, xRotation);
    matrix = m4.yRotate(matrix, yRotation);
    matrix = m4.scale(matrix, scale[0], scale[1], scale[2]);
    return matrix;
}

const computeGraphPoints = (start, end, resolution, f) => {
    const points = [];

    const startX = start * resolution;
    const endX = end * resolution;

    const values = xStep => {
        const x = xStep / resolution;
        const y = f(x);
        return [x, y, x, y];
    }

    for (let xStep = startX; xStep <= endX; xStep++) points.push(...values(xStep))

    points.shift();
    points.shift();
    points.pop();
    points.pop();
    console.log("POINTS:", points)
    return points
}

// [
//     x0, y0, x0, y0,
//     x1, y1, x1, y1,
//     x2, y2, x2, y2
// ]
// [
//     x0, y0,
//     x1, y1, x1, y1,
//     x2, y2,
// ]

const computeRoundJoinGeometry = resolution => {
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

const computeMajorGridPoints = (left, right, top, bottom) => {
    const points = [];
    const xRange = Math.abs(right - left);
    const yRange = Math.abs(top - bottom);

    const maxRange = Math.max(xRange, yRange);
    const gridSize = determineGridSize(maxRange);

    // Start points based on grid size
    const xStart = Math.ceil(left / gridSize) * gridSize;
    const yStart = Math.ceil(bottom / gridSize) * gridSize;

    for (let x = xStart; x <= right; x += gridSize) {
        points.push(x, top, x, bottom);
    }

    for (let y = yStart; y <= top; y += gridSize) {
        points.push(left, y, right, y);
    }

    return points
}

const computeMinorGridPoints = (left, right, top, bottom) => {
    const points = [];

    const xRange = Math.abs(right - left);
    const yRange = Math.abs(top - bottom);
    const maxRange = Math.max(xRange, yRange);
    const majorGridSize = determineGridSize(maxRange);

    const minorGridSize = majorGridSize / 5; // 5 minor lines between major lines

    const xStart = Math.ceil(left / minorGridSize) * minorGridSize;
    const yStart = Math.ceil(bottom / minorGridSize) * minorGridSize;

    for (let x = xStart; x <= right; x += minorGridSize) {
        // Skip major grid lines
        if (Math.abs(x % majorGridSize) > 0.0001) { 
            points.push(x, top, x, bottom);
        }
    }

    for (let y = yStart; y <= top; y += minorGridSize) {
        // Skip major grid lines
        if (Math.abs(y % majorGridSize) > 0.0001) { 
            points.push(left, y, right, y);
        }
    }

    return points;
}

const computeAxesPoints = (left, right, bottom, top) => {
    const points = [];

    if (left < right) {
        for (let x = 0; x < right; x++) {
            points.push(x, 0, x, 0);
        }
    } else {
        for (let i = 0; i > right; i--) {
            points.push(x, 0, x, 0);
        }
    }

    return points
}

const determineGridSize = maxRange => {
    const orderOfMagnitude = Math.floor(Math.log10(maxRange));

    let gridSize = Math.pow(10, orderOfMagnitude);

    const rangeGridMultiple = maxRange / gridSize;

    if (rangeGridMultiple < 5) {
        gridSize /= 5;
    } else if (rangeGridMultiple < 10) {
        gridSize /= 2;
    }

    return gridSize;
}

const getBufferLength = data => {
    const bufferLength = data.length / 2;
    return bufferLength;
}

const updateGraph = (left, right, resolution, translation, f) => {
    const translatedLeft = left - translation[0];
    const translatedRight = right - translation[0];
    const points = new Float32Array(computeGraphPoints(translatedLeft, translatedRight, resolution, f));
    return points;
}

const updateMajorGrid = (left, right, top, bottom, translation) => {
    const translatedLeft = left - translation[0];
    const translatedRight = right - translation[0];
    const translatedTop = top - translation[1];
    const translatedBottom = bottom - translation[1];
    const points = new Float32Array(computeMajorGridPoints(translatedLeft, translatedRight, translatedTop, translatedBottom));
    return points
}

const updateMinorGrid = (left, right, top, bottom, translation) => {
    const translatedLeft = left - translation[0];
    const translatedRight = right - translation[0];
    const translatedTop = top - translation[1];
    const translatedBottom = bottom - translation[1];
    const points = new Float32Array(computeMinorGridPoints(translatedLeft, translatedRight, translatedTop, translatedBottom));
    return points
}

const updateAxes = (left, right, top, bottom, translation) => {
    const translatedLeft = left - translation[0];
    const translatedRight = right - translation[0];
    const translatedTop = top - translation[1];
    const translatedBottom = bottom - translation[1];
    const points = new Float32Array(computeAxesPoints(translatedLeft, translatedRight, translatedTop, translatedBottom));
    return points
}

const uploadAttributeData = (bufferName, data) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferName);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
}


/** @type {HTMLCanvasElement} */
const canvas = document.getElementById("webgl");
const gl = canvas.getContext("webgl2", { antialias: true });
main();