import * as webglUtils from './webgl-utils.js';
import { rangeInclusive, vsub, expect, vmul, vdiv, vadd } from './utils.js';
import * as m3 from './m3.js';
import * as m4 from './m4.js';

const flipY = vec2 => [vec2[0], -vec2[1]]
const canvasSize = () => [canvas.clientWidth, canvas.clientHeight]
const worldSize = () => [xMax - xMin, yMax - yMin]

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

const functions = [
    x => Math.cos(x),
    x => Math.sin(x),
    x => x,
    x => x * x,
    x => Math.log1p(x),
];

const colors = () => {
    const grayscale = (value, alpha) => [value, value, value, alpha ?? 1.0]
    const graphColor = grayscale(0.2, 1.0)
    const majorGridColor = grayscale(0.8);
    const minorGridColor = grayscale(0.9);
    const axesColor = [0, 0, 0, 1];
    return { graphColor, majorGridColor, minorGridColor, axesColor }
}

const main = () => {
    const createBufferWithData = data => {
        const buffer = gl.createBuffer()
        uploadAttributeData(buffer, data)
        return buffer
    }

    const createAndBindVAO = () => {
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);    
        return vao
    }

    const setupInstanceVertexPosition = location => {
        gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribDivisor(location, 0);    
    }

    const setupStartAndEndPoints = location => {
        gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribDivisor(location, 1);
    }

    const programInfo = (program, instanceVertexPositionLocation) => {
        const getUniformLocation = name => gl.getUniformLocation(program, name)
        const mvp = getUniformLocation('u_mvp');
        const colorMult = getUniformLocation('u_colorMult');
        const lineWidth = getUniformLocation('u_lineWidth');
        
        return {
            program,
            positionLoc: instanceVertexPositionLocation,
            colorLoc: colorMult,
            matrixLoc: mvp,
            lineWidthLoc: lineWidth,
        }
    }

    const uniforms = () => {
        const uniforms = (u_colorMult, u_lineWidth) => ({
            u_colorMult,
            u_matrix: m4.identity(),
            u_lineWidth,
        })

        const { graphColor, majorGridColor, minorGridColor, axesColor } = colors()

        const lineUniforms = uniforms(graphColor, plotLineWidth);
        const roundJoinUniforms = uniforms(graphColor, plotLineWidth);
        const majorGridUniforms = uniforms(majorGridColor, majorGridLineWidth);
        const minorGridUniforms = uniforms(minorGridColor, minorGridLineWidth);
        const axesUniforms = uniforms(axesColor, axesLineWidth);

        return {
            lineUniforms,
            roundJoinUniforms,
            majorGridUniforms,
            minorGridUniforms,
            axesUniforms,
        }
    }

    const setupMouseEventListeners = () => {
        let panningStartPosition = null

        canvas.addEventListener('mousedown', event => {
            const mousePosition = [event.clientX, event.clientY]
            panningStartPosition = mousePosition
            canvas.style.cursor = 'grabbing';
        });
    
        canvas.addEventListener('mousemove', event => {
            if (!panningStartPosition) return;
    
            const mousePosition = [event.clientX, event.clientY]
            const delta = vsub(mousePosition, panningStartPosition)
            const screenToClipSpace = vec2 => vadd(vmul(flipY(vdiv(vec2, canvasSize())), 2), [-1, 1])
            const deltaWorld = flipY(vdiv(vmul(delta, worldSize()), canvasSize()))
            // const deltaWorld = screenToClipSpace(delta)
            const newTranslation = vadd(translation.slice(0, -1), deltaWorld)
            translation[0] = newTranslation[0]
            translation[1] = newTranslation[1]
    
            panningStartPosition = mousePosition
    
            updateAllPoints()
            drawScene();
        });
    
        canvas.addEventListener('mouseup', () => {
            panningStartPosition = null;
            canvas.style.cursor = 'grab';
        });
    
        canvas.addEventListener('mouseleave', () => {
            panningStartPosition = null;
            canvas.style.cursor = 'default';
        });
    
        canvas.addEventListener('wheel', event => {
            const rect = canvas.getBoundingClientRect();
            const rectOrigin = [rect.left, rect.top]
            const mousePosition = [event.clientX, event.clientY]
            const mousePositionRelativeToCanvas = vsub(mousePosition, rectOrigin)

            // Determine zoom direction
            if (event.deltaY === 0) return
            zoom(event.deltaY < 0, mousePositionRelativeToCanvas);
        });
    
        // Prevent the page from scrolling when using the mouse wheel on the canvas
        canvas.addEventListener('wheel', event => event.preventDefault(), { passive: false });

        const zoom = (isZoomingIn, mousePosition) => {
            const [worldWidth, worldHeight] = worldSize()

            let newWidth, newHeight, newPlotLineWidth, newMajorGridLineWidth, newMinorGridLineWidth, newAxesLineWidth, newResolution;
            const factor = isZoomingIn ? zoomFactor : 1 / zoomFactor
            newWidth = worldWidth / factor;
            newHeight = worldHeight / factor;
            newPlotLineWidth = plotLineWidth / factor;
            newMajorGridLineWidth = majorGridLineWidth / factor;
            newMinorGridLineWidth = minorGridLineWidth / factor;
            newAxesLineWidth = axesLineWidth / factor;
            newResolution = resolution * factor;

            const screenToClipSpace = vec2 => vadd(vmul(flipY(vdiv(vec2, canvasSize())), 2), [-1, 1])

            const mousePositionClip = screenToClipSpace(mousePosition)
            const [clipX, clipY] = mousePositionClip

            console.log('Mouse clip space: ', clipX, clipY);

            // Calculate mouse position in world space

            // vmul(delta, worldSize)

            const mousePositionWorld = vadd([xMin, yMin], vmul(vadd(mousePositionClip, 1), 1/2, worldSize()))
            const [mouseWorldX, mouseWorldY] = mousePositionWorld
            console.log('Mouse world dpace: ', mouseWorldX, mouseWorldY);

            const widthScalingFactor = newWidth / worldWidth;
            const heightScalingFactor = newHeight / worldHeight;
            const plotLineWidthScalingFactor = newPlotLineWidth / plotLineWidth;
            const majorGridLineWidthScalingFactor = newMajorGridLineWidth / majorGridLineWidth;
            const minorGridLineWidthScalingFactor = newMinorGridLineWidth / minorGridLineWidth;
            const axesLineWidthScalingFactor = newAxesLineWidth / axesLineWidth;
            const resolutionScalingFactor = newResolution / resolution;

            const xMinNew = mouseWorldX - (mouseWorldX - xMin) * widthScalingFactor;
            const xMaxNew = mouseWorldX + (xMax - mouseWorldX) * widthScalingFactor;
            const yMinNew = mouseWorldY - (mouseWorldY - yMin) * heightScalingFactor;
            const yMaxNew = mouseWorldY + (yMax - mouseWorldY) * heightScalingFactor;

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
            console.log('resolution:', resolution);

            xMin = xMinNew;
            xMax = xMaxNew;
            yMin = yMinNew;
            yMax = yMaxNew;

            renderWithNewOrthographicDimensions();
        }
    }

    const updatePoints = (pointsBuffer, points) => {
        uploadAttributeData(pointsBuffer, new Float32Array(points));
        return getBufferLength(points);    
    }

    const updateAllPoints = () => {
        const graphPoints = translatedGraphPoints(resolution, currentFn);
        uploadAttributeData(pointsBuffer, graphPoints);
        graphPointsBufferLength = getBufferLength(graphPoints);
        majorGridDataBufferLength = updatePoints(majorGridPointsBuffer, majorGridPoints())
        minorGridDataBufferLength = updatePoints(minorGridPointsBuffer, minorGridPoints())
        axesPointsBufferLength = updatePoints(axesPointsBuffer, axesPoints())
    }

    const renderWithNewOrthographicDimensions = () => {
        computeViewProjectionMatrix()
        updateAllPoints()
        drawScene();
    }

    const drawScene = () => {
        const drawObject = object => {
            const drawArraysInstanced = () => gl.drawArraysInstanced(primitiveType, offset, verticesPerInstance, instanceCount);
            const drawArrays = () => gl.drawArrays(primitiveType, offset, verticesPerInstance);
            const draw = () => object.getInstanceCount ? drawArraysInstanced() : drawArrays()

            const program = object.programInfo.program;
            console.log('Current program:', program);
            gl.useProgram(program);
            gl.bindVertexArray(object.vertexArray);

            // Set the uniforms.
            gl.uniformMatrix4fv(object.programInfo.matrixLoc, false, object.uniforms.u_matrix);
            gl.uniform4fv(object.programInfo.colorLoc, object.uniforms.u_colorMult);
            object.programInfo.lineWidthLoc ? gl.uniform1f(object.programInfo.lineWidthLoc, object.uniforms.u_lineWidth) : {};

            gl.bindBuffer(gl.ARRAY_BUFFER, object.dataBuffer); // Watch this 

            // Draw
            const primitiveType = object.primitiveType;
            const offset = 0;
            const verticesPerInstance = object.count;
            const instanceCount = object.getInstanceCount();
            console.log('FINAL COUNT:', verticesPerInstance);

            draw()
        }

        webglUtils.resizeCanvasToDisplaySize(canvas, devicePixelRatio);
        gl.viewport(0, 0, canvas.width, canvas.height);

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);

        const mvpMatrix = computeMVPMatrix(viewProjectionMatrix, translation, 0, 0, scale);

        lineUniforms.u_matrix = mvpMatrix
        roundJoinUniforms.u_matrix = mvpMatrix;
        majorGridUniforms.u_matrix = mvpMatrix;
        minorGridUniforms.u_matrix = mvpMatrix;
        axesUniforms.u_matrix = mvpMatrix;

        objectsToDraw.forEach(drawObject);
    }

    const getAttribLocations = program => ['a_instanceVertexPosition', 'a_startAndEndPoints'].map(name => gl.getAttribLocation(program, name))

    const lineProgram = webglUtils.createProgramFromSources(gl, [lineVertexShaderSource, fragmentShaderSource]);
    const roundJoinProgram = webglUtils.createProgramFromSources(gl, [roundJoinShaderSource, fragmentShaderSource]);
    const majorGridProgram = webglUtils.createProgramFromSources(gl, [lineVertexShaderSource, fragmentShaderSource]);
    const minorGridProgram = webglUtils.createProgramFromSources(gl, [lineVertexShaderSource, fragmentShaderSource]);
    const axesProgram = webglUtils.createProgramFromSources(gl, [lineVertexShaderSource, fragmentShaderSource]);

    // Line locations
    const [
        instanceVertexPositionLine,
        startAndEndPointsLine,
    ] = getAttribLocations(lineProgram)

    // Round join locations
    const [
        instanceVertexPositionRoundJoin,
        startAndEndPointsRoundJoin,
    ] = getAttribLocations(roundJoinProgram)

    // Major grid locations
    const [
        instanceVertexPositionMajorGrid,
        startAndEndPointsMajorGrid,
    ] = getAttribLocations(majorGridProgram)

    // Minor grid locations
    const [
        instanceVertexPositionMinorGrid,
        startAndEndPointsMinorGrid,
    ] = getAttribLocations(minorGridProgram)

    // Axes locations
    const [
        instanceVertexPositionAxes,
        startAndEndPointsAxes,
    ] = getAttribLocations(axesProgram)

    const lineSegmentInstanceGeometry = new Float32Array([
        0, -0.5,
        1, -0.5,
        1, 0.5,
        0, -0.5,
        1, 0.5,
        0, 0.5
    ]);

    // Line - static geometry
    createBufferWithData(lineSegmentInstanceGeometry)
    const lineVAO = createAndBindVAO()
    setupInstanceVertexPosition(instanceVertexPositionLine)

    console.log('Buffersize instance geo:', gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE) / 4 / 2);

    // Points for per-instance data
    const graphPoints = translatedGraphPoints(resolution, currentFn);
    const pointsBuffer = createBufferWithData(graphPoints);
    let graphPointsBufferLength = getBufferLength(graphPoints);
    setupStartAndEndPoints(startAndEndPointsLine)

    // Round join points
    const roundJoinGeometry = computeRoundJoinGeometry(resolution);
    createBufferWithData(new Float32Array(roundJoinGeometry))
    const roundJoinVAO = createAndBindVAO()
    setupInstanceVertexPosition(instanceVertexPositionRoundJoin)

    // Start and End points for per-instance data (graphPoints)
    gl.bindBuffer(gl.ARRAY_BUFFER, pointsBuffer);
    setupStartAndEndPoints(startAndEndPointsRoundJoin)

    // Major grid - static geometry
    createBufferWithData(lineSegmentInstanceGeometry)

    const majorGridVAO = createAndBindVAO()
    setupInstanceVertexPosition(instanceVertexPositionMajorGrid)

    // Start and end points for per-instace data majorgrid
    const majorGridData = new Float32Array(majorGridPoints());
    let majorGridDataBufferLength = getBufferLength(majorGridData);
    const majorGridPointsBuffer = createBufferWithData(majorGridData)
    setupStartAndEndPoints(startAndEndPointsMajorGrid)

    // Minor grid - static geometry
    createBufferWithData(lineSegmentInstanceGeometry)
    const minorGridVAO = createAndBindVAO()
    setupInstanceVertexPosition(instanceVertexPositionMinorGrid)

    // Start and end points for per-instance data minor grid
    const minorGridData = new Float32Array(minorGridPoints());
    let minorGridDataBufferLength = getBufferLength(minorGridData);
    const minorGridPointsBuffer = createBufferWithData(minorGridData)
    setupStartAndEndPoints(startAndEndPointsMinorGrid)

    // Axes - static geometry
    createBufferWithData(lineSegmentInstanceGeometry)
    const axesVAO = createAndBindVAO()
    setupInstanceVertexPosition(instanceVertexPositionAxes)

    // Start and end points for per-instance data minor grid
    const _axesPoints = new Float32Array(axesPoints());
    let axesPointsBufferLength = getBufferLength(_axesPoints);
    const axesPointsBuffer = createBufferWithData(_axesPoints)
    setupStartAndEndPoints(startAndEndPointsAxes)

    const lineProgramInfo = programInfo(lineProgram, instanceVertexPositionLine)
    const roundJoinProgramInfo = programInfo(roundJoinProgram, instanceVertexPositionRoundJoin)
    const majorGridProgramInfo = programInfo(majorGridProgram, instanceVertexPositionMajorGrid)
    const minorGridProgramInfo = programInfo(minorGridProgram, instanceVertexPositionMinorGrid)
    const axesProgramInfo = programInfo(axesProgram, instanceVertexPositionAxes)

    const {
        lineUniforms,
        roundJoinUniforms,
        majorGridUniforms,
        minorGridUniforms,
        axesUniforms,
    } = uniforms()

    const objectsToDraw = [
        {
            programInfo: lineProgramInfo,
            vertexArray: lineVAO,
            uniforms: lineUniforms,
            primitiveType: gl.TRIANGLE_STRIP,
            dataBuffer: pointsBuffer,
            count: 6 ,
            getInstanceCount: () => graphPointsBufferLength / 2,
        },
        {
            programInfo: roundJoinProgramInfo,
            vertexArray: roundJoinVAO,
            uniforms: roundJoinUniforms,
            primitiveType: gl.TRIANGLE_STRIP,
            dataBuffer: pointsBuffer,
            count: roundJoinGeometry.length / 2,
            getInstanceCount: () => graphPointsBufferLength / 2,
        },
        {
            programInfo: majorGridProgramInfo,
            vertexArray: majorGridVAO,
            uniforms: majorGridUniforms,
            primitiveType: gl.TRIANGLES,
            dataBuffer: majorGridPointsBuffer,
            count: 6,
            getInstanceCount: () => majorGridDataBufferLength / 2,
        },
        {
            programInfo: minorGridProgramInfo,
            vertexArray: minorGridVAO,
            uniforms: minorGridUniforms,
            primitiveType: gl.TRIANGLES,
            dataBuffer: minorGridPointsBuffer,
            count: 6,
            getInstanceCount: () => minorGridDataBufferLength / 2,
        },
        {
            programInfo: axesProgramInfo,
            vertexArray: axesVAO,
            uniforms: axesUniforms,
            primitiveType: gl.TRIANGLES,
            dataBuffer: axesPointsBuffer,
            count: 6,
            getInstanceCount: () => axesPointsBufferLength / 2,
        }
    ];

    let viewProjectionMatrix
    const computeViewProjectionMatrix = () => {
        const viewMatrix = () => {
            const cameraPosition = [0, 0, 1];
            const target = [0, 0, 0];
            const up = [0, 1, 0];
        
            const cameraMatrix = m4.lookAt(cameraPosition, target, up);
            return m4.inverse(cameraMatrix);
        }

        const orthographicMatrix = m4.orthographic(xMin, xMax, yMin, yMax, near, far);
        viewProjectionMatrix = m4.multiply(orthographicMatrix, viewMatrix());    
    }

    setupMouseEventListeners()
    computeViewProjectionMatrix()
    drawScene();
}

const computeMVPMatrix = (viewProjectionMatrix, translation, xRotation, yRotation, scale) => {
    let matrix = m4.translate(viewProjectionMatrix,
        translation[0],
        translation[1],
        translation[2]);
    matrix = m4.xRotate(matrix, xRotation);
    matrix = m4.yRotate(matrix, yRotation);
    matrix = m4.scale(matrix, scale[0], scale[1], scale[2]);
    return matrix;
}

const graphPoints = (start, end, resolution, f) => {
    const startX = start * resolution;
    const endX = end * resolution;

    const values = xStep => {
        const x = xStep / resolution;
        const y = f(x);
        return [x, y, x, y];
    }

    const points = rangeInclusive(startX, endX).flatMap(values).slice(2, -2)

    console.log('POINTS:', points)
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

    console.log('Round Join points:', points)
    return points
}

const majorGridPoints = () => {
    const [xMin, xMax, yMin, yMax] = translatedAxisRanges()
    const points = [];
    const xRange = Math.abs(xMax - xMin);
    const yRange = Math.abs(yMax - yMin);

    const maxRange = Math.max(xRange, yRange);
    const gridSize = determineGridSize(maxRange);

    // Start points based on grid size
    const xStart = Math.ceil(xMin / gridSize) * gridSize;
    const yStart = Math.ceil(yMin / gridSize) * gridSize;

    for (let x = xStart; x <= xMax; x += gridSize) {
        points.push(x, yMax, x, yMin);
    }

    for (let y = yStart; y <= yMax; y += gridSize) {
        points.push(xMin, y, xMax, y);
    }

    return points
}

const minorGridPoints = () => {
    const [xMin, xMax, yMin, yMax] = translatedAxisRanges()
    const points = [];

    const xRange = Math.abs(xMax - xMin);
    const yRange = Math.abs(yMax - yMin);
    const maxRange = Math.max(xRange, yRange);
    const majorGridSize = determineGridSize(maxRange);

    const minorGridSize = majorGridSize / 5; // 5 minor lines between major lines

    const xStart = Math.ceil(xMin / minorGridSize) * minorGridSize;
    const yStart = Math.ceil(yMin / minorGridSize) * minorGridSize;

    for (let x = xStart; x <= xMax; x += minorGridSize) {
        // Skip major grid lines
        if (Math.abs(x % majorGridSize) > 0.0001) { 
            points.push(x, yMax, x, yMin);
        }
    }

    for (let y = yStart; y <= yMax; y += minorGridSize) {
        // Skip major grid lines
        if (Math.abs(y % majorGridSize) > 0.0001) { 
            points.push(xMin, y, xMax, y);
        }
    }

    return points;
}

const axesPoints = () => {
    const [xMin, xMax, , ] = translatedAxisRanges()
    const points = [];

    if (xMin < xMax) {
        for (let x = 0; x < xMax; x++) {
            points.push(x, 0, x, 0);
        }
    } else {
        for (let i = 0; i > xMax; i--) {
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

const getBufferLength = data => data.length / 2

const translatedGraphPoints = (resolution, f) => {
    const translatedLeft = xMin - translation[0];
    const translatedRight = xMax - translation[0];
    const points = new Float32Array(graphPoints(translatedLeft, translatedRight, resolution, f));
    return points;
}

const translatedAxisRanges = () => [xMin - translation[0], xMax - translation[0], yMin - translation[1], yMax - translation[1]]

const uploadAttributeData = (bufferName, data) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferName);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
}

const initializeGlobalVariables = () => {
    canvas = document.getElementById('webgl');
    gl = expect(canvas.getContext('webgl2', { antialias: true }), 'could not get webgl2 context');
    near = 0;
    far = 2;
    [xMin, xMax] = (() => {
        const aspectRatio = canvas.clientWidth / canvas.clientHeight;
        return [-10 * aspectRatio, 10 * aspectRatio]
    })()
    yMin = -10;
    yMax = 10;
    translation = [0, 0, 0];

    scale = [1, 1, 1];
    resolution = 100 /* 250 */;
    currentFn = functions[3];

    plotLineWidth = 0.075;
    majorGridLineWidth = 0.05;
    minorGridLineWidth = 0.025;
    axesLineWidth = 0.15;
}

/** @type {HTMLCanvasElement} */
let canvas
let gl, near, far, xMin, xMax, yMin, yMax, translation, scale, resolution, currentFn
let plotLineWidth, majorGridLineWidth, minorGridLineWidth, axesLineWidth
const zoomFactor = 1.05;
initializeGlobalVariables()
main();