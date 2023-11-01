import * as webglUtils from './webgl-utils.js';
import { rangeInclusive, vsub, expect, vmul, vdiv, vadd } from './utils.js';
import * as m4 from './m4.js';

const flipY = vec2 => [vec2[0], -vec2[1]]
const canvasSize = () => [canvas.clientWidth, canvas.clientHeight]
const worldSize = () => [xMax - xMin, yMax - yMin]
const min = () => [xMin, yMin]
const max = () => [xMax, yMax]

const translationVector = vector => {
    // How many world space coordinates do we travel for one pixel? (this could also be a transformation matrix instead)
    const transformationVector = () => flipY(vdiv(worldSize(), canvasSize()))
    return { screenToWorldSpace: () => vmul(vector, transformationVector()) }
}

const positionVector = vector => {
    const screenToClipSpace = vector => () => vadd(vmul(flipY(vdiv(vector, canvasSize())), 2), [-1, 1])
    const clipToWorldSpace = vector => () => vadd([xMin, yMin], vmul(vadd(vector, 1), 1/2, worldSize()))
    const screenToWorldSpace = () => clipToWorldSpace(screenToClipSpace(vector)())()

    return {
        screenToClipSpace: screenToClipSpace(vector),
        clipToWorldSpace: clipToWorldSpace(vector),
        screenToWorldSpace,
    }
}

const scaleCanvas = () => {
    const width = canvas.clientWidth * devicePixelRatio
    const height = canvas.clientHeight * devicePixelRatio
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
}

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

uniform vec4 u_color;

out vec4 outColor;

void main() {
    outColor = u_color;
}
`;

const functions = [
    x => Math.cos(x),
    x => Math.sin(x),
    x => x,
    x => x * x,
    x => x * x * x,
    x => Math.log1p(x),
];

const colors = () => {
    const grayscale = (value, alpha) => [value, value, value, alpha ?? 1.0]
    const graphColor = grayscale(0.25, 1.0)
    const majorGridColor = grayscale(0.75);
    const minorGridColor = grayscale(0.9);
    const axesColor = [0, 0, 0, 1];
    return { graphColor, majorGridColor, minorGridColor, axesColor }
}

const main = () => {
    const setupMouseEventListeners = () => {
        let panningPosition = null

        canvas.addEventListener('mousedown', event => {
            const mousePosition = [event.clientX, event.clientY]
            panningPosition = mousePosition
            canvas.style.cursor = 'grabbing';
        });
    
        canvas.addEventListener('mousemove', event => {
            if (!panningPosition) return;

            const mousePosition = [event.clientX, event.clientY]

            const updateTranslation = () => {
                const deltaScreen = vsub(mousePosition, panningPosition)
                const deltaWorld = translationVector(deltaScreen).screenToWorldSpace()

                const newTranslation = vadd(translation.slice(0, -1), deltaWorld)
                translation[0] = newTranslation[0]
                translation[1] = newTranslation[1]    
            }

            updateTranslation()
        
            panningPosition = mousePosition
    
            updateAllPoints()
            render();
        });
    
        canvas.addEventListener('mouseup', () => {
            panningPosition = null;
            canvas.style.cursor = 'grab';
        });
    
        canvas.addEventListener('mouseleave', () => {
            panningPosition = null;
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

        const zoom = (zoomingIn, mousePosition) => {
            const factor = zoomingIn ? zoomFactor : 1 / zoomFactor

            const recalculate = something => something / factor
            const updateLineWidths = () => {
                const updateLineWidthOnUniforms = () => {
                    graph.updateWidth(graphLineWidth)
                    roundJoin.updateWidth(graphLineWidth)
                    majorGrid.updateWidth(majorGridLineWidth)
                    minorGrid.updateWidth(minorGridLineWidth)
                    axes.updateWidth(axesLineWidth)
                }
                const updateLineWidths = () => {
                    const recalculateEach = somethings => somethings.map(recalculate);
                    [graphLineWidth, majorGridLineWidth, minorGridLineWidth, axesLineWidth] = recalculateEach([graphLineWidth, majorGridLineWidth, minorGridLineWidth, axesLineWidth])
                }
             
                updateLineWidths()
                updateLineWidthOnUniforms()
            }
            const updateResolution = () => resolution = 1 / recalculate(1 / resolution)
            const updateWorldMinAndMax = () => {
                const recalculateWorldMinAndMax = () => {
                    const mousePositionWorld = positionVector(mousePosition).screenToWorldSpace()
                    const minNew = vsub(mousePositionWorld, vdiv(vsub(mousePositionWorld, min()), factor))
                    const maxNew = vadd(mousePositionWorld, vdiv(vsub(max(), mousePositionWorld), factor))
                    return [minNew, maxNew]
                }

                const [minNew, maxNew] = recalculateWorldMinAndMax()
                xMin = minNew[0];
                yMin = minNew[1];
                xMax = maxNew[0];
                yMax = maxNew[1];
            }
            const renderWithNewOrthographicDimensions = () => {
                computeViewProjectionMatrix()
                updateAllPoints()
                render();
            }

            updateLineWidths()
            updateResolution()
            updateWorldMinAndMax()
            renderWithNewOrthographicDimensions();
        }
    }
    const updateAllPoints = () => {
        graphPointsBuffer.updateData(graphPoints())
        majorGridPointsBuffer.updateData(majorGridPoints())
        minorGridPointsBuffer.updateData(minorGridPoints())
        axesPointsBuffer.updateData(axesPoints())
    }
    const render = () => {
        const drawObject = object => {
            const useObjectProgram = () => gl.useProgram(object.programInfo.program)
            const setUniforms = () => {
                const _uniforms = object.uniforms()
                gl.uniformMatrix4fv(object.programInfo.mvpLocation, false, _uniforms.u_mvp)
                gl.uniform4fv(object.programInfo.colorLocation, _uniforms.u_color)
                gl.uniform1f(object.programInfo.lineWidthLocation, _uniforms.u_lineWidth)
            }
            const bindVertexArray = () => gl.bindVertexArray(object.vertexArray)
            const draw = () => {
                const drawArraysInstanced = () => gl.drawArraysInstanced(primitiveType, offset, verticesPerInstance, object.instanceCount())
                const drawArrays = () => gl.drawArrays(primitiveType, offset, verticesPerInstance)
                
                const primitiveType = object.primitiveType
                const offset = 0
                const verticesPerInstance = object.count

                object.instanceCount ? drawArraysInstanced() : drawArrays()
            }

            useObjectProgram()
            bindVertexArray()
            setUniforms()
            draw()
        }
        const setupRenderingContext = () => {
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.DEPTH_TEST);    
        }
        const updateMVPMatrices = () => {
            const mvpMatrix = computeMVPMatrix(viewProjectionMatrix, translation, 0, 0, scale);
            graph.updateMVPMatrix(mvpMatrix)
            roundJoin.updateMVPMatrix(mvpMatrix)
            majorGrid.updateMVPMatrix(mvpMatrix)
            minorGrid.updateMVPMatrix(mvpMatrix)
            axes.updateMVPMatrix(mvpMatrix)
        }
        const drawEachObject = () => components.forEach(drawObject)

        scaleCanvas()
        setupRenderingContext()
        updateMVPMatrices()
        drawEachObject()
    }
    const attribLocations = program => ['a_instanceVertexPosition', 'a_startAndEndPoints'].map(name => gl.getAttribLocation(program, name))
    const createProgramFunctions = () => {
        const createProgram = ({ vertexShaderSource, fragmentShaderSource }) => {
            const shaders = [
                webglUtils.loadShader(gl, vertexShaderSource, gl.VERTEX_SHADER),
                webglUtils.loadShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER),
            ]
            return webglUtils.createProgram(gl, shaders);
        }
        const createLineProgram = () => createProgram({ vertexShaderSource: lineVertexShaderSource, fragmentShaderSource: fragmentShaderSource })
        const createRoundJoinProgram = () => createProgram({ vertexShaderSource: roundJoinShaderSource,  fragmentShaderSource: fragmentShaderSource })
        return {
            createLineProgram,
            createRoundJoinProgram,
        }
    }
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
    const buffers = () => {
        const buffer = initialData => {
            const bindArrayBuffer = buffer => gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
            const createBufferWithData = data => {
                const buffer = gl.createBuffer()
                uploadBufferData(buffer, data)
                return buffer
            }
            const uploadBufferData = (buffer, data) => {
                bindArrayBuffer(buffer)
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW)
            }
    
            let _length = initialData.length
            const buffer = createBufferWithData(initialData)
            const updateData = newData => {
                _length = newData.length
                uploadBufferData(buffer, newData)
            }
            const length = () => _length
            const bind = () => bindArrayBuffer(buffer)
    
            return {
                buffer,
                length,
                updateData,
                bind,
            }
        }

        const lineSegmentBuffer = buffer(lineSegmentInstanceGeometry)
        const graphPointsBuffer = buffer(graphPoints())
        const roundJoinGeometryBuffer = buffer(computeRoundJoinGeometry())
        const majorGridPointsBuffer = buffer(majorGridPoints())
        const minorGridPointsBuffer = buffer(minorGridPoints())
        const axesPointsBuffer = buffer(axesPoints())

        return {
            lineSegmentBuffer,
            graphPointsBuffer,
            roundJoinGeometryBuffer,
            majorGridPointsBuffer,
            minorGridPointsBuffer,
            axesPointsBuffer,
        }
    }
    const component = ({
        createProgramFunction,
        instanceVertexPositionBuffer,
        startAndEndPointsBuffer,
        color,
        width,
        primitiveType,
    }) => {
        const setupVAO = (program, instanceVertexPositionBuffer, startAndEndPointsBuffer) => {
            const [
                instanceVertexPosition,
                startAndEndPoints,
            ] = attribLocations(program)
            const vao = createAndBindVAO()
            instanceVertexPositionBuffer.bind()
            setupInstanceVertexPosition(instanceVertexPosition)
            startAndEndPointsBuffer.bind()
            setupStartAndEndPoints(startAndEndPoints)
            return vao
        }
        const uniforms = ({ color, width }) => ({
            u_color: color,
            u_mvp: m4.identity(),
            u_lineWidth: width,
        })
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
        const programInfo = (program) => {
            const getUniformLocation = name => gl.getUniformLocation(program, name)
            const mvpLocation = getUniformLocation('u_mvp');
            const colorLocation = getUniformLocation('u_color');
            const lineWidthLocation = getUniformLocation('u_lineWidth');
            
            return {
                program,
                colorLocation,
                mvpLocation,
                lineWidthLocation,
            }
        }    
        
        const program = createProgramFunction()
        const vao = setupVAO(program, instanceVertexPositionBuffer, startAndEndPointsBuffer)
        const _programInfo = programInfo(program)
        const _uniforms = uniforms({ color, width })
        const updateMVPMatrix = mvp => _uniforms.u_mvp = mvp
        const updateWidth = width => _uniforms.u_lineWidth = width
        return {
            programInfo: _programInfo,
            vertexArray: vao,
            uniforms: () => _uniforms,
            primitiveType,
            count: instanceVertexPositionBuffer.length() / 2,
            instanceCount: () => startAndEndPointsBuffer.length() / 4,
            updateMVPMatrix,
            updateWidth,
        }
    }

    const lineSegmentInstanceGeometry = [
        0, -0.5,
        1, -0.5,
        1, 0.5,
        0, -0.5,
        1, 0.5,
        0, 0.5
    ]

    const {
        lineSegmentBuffer,
        graphPointsBuffer,
        roundJoinGeometryBuffer,
        majorGridPointsBuffer,
        minorGridPointsBuffer,
        axesPointsBuffer,
    } = buffers()

    const { graphColor, majorGridColor, minorGridColor, axesColor } = colors()

    const {
        createLineProgram,
        createRoundJoinProgram,
    } = createProgramFunctions()

    const graph = component({
        createProgramFunction: createLineProgram,
        instanceVertexPositionBuffer: lineSegmentBuffer,
        startAndEndPointsBuffer: graphPointsBuffer,
        color: graphColor,
        width: graphLineWidth,
        primitiveType: gl.TRIANGLE_STRIP,
    })
    const roundJoin = component({
        createProgramFunction: createRoundJoinProgram,
        instanceVertexPositionBuffer: roundJoinGeometryBuffer,
        startAndEndPointsBuffer: graphPointsBuffer,
        color: graphColor,
        width: graphLineWidth,
        primitiveType: gl.TRIANGLE_STRIP,
    })
    const majorGrid = component({
        createProgramFunction: createLineProgram,
        instanceVertexPositionBuffer: lineSegmentBuffer,
        startAndEndPointsBuffer: majorGridPointsBuffer,
        color: majorGridColor,
        width: majorGridLineWidth,
        primitiveType: gl.TRIANGLES,
    })
    const minorGrid = component({
        createProgramFunction: createLineProgram,
        instanceVertexPositionBuffer: lineSegmentBuffer,
        startAndEndPointsBuffer: minorGridPointsBuffer,
        color: minorGridColor,
        width: minorGridLineWidth,
        primitiveType: gl.TRIANGLES,
    })
    const axes = component({
        createProgramFunction: createLineProgram,
        instanceVertexPositionBuffer: lineSegmentBuffer,
        startAndEndPointsBuffer: axesPointsBuffer,
        color: axesColor,
        width: axesLineWidth,
        primitiveType: gl.TRIANGLES,
    })

    let viewProjectionMatrix

    const components = [graph, roundJoin, axes, majorGrid, minorGrid]

    setupMouseEventListeners()
    computeViewProjectionMatrix()
    render();
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

const graphPoints = () => {
    const [xMin, xMax,,] = translatedAxisRanges()
    const startX = xMin * resolution;
    const endX = xMax * resolution;

    const values = xStep => {
        const x = xStep / resolution;
        const y = currentFn(x);
        return [x, y, x, y];
    }

    const points = rangeInclusive(startX, endX).flatMap(values).slice(2, -2)

    console.log('POINTS:', points)
    return points
}

const computeRoundJoinGeometry = () => {
    resolution = 100
    const points = [];
    for (let i = 0; i < resolution; i++) {
        const theta0 = (2.0 * Math.PI * i) / resolution;
        const theta1 = (2.0 * Math.PI * i + 1.0) / resolution;

        points.push(0.5 * Math.cos(theta0), 0.5 * Math.sin(theta0));
        points.push(0, 0);
        points.push(0.5 * Math.cos(theta1), 0.5 * Math.sin(theta1));
    }

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
    const [xMin, xMax, yMin, yMax] = translatedAxisRanges()
    const points = [];

    points.push(xMin, 0, xMax, 0)
    points.push(0, yMin, 0, yMax)

    return points
}

const determineGridSize = maxRange => {
    const orderOfMagnitude = Math.floor(Math.log10(maxRange));

    let gridSize = Math.pow(10, orderOfMagnitude);

    const rangeGridMultiple = maxRange / gridSize;

    const threshold = 0.5

    if (rangeGridMultiple < 5 * threshold) {
        gridSize /= 5;
    } else if (rangeGridMultiple < 10 * threshold) {
        gridSize /= 2;
    }

    return gridSize;
}

const translatedAxisRanges = () => [xMin - translation[0], xMax - translation[0], yMin - translation[1], yMax - translation[1]]

const initializeGlobalVariables = () => {
    canvas = document.getElementById('webgl');
    gl = expect(canvas.getContext('webgl2', { antialias: true }), 'could not get webgl2 context');
    near = 0;
    far = 2;
    [xMin, xMax] = (() => {
        const aspectRatio = canvas.clientWidth / canvas.clientHeight;
        return [-5 * aspectRatio, 5 * aspectRatio]
    })()
    yMin = -5;
    yMax = 5;
    translation = [0, 0, 0];

    scale = [1, 1, 1];
    resolution = 100 /* 250 */;
    currentFn = functions[1];

    graphLineWidth = translationVector([3, 0]).screenToWorldSpace()[0];
    majorGridLineWidth = translationVector([1, 0]).screenToWorldSpace()[0];
    minorGridLineWidth = translationVector([1, 0]).screenToWorldSpace()[0];
    axesLineWidth = translationVector([2, 0]).screenToWorldSpace()[0];
}

/** @type {HTMLCanvasElement} */
let canvas
/** @type {WebGL2RenderingContext} */
let gl
let near, far, xMin, xMax, yMin, yMax, translation, scale, resolution, currentFn
let graphLineWidth, majorGridLineWidth, minorGridLineWidth, axesLineWidth
const zoomFactor = 1.05;
initializeGlobalVariables()
main();